import { db } from "./db.js";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null) return "N/A";
  return n.toFixed(decimals);
}

function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Foreman — Jira Ingest Sanity Report");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── Overview ──────────────────────────────────────────────────────────────
  const overview = db
    .prepare<
      [],
      {
        total_tickets: number;
        total_people: number;
        earliest: string;
        latest: string;
      }
    >(
      `SELECT
         COUNT(*)                  AS total_tickets,
         (SELECT COUNT(*) FROM people) AS total_people,
         MIN(created)              AS earliest,
         MAX(resolved)             AS latest
       FROM tickets`
    )
    .get()!;

  console.log("Overview");
  console.log("────────");
  console.log(`  Total tickets : ${overview.total_tickets.toLocaleString()}`);
  console.log(`  Total people  : ${overview.total_people.toLocaleString()}`);
  console.log(`  Date range    : ${overview.earliest?.slice(0, 10)} → ${overview.latest?.slice(0, 10)}`);
  console.log();

  // ── Issue-type distribution ───────────────────────────────────────────────
  const types = db
    .prepare<[], { type: string | null; cnt: number }>(
      `SELECT type, COUNT(*) AS cnt FROM tickets GROUP BY type ORDER BY cnt DESC`
    )
    .all();

  console.log("Issue-type distribution");
  console.log("───────────────────────");
  for (const row of types) {
    console.log(`  ${(row.type ?? "Unknown").padEnd(20)} ${row.cnt.toLocaleString()}`);
  }
  console.log();

  // ── Comment stats ─────────────────────────────────────────────────────────
  const commentStats = db
    .prepare<
      [],
      { with_comments: number; total: number }
    >(
      `SELECT
         SUM(CASE WHEN comment_count >= 1 THEN 1 ELSE 0 END) AS with_comments,
         COUNT(*) AS total
       FROM tickets`
    )
    .get()!;

  const commentCounts = db
    .prepare<[], { comment_count: number }>(
      "SELECT comment_count FROM tickets WHERE comment_count IS NOT NULL"
    )
    .all()
    .map((r) => r.comment_count);

  const pct = ((commentStats.with_comments / commentStats.total) * 100).toFixed(1);
  console.log("Comments");
  console.log("────────");
  console.log(`  Tickets with ≥1 comment : ${commentStats.with_comments.toLocaleString()} (${pct}%)`);
  console.log(`  Median comment count    : ${fmt(median(commentCounts), 0)}`);
  console.log();

  // ── Top 15 assignees ──────────────────────────────────────────────────────
  interface AssigneeRow {
    display_name: string;
    resolved_count: number;
    ticket_ids: string;
  }

  const assignees = db
    .prepare<[], AssigneeRow>(
      `SELECT
         p.display_name,
         COUNT(t.id)              AS resolved_count,
         GROUP_CONCAT(t.id, ',')  AS ticket_ids
       FROM tickets t
       JOIN people p ON p.id = t.assignee_id
       WHERE t.resolved IS NOT NULL
       GROUP BY t.assignee_id
       ORDER BY resolved_count DESC
       LIMIT 15`
    )
    .all();

  console.log("Top 15 assignees by resolved tickets");
  console.log("─────────────────────────────────────────────────────────");
  console.log(
    `  ${"Name".padEnd(22)} ${"Resolved".padStart(8)}  ${"Median cycle (d)".padStart(16)}  Top 3 components`
  );
  console.log(
    `  ${"".padEnd(22, "─")} ${"".padStart(8, "─")}  ${"".padStart(16, "─")}  ${"".padStart(30, "─")}`
  );

  for (const row of assignees) {
    const ids = row.ticket_ids.split(",").map(Number);

    // Median cycle_days for this assignee
    const cycles = db
      .prepare<[string], { cycle_days: number }>(
        `SELECT cycle_days FROM tickets WHERE cycle_days IS NOT NULL AND id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids)
      .map((r) => r.cycle_days);

    const medCycle = median(cycles);

    // Top 3 components across their tickets
    interface CompRow { comp: string; cnt: number }
    const comps = db
      .prepare<[string], CompRow>(
        `SELECT
           json_each.value AS comp,
           COUNT(*) AS cnt
         FROM tickets, json_each(tickets.components)
         WHERE tickets.id IN (${ids.map(() => "?").join(",")})
         GROUP BY comp
         ORDER BY cnt DESC
         LIMIT 3`
      )
      .all(...ids) as CompRow[];

    const topComps = comps.map((c) => c.comp).join(", ") || "—";

    console.log(
      `  ${row.display_name.padEnd(22)} ${String(row.resolved_count).padStart(8)}  ${fmt(medCycle).padStart(16)}  ${topComps}`
    );
  }

  console.log();

  // ── Active WIP — top 10 ──────────────────────────────────────────────────
  const wipRows = db
    .prepare<[], { display_name: string; open_count: number }>(
      `SELECT p.display_name, COUNT(*) AS open_count
       FROM tickets t
       JOIN people p ON p.id = t.assignee_id
       WHERE t.resolved IS NULL
       GROUP BY t.assignee_id
       ORDER BY open_count DESC
       LIMIT 10`
    )
    .all();

  const totalOpen = db
    .prepare<[], { c: number }>("SELECT COUNT(*) AS c FROM tickets WHERE resolved IS NULL")
    .get()!.c;

  console.log(`Active WIP — top 10 assignees  (${totalOpen} open tickets total)`);
  console.log("────────────────────────────────");

  if (wipRows.length === 0) {
    console.log("  No open tickets loaded — run `npm run fetch:open && npm run load` first.");
  } else {
    for (const row of wipRows) {
      console.log(`  ${row.display_name.padEnd(22)} ${String(row.open_count).padStart(4)} open`);
    }
  }

  console.log();
  console.log("═══════════════════════════════════════════════════════\n");
}

main();
