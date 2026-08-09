import fs from "fs";
import path from "path";
// config.ts must be imported before db.ts so loadDotenv() runs first,
// ensuring FOREMAN_DATA_DIR (and other env vars) are set before the DB opens.
import { config, applyOAuthOverride } from "./config.js";
import { getOAuthConnection } from "./oauth.js";
import { RAW_DIR } from "../db.js";

const MAX_RESULTS = 100;
const DELAY_MS = 250;

// Cloud pagination: isLast has a known bug where it may never turn true
// and nextPageToken can chain endlessly. Guard with hard caps in addition
// to the empty/isLast/absent-token/looping-token checks below.
const CLOUD_OPEN_PAGE_CAP = 50;

const FIELDS =
  "summary,description,issuetype,status,priority,assignee,reporter,components,labels,created,resolutiondate,comment";

function pageFile(page: number): string {
  return path.join(RAW_DIR, `${config.slug}-page-${String(page).padStart(3, "0")}.json`);
}

function openPageFile(page: number): string {
  return path.join(RAW_DIR, `${config.slug}-open-page-${String(page).padStart(3, "0")}.json`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.authHeader) headers["Authorization"] = config.authHeader;
  return headers;
}

// ── Server (Jira v2) — startAt pagination ─────────────────────────────────────

async function fetchOnePageServer(
  jql: string,
  startAt: number,
  retries = 3
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(MAX_RESULTS),
    fields: FIELDS,
    expand: "changelog",
  });
  const url = `${config.baseUrl}/rest/api/2/search?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status} startAt=${startAt} attempt ${attempt}`);
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

// ── Cloud (Jira v3) — nextPageToken pagination ────────────────────────────────
// /rest/api/2/search and /rest/api/3/search are removed on *.atlassian.net.
// Cloud must use GET /rest/api/3/search/jql with nextPageToken pagination.
// expand=changelog caps histories at ~40 per issue — acceptable for status transitions.

async function fetchOnePageCloud(
  jql: string,
  nextPageToken: string | null,
  retries = 3
): Promise<Record<string, unknown>> {
  const paramObj: Record<string, string> = {
    jql,
    maxResults: String(MAX_RESULTS),
    fields: FIELDS,
    expand: "changelog",
  };
  if (nextPageToken) paramObj.nextPageToken = nextPageToken;
  const params = new URLSearchParams(paramObj);
  const url = `${config.baseUrl}/rest/api/3/search/jql?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: buildHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status} token=${nextPageToken ?? "start"} attempt ${attempt}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (attempt === retries) throw err;
      const backoff = attempt * 1000;
      console.error(`  token=${nextPageToken ?? "start"} attempt ${attempt} failed: ${err}. Retrying in ${backoff}ms…`);
      await sleep(backoff);
    }
  }
  throw new Error("unreachable");
}

// ── Resolved fetch ─────────────────────────────────────────────────────────────

async function fetchResolvedServer(totalPages: number) {
  console.log(`[server] Fetching ${totalPages} resolved pages (~${totalPages * MAX_RESULTS} issues)…`);
  for (let page = 0; page < totalPages; page++) {
    const file = pageFile(page);
    if (fs.existsSync(file)) {
      console.log(`  Page ${page}: already exists, skipping`);
      continue;
    }
    const data = await fetchOnePageServer(config.jqlResolved, page * MAX_RESULTS);
    const issues = (data as { issues?: unknown[] }).issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Page ${page}: saved ${issues.length} issues → ${path.basename(file)}`);
    if (page < totalPages - 1) await sleep(DELAY_MS);
  }
  console.log("Resolved fetch complete.");
}

