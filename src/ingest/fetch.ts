import fs from "fs";
import path from "path";
import { RAW_DIR } from "../db.js";

const BASE_URL = "https://issues.apache.org/jira/rest/api/2/search";
const JQL =
  "project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC";
const MAX_RESULTS = 100;
const DELAY_MS = 250;

function pageFile(page: number): string {
  return path.join(RAW_DIR, `kafka-page-${String(page).padStart(3, "0")}.json`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  page: number,
  retries = 3
): Promise<Record<string, unknown>> {
  const startAt = page * MAX_RESULTS;
  const params = new URLSearchParams({
    jql: JQL,
    startAt: String(startAt),
    maxResults: String(MAX_RESULTS),
    expand: "changelog",
    fields:
      "summary,description,issuetype,status,priority,assignee,reporter,components,labels,created,resolutiondate,comment",
  });

  const url = `${BASE_URL}?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on page ${page} attempt ${attempt}`);
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = attempt * 1000;
      console.error(`  Page ${page} attempt ${attempt} failed: ${err}. Retrying in ${backoff}ms…`);
      await sleep(backoff);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const args = process.argv.slice(2);
  const pagesArg = args.indexOf("--pages");
  const totalPages = pagesArg !== -1 ? parseInt(args[pagesArg + 1], 10) : 20;

  console.log(`Fetching ${totalPages} pages (~${totalPages * MAX_RESULTS} issues)…`);

  for (let page = 0; page < totalPages; page++) {
    const file = pageFile(page);

    if (fs.existsSync(file)) {
      console.log(`  Page ${page}: already exists, skipping`);
      continue;
    }

    const data = await fetchPage(page);
    const issues = (data as { issues?: unknown[] }).issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Page ${page}: saved ${issues.length} issues → ${path.basename(file)}`);

    if (page < totalPages - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log("Fetch complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
