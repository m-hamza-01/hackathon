/**
 * GET /api/auth/github/status
 *
 * Returns the current GitHub App connection state.
 *
 * Response shape:
 *   { connected: boolean, account?: string, repos?: string[],
 *     appConfigured: boolean, appSlug?: string }
 *
 * appConfigured is true when GITHUB_APP_ID is set AND the PEM file exists —
 * used by GithubPanel to decide whether to enable the install link.
 *
 * No secrets are ever included in the response.
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface GitHubAppConnection {
  installationId: number;
  account: string;
  repos: string[];
  connectedAt: string;
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

function resolveDataDir(): string {
  if (process.env.TASKSCOPE_DATA_DIR) return process.env.TASKSCOPE_DATA_DIR;
  return path.join(process.cwd(), "../data");
}

function pemExists(pemPath: string): boolean {
  try {
    fs.accessSync(pemPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<NextResponse> {
  loadDotenv();

  const dataDir = resolveDataDir();
  const appId = process.env.GITHUB_APP_ID ?? "";
  const pemPath =
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ?? path.join(dataDir, "github-app.pem");
  const appSlug = process.env.GITHUB_APP_SLUG ?? "";

  const appConfigured = Boolean(appId) && pemExists(pemPath);

  const connFile = path.join(dataDir, "github-app.json");
  try {
    const raw = fs.readFileSync(connFile, "utf8");
    const conn = JSON.parse(raw) as Partial<GitHubAppConnection>;

    if (!conn.installationId || !conn.account) {
      return NextResponse.json({ connected: false, appConfigured, appSlug });
    }

    return NextResponse.json({
      connected: true,
      account: conn.account,
      repos: conn.repos ?? [],
      appConfigured,
      appSlug,
    });
  } catch {
    // File missing or unreadable — app not yet installed.
    return NextResponse.json({ connected: false, appConfigured, appSlug });
  }
}
