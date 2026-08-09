import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import fs from "fs";
import path from "path";

// Mirror loadDotenv from web/src/lib/synthesize.ts.
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

// Resolve the data directory: TASKSCOPE_DATA_DIR override or ../data from web/.
function resolveDataDir(): string {
  if (process.env.TASKSCOPE_DATA_DIR) {
    return process.env.TASKSCOPE_DATA_DIR;
  }
  // Next.js server cwd() is typically web/; one level up reaches the project root data/.
  // Also try cwd/data in case running from the project root.
  const fromWeb = path.join(process.cwd(), "../data");
  try {
    fs.mkdirSync(fromWeb, { recursive: true });
    return fromWeb;
  } catch {
    return path.join(process.cwd(), "data");
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface AccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

interface JiraOAuthConnection {
  cloudId: string;
  siteUrl: string;
  siteName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  connectedAt: number;
  sites: AccessibleResource[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Derive origin from the incoming request for absolute redirect URLs.
  const origin = new URL(req.url).origin;

  function errorRedirect(reason: string): NextResponse {
    return NextResponse.redirect(
      `${origin}/connect?status=error&reason=${encodeURIComponent(reason)}`
    );
  }
  loadDotenv();

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  // Atlassian may redirect with error (e.g. user denied consent).
  if (errorParam) {
    return errorRedirect("denied");
  }

  if (!code || !stateParam) {
    return errorRedirect("invalid_callback");
  }

  // Validate state against the httpOnly cookie to prevent CSRF.
  const storedState = req.cookies.get("jira_oauth_state")?.value;
  if (!storedState || storedState !== stateParam) {
    return errorRedirect("state_mismatch");
  }

  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorRedirect("missing_credentials");
  }

  // || not ??: empty string in .env must fall through to the default.
  const redirectUri =
    process.env.JIRA_OAUTH_REDIRECT_URI ||
    "http://localhost:3000/api/auth/jira/callback";
  const authBase =
    process.env.JIRA_OAUTH_AUTH_BASE ?? "https://auth.atlassian.com";
  const apiBase =
    process.env.JIRA_OAUTH_API_BASE ?? "https://api.atlassian.com";

  let tokens: TokenResponse;
  try {
    const tokenRes = await fetch(`${authBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      // Do not include response body — it may contain sensitive details.
      console.error("[jira/callback] token exchange failed, status:", tokenRes.status);
      return errorRedirect("token_exchange_failed");
    }
    tokens = (await tokenRes.json()) as TokenResponse;
  } catch (err) {
    console.error("[jira/callback] token exchange network error:", err);
    return errorRedirect("network_error");
  }

  if (!tokens.access_token) {
    return errorRedirect("no_access_token");
  }

  // Discover accessible Atlassian sites.
  let sites: AccessibleResource[];
  try {
    const resourcesRes = await fetch(`${apiBase}/oauth/token/accessible-resources`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!resourcesRes.ok) {
      console.error("[jira/callback] accessible-resources failed, status:", resourcesRes.status);
      return errorRedirect("site_discovery_failed");
    }
    sites = (await resourcesRes.json()) as AccessibleResource[];
  } catch (err) {
    console.error("[jira/callback] accessible-resources network error:", err);
    return errorRedirect("network_error");
  }

  if (!sites || sites.length === 0) {
    return errorRedirect("no_sites");
  }

  // Use the first site; store the full list.
  const primarySite = sites[0];
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const refreshToken = tokens.refresh_token ?? "";

  const connection: JiraOAuthConnection = {
    cloudId: primarySite.id,
    siteUrl: primarySite.url,
    siteName: primarySite.name,
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt,
    scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    connectedAt: Date.now(),
    sites,
  };

  // Persist to data/jira-oauth.json — resolve path via TASKSCOPE_DATA_DIR or default.
  const dataDir = resolveDataDir();
  const tokenFile = path.join(dataDir, "jira-oauth.json");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tokenFile, JSON.stringify(connection, null, 2), "utf8");
  } catch (err) {
    console.error("[jira/callback] failed to write token file:", err);
    return errorRedirect("storage_error");
  }

  // Clear the state cookie.
  const response = NextResponse.redirect(`${origin}/connect?status=ok`);
  response.cookies.set("jira_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
