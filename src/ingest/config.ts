import fs from "fs";
import path from "path";

// .env loader — reads project-root .env, does not overwrite already-set vars.
// Duplicated from src/engine/synthesize.ts; do not refactor that file.
function loadDotenv(): void {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../.env"),
  ];
  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) process.env[key] = val;
      }
      return;
    } catch {
      // try next candidate
    }
  }
}

loadDotenv();

const APACHE_KAFKA_BASE = "https://issues.apache.org/jira";

// Exact JQL strings from the original fetch.ts — preserved for demo-dataset reproducibility.
const KAFKA_JQL_RESOLVED =
  "project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC";
const KAFKA_JQL_OPEN =
  'project=KAFKA AND resolution=EMPTY AND status in ("In Progress","Patch Available","Reopened") AND assignee is not EMPTY ORDER BY updated DESC';

export interface JiraConfig {
  baseUrl: string;
  project: string;
  api: "cloud" | "server";
  authHeader: string | null;
  jqlResolved: string;
  jqlOpen: string;
  pseudonymize: boolean;
  slug: string;
}

function buildConfig(): JiraConfig {
  const baseUrl = (process.env.JIRA_BASE_URL ?? APACHE_KAFKA_BASE).replace(/\/+$/, "");
  const project = process.env.JIRA_PROJECT ?? "KAFKA";

  // Auto-detect API type from baseUrl; JIRA_API env overrides.
  let api: "cloud" | "server";
  if (process.env.JIRA_API === "cloud" || process.env.JIRA_API === "server") {
    api = process.env.JIRA_API;
  } else {
    api = baseUrl.includes(".atlassian.net") ? "cloud" : "server";
  }

  // Auth: JIRA_EMAIL + JIRA_API_TOKEN → Basic base64(email:token) (Cloud standard);
  // JIRA_PAT → Bearer (Server/DC standard); neither → no auth (public instances).
  let authHeader: string | null = null;
  if (process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    const creds = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
    authHeader = `Basic ${creds}`;
  } else if (process.env.JIRA_PAT) {
    authHeader = `Bearer ${process.env.JIRA_PAT}`;
  }

  // JQL: env override wins; otherwise preserve exact KAFKA strings for demo-dataset
  // reproducibility, or use generic templates for any other project/instance.
  const isDefaultKafka = baseUrl === APACHE_KAFKA_BASE && project === "KAFKA";
  const jqlResolved =
    process.env.JIRA_JQL_RESOLVED ??
    (isDefaultKafka
      ? KAFKA_JQL_RESOLVED
      : `project = ${project} AND resolutiondate is not EMPTY AND assignee is not EMPTY ORDER BY resolved DESC`);
  const jqlOpen =
    process.env.JIRA_JQL_OPEN ??
    (isDefaultKafka
      ? KAFKA_JQL_OPEN
      : `project = ${project} AND resolutiondate is EMPTY AND statusCategory = "In Progress" AND assignee is not EMPTY ORDER BY updated DESC`);

  // PSEUDONYMIZE=false disables pseudonymization (use when ingesting your own team's data).
  const pseudonymize = process.env.PSEUDONYMIZE !== "false";

  // slug drives raw file naming; project=KAFKA → slug=kafka → matches existing cache files.
  const slug = project.toLowerCase();

  return { baseUrl, project, api, authHeader, jqlResolved, jqlOpen, pseudonymize, slug };
}

export const config: JiraConfig = buildConfig();

// One-click OAuth connection (from /connect) takes priority over env auth.
// Mutates config in place: Cloud API via api.atlassian.com/ex/jira/{cloudId},
// Bearer token auth, and — since the legacy KAFKA JQL only applies to the
// Apache demo instance — generic JQL templates unless env overrides exist.
export function applyOAuthOverride(conn: { baseUrl: string; authHeader: string }): void {
  config.baseUrl = conn.baseUrl;
  config.authHeader = conn.authHeader;
  config.api = "cloud";
  if (!process.env.JIRA_JQL_RESOLVED) {
    config.jqlResolved = `project = ${config.project} AND resolutiondate is not EMPTY AND assignee is not EMPTY ORDER BY resolved DESC`;
  }
  if (!process.env.JIRA_JQL_OPEN) {
    config.jqlOpen = `project = ${config.project} AND resolutiondate is EMPTY AND statusCategory = "In Progress" AND assignee is not EMPTY ORDER BY updated DESC`;
  }
}
