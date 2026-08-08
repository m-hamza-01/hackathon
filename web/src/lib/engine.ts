/**
 * Scoring engine for /api/ask — ported from src/engine/engine.ts.
 *
 * Changes from the root-package version:
 *   - DB opened via the shared singleton in ./db (uses process.cwd() path,
 *     safe across Next.js dev/prod because `next` always runs from web/).
 *   - Imports bm25 from ./bm25 (local copy, same logic).
 *   - No CLI entry point — export only, consumed by the API route.
 */

import { db } from "./db";
import { buildIndex, search, RawDoc } from "./bm25";

// ── Public contract (frozen) ──────────────────────────────────────────────────

export interface QueryResult {
  query: string;
  complexity: {
    label:       "Low" | "Medium" | "High" | "Very High";
    sample_size: number;
    p25_days:    number;
    median_days: number;
    p75_days:    number;
  };
  candidates: Array<{
    rank:              number;
    display_name:      string;
    person_id:         number;
    score:             number;
    raw_score:         number;
    speed_ratio:       number;
    median_cycle_days: number;
    ticket_count:      number;
    relevant_count:    number;
    wip:               number;
    eta: {
      p25_days:    number;
      median_days: number;
      p75_days:    number;
    };
    evidence: Array<{
      key:        string;
      title:      string;
      bm25_score: number;
      resolved:   string | null;
      cycle_days: number | null;
    }>;
  }>;
  neighbor_tickets: Array<{
    key:        string;
    title:      string;
    bm25_score: number;
    assignee:   string;
    cycle_days: number | null;
    resolved:   string | null;
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HALF_LIFE_MS        = 24 * 30.44 * 24 * 3600 * 1000;
const DECAY_LAMBDA        = Math.LN2 / HALF_LIFE_MS;
const TOP_N               = 35;
const MIN_MATCHES         = 1;
const TOP_CANDIDATES      = 10;
const COMP_BOOST_STRENGTH = 2.0;
const ETA_MIN_LO          = 0.5;
const ETA_MAX_RATIO       = 8.0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

type ComplexityLabel = "Low" | "Medium" | "High" | "Very High";

function complexityLabel(medianDays: number): ComplexityLabel {
  if (medianDays <= 3)  return "Low";
  if (medianDays <= 14) return "Medium";
  if (medianDays <= 60) return "High";
  return "Very High";
}

function effortProxy(row: {
  work_days:  number | null;
  cycle_days: number | null;
  type:       string | null;
}): number | null {
  if (row.work_days  != null) return row.work_days;
  if (row.cycle_days != null) {
    return row.type === "Sub-task" ? row.cycle_days * 0.2 : row.cycle_days;
  }
  return null;
}

function recencyDecay(resolvedISO: string | null, nowMs: number): number {
  if (!resolvedISO) return 0.1;
  const t = new Date(resolvedISO).getTime();
  if (isNaN(t)) return 0.1; // unparseable timestamp — same fallback as missing
  const msAgo = Math.max(0, nowMs - t);
  return Math.exp(-DECAY_LAMBDA * msAgo);
}

// ── Corpus-wide effort baseline (computed once at module load) ────────────────

const _corpusMedianEffort: number = (() => {
  const rows = db.prepare(`
    SELECT work_days, cycle_days, type FROM tickets WHERE resolved IS NOT NULL
  `).all() as Array<{ work_days: number | null; cycle_days: number | null; type: string }>;
  const efforts = rows
    .map(r => effortProxy(r))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return efforts.length > 0 ? percentile(efforts, 50) : 15;
})();

// ── Component-signal detection ────────────────────────────────────────────────

const COMPONENT_SIGNALS: [RegExp, string][] = [
  [/\bstreams?\b|\bkstream\b|\bktable\b|\btopology\b|\bstate.?store\b|\btask.?assign|\bstate-updater\b/i, "streams"],
  [/\bconnect(?:or)?\b|\bsink\b|\bsource.?connector\b|\bdlq\b|\bjdbc\b/i,                              "connect"],
  [/\bproducer?\b|\bidempotent\b|\bsequence.?number\b/i,                                                 "producer"],
  [/\bssl\b|\bcidr\b|\bacl\b|\bauthoriz/i,                                                               "clients"],
  [/\bcontroller\b|\bkraft\b|\braft\b|\bquorum\b|\bunregister/i,                                         "controller"],
  [/\bcompaction\b|\bsegment\b|\blog.?clean\b|\btombstone\b/i,                                           "log"],
  [/\bbroker\b|\bpartition.?leader\b|\breplica\b/i,                                                      "core"],
];

function detectComponents(text: string): Set<string> {
  const found = new Set<string>();
  for (const [re, comp] of COMPONENT_SIGNALS) {
    if (re.test(text)) found.add(comp);
  }
  return found;
}

const _compFractionCache = new Map<number, Map<string, number>>();

function personCompFractions(personId: number): Map<string, number> {
  if (_compFractionCache.has(personId)) return _compFractionCache.get(personId)!;
  const rows = db.prepare(
    "SELECT components FROM tickets WHERE assignee_id = ? AND resolved IS NOT NULL"
  ).all(personId) as Array<{ components: string | null }>;
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    for (const c of parseJsonArray(r.components)) {
      const trimmed = c.trim();
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
      total++;
    }
  }
  const fracs = new Map<string, number>(
    [...counts].map(([k, v]) => [k, v / Math.max(1, total)])
  );
  _compFractionCache.set(personId, fracs);
  return fracs;
}

const _personMedianCache = new Map<number, number>();

function personGlobalMedian(personId: number): number {
  if (_personMedianCache.has(personId)) return _personMedianCache.get(personId)!;
  const rows = db.prepare(`
    SELECT work_days, cycle_days, type FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
  `).all(personId) as Array<{ work_days: number | null; cycle_days: number | null; type: string }>;
  const efforts = rows
    .map(r => effortProxy(r))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const med = efforts.length > 0 ? percentile(efforts, 50) : 15;
  _personMedianCache.set(personId, med);
  return med;
}

function activeWip(personId: number): number {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM tickets WHERE resolved IS NULL AND assignee_id = ?"
  ).get(personId) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function ask(params: {
  title: string;
  description?: string;
  excludeId?: number;
  opts?: { topK?: number; topCandidates?: number };
}): QueryResult {
  const nowMs = Date.now();

  // id != -1 is always true (Jira ids are positive), so one bound-parameter
  // statement covers both the exclude and no-exclude cases.
  const rawDocs = db.prepare(`
    SELECT id, key, title, description, components, labels,
           resolved, assignee_id, cycle_days, work_days, type, comment_count
    FROM tickets
    WHERE resolved IS NOT NULL AND id != ?
  `).all(params.excludeId ?? -1) as RawDoc[];

  const idx        = buildIndex(rawDocs);
  const queryText  = [params.title, params.description].filter(Boolean).join(" ");
  const hits       = search(idx, queryText, TOP_N);
  const queryComps = detectComponents(queryText);

  if (hits.length === 0) {
    return {
      query:      queryText,
      complexity: { label: "Medium", sample_size: 0, p25_days: 3, median_days: 15, p75_days: 60 },
      candidates:       [],
      neighbor_tickets: [],
    };
  }

  const maxBM25 = hits[0].score;

  interface Neighbor {
    id:           number;
    key:          string;
    title:        string;
    type:         string;
    similarity:   number;
    bm25Score:    number;
    effortDays:   number | null;
    commentCount: number;
    components:   string[];
    assigneeId:   number | null;
    resolved:     string | null;
  }

  const neighbors: Neighbor[] = hits.map(hit => {
    const d = hit.doc;
    return {
      id:           d.id,
      key:          d.key,
      title:        d.title,
      type:         d.type ?? "Unknown",
      similarity:   maxBM25 > 0 ? hit.score / maxBM25 : 0,
      bm25Score:    hit.score,
      effortDays:   effortProxy(d),
      commentCount: d.comment_count ?? 0,
      components:   parseJsonArray(
        rawDocs.find(r => r.id === d.id)?.components ?? null
      ).map(c => c.trim()),
      assigneeId:   d.assignee_id,
      resolved:     d.resolved,
    };
  });

  const effortValues = neighbors
    .map(n => n.effortDays)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const globalP50 = effortValues.length > 0 ? percentile(effortValues, 50) : 15;
  const globalP25 = effortValues.length > 0 ? percentile(effortValues, 25) : 3;
  const globalP75 = effortValues.length > 0 ? percentile(effortValues, 75) : 60;

  const complexity = {
    label:       complexityLabel(globalP50),
    sample_size: effortValues.length,
    p25_days:    r1(globalP25),
    median_days: r1(globalP50),
    p75_days:    r1(globalP75),
  };

  const byAssignee = new Map<number, Neighbor[]>();
  for (const n of neighbors) {
    if (n.assigneeId == null) continue;
    if (!byAssignee.has(n.assigneeId)) byAssignee.set(n.assigneeId, []);
    byAssignee.get(n.assigneeId)!.push(n);
  }

  const assigneeIds = [...byAssignee.keys()];
  const nameRows = assigneeIds.length > 0
    ? db.prepare(
        `SELECT id, display_name FROM people WHERE id IN (${assigneeIds.map(() => "?").join(",")})`
      ).all(...assigneeIds) as Array<{ id: number; display_name: string }>
    : [];
  const displayNames = new Map(nameRows.map(r => [r.id, r.display_name]));

  const countRows = assigneeIds.length > 0
    ? db.prepare(
        `SELECT assignee_id, COUNT(*) as cnt FROM tickets
         WHERE resolved IS NOT NULL AND assignee_id IN (${assigneeIds.map(() => "?").join(",")})
         GROUP BY assignee_id`
      ).all(...assigneeIds) as Array<{ assignee_id: number; cnt: number }>
    : [];
  const totalTicketsMap = new Map(countRows.map(r => [r.assignee_id, r.cnt]));

  interface ScoredPerson {
    assigneeId:   number;
    displayName:  string;
    rawScore:     number;
    speedFactor:  number;
    personMedian: number;
    totalTickets: number;
    neighbors:    Neighbor[];
    wip:          number;
  }

  const scored: ScoredPerson[] = [];

  for (const [assigneeId, nts] of byAssignee) {
    if (nts.length < MIN_MATCHES) continue;

    const wip = activeWip(assigneeId);

    const subsetEfforts = nts
      .map(n => n.effortDays)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    const personMedian = subsetEfforts.length > 0
      ? percentile(subsetEfforts, 50)
      : personGlobalMedian(assigneeId);

    const speedFactor = personMedian > 0
      ? Math.max(0.5, Math.min(2.0, _corpusMedianEffort / personMedian))
      : 1.0;

    const wipPenalty = 1 / (1 + 0.15 * wip);

    const totalTickets = totalTicketsMap.get(assigneeId) ?? 1;
    const countNorm = 1 / Math.sqrt(Math.log(1 + totalTickets));

    const relevanceSum = nts.reduce(
      (s, n) => s + n.similarity * recencyDecay(n.resolved, nowMs),
      0
    );

    let componentBoost = 1.0;
    if (queryComps.size > 0) {
      const fracs = personCompFractions(assigneeId);
      let overlap = 0;
      for (const comp of queryComps) overlap += fracs.get(comp) ?? 0;
      overlap /= queryComps.size;
      componentBoost = 1.0 + COMP_BOOST_STRENGTH * overlap;
    }

    const rawScore = relevanceSum * speedFactor * wipPenalty * countNorm * componentBoost;

    scored.push({
      assigneeId,
      displayName:  displayNames.get(assigneeId) ?? `Person#${assigneeId}`,
      rawScore,
      speedFactor,
      personMedian,
      totalTickets,
      neighbors:    nts,
      wip,
    });
  }

  scored.sort((a, b) => b.rawScore - a.rawScore);

  const maxRaw = scored[0]?.rawScore ?? 1;
  const topCandidates = params.opts?.topCandidates ?? TOP_CANDIDATES;

  const builtCandidates = scored.slice(0, topCandidates).map((sc, idx) => {
    const nts = sc.neighbors;

    const winsorCap = Math.max(globalP75 * 3, 30);
    const effortsForEta = nts
      .map(n => n.effortDays != null ? Math.min(n.effortDays, winsorCap) : null)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    let etaP25: number;
    let etaMedian: number;
    let etaP75: number;

    if (effortsForEta.length >= 3) {
      etaP25    = percentile(effortsForEta, 25);
      etaMedian = percentile(effortsForEta, 50);
      etaP75    = percentile(effortsForEta, 75);
    } else if (effortsForEta.length >= 1) {
      etaP25    = effortsForEta[0] * 0.7;
      etaMedian = effortsForEta[Math.floor((effortsForEta.length - 1) / 2)];
      etaP75    = effortsForEta[effortsForEta.length - 1] * 1.3;
    } else {
      etaP25    = globalP25;
      etaMedian = globalP50;
      etaP75    = globalP75;
    }

    const wipInflation = 1 + 0.10 * sc.wip;
    etaP25    = etaP25    * wipInflation;
    etaMedian = etaMedian * wipInflation;
    etaP75    = etaP75    * wipInflation;

    const complexityHi = globalP75 * 1.5;
    etaP75    = Math.min(etaP75, complexityHi);
    etaP25    = Math.min(etaP25, etaP75);
    etaP25    = Math.max(etaP25, ETA_MIN_LO);
    etaP75    = Math.max(etaP75, etaP25);
    etaP75    = Math.min(etaP75, etaP25 * ETA_MAX_RATIO);
    etaMedian = Math.min(Math.max(etaMedian, etaP25), etaP75);

    etaP25    = r1(etaP25);
    etaMedian = r1(etaMedian);
    etaP75    = r1(etaP75);

    const evidence = [...nts]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(n => ({
        key:        n.key,
        title:      n.title,
        bm25_score: Math.round(n.bm25Score * 1000) / 1000,
        resolved:   n.resolved,
        cycle_days: n.effortDays != null ? r1(n.effortDays) : null,
      }));

    return {
      rank:              idx + 1,
      display_name:      sc.displayName,
      person_id:         sc.assigneeId,
      score:             Math.round((sc.rawScore / maxRaw) * 100),
      raw_score:         Math.round(sc.rawScore * 10000) / 10000,
      speed_ratio:       Math.round(sc.speedFactor * 100) / 100,
      median_cycle_days: r1(sc.personMedian),
      ticket_count:      sc.totalTickets,
      relevant_count:    nts.length,
      wip:               sc.wip,
      eta: { p25_days: etaP25, median_days: etaMedian, p75_days: etaP75 },
      evidence,
    };
  });

  const neighborTickets = neighbors.map(n => ({
    key:        n.key,
    title:      n.title,
    bm25_score: Math.round(n.bm25Score * 1000) / 1000,
    assignee:   n.assigneeId != null
                  ? (displayNames.get(n.assigneeId) ?? `Person#${n.assigneeId}`)
                  : "Unassigned",
    cycle_days: n.effortDays != null ? r1(n.effortDays) : null,
    resolved:   n.resolved,
  }));

  return {
    query:            queryText,
    complexity,
    candidates:       builtCandidates,
    neighbor_tickets: neighborTickets,
  };
}
