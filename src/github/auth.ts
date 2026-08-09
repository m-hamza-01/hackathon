/**
 * GitHub App token provider.
 *
 * Builds a short-lived RS256 JWT, exchanges it for an installation access
 * token, and caches the result until 5 minutes before expiry.
 *
 * Design notes
 * ─────────────
 * JWT construction uses only node:crypto (no jsonwebtoken dep).
 *   iss = GITHUB_APP_ID (numeric string, e.g. "12345")
 *   iat = now - 60 s   (60-second back-date absorbs typical clock drift)
 *   exp = now + 540 s  (9 min; GitHub's hard limit is 10 min)
 *
 * getInstallationToken() returns null — never throws — when the App is not
 * configured or the PEM file cannot be read. Callers treat null as
 * "GitHub not available" and skip GitHub-dependent paths.
 *
 * Consuming the token in PR ingest
 * ──────────────────────────────────
 * The `gh` CLI can be driven with a plain PAT-style token via:
 *   GH_TOKEN=<token> gh pr list --repo owner/repo ...
 * Alternatively, pass it directly as Authorization: Bearer <token> in fetch
 * calls. The supervisor wires that plumbing; this module just provides the token.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

// ── Dotenv loader ─────────────────────────────────────────────────────────────
// Tries cwd (project root when running as CLI) then cwd/.. (web/ when imported
// by the Next.js server). Does not overwrite vars already present in the env.

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

// ── Data directory ─────────────────────────────────────────────────────────────
// TASKSCOPE_DATA_DIR wins; otherwise defaults to <cwd>/data (project root when
// run as a CLI script).

function resolveDataDir(): string {
  if (process.env.TASKSCOPE_DATA_DIR) return process.env.TASKSCOPE_DATA_DIR;
  return path.join(process.cwd(), "data");
}

// ── GitHub API base ────────────────────────────────────────────────────────────
// GITHUB_API_BASE overrides the real API — used in tests to point at a local mock.

function apiBase(): string {
  return process.env.GITHUB_API_BASE ?? "https://api.github.com";
}

// ── GitHub App connection record ───────────────────────────────────────────────
// Written by web/src/app/api/auth/github/setup/route.ts after install.
// Only metadata — no tokens — persists on disk.

export interface GitHubAppConnection {
  installationId: number;
  account: string;
  repos: string[];
  connectedAt: string;
}

function readAppConnection(): GitHubAppConnection | null {
  const filePath = path.join(resolveDataDir(), "github-app.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as GitHubAppConnection;
  } catch {
    return null;
  }
}

// ── RS256 JWT builder ──────────────────────────────────────────────────────────
// We build the JWT manually to avoid any external dependency.
// base64url: standard base64 with +→- /→_ and padding stripped.

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function buildAppJWT(appId: string, pemKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: appId,   // GitHub accepts the numeric App ID or client ID; App ID is simpler
      iat: now - 60, // back-dated 60 s to absorb clock drift between machines
      exp: now + 540, // 9 min from now; GitHub hard-limits JWTs to 10 min
    })
  );
  const data = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  const sig = signer
    .sign(pemKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${data}.${sig}`;
}

// ── In-memory cache ────────────────────────────────────────────────────────────
// Installation tokens last ~1 hour. We refresh when fewer than 5 min remain.

interface CachedToken {
  token: string;
  expiresAt: string; // ISO 8601 string from GitHub
  expiresMs: number; // milliseconds epoch for comparison
}

let cachedToken: CachedToken | null = null;

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 min

// ── Public API ─────────────────────────────────────────────────────────────────

export interface InstallationToken {
  token: string;
  expiresAt: string; // ISO 8601
}

/**
 * Returns a short-lived GitHub installation access token.
 *
 * On first call (or after the cache nears expiry): builds an RS256 app JWT,
 * then POSTs to /app/installations/{id}/access_tokens to mint a new token.
 *
 * Returns null without throwing when:
 *   - GITHUB_APP_ID is not set
 *   - GITHUB_APP_PRIVATE_KEY_PATH (or default data/github-app.pem) can't be read
 *   - data/github-app.json is missing (App not installed yet)
 *   - The GitHub API call fails
 */
export async function getInstallationToken(): Promise<InstallationToken | null> {
  loadDotenv();

  const appId = process.env.GITHUB_APP_ID;
  const pemPath =
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ??
    path.join(resolveDataDir(), "github-app.pem");

  if (!appId) return null;

  let pemKey: string;
  try {
    pemKey = fs.readFileSync(pemPath, "utf8");
  } catch {
    return null;
  }

  const connection = readAppConnection();
  if (!connection) return null;

  // Serve cached token if it has more than 5 min of life remaining.
  if (cachedToken && cachedToken.expiresMs - Date.now() > REFRESH_MARGIN_MS) {
    return { token: cachedToken.token, expiresAt: cachedToken.expiresAt };
  }

  try {
    const jwt = buildAppJWT(appId, pemKey);
    const res = await fetch(
      `${apiBase()}/app/installations/${connection.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      console.warn(`[github/auth] installation token request failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { token: string; expires_at: string };
    const expiresMs = new Date(data.expires_at).getTime();

    cachedToken = { token: data.token, expiresAt: data.expires_at, expiresMs };
    return { token: data.token, expiresAt: data.expires_at };
  } catch (err) {
    console.warn("[github/auth] getInstallationToken error:", err);
    return null;
  }
}
