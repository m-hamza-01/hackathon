import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const RAW_DIR = path.join(DATA_DIR, "raw");
const DB_PATH = path.join(DATA_DIR, "taskscope.db");

// Ensure data directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for concurrent reads during load
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE,
    real_name    TEXT,
    display_name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id            INTEGER PRIMARY KEY,
    key           TEXT UNIQUE,
    title         TEXT,
    description   TEXT,
    type          TEXT,
    status        TEXT,
    priority      TEXT,
    components    TEXT,
    labels        TEXT,
    assignee_id   INTEGER,
    reporter_id   INTEGER,
    created       TEXT,
    resolved      TEXT,
    cycle_days    REAL,
    work_days     REAL,
    reopen_count  INTEGER,
    comment_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS transitions (
    ticket_id   INTEGER,
    from_status TEXT,
    to_status   TEXT,
    at          TEXT
  );

  CREATE TABLE IF NOT EXISTS comments (
    ticket_id INTEGER,
    author_id INTEGER,
    body      TEXT,
    at        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_comments_ticket  ON comments(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_transitions_ticket ON transitions(ticket_id);
`);

export { db, DATA_DIR, RAW_DIR, DB_PATH };
