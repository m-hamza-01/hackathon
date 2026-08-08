import fs from "fs";
import path from "path";
import { db, RAW_DIR } from "../db.js";
import { getPseudonym } from "../pseudonyms.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface JiraUser {
  name?: string;
  displayName?: string;
}

interface JiraComment {
  author?: JiraUser;
  body?: string;
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
    description?: string;
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: JiraUser;
    reporter?: JiraUser;
    components?: Array<{ name?: string }>;
    labels?: string[];
    created?: string;
    resolutiondate?: string;
    comment?: { comments?: JiraComment[] };
  };
  changelog?: { histories?: JiraHistory[] };
}

interface JiraPage {
  issues?: JiraIssue[];
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
  if (!user?.name) return null;
  const existing = getPersonByUsername.get(user.name);
  if (existing) return existing.id;

  const { c } = countPeople.get()!;
  const pseudonym = getPseudonym(c);

  const row = upsertPerson.get(
    user.name,
    user.displayName ?? user.name,
    pseudonym
  );
  // row may be undefined if ON CONFLICT updated (shouldn't happen for new inserts, but guard)
  if (row) return row.id;
  return getPersonByUsername.get(user.name)?.id ?? null;
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
    const comment_count = comments.length;

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
      f.description ?? null,
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
        c.body ?? "",
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

// ── Open tickets (WIP snapshot) ───────────────────────────────────────────────

interface OpenIssue {
  id: string;
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string };
    assignee?: JiraUser;
  };
}

const clearOpenTickets = db.prepare("DELETE FROM open_tickets");
const insertOpenTicket = db.prepare<[number, string, string | null, string | null, number | null]>(
  "INSERT OR REPLACE INTO open_tickets (id, key, title, status, assignee_id) VALUES (?,?,?,?,?)"
);

const loadOpenTickets = db.transaction((issues: OpenIssue[]) => {
  clearOpenTickets.run();
  for (const issue of issues) {
    const f = issue.fields ?? {};
    const assignee_id = ensurePerson(f.assignee);
    insertOpenTicket.run(
      parseInt(issue.id, 10),
      issue.key,
      f.summary ?? null,
      f.status?.name ?? null,
      assignee_id
    );
  }
});

function maybeLoadOpenTickets() {
  const openFile = path.join(RAW_DIR, "kafka-open.json");
  if (!fs.existsSync(openFile)) return;

  const raw = JSON.parse(fs.readFileSync(openFile, "utf8")) as { issues?: OpenIssue[] };
  const issues = raw.issues ?? [];
  loadOpenTickets(issues);
  console.log(`Loaded ${issues.length} open/in-progress tickets (WIP snapshot).`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main() {
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.startsWith("kafka-page-") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error("No raw pages found in", RAW_DIR, "— run `npm run fetch` first.");
    process.exit(1);
  }

  console.log(`Loading ${files.length} page(s) into SQLite…`);

  const allPages: JiraIssue[][] = [];
  for (const file of files) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(RAW_DIR, file), "utf8")
    ) as JiraPage;
    allPages.push(raw.issues ?? []);
  }

  loadAll(allPages);
  maybeLoadOpenTickets();

  const stats = db
    .prepare<[], { tickets: number; people: number; open: number }>(
      `SELECT
         (SELECT COUNT(*) FROM tickets) AS tickets,
         (SELECT COUNT(*) FROM people)  AS people,
         (SELECT COUNT(*) FROM open_tickets) AS open`
    )
    .get()!;

  console.log(
    `Done. Loaded ${stats.tickets} tickets, ${stats.people} people, ${stats.open} open-ticket WIP entries.`
  );
}

main();
