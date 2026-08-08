/**
 * CLI entry point for the scoring engine.
 *
 * Modes:
 *   --title "..." --desc "..."   Normal query; prints pretty JSON
 *   --eval                       Leave-one-out evaluation on 25 recent tickets
 *   --demo                       Run 3 Kafka-flavored sanity queries
 */

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import { ask, AskResult } from "./engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, "../../data/taskscope.db");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

// ── Demo queries (Kafka-flavored) ─────────────────────────────────────────────

const DEMO_QUERIES = [
  {
    title: "Streams consumer lag grows unbounded after broker restart",
    desc:  "After a planned broker restart the Kafka Streams consumer group shows continuously growing lag on several partitions. The application appears healthy and processes records normally on the remaining partitions. Suspect issue with partition reassignment not triggering a task restart.",
  },
  {
    title: "Connect JDBC sink connector silently drops records on large CLOB columns",
    desc:  "The JDBC sink connector stops writing rows to the target database table when source records contain CLOB or BLOB columns exceeding 64 KB without raising an error or DLQ entry. The issue reproduces on both MySQL and PostgreSQL targets with the distributed Connect cluster.",
  },
  {
    title: "Log compaction leaves tombstone records beyond configured retention",
    desc:  "After enabling log compaction on a topic, tombstone (null-value) records persist well beyond delete.retention.ms. Observation: the compaction thread only runs during active-segment rolls; idle topics with low traffic never compact tombstones. The cleaner thread log shows no errors.",
  },
];

// ── Normal query ──────────────────────────────────────────────────────────────

function runQuery(title: string, desc: string) {
  const result = ask({ title, description: desc });
  console.log(JSON.stringify(result, null, 2));
}

// ── Leave-one-out evaluation ──────────────────────────────────────────────────

function runEval() {
  const db = new Database(DB_PATH, { readonly: true });

  // Pick 25 most recently resolved non-Sub-task tickets with an assigned person
  const evalTickets = db.prepare(`
    SELECT t.id, t.key, t.title, t.description, t.assignee_id, p.display_name
    FROM tickets t
    JOIN people p ON p.id = t.assignee_id
    WHERE t.resolved IS NOT NULL
      AND t.type != 'Sub-task'
      AND t.assignee_id IS NOT NULL
    ORDER BY t.resolved DESC
    LIMIT 25
  `).all() as Array<{
    id: number;
    key: string;
    title: string;
    description: string | null;
    assignee_id: number;
    display_name: string;
  }>;

  db.close();

  let hit1 = 0;
  let hit3 = 0;
  const details: Array<{
    key: string;
    trueAssignee: string;
    rank: number | null;
    top3: string[];
  }> = [];

  for (const ticket of evalTickets) {
    const result: AskResult = ask({
      title:       ticket.title,
      description: ticket.description ?? "",
      excludeId:   ticket.id,
    });

    const candidates = result.candidates;
    const trueAssignee = ticket.display_name;

    const rankIdx = candidates.findIndex(c => c.displayName === trueAssignee);
    const rank = rankIdx === -1 ? null : rankIdx + 1;

    if (rank === 1) hit1++;
    if (rank !== null && rank <= 3) hit3++;

    details.push({
      key:          ticket.key,
      trueAssignee,
      rank,
      top3: candidates.slice(0, 3).map(c => c.displayName),
    });
  }

  const n = evalTickets.length;
  console.log(`\nLeave-one-out evaluation  (n=${n} recent non-Sub-task tickets)\n`);
  console.log(`  Hit@1 : ${hit1}/${n}  (${((hit1 / n) * 100).toFixed(1)}%)`);
  console.log(`  Hit@3 : ${hit3}/${n}  (${((hit3 / n) * 100).toFixed(1)}%)\n`);

  console.log("  Per-ticket results:");
  console.log(`  ${"Ticket".padEnd(14)} ${"True Assignee".padEnd(24)} ${"Rank".padStart(4)}  Top-3 candidates`);
  console.log(`  ${"─".repeat(14)} ${"─".repeat(24)} ${"─".repeat(4)}  ${"─".repeat(50)}`);
  for (const d of details) {
    const rankStr = d.rank != null ? `#${d.rank}` : "miss";
    console.log(`  ${d.key.padEnd(14)} ${d.trueAssignee.padEnd(24)} ${rankStr.padStart(4)}  ${d.top3.join(", ")}`);
  }
}

// ── Demo run ──────────────────────────────────────────────────────────────────

function runDemo() {
  for (const q of DEMO_QUERIES) {
    console.log(`\n${"═".repeat(72)}`);
    console.log(`Query: "${q.title}"`);
    console.log("═".repeat(72));
    const result = ask({ title: q.title, description: q.desc });
    const { complexity, candidates } = result;
    console.log(`\nComplexity: ${complexity.label}  (median ${complexity.medianDays}d, range ${complexity.rangeDays[0]}–${complexity.rangeDays[1]}d)`);
    console.log(`\nTop candidates:`);
    for (const c of candidates.slice(0, 5)) {
      console.log(
        `  ${String(c.matchScore).padStart(3)}/100  ${c.displayName.padEnd(24)}` +
        `  matches=${c.matchCount}  wip=${c.activeWip}  eta=${c.eta.lo}–${c.eta.hi}d`
      );
      for (const e of c.evidence.slice(0, 2)) {
        console.log(`          [${e.key}] ${e.cycleDays != null ? e.cycleDays + "d" : "N/A"}  "${e.title.slice(0, 60)}"`);
      }
    }
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--eval")) {
    runEval();
    return;
  }

  if (args.includes("--demo") || args.length === 0) {
    runDemo();
    return;
  }

  const title = getArg(args, "--title");
  const desc  = getArg(args, "--desc");

  if (!title) {
    console.error("Usage: npm run ask -- --title \"...\" [--desc \"...\"]");
    console.error("       npm run ask -- --eval");
    console.error("       npm run ask -- --demo");
    process.exit(1);
  }

  runQuery(title, desc ?? "");
}

main();
