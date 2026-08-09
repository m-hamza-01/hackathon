import fs from "fs";
import path from "path";

function resolveDataDir(): string {
  if (process.env.FOREMAN_DATA_DIR) {
    return process.env.FOREMAN_DATA_DIR;
  }
  return path.join(process.cwd(), "../data");
}

/**
 * Returns true if jira-oauth.json exists, parses as JSON, and has
 * truthy accessToken and expiresAt fields. File is read lazily (inside
 * the function body) so importing this module is safe at build time
 * when data/ does not exist.
 */
export function isJiraConnected(): boolean {
  const tokenFile = path.join(resolveDataDir(), "jira-oauth.json");
  try {
    const raw = fs.readFileSync(tokenFile, "utf8");
    const conn = JSON.parse(raw) as { accessToken?: unknown; expiresAt?: unknown };
    return !!(conn.accessToken && conn.expiresAt);
  } catch {
    return false;
  }
}
