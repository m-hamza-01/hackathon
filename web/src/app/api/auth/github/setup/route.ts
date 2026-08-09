/**
 * GET /api/auth/github/setup
 *
 * GitHub App Setup URL callback. After an org admin installs the App on
 * chosen repos, GitHub redirects here with ?installation_id=<id>.
 *
 * Flow:
 *   1. Validate installation_id is numeric (non-numeric values are spoofed).
 *   2. Build an RS256 app JWT and verify the installation exists via
 *      GET /app/installations/{id}.
 *   3. Mint an installation token and list accessible repos.
 *   4. Write data/github-app.json: { installationId, account, repos, connectedAt }
 *      — no tokens written to disk; installation tokens are minted on demand.
 *   5. Redirect to /connect?github=ok (or ?github=error&reason=<generic>).
 *
 * GITHUB_API_BASE overrides the API host (used in tests against a local mock).
 */

import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadGithubPrivateKey } from "@/lib/github-key";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function resolveDataDir(): string {
  if (process.env.FOREMAN_DATA_DIR) return process.env.FOREMAN_DATA_DIR;
  // Next.js cwd() is typically web/; one level up reaches the project root data/.
  const fromWeb = path.join(process.cwd(), "../data");
  try {
    fs.mkdirSync(fromWeb, { recursive: true });
    return fromWeb;
  } catch {
    return path.join(process.cwd(), "data");
  }
}

function apiBase(): string {
  return process.env.GITHUB_API_BASE ?? "https://api.github.com";
}

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
      iss: appId,
      iat: now - 60,
      exp: now + 540,
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

// ── GitHub API response shapes ─────────────────────────────────────────────────

interface GitHubInstallation {
  id: number;
  account: { login: string } | null;
}

interface GitHubRepo {
  full_name: string;
}

interface GitHubRepoList {
  repositories: GitHubRepo[];
}

interface GitHubAccessToken {
  token: string;
  expires_at: string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  loadDotenv();

  // NextResponse.redirect requires absolute URLs — derive origin from the request.
  const origin = new URL(req.url).origin;
  const redirect = (query: string) =>
    NextResponse.redirect(`${origin}/connect?${query}`);

  const { searchParams } = new URL(req.url);
  const rawId = searchParams.get("installation_id");

  // Non-numeric values indicate a spoofed callback — reject immediately.
  if (!rawId || !/^\d+$/.test(rawId)) {
    return redirect("github=error&reason=invalid_installation_id");
  }
  const installationId = parseInt(rawId, 10);

  const appId = process.env.GITHUB_APP_ID;
  const dataDir = resolveDataDir();

  if (!appId) {
    return redirect("github=error&reason=app_not_configured");
  }

  const pemKey = loadGithubPrivateKey(dataDir);
  if (!pemKey) {
    console.error(
      "[github/setup] No private key found — set GITHUB_APP_PRIVATE_KEY or place the PEM at",
      process.env.GITHUB_APP_PRIVATE_KEY_PATH ?? `${dataDir}/github-app.pem`
    );
    return redirect("github=error&reason=pem_not_found");
  }

  let jwt: string;
  try {
    jwt = buildAppJWT(appId, pemKey);
  } catch (err) {
    console.error("[github/setup] JWT build failed:", err);
    return redirect("github=error&reason=jwt_error");
  }

  const base = apiBase();
  const ghHeaders = {
    Authorization: `Bearer ${jwt}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Verify the installation exists — prevents acting on spoofed IDs.
  let installation: GitHubInstallation;
  try {
    const instRes = await fetch(`${base}/app/installations/${installationId}`, {
      headers: ghHeaders,
    });
    if (!instRes.ok) {
      console.error(`[github/setup] installation lookup failed: ${instRes.status}`);
      return redirect("github=error&reason=installation_not_found");
    }
    installation = (await instRes.json()) as GitHubInstallation;
  } catch (err) {
    console.error("[github/setup] installation lookup error:", err);
    return redirect("github=error&reason=network_error");
  }

  // Mint an installation token to list repos.
  let instToken: string;
  try {
    const tokenRes = await fetch(
      `${base}/app/installations/${installationId}/access_tokens`,
      { method: "POST", headers: ghHeaders }
    );
    if (!tokenRes.ok) {
      console.error(`[github/setup] access_tokens failed: ${tokenRes.status}`);
      return redirect("github=error&reason=token_error");
    }
    const tokenData = (await tokenRes.json()) as GitHubAccessToken;
    instToken = tokenData.token;
  } catch (err) {
    console.error("[github/setup] access_tokens error:", err);
    return redirect("github=error&reason=network_error");
  }

  // List accessible repos with the installation token.
  let repos: string[] = [];
  try {
    const reposRes = await fetch(`${base}/installation/repositories?per_page=100`, {
      headers: {
        Authorization: `Bearer ${instToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (reposRes.ok) {
      const reposData = (await reposRes.json()) as GitHubRepoList;
      repos = (reposData.repositories ?? []).map((r) => r.full_name);
    }
  } catch {
    // Non-fatal — store with empty list; user can re-run after permission is fixed.
  }

  // Persist connection metadata — no tokens; installation tokens are minted on demand.
  const account = installation.account?.login ?? "unknown";
  const connFile = path.join(dataDir, "github-app.json");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      connFile,
      JSON.stringify(
        { installationId, account, repos, connectedAt: new Date().toISOString() },
        null,
        2
      ),
      "utf8"
    );
  } catch (err) {
    console.error("[github/setup] failed to write github-app.json:", err);
    return redirect("github=error&reason=storage_error");
  }

  return redirect("github=ok");
}
