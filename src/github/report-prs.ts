import Database from "better-sqlite3";
import path from "path";

// ── DB setup ──────────────────────────────────────────────────────────────────
// Reads TASKSCOPE_DB env var so the same report works against the scratch copy.

const DATA_DIR = path.resolve("data");
const DB_PATH =
  process.env.TASKSCOPE_DB ?? path.join(DATA_DIR, "taskscope.db");

const db = new Database(DB_PATH, { readonly: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmt(n: number | null, dec = 1): string {
  return n === null ? "N/A" : n.toFixed(dec);
}

// ── Guards ────────────────────────────────────────────────────────────────────

function requireTable(name: string): void {
  const row = db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .get(name);
  if (!row) {
    console.error(
      `Table '${name}' not found in ${DB_PATH}.\nRun 'npm run github:load' first.`
    );
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  requireTable("prs");
  requireTable("pr_tickets");

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  TaskScope — GitHub PR Integration Report");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── PR overview ─────────────────────────────────────────────────────────────

  const overview = db
    .prepare<
      [],
      { total: number; merged: number; open: number; closed: number; with_keys: number }
    >(`
      SELECT
        COUNT(*)                                               AS total,
        SUM(CASE WHEN state = 'MERGED' THEN 1 ELSE 0 END)    AS merged,
        SUM(CASE WHEN state = 'OPEN'   THEN 1 ELSE 0 END)    AS open,
        SUM(CASE WHEN state = 'CLOSED' THEN 1 ELSE 0 END)    AS closed,
        (SELECT COUNT(DISTINCT pr_id) FROM pr_tickets)        AS with_keys
      FROM prs
    `)
    .get()!;

  console.log("PR Overview");
  console.log("───────────");
  console.log(`  Total PRs stored   : ${overview.total.toLocaleString()}`);
  console.log(`  Merged             : ${overview.merged.toLocaleString()}`);
  console.log(`  Open               : ${overview.open.toLocaleString()}`);
  console.log(`  Closed (unmerged)  : ${overview.closed.toLocaleString()}`);
  console.log(
    `  PRs with KAFKA key : ${overview.with_keys.toLocaleString()}` +
    ` (${overview.total > 0 ? ((overview.with_keys / overview.total) * 100).toFixed(1) : "0.0"}%)`
  );
  console.log();

  // ── Ticket coverage ──────────────────────────────────────────────────────────

  const coverage = db
    .prepare<
      [],
      { resolved_total: number; covered: number; covered_merged: number }
    >(`
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE resolved IS NOT NULL) AS resolved_total,
        COUNT(DISTINCT t.id)                                      AS covered,
        COUNT(DISTINCT CASE WHEN pr.state = 'MERGED' THEN t.id END) AS covered_merged
      FROM tickets t
      JOIN pr_tickets pt ON pt.ticket_key = t.key
      JOIN prs pr        ON pr.id = pt.pr_id
      WHERE t.resolved IS NOT NULL
    `)
    .get()!;

  const pctAny = coverage.resolved_total > 0
    ? ((coverage.covered / coverage.resolved_total) * 100).toFixed(1)
    : "0.0";
  const pctMerged = coverage.resolved_total > 0
    ? ((coverage.covered_merged / coverage.resolved_total) * 100).toFixed(1)
    : "0.0";

  console.log("Ticket Coverage (resolved tickets only)");
  console.log("────────────────────────────────────────");
  console.log(`  Resolved tickets total : ${coverage.resolved_total.toLocaleString()}`);
  console.log(`  Covered (any PR)       : ${coverage.covered.toLocaleString()} (${pctAny}%)`);
  console.log(`  Covered (merged PR)    : ${coverage.covered_merged.toLocaleString()} (${pctMerged}%)`);
  console.log();

  // ── Merged PR size distribution ──────────────────────────────────────────────

  const mergedSizes = db
    .prepare<[], { additions: number; deletions: number; changed_files: number }>(
      "SELECT additions, deletions, changed_files FROM prs WHERE state = 'MERGED'"
    )
    .all();

  const linesAll = mergedSizes.map((r) => r.additions + r.deletions);
  const filesAll = mergedSizes.map((r) => r.changed_files);

  console.log("Merged PR Size Distribution");
  console.log("───────────────────────────");
  console.log(`  Merged PRs total     : ${mergedSizes.length.toLocaleString()}`);
  console.log(`  Median lines changed : ${fmt(median(linesAll), 0)}`);
  console.log(`  Median files changed : ${fmt(median(filesAll), 1)}`);
  console.log();

  // ── Per-person PR metrics ────────────────────────────────────────────────────
  // Join is ticket.assignee_id → people (pseudonyms), NOT pr.author_login.
  // GitHub logins are real usernames; pseudonyms must never be paired with them.

  interface PersonPRRow {
    display_name: string;
    additions: number;
    deletions: number;
    changed_files: number;
    days_to_merge: number | null;
  }

  const rows = db
    .prepare<[], PersonPRRow>(`
      SELECT
        p.display_name,
        pr.additions,
        pr.deletions,
        pr.changed_files,
        CASE
          WHEN pr.merged IS NOT NULL AND pr.created IS NOT NULL
          THEN CAST(julianday(pr.merged) - julianday(pr.created) AS REAL)
          ELSE NULL
        END AS days_to_merge
      FROM tickets t
      JOIN people    p  ON p.id  = t.assignee_id
      JOIN pr_tickets pt ON pt.ticket_key = t.key
      JOIN prs       pr ON pr.id = pt.pr_id
      WHERE t.resolved IS NOT NULL AND pr.state = 'MERGED'
      ORDER BY p.display_name
    `)
    .all();

  // Aggregate per pseudonym
  type Agg = { mergedCount: number; lines: number[]; files: number[]; days: number[] };
  const personMap = new Map<string, Agg>();

  for (const row of rows) {
    let agg = personMap.get(row.display_name);
    if (!agg) {
      agg = { mergedCount: 0, lines: [], files: [], days: [] };
      personMap.set(row.display_name, agg);
    }
    agg.mergedCount++;
    agg.lines.push(row.additions + row.deletions);
    agg.files.push(row.changed_files);
    if (row.days_to_merge !== null) agg.days.push(row.days_to_merge);
  }

  const ranked = [...personMap.entries()]
    .sort((a, b) => b[1].mergedCount - a[1].mergedCount)
    .slice(0, 20);

  console.log("Per-Person PR Metrics — top 20 by merged PR count");
  console.log("(joined via ticket assignee; GitHub logins not shown)");
  console.log("─────────────────────────────────────────────────────────────────────");
  const h = `  ${"Name".padEnd(22)} ${"Merged PRs".padStart(10)}  ${"Med lines".padStart(9)}  ${"Med files".padStart(9)}  ${"Med days".padStart(8)}`;
  const sep = `  ${"".padEnd(22, "─")} ${"".padStart(10, "─")}  ${"".padStart(9, "─")}  ${"".padStart(9, "─")}  ${"".padStart(8, "─")}`;
  console.log(h);
  console.log(sep);

  for (const [name, agg] of ranked) {
    console.log(
      `  ${name.padEnd(22)} ` +
      `${String(agg.mergedCount).padStart(10)}  ` +
      `${fmt(median(agg.lines), 0).padStart(9)}  ` +
      `${fmt(median(agg.files), 1).padStart(9)}  ` +
      `${fmt(median(agg.days), 1).padStart(8)}`
    );
  }

  console.log();
  console.log("═══════════════════════════════════════════════════════\n");
}

main();
