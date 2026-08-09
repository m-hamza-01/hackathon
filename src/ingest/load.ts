import fs from "fs";
import path from "path";
// config.ts must be imported before db.ts so loadDotenv() runs first.
import { config } from "./config.js";
import { db, RAW_DIR } from "../db.js";
import { getPseudonym } from "../pseudonyms.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface JiraUser {
  name?: string;
  accountId?: string;   // Cloud only — GDPR removed `name` on *.atlassian.net
  displayName?: string;
}

interface JiraComment {
  author?: JiraUser;
  body?: unknown;       // Server: string; Cloud: Atlassian Document Format (ADF) object
  created?: string;
}

interface JiraHistory {
  created?: string;
  items?: Array<{
    field?: string;
    fromString?: string;
    toString?: string;
  }>;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: unknown; // Server: string; Cloud: ADF object
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: JiraUser;
    reporter?: JiraUser;
    components?: Array<{ name?: string }>;
    labels?: string[];
    created?: string;
    resolutiondate?: string;
    comment?: {
      total?: number;       // prefer total over comments.length (Cloud caps inline list)
      comments?: JiraComment[];
    };
  };
  changelog?: { histories?: JiraHistory[] };
}

interface JiraPage {
  issues?: JiraIssue[];
}

// ── ADF → plain text ──────────────────────────────────────────────────────────
// Cloud v3 returns description and comment bodies as Atlassian Document Format
// (ADF) JSON objects. Server v2 returns plain strings. This helper handles both.

function adfToText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v || null;
  if (typeof v !== "object") return null;

  // Recursively collect all .text leaf values from ADF .content trees.
  const texts: string[] = [];
  function collect(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.text === "string" && n.text) texts.push(n.text);
    if (Array.isArray(n.content)) {
      for (const child of n.content) collect(child);
    }
  }
  collect(v);
  const result = texts.join(" ").trim();
  return result || null;
}

// ── Prepared statements ──────────────────────────────────────────────────────

const upsertPerson = db.prepare<[string, string, string]>(`
  INSERT INTO people (username, real_name, display_name)
  VALUES (?, ?, ?)
  ON CONFLICT(username) DO UPDATE SET real_name = excluded.real_name
  RETURNING id
`);

const getPersonByUsername = db.prepare<[string], { id: number }>(
  "SELECT id FROM people WHERE username = ?"
);

const countPeople = db.prepare<[], { c: number }>(
  "SELECT COUNT(*) AS c FROM people"
);

const upsertTicket = db.prepare<[
  number, string, string | null, string | null, string | null,
  string | null, string | null, string, string, number | null,
  number | null, string | null, string | null, number | null,
  number | null, number, number
]>(`
  INSERT INTO tickets
    (id, key, title, description, type, status, priority, components, labels,
     assignee_id, reporter_id, created, resolved, cycle_days, work_days,
     reopen_count, comment_count)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    key          = excluded.key,
    title        = excluded.title,
    description  = excluded.description,
    type         = excluded.type,
    status       = excluded.status,
    priority     = excluded.priority,
    components   = excluded.components,
    labels       = excluded.labels,
    assignee_id  = excluded.assignee_id,
    reporter_id  = excluded.reporter_id,
    created      = excluded.created,
    resolved     = excluded.resolved,
    cycle_days   = excluded.cycle_days,
    work_days    = excluded.work_days,
    reopen_count = excluded.reopen_count,
    comment_count = excluded.comment_count
`);

const deleteTransitions = db.prepare<[number]>(
  "DELETE FROM transitions WHERE ticket_id = ?"
);
const insertTransition = db.prepare<[number, string, string, string]>(
  "INSERT INTO transitions (ticket_id, from_status, to_status, at) VALUES (?,?,?,?)"
);

