import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { GHPage, PRNode } from "./fetch-prs.js";

// ── DB setup ──────────────────────────────────────────────────────────────────
// Respects FOREMAN_DB env var so the test run can target a scratch copy
// without touching the live data/foreman.db.

const DATA_DIR = path.resolve("data");
const GITHUB_RAW_DIR = path.join(DATA_DIR, "raw", "github");

const DB_PATH =
  process.env.FOREMAN_DB ?? path.join(DATA_DIR, "foreman.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// GitHub tables live here, not in src/db.ts
db.exec(`
  CREATE TABLE IF NOT EXISTS prs (
    id            INTEGER PRIMARY KEY,
    number        INTEGER NOT NULL,
    title         TEXT,
    author_login  TEXT,
    created       TEXT,
    merged        TEXT,
    state         TEXT,
    additions     INTEGER,
    deletions     INTEGER,
    changed_files INTEGER,
    review_count  INTEGER,
    comment_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS pr_tickets (
    pr_id      INTEGER NOT NULL,
    ticket_key TEXT    NOT NULL,
    PRIMARY KEY (pr_id, ticket_key)
  );

  CREATE INDEX IF NOT EXISTS idx_pr_tickets_key   ON pr_tickets(ticket_key);
  CREATE INDEX IF NOT EXISTS idx_prs_author_login ON prs(author_login);
`);

// ── Prepared statements ───────────────────────────────────────────────────────

const upsertPR = db.prepare<[
  number, number, string | null, string | null,
  string, string | null, string,
  number, number, number, number, number
]>(`
  INSERT INTO prs
    (id, number, title, author_login, created, merged, state,
     additions, deletions, changed_files, review_count, comment_count)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    number        = excluded.number,
    title         = excluded.title,
    author_login  = excluded.author_login,
    created       = excluded.created,
    merged        = excluded.merged,
    state         = excluded.state,
    additions     = excluded.additions,
    deletions     = excluded.deletions,
    changed_files = excluded.changed_files,
    review_count  = excluded.review_count,
    comment_count = excluded.comment_count
`);

const deletePRTickets = db.prepare<[number]>(
  "DELETE FROM pr_tickets WHERE pr_id = ?"
);

const insertPRTicket = db.prepare<[number, string]>(
  "INSERT OR IGNORE INTO pr_tickets (pr_id, ticket_key) VALUES (?,?)"
);

// ── Ticket key extraction ─────────────────────────────────────────────────────
// Primary source: title (e.g. "KAFKA-12345: Fix ...").
// Fallback: branch name (e.g. "KAFKA-12345-fix-thing").
// Last resort: first 2 000 chars of PR body (avoids reading huge descriptions).
// A PR may reference multiple tickets; duplicates are deduplicated.

const KAFKA_RE = /KAFKA-(\d+)/gi;

function extractKeys(pr: PRNode): string[] {
  const sources = [
    pr.title,
    pr.headRefName,
    (pr.body ?? "").slice(0, 2000),
  ];
  const keys = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(KAFKA_RE)) {
      keys.add(`KAFKA-${m[1]}`);
    }
  }
  return [...keys];
}

// ── Load ──────────────────────────────────────────────────────────────────────

function loadPRNode(pr: PRNode): void {
  upsertPR.run(
    pr.databaseId,
    pr.number,
    pr.title,
    pr.author?.login ?? null,
    pr.createdAt,
    pr.mergedAt,
    pr.state,
    pr.additions,
    pr.deletions,
    pr.changedFiles,
    pr.reviews.totalCount,
    pr.comments.totalCount
  );

  const keys = extractKeys(pr);
  deletePRTickets.run(pr.databaseId);
  for (const key of keys) {
    insertPRTicket.run(pr.databaseId, key);
  }
}

const loadBatch = db.transaction((nodes: PRNode[]) => {
  for (const node of nodes) {
    loadPRNode(node);
  }
});

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(GITHUB_RAW_DIR)) {
    console.error(
      `GitHub raw dir not found: ${GITHUB_RAW_DIR}\nRun 'npm run github:fetch' first.`
    );
    process.exit(1);
  }

  const pageFiles = fs
    .readdirSync(GITHUB_RAW_DIR)
    .filter((f) => f.startsWith("github-page-") && f.endsWith(".json"))
    .sort();

  if (pageFiles.length === 0) {
    console.error(
      "No GitHub page files found. Run 'npm run github:fetch' first."
    );
    process.exit(1);
  }

  console.log(
    `\nLoading ${pageFiles.length} GitHub page(s) from ${GITHUB_RAW_DIR}…`
  );
  console.log(`Target DB: ${DB_PATH}\n`);

  let totalPRs = 0;

  for (const file of pageFiles) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(GITHUB_RAW_DIR, file), "utf8")
    ) as GHPage;
    const nodes = raw.data.repository.pullRequests.nodes;

    const withKeys = nodes.filter((n) => extractKeys(n).length > 0).length;
    loadBatch(nodes);
    totalPRs += nodes.length;

    console.log(
      `  ${file}: ${nodes.length} PRs, ${withKeys} with KAFKA key (${((withKeys / nodes.length) * 100).toFixed(1)}%)`
    );
  }

  const stats = db
    .prepare<
      [],
      { prs: number; links: number; distinct_keys: number }
    >(`
      SELECT
        (SELECT COUNT(*)                        FROM prs)        AS prs,
        (SELECT COUNT(*)                        FROM pr_tickets) AS links,
        (SELECT COUNT(DISTINCT ticket_key)      FROM pr_tickets) AS distinct_keys
    `)
    .get()!;

  console.log(`
Done.
  PRs loaded       : ${totalPRs.toLocaleString()}
  PRs in DB        : ${stats.prs.toLocaleString()}
  Ticket links     : ${stats.links.toLocaleString()}
  Distinct keys    : ${stats.distinct_keys.toLocaleString()}
`);
}

main();
