import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Mirror loadDotenv from web/src/lib/synthesize.ts — reads root .env without
// overwriting vars already set in the environment.
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

export async function GET(): Promise<NextResponse> {
  loadDotenv();

  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error: "Jira OAuth is not configured.",
        required_env_vars: [
          "JIRA_OAUTH_CLIENT_ID — OAuth 2.0 (3LO) app client ID from developer.atlassian.com",
          "JIRA_OAUTH_CLIENT_SECRET — OAuth 2.0 (3LO) app client secret",
          "JIRA_OAUTH_REDIRECT_URI (optional) — defaults to http://localhost:3000/api/auth/jira/callback",
        ],
      },
      { status: 500 }
    );
  }

  // || not ??: .env.example ships JIRA_OAUTH_REDIRECT_URI= (empty string),
  // which must fall through to the default.
  const redirectUri =
    process.env.JIRA_OAUTH_REDIRECT_URI ||
    "http://localhost:3000/api/auth/jira/callback";
  const authBase =
    process.env.JIRA_OAUTH_AUTH_BASE ?? "https://auth.atlassian.com";

  // Generate a random state token for CSRF protection.
  const state = crypto.randomBytes(24).toString("hex");

  const authorizeUrl = new URL(`${authBase}/authorize`);
  authorizeUrl.searchParams.set("audience", "api.atlassian.com");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", "read:jira-work read:jira-user offline_access");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(authorizeUrl.toString());

  // httpOnly cookie so JS cannot read the state; SameSite=Lax allows the
  // Atlassian redirect to carry the cookie back.
  response.cookies.set("jira_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — more than enough for the consent flow
  });

  return response;
}
