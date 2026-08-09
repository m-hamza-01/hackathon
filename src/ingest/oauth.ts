/**
 * Jira OAuth 2.0 (3LO) connection helper for the ingest layer.
 *
 * Reads data/jira-oauth.json, refreshes if the access token is within 5 min
 * of expiry, persists the new tokens (Atlassian uses rotating refresh tokens —
 * always store the returned refresh_token), and returns the baseUrl + Bearer
 * header for API calls.
 *
 * Returns null if no token file exists or credentials are missing.
 * Never imports Next.js — pure Node, safe to call from CLI scripts.
 */

import fs from "fs";
import path from "path";

interface JiraOAuthConnection {
  cloudId: string;
  siteUrl: string;
  siteName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: number;
  sites?: unknown[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

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

function resolveTokenFile(): string {
  const dataDir = process.env.TASKSCOPE_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "jira-oauth.json");
}

function readConnection(): JiraOAuthConnection | null {
  const tokenFile = resolveTokenFile();
  try {
    const raw = fs.readFileSync(tokenFile, "utf8");
    const conn = JSON.parse(raw) as Partial<JiraOAuthConnection>;
    if (!conn.accessToken || !conn.cloudId || !conn.expiresAt) return null;
    return conn as JiraOAuthConnection;
  } catch {
    return null;
  }
}

function writeConnection(conn: JiraOAuthConnection): void {
  const tokenFile = resolveTokenFile();
  const dataDir = path.dirname(tokenFile);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tokenFile, JSON.stringify(conn, null, 2), "utf8");
}

async function refreshTokens(conn: JiraOAuthConnection): Promise<JiraOAuthConnection | null> {
  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[oauth] JIRA_OAUTH_CLIENT_ID or JIRA_OAUTH_CLIENT_SECRET not set — cannot refresh");
    return null;
  }

  const authBase = process.env.JIRA_OAUTH_AUTH_BASE ?? "https://auth.atlassian.com";

  try {
    const res = await fetch(`${authBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conn.refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("[oauth] refresh failed, status:", res.status);
      return null;
    }

    const data = (await res.json()) as TokenResponse;
    if (!data.access_token) {
      console.error("[oauth] refresh response missing access_token");
      return null;
    }

    // Atlassian refresh tokens rotate — always store the new one.
    const refreshed: JiraOAuthConnection = {
      ...conn,
      accessToken: data.access_token,
      // Use the returned refresh_token if present; retain the old one only as
      // a last resort (Atlassian always returns a new one but be defensive).
      refreshToken: data.refresh_token ?? conn.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scopes: data.scope ? data.scope.split(" ") : conn.scopes,
    };

    writeConnection(refreshed);
    return refreshed;
  } catch (err) {
    console.error("[oauth] refresh network error:", err);
    return null;
  }
}

export interface OAuthConnection {
  baseUrl: string;
  authHeader: string;
}

/**
 * Returns { baseUrl, authHeader } for making Jira API calls, or null if not
 * connected / credentials missing.
 *
 * Refreshes automatically when the access token is within 5 minutes of expiry.
 */
export async function getOAuthConnection(): Promise<OAuthConnection | null> {
  loadDotenv();

  let conn = readConnection();
  if (!conn) return null;

  const FIVE_MIN_MS = 5 * 60 * 1000;
  if (Date.now() >= conn.expiresAt - FIVE_MIN_MS) {
    const refreshed = await refreshTokens(conn);
    if (!refreshed) return null;
    conn = refreshed;
  }

  const apiBase = process.env.JIRA_OAUTH_API_BASE ?? "https://api.atlassian.com";

  return {
    baseUrl: `${apiBase}/ex/jira/${conn.cloudId}`,
    authHeader: `Bearer ${conn.accessToken}`,
  };
}