async function fetchResolvedCloud(totalPages: number) {
  console.log(`[cloud] Fetching up to ${totalPages} resolved pages…`);
  let pageNum = 0;
  let nextPageToken: string | null = null;
  let prevToken = "__none__";

  while (pageNum < totalPages) {
    const file = pageFile(pageNum);
    if (fs.existsSync(file)) {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as {
        nextPageToken?: string;
        issues?: unknown[];
      };
      nextPageToken = cached.nextPageToken ?? null;
      console.log(`  Page ${pageNum}: already exists, skipping`);
      pageNum++;
      if (!nextPageToken) break;
      continue;
    }

    const data = await fetchOnePageCloud(config.jqlResolved, nextPageToken);
    const page = data as { issues?: unknown[]; nextPageToken?: string; isLast?: boolean };
    const issues = page.issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Page ${pageNum}: saved ${issues.length} issues → ${path.basename(pageFile(pageNum))}`);

    const newToken = page.nextPageToken ?? null;
    const done = issues.length === 0 || page.isLast === true || !newToken || newToken === prevToken;
    prevToken = newToken ?? "__none__";
    nextPageToken = newToken;
    pageNum++;
    if (done) break;
    if (pageNum < totalPages) await sleep(DELAY_MS);
  }
  console.log("Resolved fetch complete.");
}

// ── Open fetch ────────────────────────────────────────────────────────────────

async function fetchOpenServer() {
  console.log("[server] Fetching open/in-progress/reopened tickets for WIP…");
  let pageNum = 0;
  let total = Infinity;

  while (pageNum * MAX_RESULTS < total) {
    const file = openPageFile(pageNum);
    if (fs.existsSync(file)) {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as {
        total?: number;
        issues?: unknown[];
      };
      total = cached.total ?? total;
      console.log(`  Open page ${pageNum}: already exists, skipping`);
      pageNum++;
      continue;
    }

    const data = await fetchOnePageServer(config.jqlOpen, pageNum * MAX_RESULTS);
    const page = data as { total?: number; issues?: unknown[] };
    total = page.total ?? 0;
    const issues = page.issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Open page ${pageNum}: saved ${issues.length} issues → ${path.basename(openPageFile(pageNum))}  (total=${total})`);

    if (issues.length === 0) break;
    pageNum++;
    if (pageNum * MAX_RESULTS < total) await sleep(DELAY_MS);
  }
  console.log(`Open fetch complete (${pageNum} pages, total=${total}).`);
}

async function fetchOpenCloud() {
  console.log("[cloud] Fetching open/in-progress tickets for WIP…");
  let pageNum = 0;
  let nextPageToken: string | null = null;
  let prevToken = "__none__";

  while (pageNum < CLOUD_OPEN_PAGE_CAP) {
    const file = openPageFile(pageNum);
    if (fs.existsSync(file)) {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as {
        nextPageToken?: string;
        issues?: unknown[];
      };
      nextPageToken = cached.nextPageToken ?? null;
      console.log(`  Open page ${pageNum}: already exists, skipping`);
      pageNum++;
      if (!nextPageToken) break;
      continue;
    }

    const data = await fetchOnePageCloud(config.jqlOpen, nextPageToken);
    const page = data as { issues?: unknown[]; nextPageToken?: string; isLast?: boolean };
    const issues = page.issues ?? [];
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`  Open page ${pageNum}: saved ${issues.length} issues → ${path.basename(openPageFile(pageNum))}`);

    const newToken = page.nextPageToken ?? null;
    const done = issues.length === 0 || page.isLast === true || !newToken || newToken === prevToken;
    prevToken = newToken ?? "__none__";
    nextPageToken = newToken;
    pageNum++;
    if (done) break;
    await sleep(DELAY_MS);
  }
  console.log(`Open fetch complete (${pageNum} pages).`);
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // A one-click OAuth connection (made at /connect) takes priority over env auth.
  const oauth = await getOAuthConnection();
  if (oauth) {
    applyOAuthOverride(oauth);
    console.log(
      `Using OAuth connection. Set JIRA_PROJECT in .env to pick the project (current: ${config.project}).`
    );
  }

  console.log(
    `Jira config: api=${config.api} project=${config.project} baseUrl=${config.baseUrl}`
  );

  if (args.includes("--open")) {
    if (config.api === "cloud") {
      await fetchOpenCloud();
    } else {
      await fetchOpenServer();
    }
    return;
  }

  const pagesArg = args.indexOf("--pages");
  const totalPages = pagesArg !== -1 ? parseInt(args[pagesArg + 1], 10) : 20;

  if (config.api === "cloud") {
    await fetchResolvedCloud(totalPages);
  } else {
    await fetchResolvedServer(totalPages);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