const deleteComments = db.prepare<[number]>(
  "DELETE FROM comments WHERE ticket_id = ?"
);
const insertComment = db.prepare<[number, number | null, string, string]>(
  "INSERT INTO comments (ticket_id, author_id, body, at) VALUES (?,?,?,?)"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

function ensurePerson(user: JiraUser | undefined | null): number | null {
  // Cloud users have no `name` (GDPR); key on name ?? accountId.
  const key = user?.name ?? user?.accountId;
  if (!key) return null;

  const existing = getPersonByUsername.get(key);
  if (existing) return existing.id;

  const { c } = countPeople.get()!;
  // When pseudonymize=false (team's own Jira), use the real displayName.
  // display_name has a UNIQUE constraint — assumes displayNames are unique within the project.
  const displayName = config.pseudonymize
    ? getPseudonym(c)
    : (user?.displayName ?? key);

  const row = upsertPerson.get(
    key,
    user?.displayName ?? key,
    displayName
  );
  // row may be undefined if ON CONFLICT updated (shouldn't happen for new inserts, but guard)
  if (row) return row.id;
  return getPersonByUsername.get(key)?.id ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function loadPage(issues: JiraIssue[]) {
  for (const issue of issues) {
    const f = issue.fields ?? {};
    const changelog = issue.changelog ?? {};
    const histories: JiraHistory[] = changelog.histories ?? [];

    // Collect status transitions
    const statusTransitions: Array<{
      from: string;
      to: string;
      at: string;
    }> = [];

    for (const h of histories) {
      for (const item of h.items ?? []) {
        if (item.field === "status" && h.created) {
          statusTransitions.push({
            from: item.fromString ?? "",
            to: item.toString ?? "",
            at: h.created,
          });
        }
      }
    }

    // Derived metrics
    const created = f.created ?? null;
    const resolved = f.resolutiondate ?? null;

    const cycle_days =
      created && resolved ? daysBetween(created, resolved) : null;

    // work_days: time from first "In Progress" or "Patch Available" transition
    const workStartStatuses = ["in progress", "patch available"];
    const firstWorkTransition = statusTransitions
      .filter((t) => workStartStatuses.includes(t.to.toLowerCase()))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];

    const work_days =
      firstWorkTransition && resolved
        ? daysBetween(firstWorkTransition.at, resolved)
        : null;

    const reopen_count = statusTransitions.filter(
      (t) => t.to.toLowerCase() === "reopened"
    ).length;

    const comments: JiraComment[] = f.comment?.comments ?? [];
    // Prefer f.comment.total: Cloud caps the inline comments array at ~5,
    // while total reflects the true count.
    const comment_count = f.comment?.total ?? comments.length;

    // Ensure people exist
    const assignee_id = ensurePerson(f.assignee);
    const reporter_id = ensurePerson(f.reporter);

    const components = JSON.stringify(
      (f.components ?? []).map((c) => c.name).filter(Boolean)
    );
    const labels = JSON.stringify(f.labels ?? []);

    const ticketId = parseInt(issue.id, 10);

    upsertTicket.run(
      ticketId,
      issue.key,
      f.summary ?? null,
      adfToText(f.description),  // normalise ADF (Cloud) or passthrough string (Server)
      f.issuetype?.name ?? null,
      f.status?.name ?? null,
      f.priority?.name ?? null,
      components,
      labels,
      assignee_id,
      reporter_id,
      created,
      resolved,
      cycle_days,
      work_days,
      reopen_count,
      comment_count
    );

    // Replace transitions and comments for this ticket
    deleteTransitions.run(ticketId);
    for (const t of statusTransitions) {
      insertTransition.run(ticketId, t.from, t.to, t.at);
    }

    deleteComments.run(ticketId);
    for (const c of comments) {
      const author_id = ensurePerson(c.author);
      insertComment.run(
        ticketId,
        author_id,
        adfToText(c.body) ?? "",  // normalise ADF (Cloud) or passthrough string (Server)
        c.created ?? ""
      );
    }
  }
}

const loadAll = db.transaction((pages: JiraIssue[][]) => {
  for (const issues of pages) {
    loadPage(issues);
  }
});

// ── Entry point ───────────────────────────────────────────────────────────────

function readPages(prefix: string): JiraIssue[][] {
  return fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8")) as JiraPage;
      return raw.issues ?? [];
    });
}

function main() {
  // Resolved tickets — file prefix matches slug (kafka → kafka-page-, mock → mock-page-)
  const resolvedPages = readPages(`${config.slug}-page-`);
  if (resolvedPages.length === 0) {
    console.error("No resolved pages found in", RAW_DIR, "— run `npm run fetch` first.");
    process.exit(1);
  }
  console.log(`Loading ${resolvedPages.length} resolved page(s)…`);
  loadAll(resolvedPages);

  // Open/in-progress tickets — same structure, resolutiondate is null so
  // resolved/cycle_days/work_days stay NULL in the DB.
  const openPages = readPages(`${config.slug}-open-page-`);
  if (openPages.length > 0) {
    const openCount = openPages.reduce((s, p) => s + p.length, 0);
    console.log(`Loading ${openPages.length} open page(s) (${openCount} tickets)…`);
    loadAll(openPages);
  }

  const stats = db
    .prepare<[], { tickets: number; people: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tickets)                        AS tickets,
         (SELECT COUNT(*) FROM people)                         AS people,
         (SELECT COUNT(*) FROM tickets WHERE resolved IS NULL) AS open`
    )
    .get()!;

  console.log(
    `Done. ${stats.tickets} tickets total (${stats.open} open/WIP), ${stats.people} people.`
  );
}

main();
