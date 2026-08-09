/**
 * Singleton SQLite connection for Next.js route handlers.
 *
 * DB_PATH is resolved relative to process.cwd() which is always the web/
 * directory when Next.js is started with `next dev` or `next start`.
 *
 * The global cache prevents duplicate open connections across hot-reload cycles
 * in development (Next.js re-evaluates modules on each code change; the DB
 * connection would otherwise be re-created on every save).
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "../data/foreman.db");

declare global {
  // eslint-disable-next-line no-var
  var _foreman_db: Database.Database | undefined;
}

function openDb(): Database.Database {
  if (!global._foreman_db) {
    global._foreman_db = new Database(DB_PATH, { readonly: true });
  }
  return global._foreman_db;
}

export const db = openDb();
