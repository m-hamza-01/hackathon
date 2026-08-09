import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getInstallationToken } from "./auth.js";

const execFileAsync = promisify(execFile);

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function argStr(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const SINCE = argStr("--since", "2024-01-01");
const maxPagesStr = argStr("--max-pages", "");
const MAX_PAGES: number = maxPagesStr ? parseInt(maxPagesStr, 10) : Infinity;

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve("data");
const GITHUB_RAW_DIR = path.join(DATA_DIR, "raw", "github");

fs.mkdirSync(GITHUB_RAW_DIR, { recursive: true });

// ── GraphQL query ─────────────────────────────────────────────────────────────
// Fetches 100 PRs per page with all fields needed for the prs table and
// ticket-key extraction. No per-PR follow-up requests needed.

const QUERY = `
query FetchPRs($cursor: String) {
  repository(owner: "apache", name: "kafka") {
    pullRequests(
      first: 100
      after: $cursor
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId
        number
        title
        headRefName
        body
        author { login }
        createdAt
        mergedAt
        state
        additions
        deletions
        changedFiles
        reviews(first: 0) { totalCount }
        comments(first: 0) { totalCount }
      }
    }
  }
}`.trim();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PRNode {
  databaseId: number;
  number: number;
  title: string;
  headRefName: string;
  body: string | null;
  author: { login: string } | null;
  createdAt: string;
  mergedAt: string | null;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviews: { totalCount: number };
  comments: { totalCount: number };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface GHPage {
  data: {
    repository: {
      pullRequests: {
        pageInfo: PageInfo;
        nodes: PRNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pageFile(n: number): string {
  return path.join(GITHUB_RAW_DIR, `github-page-${String(n).padStart(3, "0")}.json`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(cursor: string | null, retries = 3): Promise<GHPage> {
  // Pass cursor only when non-null; omitting the variable lets GraphQL default it to null
  const ghArgs = ["api", "graphql", "-f", `query=${QUERY}`];
  if (cursor !== null) {
    ghArgs.push("-f", `cursor=${cursor}`);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync("gh", ghArgs, {
        maxBuffer: 64 * 1024 * 1024, // 64 MB — large PR bodies can bulk up pages
      });
      const parsed = JSON.parse(stdout) as GHPage;
      if (parsed.errors?.length) {
        throw new Error(
          `GraphQL error: ${parsed.errors.map((e) => e.message).join("; ")}`
        );
      }
      return parsed;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 2000;
      console.error(`  Attempt ${attempt} failed: ${err}. Retrying in ${wait}ms…`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // A GitHub App installation (made at /connect) takes priority over the
  // gh CLI's stored login — gh reads GH_TOKEN from the environment.
  if (!process.env.GH_TOKEN) {
    const appToken = await getInstallationToken();
    if (appToken) {
      process.env.GH_TOKEN = appToken.token;
      console.log("Using GitHub App installation token.");
    }
  }

  const maxLabel = isFinite(MAX_PAGES) ? `, max-pages=${MAX_PAGES}` : "";
  console.log(`\nFetching apache/kafka PRs (since=${SINCE}${maxLabel})…\n`);

  let pageNum = 0;
  let cursor: string | null = null;

  // Scan cached pages to find the resume cursor (skip already-fetched work)
  while (pageNum < MAX_PAGES && fs.existsSync(pageFile(pageNum))) {
    const cached = JSON.parse(
      fs.readFileSync(pageFile(pageNum), "utf8")
    ) as GHPage;
    const pi = cached.data.repository.pullRequests.pageInfo;
    console.log(`  Page ${pageNum}: cached, skipping`);
    if (!pi.hasNextPage) {
      console.log("\nAll pages already fetched.");
      return;
    }
    cursor = pi.endCursor;
    pageNum++;
  }

  // Fetch new pages
  let fetched = 0;
  while (pageNum < MAX_PAGES) {
    const res = await fetchPage(cursor);
    const prs = res.data.repository.pullRequests;
    const nodes = prs.nodes;

    fs.writeFileSync(pageFile(pageNum), JSON.stringify(res, null, 2));
    fetched++;

    const newest = nodes.at(0);
    const oldest = nodes.at(-1);
    console.log(
      `  Page ${pageNum}: ${nodes.length} PRs  ` +
      `[${newest?.createdAt?.slice(0, 10)} → ${oldest?.createdAt?.slice(0, 10)}]  ` +
      `→ ${path.basename(pageFile(pageNum))}`
    );

    cursor = prs.pageInfo.endCursor;
    const noMore = !prs.pageInfo.hasNextPage;
    const pastCutoff = oldest ? oldest.createdAt.slice(0, 10) < SINCE : false;

    pageNum++;

    if (noMore || pastCutoff) {
      if (pastCutoff) console.log(`\n  Reached since cutoff (${SINCE}), stopping.`);
      else console.log(`\n  No more pages.`);
      break;
    }

    if (pageNum < MAX_PAGES) {
      await sleep(300); // polite delay between requests
    }
  }

  console.log(`\nFetch complete. ${pageNum} page(s) total, ${fetched} fetched this run.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
