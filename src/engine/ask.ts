// CLI entry point for the scoring engine.
// Usage:  npm run ask -- "consumer group rebalance stuck after broker failure"
//         npm run ask -- --demo    (runs 5 pre-defined gnarly queries)

import { queryEngine, QueryResult } from "./score.js";

const DEMO_QUERIES = [
  "consumer group rebalance stuck after broker restart partition assignment",
  "producer idempotent acks message duplication sequence number reset",
  "streams stateful task migration state store restoration rolling upgrade",
  "connect distributed offset commit race condition rebalance loop",
  "log compaction corrupt index segment unclean leader shutdown",
];

function printResult(result: QueryResult) {
  const { query, complexity, candidates, neighbor_tickets } = result;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`Query: "${query}"`);
  console.log("═".repeat(70));

  console.log(`\nComplexity estimate  (from ${complexity.sample_size} similar tickets)`);
  console.log(`  p25 / median / p75 : ${complexity.p25_days}d / ${complexity.median_days}d / ${complexity.p75_days}d`);

  console.log(`\nTop candidates`);
  console.log(`  ${"Name".padEnd(22)} ${"Score".padStart(5)}  ${"Speed".padStart(5)}  ${"Med.cycle".padStart(9)}  ${"Tickets".padStart(7)}  ${"WIP".padStart(3)}  Personalized ETA (p25/med/p75)`);
  console.log(`  ${"─".repeat(22)} ${"─".repeat(5)}  ${"─".repeat(5)}  ${"─".repeat(9)}  ${"─".repeat(7)}  ${"─".repeat(3)}  ${"─".repeat(30)}`);

  for (const c of candidates) {
    const wip   = c.wip > 0 ? `${c.wip}` : " -";
    const speed = c.speed_ratio >= 1 ? `+${c.speed_ratio.toFixed(1)}x` : `${c.speed_ratio.toFixed(1)}x`;
    const eta   = `${c.eta.p25_days}d / ${c.eta.median_days}d / ${c.eta.p75_days}d`;
    console.log(
      `  ${c.display_name.padEnd(22)} ${String(c.score).padStart(5)}  ${speed.padStart(5)}  ${String(c.median_cycle_days + "d").padStart(9)}  ${String(c.relevant_count + "/" + c.ticket_count).padStart(7)}  ${wip.padStart(3)}  ${eta}`
    );
  }

  if (candidates.length > 0) {
    const top = candidates[0];
    console.log(`\nTop pick: ${top.display_name}  (score ${top.score}/100)`);
    console.log(`  Evidence tickets:`);
    for (const e of top.evidence) {
      const cycle = e.cycle_days !== null ? `${Math.round(e.cycle_days)}d` : "N/A";
      console.log(`    [${e.key}] (bm25=${e.bm25_score}, cycle=${cycle}) ${e.title.slice(0, 70)}`);
    }
  }

  console.log(`\nNearest neighbor tickets (BM25 top-5):`);
  for (const n of neighbor_tickets.slice(0, 5)) {
    const cycle = n.cycle_days !== null ? `${Math.round(n.cycle_days)}d` : "N/A";
    console.log(`  [${n.key}] bm25=${n.bm25_score}  cycle=${cycle}  ${n.assignee}  "${n.title.slice(0, 55)}"`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--demo") || args.length === 0) {
    console.log("Running 5 demo queries…\n");
    for (const q of DEMO_QUERIES) {
      const result = queryEngine(q, { topK: 30, topCandidates: 5 });
      printResult(result);
    }
    return;
  }

  const query = args.join(" ");
  const result = queryEngine(query, { topK: 30, topCandidates: 10 });
  printResult(result);
}

main();
