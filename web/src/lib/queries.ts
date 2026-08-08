/**
 * SQLite-backed data access for the team and person API routes.
 * Returns shapes that match the frozen frontend contract in FRONTEND_SPEC.md.
 */

import { db } from "./db";
import type { TeamResponse, PersonSummary, TeamMeta } from "./types";

// ── Shared helpers ────────────────────────────────────────────────────────────

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

/**
 * Best available effort estimate for a ticket.
 * Mirrors the effortProxy logic in engine.ts — keeps median values consistent
 * between what the team page shows and what the engine scores against.
 */
function effortProxy(
  work_days: number | null,
  cycle_days: number | null,
  type: string | null,
): number | null {
  if (work_days  != null) return work_days;
  if (cycle_days != null) {
    return type === "Sub-task" ? cycle_days * 0.2 : cycle_days;
  }
  return null;
}

function parseComponents(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? (arr as unknown[]).map(c => String(c).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/** Build a SQL IN-list placeholder string and matching arg array. */
function inList(ids: number[]): { sql: string; args: number[] } {
  return { sql: ids.map(() => "?").join(","), args: ids };
}

// ── Date formatting ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format an ISO timestamp from the DB (e.g. "2026-08-06T12:23:32.000+0000") as "6 Aug 2026". */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── GET /api/team ─────────────────────────────────────────────────────────────

// Top contributors by resolved-ticket volume, minimum history so medians mean
// something. This matches the FRONTEND_SPEC "~10–25 person roster".
const ROSTER_LIMIT = 25;
const MIN_RESOLVED = 5;

export function getTeam(): TeamResponse {
  // 1. Roster: people with >= MIN_RESOLVED resolved tickets, top ROSTER_LIMIT by count
  const rosterRows = db.prepare(`
    SELECT p.id, p.display_name, COUNT(*) as tickets_resolved
    FROM people p
    JOIN tickets t ON t.assignee_id = p.id AND t.resolved IS NOT NULL
    GROUP BY p.id
    HAVING COUNT(*) >= ${MIN_RESOLVED}
    ORDER BY tickets_resolved DESC
    LIMIT ${ROSTER_LIMIT}
  `).all() as Array<{ id: number; display_name: string; tickets_resolved: number }>;

  if (rosterRows.length === 0) {
    const meta = getTeamMeta();
    return { people: [], meta };
  }

  const ids = rosterRows.map(r => r.id);
  const { sql: ph, args } = inList(ids);

  // 2. Effort values per person for median computation
  const effortRows = db.prepare(`
    SELECT assignee_id, work_days, cycle_days, type
    FROM tickets
    WHERE resolved IS NOT NULL AND assignee_id IN (${ph})
  `).all(...args) as Array<{
    assignee_id: number;
    work_days: number | null;
    cycle_days: number | null;
    type: string;
  }>;

  const effortsByPerson = new Map<number, number[]>();
  for (const r of effortRows) {
    const e = effortProxy(r.work_days, r.cycle_days, r.type);
    if (e === null) continue;
    if (!effortsByPerson.has(r.assignee_id)) effortsByPerson.set(r.assignee_id, []);
    effortsByPerson.get(r.assignee_id)!.push(e);
  }

  // 3. Active WIP counts (tickets with no resolved date)
  const wipRows = db.prepare(`
    SELECT assignee_id, COUNT(*) as wip
    FROM tickets
    WHERE resolved IS NULL AND assignee_id IN (${ph})
    GROUP BY assignee_id
  `).all(...args) as Array<{ assignee_id: number; wip: number }>;
  const wipMap = new Map(wipRows.map(r => [r.assignee_id, r.wip]));

  // 4. Component tallies per person (JSON arrays, need JS parsing)
  const compRows = db.prepare(`
    SELECT assignee_id, components
    FROM tickets
    WHERE resolved IS NOT NULL
      AND components IS NOT NULL
      AND components != '[]'
      AND assignee_id IN (${ph})
  `).all(...args) as Array<{ assignee_id: number; components: string }>;

  const compsByPerson = new Map<number, Map<string, number>>();
  for (const r of compRows) {
    const comps = parseComponents(r.components);
    if (comps.length === 0) continue;
    if (!compsByPerson.has(r.assignee_id)) compsByPerson.set(r.assignee_id, new Map());
    const map = compsByPerson.get(r.assignee_id)!;
    for (const c of comps) map.set(c, (map.get(c) ?? 0) + 1);
  }

  // 5. Type mix per person
  const typeRows = db.prepare(`
    SELECT assignee_id, type, COUNT(*) as cnt
    FROM tickets
    WHERE resolved IS NOT NULL AND assignee_id IN (${ph})
    GROUP BY assignee_id, type
  `).all(...args) as Array<{ assignee_id: number; type: string; cnt: number }>;

  const typeByPerson = new Map<number, Record<string, number>>();
  for (const r of typeRows) {
    if (!typeByPerson.has(r.assignee_id)) typeByPerson.set(r.assignee_id, {});
    typeByPerson.get(r.assignee_id)![r.type] = r.cnt;
  }

  // 6. Assemble PersonSummary array
  const people: PersonSummary[] = rosterRows.map(row => {
    const efforts = (effortsByPerson.get(row.id) ?? []).sort((a, b) => a - b);
    const medianCycleDays = r1(percentile(efforts, 50));

    const compMap = compsByPerson.get(row.id) ?? new Map<string, number>();
    const topComponents = [...compMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);

    return {
      id:               row.id,
      name:             row.display_name,
      ticketsResolved:  row.tickets_resolved,
      medianCycleDays,
      activeWip:        wipMap.get(row.id) ?? 0,
      topComponents,
      typeMix:          typeByPerson.get(row.id) ?? {},
    };
  });

  return { people, meta: getTeamMeta() };
}

function getTeamMeta(): TeamMeta {
  const row = db.prepare(`
    SELECT COUNT(*)                    AS total,
           MIN(substr(resolved, 1, 4)) AS min_year,
           MAX(substr(resolved, 1, 4)) AS max_year
    FROM tickets
    WHERE resolved IS NOT NULL
  `).get() as { total: number; min_year: string; max_year: string };

  return {
    totalTickets: row.total,
    dateRange:    [row.min_year, row.max_year],
  };
}

// ── GET /api/person/[id] ──────────────────────────────────────────────────────

export function getPerson(id: number) {
  // Verify person exists
  const personRow = db.prepare(
    "SELECT id, display_name FROM people WHERE id = ?"
  ).get(id) as { id: number; display_name: string } | undefined;

  if (!personRow) return null;

  // PersonSummary
  const summary = buildPersonSummary(personRow);

  // Cycle trend: group resolved tickets by YYYY-MM, compute median effort per month
  const trendRaw = db.prepare(`
    SELECT substr(resolved, 1, 7) AS month,
           work_days, cycle_days, type
    FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
    ORDER BY month
  `).all(id) as Array<{
    month: string;
    work_days: number | null;
    cycle_days: number | null;
    type: string;
  }>;

  // Zombie guard: tickets that sat open for years (e.g. KAFKA-967, 4775d)
  // would flatten the trend chart's scale — they're stale data, not pace.
  const TREND_MAX_DAYS = 365;

  const monthMap = new Map<string, number[]>();
  for (const r of trendRaw) {
    const e = effortProxy(r.work_days, r.cycle_days, r.type);
    if (e === null || e > TREND_MAX_DAYS) continue;
    if (!monthMap.has(r.month)) monthMap.set(r.month, []);
    monthMap.get(r.month)!.push(e);
  }
  const cycleTrend = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, efforts]) => ({
      month,
      medianDays: r1(percentile(efforts.sort((a, b) => a - b), 50)),
    }));

  // Recent resolved tickets — raw cycle_days shown to manager (no Sub-task discount)
  const ticketRows = db.prepare(`
    SELECT key, title, type,
           COALESCE(work_days, cycle_days) AS cycleDays,
           resolved
    FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
    ORDER BY resolved DESC
    LIMIT 20
  `).all(id) as Array<{
    key: string;
    title: string;
    type: string;
    cycleDays: number | null;
    resolved: string;
  }>;

  const recentTickets = ticketRows.map(r => ({
    key:       r.key,
    title:     r.title,
    type:      r.type,
    cycleDays: r.cycleDays != null ? r1(r.cycleDays) : 0,
    resolved:  fmtDate(r.resolved),
  }));

  // Collaborators: people who commented on the same tickets as this person
  const collabRaw = db.prepare(`
    SELECT c2.author_id, COUNT(DISTINCT c2.ticket_id) AS shared_tickets
    FROM comments c1
    JOIN comments c2
      ON c1.ticket_id = c2.ticket_id
     AND c2.author_id != ?
    WHERE c1.author_id = ?
    GROUP BY c2.author_id
    ORDER BY shared_tickets DESC
    LIMIT 10
  `).all(id, id) as Array<{ author_id: number; shared_tickets: number }>;

  const collaborators = resolveCollaborators(collabRaw);

  return { person: summary, cycleTrend, recentTickets, collaborators };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildPersonSummary(row: { id: number; display_name: string }): PersonSummary {
  const id = row.id;

  const countRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM tickets WHERE assignee_id = ? AND resolved IS NOT NULL"
  ).get(id) as { cnt: number };

  const effortRows = db.prepare(`
    SELECT work_days, cycle_days, type
    FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
  `).all(id) as Array<{ work_days: number | null; cycle_days: number | null; type: string }>;

  const efforts = effortRows
    .map(r => effortProxy(r.work_days, r.cycle_days, r.type))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const wipRow = db.prepare(
    "SELECT COUNT(*) as cnt FROM tickets WHERE resolved IS NULL AND assignee_id = ?"
  ).get(id) as { cnt: number };

  const compRows = db.prepare(`
    SELECT components FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
      AND components IS NOT NULL AND components != '[]'
  `).all(id) as Array<{ components: string }>;

  const compMap = new Map<string, number>();
  for (const r of compRows) {
    for (const c of parseComponents(r.components)) {
      compMap.set(c, (compMap.get(c) ?? 0) + 1);
    }
  }
  const topComponents = [...compMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  const typeRows = db.prepare(`
    SELECT type, COUNT(*) as cnt FROM tickets
    WHERE assignee_id = ? AND resolved IS NOT NULL
    GROUP BY type
  `).all(id) as Array<{ type: string; cnt: number }>;

  const typeMix: Record<string, number> = {};
  for (const r of typeRows) typeMix[r.type] = r.cnt;

  return {
    id,
    name:             row.display_name,
    ticketsResolved:  countRow.cnt,
    medianCycleDays:  r1(percentile(efforts, 50)),
    activeWip:        wipRow.cnt,
    topComponents,
    typeMix,
  };
}

function resolveCollaborators(
  raw: Array<{ author_id: number; shared_tickets: number }>
) {
  if (raw.length === 0) return [];
  const ids = raw.map(r => r.author_id);
  const { sql: ph, args } = inList(ids);
  const nameRows = db.prepare(
    `SELECT id, display_name FROM people WHERE id IN (${ph})`
  ).all(...args) as Array<{ id: number; display_name: string }>;
  const nameMap = new Map(nameRows.map(r => [r.id, r.display_name]));
  return raw.map(r => ({
    id:            r.author_id,
    name:          nameMap.get(r.author_id) ?? `Person#${r.author_id}`,
    sharedTickets: r.shared_tickets,
  }));
}
