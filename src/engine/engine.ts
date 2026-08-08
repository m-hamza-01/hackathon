/**
 * Core scoring engine: BM25 retrieval + candidate ranking + complexity/ETA.
 *
 * ── Effort proxy ──────────────────────────────────────────────────────────────
 * We need one number for "how many days did this ticket take":
 *   1. work_days  (first In-Progress/Patch-Available → resolved) — preferred.
 *      ~951 of 2000 tickets have it; it measures real working time, not clock time.
 *   2. cycle_days (created → resolved) — fallback.
 *      Grossly overstates Sub-task effort because sub-tasks are frequently parked
 *      in backlog for months (e.g. trivial "move class X" → 150+ cycle days).
 *      For Sub-tasks with only cycle_days, apply 0.2× discount.
 *
 * ── Candidate scoring formula ─────────────────────────────────────────────────
 *   finalScore(p) = speedFactor(p) × wipPenalty(p) × countNorm(p) × componentBoost(p)
 *                   × Σ_t [ sim(t) × recency(t) ]
 *
 *   sim(t)           = BM25 score / max BM25 score in result set   ∈ [0, 1]
 *   recency(t)       = exp(−ln2 × monthsAgo / 24)   half-life = 24 months
 *   speedFactor(p)   = clamp(corpusMedianEffort / personMedianEffort, 0.5, 2.0)
 *                      — rewards people who close similar tickets faster;
 *                        corpusMedianEffort is pre-computed over all ~2000 resolved
 *                        tickets for stability (vs using volatile neighbor-subset median)
 *   wipPenalty(p)    = 1 / (1 + 0.15 × activeWip(p))
 *                      — continuous discount; 0 WIP → 1.0, 4 WIP → ≈ 0.63
 *   countNorm(p)     = 1 / sqrt(ln(1 + totalTickets(p)))
 *                      — mild penalty for high total ticket count to reduce "famous
 *                        person" bias: a developer with 113 tickets is ~57× more
 *                        likely to appear in any random top-35 result set than one
 *                        with 1 ticket; this normalization partially corrects that.
 *                        Grows slowly: N=1→1.20, N=10→0.65, N=113→0.46.
 *   componentBoost(p)= 1 + 2.0 × avgFraction(detectedComponents, p)
 *                      — rewards candidates with demonstrable subsystem expertise
 *                        matching the query area (e.g. "streams" query → streams
 *                        specialist). avgFraction = mean fraction of person's tickets
 *                        in each query-detected Kafka component. No components detected
 *                        in the query → boost = 1.0 (no effect).
 *
 * ── Complexity labels ─────────────────────────────────────────────────────────
 * Based on the non-Sub-task work_days empirical distribution:
 *   Low      : medianDays ≤ 3    (below P25 ≈ 2.6d)
 *   Medium   : 3 < medianDays ≤ 14   (around P50 ≈ 15d)
 *   High     : 14 < medianDays ≤ 60  (up to P75 ≈ 61d)
 *   Very High: medianDays > 60
 *
 * ── Minimum evidence threshold ───────────────────────────────────────────────
 * At least 1 neighbor match required. Single matches are valid for people with
 * few total tickets (expected random hit < 0.5); countNorm already discounts
 * prolific developers who have accidental low-quality matches.
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import { buildIndex, search, RawDoc } from "./bm25.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, "../../data/taskscope.db");

const db = new Database(DB_PATH, { readonly: true });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComplexityEstimate {
  label: "Low" | "Medium" | "High" | "Very High";
  medianDays: number;
  rangeDays: [number, number];  // [p25, p75]
}

export interface EvidenceTicket {
  key: string;
  title: string;
  cycleDays: number | null;   // effort proxy value
  resolved: string | null;
}

export interface Candidate {
  displayName: string;
  matchScore: number;        // normalized 0–100
  matchCount: number;        // how many neighbor tickets this person was assigned
  activeWip: number;
  eta: { lo: number; hi: number };
  evidence: EvidenceTicket[];
}

export interface AskResult {
  complexity: ComplexityEstimate;
  candidates: Candidate[];
  /** Raw neighbor list for the LLM synthesis layer */
  neighbors: Array<{
    key: string;
    title: string;
    similarity: number;
    effortDays: number | null;
    commentCount: number;
    components: string[];
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Recency half-life: 24 months in milliseconds */
const HALF_LIFE_MS  = 24 * 30.44 * 24 * 3600 * 1000;
const DECAY_LAMBDA  = Math.LN2 / HALF_LIFE_MS;

const TOP_N               = 35;   // BM25 retrieval count (wider net → more candidates visible)
const MIN_MATCHES         = 1;    // minimum neighbor matches to rank a candidate
const TOP_CANDIDATES      = 10;   // max candidates returned
const COMP_BOOST_STRENGTH = 2.0;  // multiplier for component-expertise overlap bonus

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

function complexityLabel(medianDays: number): ComplexityEstimate["label"] {
  if (medianDays <= 3)  return "Low";
  if (medianDays <= 14) return "Medium";
  if (medianDays <= 60) return "High";
  return "Very High";
}

/**
 * Best available effort estimate for a ticket.
 * Sub-task discount applied only when falling back to cycle_days, because
 * backlog parking inflates cycle_days massively for sub-tasks.
 */
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
  const msAgo = Math.max(0, nowMs - new Date(resolvedISO).getTime());
  return Math.exp(-DECAY_LAMBDA * msAgo);
}

