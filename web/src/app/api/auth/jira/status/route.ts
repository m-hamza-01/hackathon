import { NextResponse } from "next/server";
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
}

function resolveDataDir(): string {
  if (process.env.TASKSCOPE_DATA_DIR) {
    return process.env.TASKSCOPE_DATA_DIR;
  }
  return path.join(process.cwd(), "../data");
}

export async function GET(): Promise<NextResponse> {
  const tokenFile = path.join(resolveDataDir(), "jira-oauth.json");

  try {
    const raw = fs.readFileSync(tokenFile, "utf8");
    const conn = JSON.parse(raw) as Partial<JiraOAuthConnection>;

    if (!conn.accessToken || !conn.expiresAt) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      siteName: conn.siteName,
      siteUrl: conn.siteUrl,
      expiresAt: conn.expiresAt,
    });
  } catch {
    // File missing or unreadable — not connected.
    return NextResponse.json({ connected: false });
  }
}
