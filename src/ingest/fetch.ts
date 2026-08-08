import fs from "fs";
import path from "path";
import { RAW_DIR } from "../db.js";

const BASE_URL = "https://issues.apache.org/jira/rest/api/2/search";

const RESOLVED_JQL =
  "project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC";
const OPEN_JQL =
  'project=KAFKA AND resolution=EMPTY AND status in ("In Progress","Patch Available","Reopened") AND assignee is not EMPTY ORDER BY updated DESC';

const MAX_RESULTS = 100;
const DELAY_MS = 250;

function pageFile(page: number): string {
  return path.join(RAW_DIR, `kafka-page-${String(page).padStart(3, "0")}.json`);
}

function openPageFile(page: number): string {
  return path.join(RAW_DIR, `kafka-open-page-${String(page).padStart(3, "0")}.json`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnePage(
  jql: string,
  startAt: number,
  fields: string,
  expand: string | null,
  retries = 3
): Promise<Record<string, unknown>> {
  const paramObj: Record<string, string> = {
    jql,
    startAt: String(startAt),
    maxResults: String(MAX_RESULTS),
    fields,
  };
  if (expand) paramObj.expand = expand;
  const params = new URLSearchParams(paramObj);
  const url = `${BASE_URL}?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} startAt=${startAt} attempt ${attempt}`);
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = attempt * 1000;
      console.error(`  startAt=${startAt} attempt ${attempt} failed: ${err}. Retrying in ${backoff}ms…`);
      await sleep(backoff);
    }
  }
  throw new Error("unreachable");
}

async function fetchResolved(totalPages: number) {
  console.log(`Fetching ${totalPages} resolved pages (~${totalPages * MAX_RESULTS} issues)…`);
  for (let page = 0; page < totalPages; page++) {
    const file = pageFile(page);
    if (fs.existsSync(file)) {
      console.log(`  Page ${page}: already exists, skipping`);
      continue;
    }
    const data = await fetchOnePage(
      RESOLVED_JQL,
      page * MAX_RESULTS,
      "summary,description,issuetype,status,priority,assignee,reporter,components,labels,created,resolutiondate,comment",
      "changelog"
    );
    const issues = (data as { issues?: unknown[] }).issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Page ${page}: saved ${issues.length} issues → ${path.basename(file)}`);
    if (page < totalPages - 1) await sleep(DELAY_MS);
  }
  console.log("Resolved fetch complete.");
}

async function fetchOpen() {
  console.log("Fetching open/in-progress/reopened tickets for WIP…");

  // Read total from first page, then paginate until exhausted. Resumable.
  let pageNum = 0;
  let total = Infinity;

  while (pageNum * MAX_RESULTS < total) {
    const file = openPageFile(pageNum);
    if (fs.existsSync(file)) {
      // Already fetched — read total from it to set stopping condition
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as { total?: number; issues?: unknown[] };
      total = cached.total ?? total;
      console.log(`  Open page ${pageNum}: already exists, skipping`);
      pageNum++;
      continue;
    }

    const data = await fetchOnePage(
      OPEN_JQL,
      pageNum * MAX_RESULTS,
      "summary,description,issuetype,status,priority,assignee,reporter,components,labels,created,resolutiondate,comment",
      "changelog"
    );
    const page = data as { total?: number; issues?: unknown[] };
    total = page.total ?? 0;
    const issues = page.issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Open page ${pageNum}: saved ${issues.length} issues → ${path.basename(file)}  (total=${total})`);

    if (issues.length === 0) break;
    pageNum++;
    if (pageNum * MAX_RESULTS < total) await sleep(DELAY_MS);
  }

  console.log(`Open fetch complete (${pageNum} pages, total=${total}).`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--open")) {
    await fetchOpen();
    return;
  }

  const pagesArg = args.indexOf("--pages");
  const totalPages = pagesArg !== -1 ? parseInt(args[pagesArg + 1], 10) : 20;
  await fetchResolved(totalPages);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
