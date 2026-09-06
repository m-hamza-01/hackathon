/**
 * Findings for GET /api/report — the Team Health Report.
 *
 * Every finding is computed from the same SQLite snapshot the rest of the app
 * reads. Trend windows are anchored to the newest resolved ticket, not the
 * wall clock, so historic datasets (the Kafka demo) produce sane trends.
 */

import { db } from "./db";
import { percentile, r1, effortProxy } from "./queries";
import type { ReportResponse, ReportFinding, TeamMeta } from "./types";

const DAY_MS = 86_400_000;
const ZOMBIE_DAYS = 365; // ignore lags/cycles beyond this — stale data, not pace

const SEVERITY_ORDER = { conversation: 0, watch: 1, healthy: 2 } as const;

function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 50);
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (isNaN(from) || isNaN(to)) return null;
  return (to - from) / DAY_MS;
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

// ── Individual findings ───────────────────────────────────────────────────────

/** Work concentration: is one area effectively one person's? */
function concentrationFinding(): ReportFinding | null {
  const rows = db.prepare(`
    SELECT assignee_id, components
    FROM tickets
    WHERE resolved IS NOT NULL
      AND assignee_id IS NOT NULL
      AND components IS NOT NULL AND components != '[]'
  `).all() as Array<{ assignee_id: number; components: string }>;

  const MIN_COMPONENT_TICKETS = 30;

  // component → (assignee → count)
  const tally = new Map<string, Map<number, number>>();
  for (const row of rows) {
    for (const comp of parseComponents(row.components)) {
      if (!tally.has(comp)) tally.set(comp, new Map());
      const byPerson = tally.get(comp)!;
      byPerson.set(row.assignee_id, (byPerson.get(row.assignee_id) ?? 0) + 1);
    }
  }

  let worst: { comp: string; total: number; top: Array<[number, number]>; share: number } | null = null;
  for (const [comp, byPerson] of tally) {
    const total = [...byPerson.values()].reduce((s, v) => s + v, 0);
    if (total < MIN_COMPONENT_TICKETS) continue;
    const top = [...byPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const share = top[0][1] / total;
    if (!worst || share > worst.share) worst = { comp, total, top, share };
  }
  if (!worst) return null;

  const ids = worst.top.map(([id]) => id);
  const nameRows = db.prepare(
    `SELECT id, display_name FROM people WHERE id IN (${ids.map(() => "?").join(",")})`
  ).all(...ids) as Array<{ id: number; display_name: string }>;
  const names = new Map(nameRows.map(r => [r.id, r.display_name]));
  const name = (id: number) => names.get(id) ?? `Person#${id}`;

  const pct = Math.round(worst.share * 100);
  const bars = worst.top.map(([id, count]) => ({ label: name(id), value: count }));
  const topName = name(worst.top[0][0]);
  const topCount = worst.top[0][1];
  const runnerUp = worst.top[1]?.[1] ?? 0;

  if (worst.share >= 0.45) {
    return {
      id: "concentration",
      severity: "conversation",
      claim: `${pct}% of the ${worst.comp} work rests on one person`,
      body: `${topName} closed ${topCount} of the ${worst.total} finished tickets touching ${worst.comp}. The next closest person closed ${runnerUp}. When ${topName} is away or overloaded, that work has nowhere to go.`,
      bars,
    };
  }
  if (worst.share >= 0.3) {
    return {
      id: "concentration",
      severity: "watch",
      claim: `${worst.comp} leans on one person for ${pct}% of its work`,
      body: `${topName} closed ${topCount} of the ${worst.total} finished tickets touching ${worst.comp} — not yet a single point of failure, but the gap to the next person (${runnerUp}) is wide.`,
      bars,
    };
  }
  return {
    id: "concentration",
    severity: "healthy",
    claim: "No area depends on a single person",
    body: `Even the most concentrated area, ${worst.comp}, spreads across several people — the busiest closed ${pct}% of its ${worst.total} tickets.`,
    bars,
  };
}

/** Pickup lag: how long does new work sit before someone starts it? */
function pickupFinding(): ReportFinding | null {
  const rows = db.prepare(`
    SELECT t.created AS created, t.resolved AS resolved, MIN(tr.at) AS started
    FROM tickets t
    JOIN transitions tr ON tr.ticket_id = t.id AND tr.to_status = 'In Progress'
    WHERE t.resolved IS NOT NULL AND t.created IS NOT NULL
    GROUP BY t.id
  `).all() as Array<{ created: string; resolved: string; started: string }>;

  const anchorRow = db.prepare(
    "SELECT MAX(resolved) AS anchor FROM tickets WHERE resolved IS NOT NULL"
  ).get() as { anchor: string | null };
  if (!anchorRow.anchor) return null;
  const anchor = new Date(anchorRow.anchor).getTime();

  const all: number[] = [];
  const recent: number[] = [];   // resolved in the last 365d before anchor
  const previous: number[] = []; // the 365d before that
  for (const row of rows) {
    const lag = daysBetween(row.created, row.started);
    if (lag === null || lag < 0 || lag > ZOMBIE_DAYS) continue;
    all.push(lag);
    const resolvedAt = new Date(row.resolved).getTime();
    const age = (anchor - resolvedAt) / DAY_MS;
    if (age <= 365) recent.push(lag);
    else if (age <= 730) previous.push(lag);
  }
  if (all.length < 20) return null;

  const med = r1(median(all));
  const MIN_WINDOW = 20;
  let trend = "";
  if (recent.length >= MIN_WINDOW && previous.length >= MIN_WINDOW) {
    const mRecent = r1(median(recent));
    const mPrevious = r1(median(previous));
    if (mRecent > mPrevious * 1.2) trend = ` In the most recent year it was ${mRecent} days, up from ${mPrevious} the year before.`;
    else if (mRecent < mPrevious * 0.8) trend = ` In the most recent year it was ${mRecent} days, down from ${mPrevious} the year before.`;
  }

  if (med >= 7) {
    return {
      id: "pickup",
      severity: "conversation",
      claim: `New work waits ${Math.round(med)} days before anyone starts it`,
      body: `Across ${all.length} finished tickets, the median wait between a ticket being created and someone starting on it was ${med} days.${trend}`,
    };
  }
  if (med >= 3) {
    return {
      id: "pickup",
      severity: "watch",
      claim: `New work waits about ${Math.round(med)} days before anyone starts it`,
      body: `Across ${all.length} finished tickets, the median wait between created and started was ${med} days.${trend}`,
    };
  }
  return {
    id: "pickup",
    severity: "healthy",
    claim: "New work gets picked up quickly",
    body: `Across ${all.length} finished tickets, the median wait between a ticket being created and someone starting on it was ${med} days.${trend}`,
  };
}

/** Rework: how often does finished work come back? */
function reworkFinding(): ReportFinding | null {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN reopen_count >= 1 THEN 1 ELSE 0 END) AS reopened
    FROM tickets
    WHERE resolved IS NOT NULL
  `).get() as { total: number; reopened: number | null };
  if (row.total < 50) return null;

  const reopened = row.reopened ?? 0;
  const pct = r1((reopened / row.total) * 100);

  const total = row.total.toLocaleString();
  if (pct >= 15) {
    return {
      id: "rework",
      severity: "conversation",
      claim: "Finished work keeps coming back",
      body: `${reopened} of ${total} finished tickets were reopened at least once — ${pct}%. Work that bounces back was never really done, and it lands as unplanned load.`,
    };
  }
  if (pct >= 8) {
    return {
      id: "rework",
      severity: "watch",
      claim: `About 1 in ${Math.round(100 / pct)} finished tickets gets reopened`,
      body: `${reopened} of ${total} finished tickets were reopened at least once — ${pct}%.`,
    };
  }
  return {
    id: "rework",
    severity: "healthy",
    claim: "Finished work stays finished",
    body: `Only ${reopened} of ${total} finished tickets were ever reopened — ${pct}%. When this team calls something done, it stays done.`,
  };
}

/** Type spread: does one kind of work run far longer than the rest? */
function typeSpreadFinding(): ReportFinding | null {
  const rows = db.prepare(`
    SELECT type, work_days, cycle_days
    FROM tickets
    WHERE resolved IS NOT NULL AND type IS NOT NULL
  `).all() as Array<{ type: string; work_days: number | null; cycle_days: number | null }>;

  const MIN_TYPE_TICKETS = 30;
  const byType = new Map<string, number[]>();
  const overall: number[] = [];
  for (const row of rows) {
    const e = effortProxy(row.work_days, row.cycle_days, row.type);
    if (e === null || e > ZOMBIE_DAYS) continue;
    overall.push(e);
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type)!.push(e);
  }
  if (overall.length < 100) return null;

  const overallMed = median(overall);
  if (overallMed <= 0) return null;

  let slowest: { type: string; med: number; count: number } | null = null;
  for (const [type, efforts] of byType) {
    if (efforts.length < MIN_TYPE_TICKETS) continue;
    const med = median(efforts);
    if (!slowest || med > slowest.med) slowest = { type, med, count: efforts.length };
  }
  if (!slowest) return null;

  const ratio = r1(slowest.med / overallMed);
  if (ratio < 2) return null; // nothing stands out — say nothing rather than pad

  return {
    id: "type-spread",
    severity: "watch",
    claim: `${slowest.type} work runs ${ratio}× the typical ticket`,
    body: `The median ${slowest.type} ticket took ${r1(slowest.med)} days against ${r1(overallMed)} for the typical ticket (${slowest.count} of them in the history). Plans that treat all tickets alike will be most wrong here.`,
  };
}

/** Merge turnaround: the GitHub-side signal. Omitted when no PRs are ingested. */
function mergeFinding(): ReportFinding | null {
  const rows = db.prepare(
    "SELECT created, merged FROM prs WHERE merged IS NOT NULL AND created IS NOT NULL"
  ).all() as Array<{ created: string; merged: string }>;
  if (rows.length < 30) return null;

  const lags: number[] = [];
  for (const row of rows) {
    const days = daysBetween(row.created, row.merged);
    if (days === null || days < 0 || days > 90) continue;
    lags.push(days);
  }
  if (lags.length < 30) return null;

  const medDays = median(lags);
  const prCount = lags.length.toLocaleString();
  if (medDays < 1) {
    const hours = Math.max(1, Math.round(medDays * 24));
    return {
      id: "merge",
      severity: "healthy",
      claim: "Pull requests merge within a day",
      body: `Across ${prCount} merged pull requests, half went in within ${hours} hour${hours === 1 ? "" : "s"} of being opened. Fast merges are rare, and worth protecting.`,
    };
  }
  if (medDays < 3) {
    return {
      id: "merge",
      severity: "watch",
      claim: `Pull requests take about ${r1(medDays)} days to merge`,
      body: `Across ${prCount} merged pull requests, the typical one waited ${r1(medDays)} days between being opened and being merged.`,
    };
  }
  return {
    id: "merge",
    severity: "conversation",
    claim: `Pull requests sit ${Math.round(medDays)} days before merging`,
    body: `Across ${prCount} merged pull requests, the typical one waited ${r1(medDays)} days between being opened and being merged. Whatever is being built is finished long before it ships.`,
  };
}

// ── GET /api/report ───────────────────────────────────────────────────────────

export function getReport(): ReportResponse {
  const metaRow = db.prepare(`
    SELECT COUNT(*)                    AS total,
           MIN(substr(resolved, 1, 4)) AS min_year,
           MAX(substr(resolved, 1, 4)) AS max_year
    FROM tickets
    WHERE resolved IS NOT NULL
  `).get() as { total: number; min_year: string; max_year: string };

  const meta: TeamMeta = {
    totalTickets: metaRow.total,
    dateRange: [metaRow.min_year, metaRow.max_year],
  };

  // Match the Team page roster (>=5 resolved, top 25) so both tabs agree.
  const peopleRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT assignee_id FROM tickets
      WHERE resolved IS NOT NULL AND assignee_id IS NOT NULL
      GROUP BY assignee_id
      HAVING COUNT(*) >= 5
      LIMIT 25
    )
  `).get() as { cnt: number };

  const findings = [
    concentrationFinding(),
    pickupFinding(),
    reworkFinding(),
    typeSpreadFinding(),
    mergeFinding(),
  ]
    .filter((f): f is ReportFinding => f !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return { meta, peopleCount: peopleRow.cnt, findings };
}
