// Scoring engine: BM25 retrieval + candidate ranking + complexity/ETA.
//
// Formula per candidate:
//   person_score = speed_score × wip_penalty × Σ_t (bm25(q,t) × recency_decay(t))
//
// Where:
//   speed_score    = global_median_cycle / person_median_cycle (capped 0.2–4.0)
//   recency_decay  = exp(-λ × days_since_resolved),  λ = ln2/180  (half-life 180d)
//   wip_penalty    = 0.6 if person has open WIP tickets, else 1.0

import { db } from "../db.js";
import { buildIndex, search, BM25Index, RawDoc } from "./bm25.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ETA {
  p25_days: number;
  median_days: number;
  p75_days: number;
}

export interface Evidence {
  key: string;
  title: string;
  bm25_score: number;
  resolved: string;
  cycle_days: number | null;
}

export interface Candidate {
  rank: number;
  display_name: string;
  person_id: number;
  score: number;          // normalized 0–100
  raw_score: number;
  speed_ratio: number;    // personal speed vs global median; >1 = faster
  median_cycle_days: number;
  ticket_count: number;   // total resolved tickets
  relevant_count: number; // tickets that had BM25 score > 0
  wip: number;            // current open tickets (0 if no WIP snapshot)
  eta: ETA;               // personalized ETA
  evidence: Evidence[];   // top-3 most relevant tickets
}

export interface NeighborTicket {
  key: string;
  title: string;
  bm25_score: number;
  assignee: string;
  cycle_days: number | null;
  resolved: string | null;
}

export interface QueryResult {
  query: string;
  complexity: {
    sample_size: number;
    p25_days: number;
    median_days: number;
    p75_days: number;
  };
  candidates: Candidate[];
  neighbor_tickets: NeighborTicket[];
}

// ── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Engine (built once, reused across multiple queries) ──────────────────────

interface PersonProfile {
  id: number;
  display_name: string;
  ticket_ids: Set<number>;
  cycle_days: number[];    // sorted ascending
  median_cycle: number;
  wip: number;
}

interface Engine {
  idx: BM25Index;
  people: Map<number, PersonProfile>;  // person_id → profile
  globalMedianCycle: number;
  now: number;  // ms timestamp at build time
}

let _engine: Engine | null = null;

function buildEngine(): Engine {
  // All resolved tickets with their text fields
  const rawDocs = db
    .prepare<[], RawDoc>(
      `SELECT id, key, title, description, components, labels,
              resolved, assignee_id, cycle_days, work_days
       FROM tickets
       WHERE resolved IS NOT NULL AND assignee_id IS NOT NULL`
    )
    .all();

  const idx = buildIndex(rawDocs);

  // People profiles
  const peopleRows = db
    .prepare<[], { id: number; display_name: string }>(
      "SELECT id, display_name FROM people"
    )
    .all();

  // WIP counts from open_tickets (0 if table is empty)
  const wipRows = db
    .prepare<[], { assignee_id: number; cnt: number }>(
      "SELECT assignee_id, COUNT(*) AS cnt FROM open_tickets GROUP BY assignee_id"
    )
    .all();
  const wipMap = new Map<number, number>(wipRows.map((r) => [r.assignee_id, r.cnt]));

  const people = new Map<number, PersonProfile>();
  for (const p of peopleRows) {
    people.set(p.id, {
      id: p.id,
      display_name: p.display_name,
      ticket_ids: new Set(),
      cycle_days: [],
      median_cycle: 0,
      wip: wipMap.get(p.id) ?? 0,
    });
  }

  // Populate ticket_ids and cycle_days per person
  for (const doc of rawDocs) {
    if (doc.assignee_id === null) continue;
    const profile = people.get(doc.assignee_id);
    if (!profile) continue;
    profile.ticket_ids.add(doc.id);
    if (doc.cycle_days !== null) profile.cycle_days.push(doc.cycle_days);
  }

  // Compute sorted cycle_days and median per person
  const allCycles: number[] = [];
  for (const profile of people.values()) {
    profile.cycle_days.sort((a, b) => a - b);
    profile.median_cycle =
      profile.cycle_days.length > 0
        ? percentile(profile.cycle_days, 50)
        : 0;
    allCycles.push(...profile.cycle_days);
  }

  allCycles.sort((a, b) => a - b);
  const globalMedianCycle = allCycles.length > 0 ? percentile(allCycles, 50) : 30;

  return { idx, people, globalMedianCycle, now: Date.now() };
}

function getEngine(): Engine {
  if (!_engine) _engine = buildEngine();
  return _engine;
}

// Force a rebuild (call after re-loading the DB)
export function resetEngine(): void {
  _engine = null;
}

// ── Query ─────────────────────────────────────────────────────────────────────

const LAMBDA = Math.log(2) / 180;  // half-life 180 days
const MS_PER_DAY = 86_400_000;

function recencyDecay(resolvedISO: string | null, now: number): number {
  if (!resolvedISO) return 0.1;
  const daysSince = (now - new Date(resolvedISO).getTime()) / MS_PER_DAY;
  return Math.exp(-LAMBDA * Math.max(0, daysSince));
}

