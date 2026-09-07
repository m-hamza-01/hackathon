/**
 * Backtest harness (ALGORITHM_RESEARCH.md §5.1) — internal quality gate.
 *
 * Time-travel evaluation: each eval ticket is rolled back to its creation
 * instant and predicted using only tickets resolved before that instant
 * (engine `asOf` mode — BM25 corpus, recency decay, WIP, and every median
 * are all computed as of the cutoff). Nothing here surfaces to customers;
 * run it before and after every engine change.
 *
 *   npm run backtest              # default: 400 most recent eligible tickets
 *   npm run backtest -- --max 50  # quick pass
 *
 * Known limits of the current data/engine (recorded in the JSON output):
 *  - Ground truth = tickets.assignee_id (assignee at export). §5.2 wants the
 *    resolver at the resolving transition; the DB has no assignee history yet.
 *  - Query text = final title/description, not the filing-time text.
 *  - The engine emits one interval (p25–p75, nominal 50%); 80/95% coverage
 *    waits on the conformal-calibration work (§5.4).
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { ask } from "../engine/engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.FOREMAN_DB_PATH ?? path.resolve(__dirname, "../../data/foreman.db");
const OUT_DIR = path.resolve(__dirname, "../../data/backtests");

// ── Config ────────────────────────────────────────────────────────────────────

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const MAX_EVAL  = Number(argValue("--max") ?? 400);   // eval-set cap, most recent first
const MIN_PRIOR = Number(argValue("--min-prior") ?? 250); // resolved tickets required before `created`

// ── Eval set ──────────────────────────────────────────────────────────────────

interface EvalTicket {
  id: number;
  key: string;
  title: string;
  description: string | null;
  type: string | null;
  created: string;
  resolved: string;
  assignee_id: number;
  work_days: number | null;
  cycle_days: number | null;
}

const db = new Database(DB_PATH, { readonly: true });

const resolvedTickets = db.prepare(`
  SELECT id, key, title, description, type, created, resolved, assignee_id, work_days, cycle_days
  FROM tickets
  WHERE resolved IS NOT NULL AND assignee_id IS NOT NULL AND created IS NOT NULL
  ORDER BY resolved ASC
`).all() as EvalTicket[];

// resolved timestamps, ascending — binary search gives "history size at instant t"
const resolvedTimes = resolvedTickets.map(t => t.resolved);

function priorCount(iso: string): number {
  let lo = 0, hi = resolvedTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (resolvedTimes[mid] <= iso) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function effortProxy(t: { work_days: number | null; cycle_days: number | null; type: string | null }): number | null {
  if (t.work_days != null) return t.work_days;
  if (t.cycle_days != null) return t.type === "Sub-task" ? t.cycle_days * 0.2 : t.cycle_days;
  return null;
}

/**
 * Naive baseline: predict the people most active in the 180 days before the
 * ticket was filed. Any engine change must beat this to justify its
 * complexity.
 */
function mostActiveBefore(iso: string, topN: number): number[] {
  const end = priorCount(iso);
  const start = priorCount(new Date(new Date(iso).getTime() - 180 * 86_400_000).toISOString().replace("Z", "+0000"));
  const counts = new Map<number, number>();
  for (let i = start; i < end; i++) {
    const id = resolvedTickets[i].assignee_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([id]) => id);
}

const eligible = resolvedTickets.filter(t => priorCount(t.created) >= MIN_PRIOR);
const evalSet = eligible.slice(-MAX_EVAL); // most recent by resolved date
const skippedThinHistory = resolvedTickets.length - eligible.length;

console.log(`Backtest over ${evalSet.length} tickets (of ${resolvedTickets.length} resolved; ${skippedThinHistory} skipped: <${MIN_PRIOR} tickets of prior history)`);

// ── Run ───────────────────────────────────────────────────────────────────────

interface Row {
  key: string;
  created: string;
  resolver_rank: number | null; // 1-based rank of the actual assignee, null = not in top 10
  top1_id: number | null;
  candidates: number;
  actual_days: number | null;
  // the interval the engine gave for the person who actually did the work
  resolver_eta: { p25: number; median: number; p75: number } | null;
  covered50: boolean | null;
  abs_log_err: number | null;
}

const rows: Row[] = [];
let baselineTop1 = 0;
let baselineTop3 = 0;
const t0 = Date.now();

