import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isJiraConnected } from "@/lib/jira-connection";

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
  if (process.env.FOREMAN_DATA_DIR) {
    return process.env.FOREMAN_DATA_DIR;
  }
  return path.join(process.cwd(), "../data");
}

export async function GET(): Promise<NextResponse> {
  if (!isJiraConnected()) {
    return NextResponse.json({ connected: false });
  }

  const tokenFile = path.join(resolveDataDir(), "jira-oauth.json");
  try {
    const raw = fs.readFileSync(tokenFile, "utf8");
    const conn = JSON.parse(raw) as Partial<JiraOAuthConnection>;
    return NextResponse.json({
      connected: true,
      siteName: conn.siteName,
      siteUrl: conn.siteUrl,
      expiresAt: conn.expiresAt,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