export function queryEngine(
  queryText: string,
  opts: { topK?: number; topCandidates?: number } = {}
): QueryResult {
  const topK         = opts.topK         ?? 30;
  const topCandidates = opts.topCandidates ?? 10;

  const { idx, people, globalMedianCycle, now } = getEngine();

  // BM25 over all tickets
  const hits = search(idx, queryText, topK);

  // Build a lookup: docId → BM25 score
  const hitScores = new Map<number, number>(hits.map((h) => [h.doc.id, h.score]));

  // Per-person relevance score
  interface PersonScore {
    profile: PersonProfile;
    raw_score: number;
    relevant_docs: Array<{ doc_id: number; bm25: number; decay: number }>;
  }

  const personScores: PersonScore[] = [];

  for (const profile of people.values()) {
    if (profile.ticket_ids.size === 0) continue;

    let relevanceSum = 0;
    const relevant: PersonScore["relevant_docs"] = [];

    for (const docId of profile.ticket_ids) {
      const bm25 = hitScores.get(docId);
      if (!bm25) continue;
      const doc   = idx.docById.get(docId)!;
      const decay = recencyDecay(doc.resolved, now);
      relevanceSum += bm25 * decay;
      relevant.push({ doc_id: docId, bm25, decay });
    }

    if (relevanceSum === 0) continue;

    // Speed score: global_median / person_median, capped
    const speedScore =
      profile.median_cycle > 0
        ? Math.min(4.0, Math.max(0.2, globalMedianCycle / profile.median_cycle))
        : 1.0;

    // WIP penalty
    const wipPenalty = profile.wip > 0 ? 0.6 : 1.0;

    const raw_score = relevanceSum * speedScore * wipPenalty;

    personScores.push({ profile, raw_score, relevant_docs: relevant });
  }

  // Sort by raw_score descending
  personScores.sort((a, b) => b.raw_score - a.raw_score);

  // Normalize top scores to 0–100
  const maxRaw = personScores[0]?.raw_score ?? 1;

  const candidates: Candidate[] = personScores
    .slice(0, topCandidates)
    .map((ps, i) => {
      // Sort relevant docs by bm25 × decay for evidence
      const sorted = [...ps.relevant_docs].sort(
        (a, b) => b.bm25 * b.decay - a.bm25 * a.decay
      );

      const evidence: Evidence[] = sorted.slice(0, 3).map((r) => {
        const doc = idx.docById.get(r.doc_id)!;
        return {
          key: doc.key,
          title: doc.title,
          bm25_score: Math.round(r.bm25 * 100) / 100,
          resolved: doc.resolved ?? "",
          cycle_days: doc.cycle_days,
        };
      });

      // Cap speed_ratio to same [0.2, 4.0] range used in scoring
      const speedRatio =
        ps.profile.median_cycle > 0
          ? Math.min(4.0, Math.max(0.2, globalMedianCycle / ps.profile.median_cycle))
          : 1.0;

      // Personalized ETA: adjust complexity distribution by speed ratio
      const neighborCycles = hits
        .map((h) => h.doc.cycle_days)
        .filter((c): c is number => c !== null)
        .sort((a, b) => a - b);

      const etaAdjust = speedRatio > 0 ? 1 / speedRatio : 1;
      const eta: ETA = {
        p25_days:    Math.round(percentile(neighborCycles, 25)  * etaAdjust * 10) / 10,
        median_days: Math.round(percentile(neighborCycles, 50)  * etaAdjust * 10) / 10,
        p75_days:    Math.round(percentile(neighborCycles, 75)  * etaAdjust * 10) / 10,
      };

      return {
        rank:              i + 1,
        display_name:      ps.profile.display_name,
        person_id:         ps.profile.id,
        score:             Math.round((ps.raw_score / maxRaw) * 100),
        raw_score:         ps.raw_score,
        speed_ratio:       Math.round(speedRatio * 100) / 100,
        median_cycle_days: Math.round(ps.profile.median_cycle * 10) / 10,
        ticket_count:      ps.profile.ticket_ids.size,
        relevant_count:    ps.relevant_docs.length,
        wip:               ps.profile.wip,
        eta,
        evidence,
      };
    });

  // Complexity from top-K neighbor tickets
  const neighborCycles = hits
    .map((h) => h.doc.cycle_days)
    .filter((c): c is number => c !== null)
    .sort((a, b) => a - b);

  const complexity = {
    sample_size: neighborCycles.length,
    p25_days:    Math.round(percentile(neighborCycles, 25)  * 10) / 10,
    median_days: Math.round(percentile(neighborCycles, 50)  * 10) / 10,
    p75_days:    Math.round(percentile(neighborCycles, 75)  * 10) / 10,
  };

  // Neighbor ticket list (for dashboard / synthesis layer)
  const neighbor_tickets: NeighborTicket[] = hits.map((h) => {
    const personId = h.doc.assignee_id;
    const assignee = personId ? (people.get(personId)?.display_name ?? "Unknown") : "Unknown";
    return {
      key:        h.doc.key,
      title:      h.doc.title,
      bm25_score: Math.round(h.score * 100) / 100,
      assignee,
      cycle_days: h.doc.cycle_days,
      resolved:   h.doc.resolved,
    };
  });

  return { query: queryText, complexity, candidates, neighbor_tickets };
}