for (const [i, t] of evalSet.entries()) {
  const active = mostActiveBefore(t.created, 3);
  if (active[0] === t.assignee_id) baselineTop1++;
  if (active.includes(t.assignee_id)) baselineTop3++;

  const res = ask({
    title: t.title,
    description: t.description ?? undefined,
    excludeId: t.id,
    asOf: t.created,
  });

  const resolverIdx = res.candidates.findIndex(c => c.person_id === t.assignee_id);
  const resolver = resolverIdx >= 0 ? res.candidates[resolverIdx] : null;
  const actual = effortProxy(t);

  let covered50: boolean | null = null;
  let absLogErr: number | null = null;
  if (resolver && actual != null) {
    covered50 = actual >= resolver.eta.p25_days && actual <= resolver.eta.p75_days;
    absLogErr = Math.abs(
      Math.log(Math.max(actual, 0.1)) - Math.log(Math.max(resolver.eta.median_days, 0.1))
    );
  }

  rows.push({
    key: t.key,
    created: t.created,
    resolver_rank: resolverIdx >= 0 ? resolverIdx + 1 : null,
    top1_id: res.candidates[0]?.person_id ?? null,
    candidates: res.candidates.length,
    actual_days: actual != null ? Math.round(actual * 10) / 10 : null,
    resolver_eta: resolver
      ? { p25: resolver.eta.p25_days, median: resolver.eta.median_days, p75: resolver.eta.p75_days }
      : null,
    covered50,
    abs_log_err: absLogErr != null ? Math.round(absLogErr * 1000) / 1000 : null,
  });

  if ((i + 1) % 50 === 0) {
    const rate = (Date.now() - t0) / (i + 1);
    console.log(`  ${i + 1}/${evalSet.length}  (${Math.round(rate)} ms/ticket)`);
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────

const answered = rows.filter(r => r.candidates > 0);
const abstained = rows.length - answered.length;

const top1Hits = answered.filter(r => r.resolver_rank === 1).length;
const top3Hits = answered.filter(r => r.resolver_rank !== null && r.resolver_rank <= 3).length;
const top10Hits = answered.filter(r => r.resolver_rank !== null).length;

const etaRows = rows.filter(r => r.covered50 !== null);
const covered = etaRows.filter(r => r.covered50).length;
const logErrs = rows.map(r => r.abs_log_err).filter((v): v is number => v !== null);
const logMae = logErrs.length > 0 ? logErrs.reduce((s, v) => s + v, 0) / logErrs.length : null;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const metrics = {
  eval_tickets: rows.length,
  abstention_rate_pct: pct(abstained, rows.length),
  ranking: {
    // denominators: answered queries (engine produced candidates)
    top1_hit_pct: pct(top1Hits, answered.length),
    top3_hit_pct: pct(top3Hits, answered.length),
    top10_hit_pct: pct(top10Hits, answered.length),
    answered: answered.length,
  },
  eta: {
    // measured on the interval given for the person who actually resolved the
    // ticket, when that person appeared in the candidate list
    nominal_coverage_pct: 50,
    observed_coverage_pct: pct(covered, etaRows.length),
    log_mae: logMae != null ? Math.round(logMae * 1000) / 1000 : null,
    median_multiplicative_err: logMae != null ? Math.round(Math.exp(logMae) * 100) / 100 : null,
    measured_on: etaRows.length,
  },
  naive_baseline: {
    // "most active person in the 180 days before filing" — the bar to beat
    top1_hit_pct: pct(baselineTop1, rows.length),
    top3_hit_pct: pct(baselineTop3, rows.length),
  },
};

// ── Output ────────────────────────────────────────────────────────────────────

const report = {
  ran_at: new Date().toISOString(),
  config: { db: DB_PATH, max_eval: MAX_EVAL, min_prior: MIN_PRIOR },
  caveats: [
    "ground truth = assignee at export, not resolver-at-transition (no assignee history in DB yet)",
    "query text = final title/description, not filing-time text",
    "only the 50% interval exists today; 80/95% coverage waits on conformal calibration (§5.4)",
  ],
  metrics,
  rows,
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, `backtest-${report.ran_at.replace(/[:.]/g, "-")}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("\n── Results ──────────────────────────────────────");
console.log(`eval tickets        ${metrics.eval_tickets}`);
console.log(`abstention rate     ${metrics.abstention_rate_pct}%`);
console.log(`top-1 hit rate      ${metrics.ranking.top1_hit_pct}%   (of ${metrics.ranking.answered} answered)`);
console.log(`top-3 hit rate      ${metrics.ranking.top3_hit_pct}%`);
console.log(`top-10 hit rate     ${metrics.ranking.top10_hit_pct}%`);
console.log(`50% interval hit    ${metrics.eta.observed_coverage_pct}%   (nominal 50, on ${metrics.eta.measured_on} tickets)`);
console.log(`log-MAE of median   ${metrics.eta.log_mae}  (typical miss ×${metrics.eta.median_multiplicative_err})`);
console.log(`naive baseline      top-1 ${metrics.naive_baseline.top1_hit_pct}% · top-3 ${metrics.naive_baseline.top3_hit_pct}%  (most active in prior 180d)`);
console.log(`\nFull report: ${outPath}`);