// ── Corpus-wide effort baseline (stable across all queries) ──────────────────
// Pre-compute once at module load. Used as the globalMedian in speedFactor so
// speedFactor doesn't vary by query topic (volatile neighbor-set medians shift
// wildly depending on which 35 tickets come back for a given query).

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
// Light heuristic: detect which Kafka subsystems the query is about, then boost
// candidates who have a strong track record in those subsystems. This rewards
// specialists (e.g. "Add broker-side stream group assignor" → streams expert)
// over generalists who happen to have a few matching tickets.
//
// Boost formula: componentBoost = 1 + COMP_BOOST_STRENGTH × avgFraction
// where avgFraction = mean of (person's ticket fraction in each detected component).

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

// Per-person component fractions: component → fraction of resolved tickets
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

// ── Lazy person-global-median cache (per DB session) ─────────────────────────

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
  /** Exclude this ticket ID from the BM25 index — for leave-one-out evaluation */
  excludeId?: number;
}): AskResult {
  const nowMs = Date.now();

  // Build BM25 index over resolved tickets (excluding the eval ticket if set)
  const rawDocs = db.prepare(`
    SELECT id, key, title, description, components, labels,
           resolved, assignee_id, cycle_days, work_days, type, comment_count
    FROM tickets
    WHERE resolved IS NOT NULL
    ${params.excludeId !== undefined ? `AND id != ${params.excludeId}` : ""}
  `).all() as RawDoc[];

  const idx        = buildIndex(rawDocs);
  const queryText  = [params.title, params.description].filter(Boolean).join(" ");
  const hits       = search(idx, queryText, TOP_N);
  const queryComps = detectComponents(queryText);

  if (hits.length === 0) {
    return {
      complexity: { label: "Medium", medianDays: 15, rangeDays: [3, 60] },
      candidates: [],
      neighbors:  [],
    };
  }

  const maxBM25 = hits[0].score;

  // ── Enrich neighbors ────────────────────────────────────────────────────────

  interface Neighbor {
    id:           number;
    key:          string;
    title:        string;
    type:         string;
    similarity:   number;
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
      effortDays:   effortProxy(d),
      commentCount: d.comment_count ?? 0,
      components:   parseJsonArray(
        // components not stored on DocMeta; re-fetch from rawDocs lookup
        rawDocs.find(r => r.id === d.id)?.components ?? null
      ).map(c => c.trim()),
      assigneeId:   d.assignee_id,
      resolved:     d.resolved,
    };
  });

  // ── Complexity ──────────────────────────────────────────────────────────────
  // Effort distribution over all neighbors (effort proxy already accounts for
  // Sub-task discount, so we include all neighbor types here)

  const effortValues = neighbors
    .map(n => n.effortDays)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const globalP50 = effortValues.length > 0 ? percentile(effortValues, 50) : 15;
  const globalP25 = effortValues.length > 0 ? percentile(effortValues, 25) : 3;
  const globalP75 = effortValues.length > 0 ? percentile(effortValues, 75) : 60;

  const complexity: ComplexityEstimate = {
    label:      complexityLabel(globalP50),
    medianDays: r1(globalP50),
    rangeDays:  [r1(globalP25), r1(globalP75)],
  };

  // ── Candidate scoring ───────────────────────────────────────────────────────

  const byAssignee = new Map<number, Neighbor[]>();
  for (const n of neighbors) {
    if (n.assigneeId == null) continue;
    if (!byAssignee.has(n.assigneeId)) byAssignee.set(n.assigneeId, []);
    byAssignee.get(n.assigneeId)!.push(n);
  }

  // Fetch display names and total resolved ticket counts in one pass
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
    assigneeId:  number;
    displayName: string;
    rawScore:    number;
    neighbors:   Neighbor[];
    wip:         number;
  }

  const scored: ScoredPerson[] = [];

  for (const [assigneeId, nts] of byAssignee) {
    if (nts.length < MIN_MATCHES) continue;

    const wip = activeWip(assigneeId);

    // Person's median effort on their neighbor subset (fallback to global profile)
    const subsetEfforts = nts
      .map(n => n.effortDays)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    const personMedian = subsetEfforts.length > 0
      ? percentile(subsetEfforts, 50)
      : personGlobalMedian(assigneeId);

    // speedFactor uses corpus-wide median (stable, not query-dependent)
    const speedFactor = personMedian > 0
      ? Math.max(0.5, Math.min(2.0, _corpusMedianEffort / personMedian))
      : 1.0;

    // wipPenalty: continuous — 0 WIP → 1.0, 4 WIP → ≈ 0.63
    const wipPenalty = 1 / (1 + 0.15 * wip);

    // countNorm: mild penalty for high total ticket count to reduce "famous person" bias.
    // A developer with 113 tickets is probabilistically ~57× more likely to appear in
    // any top-35 result than someone with 1 ticket; this norm partially corrects that.
    const totalTickets = totalTicketsMap.get(assigneeId) ?? 1;
    const countNorm = 1 / Math.sqrt(Math.log(1 + totalTickets));

    // Weighted relevance sum
    const relevanceSum = nts.reduce(
      (s, n) => s + n.similarity * recencyDecay(n.resolved, nowMs),
      0
    );

    // componentBoost: reward candidates with demonstrated expertise in the same
    // Kafka subsystem as the query. Overlap = average fraction of their tickets in
    // each detected component. boost = 1 + COMP_BOOST_STRENGTH × avgOverlap.
    // No detected components → boost stays 1.0 (no effect).
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
      displayName: displayNames.get(assigneeId) ?? `Person#${assigneeId}`,
      rawScore,
      neighbors:   nts,
      wip,
    });
  }

  scored.sort((a, b) => b.rawScore - a.rawScore);

  const maxRaw = scored[0]?.rawScore ?? 1;

  // ── Build output candidates ─────────────────────────────────────────────────

  const candidates: Candidate[] = scored.slice(0, TOP_CANDIDATES).map(sc => {
    const nts = sc.neighbors;

    // ETA from this person's neighbor effort distribution
    const effortsForEta = nts
      .map(n => n.effortDays)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    let etaLo: number;
    let etaHi: number;

    if (effortsForEta.length >= 3) {
      etaLo = percentile(effortsForEta, 25);
      etaHi = percentile(effortsForEta, 75);
    } else if (effortsForEta.length >= 1) {
      // Sparse subset: bracket around the available data
      etaLo = effortsForEta[0] * 0.5;
      etaHi = effortsForEta[effortsForEta.length - 1] * 1.5;
    } else {
      // No effort data for neighbors; fall back to global complexity range
      etaLo = globalP25;
      etaHi = globalP75;
    }

    // Widen by WIP: more concurrent work → slower expected delivery
    etaLo = etaLo / (1 + 0.10 * sc.wip);
    etaHi = etaHi * (1 + 0.20 * sc.wip);

    // Top-5 evidence tickets (by similarity)
    const evidence: EvidenceTicket[] = [...nts]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(n => ({
        key:       n.key,
        title:     n.title,
        cycleDays: n.effortDays != null ? r1(n.effortDays) : null,
        resolved:  n.resolved,
      }));

    return {
      displayName: sc.displayName,
      matchScore:  Math.round((sc.rawScore / maxRaw) * 100),
      matchCount:  nts.length,
      activeWip:   sc.wip,
      eta:         { lo: r1(etaLo), hi: r1(etaHi) },
      evidence,
    };
  });

  // ── Neighbor output for synthesis layer ────────────────────────────────────

  const neighborOut = neighbors.map(n => ({
    key:          n.key,
    title:        n.title,
    similarity:   Math.round(n.similarity * 1000) / 1000,
    effortDays:   n.effortDays != null ? r1(n.effortDays) : null,
    commentCount: n.commentCount,
    components:   n.components,
  }));

  return { complexity, candidates, neighbors: neighborOut };
}
