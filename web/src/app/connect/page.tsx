"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppHeader } from "@/app/page";

interface JiraStatus {
  connected: boolean;
  siteName?: string;
  siteUrl?: string;
  expiresAt?: number;
}

interface GitHubStatus {
  connected: boolean;
  account?: string;
  repos?: string[];
  appConfigured: boolean;
  appSlug?: string;
}

function fmtExpiry(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Approve read access",
    body: "Atlassian's consent screen asks for read-only access to your Jira issues and user list. Foreman never writes to your Jira.",
  },
  {
    n: "02",
    title: "Your history is indexed",
    body: "Resolved tickets are pulled and indexed locally. Nothing leaves your machine — the database lives inside the project folder.",
  },
  {
    n: "03",
    title: "Estimates and candidates appear",
    body: "Open the Team view or Ask a question. Foreman uses your own resolved history to surface who's done this kind of work before.",
  },
];

function ErrorBanner({ reason }: { reason: string | null }) {
  const msg =
    reason === "denied"
      ? "Access was declined on the Atlassian consent screen. You can try again anytime."
      : reason === "state_mismatch"
      ? "Security check failed — the request may have been modified in transit. Please try again."
      : "Something went wrong during authorization. Check that your app credentials are set correctly and try again.";

  return (
    <div
      role="alert"
      style={{
        border: "1px solid oklch(0.42 0.1 30)",
        borderRadius: 6,
        background: "oklch(0.235 0.025 30)",
        padding: "14px 18px",
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.7 0.16 30)", marginTop: 5, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: "13px", fontWeight: 650, marginBottom: 3, color: "oklch(0.88 0.04 30)" }}>
          Connection failed
        </div>
        <div style={{ fontSize: "12px", color: "oklch(0.72 0.02 30)", lineHeight: 1.55 }}>{msg}</div>
      </div>
    </div>
  );
}

// ── Card design tokens ──────────────────────────────────────────────────────
const C = {
  connectedDot:      "oklch(0.72 0.18 50)",
  connectedFg:       "oklch(0.82 0.1 50)",
  connectedChipBg:   "oklch(0.26 0.03 50)",
  connectedBorder:   "oklch(0.4 0.07 50)",
  connectedCardBorder:"oklch(0.38 0.06 50)",
  disconnectedDot:   "oklch(0.45 0.008 90)",
  disconnectedFg:    "oklch(0.6 0.008 90)",
  disconnectedChipBg:"oklch(0.24 0.008 90)",
  disconnectedBorder:"oklch(0.3 0.008 90)",
  btnOrangeBg:       "oklch(0.72 0.18 50)",
  btnOrangeText:     "oklch(0.2 0.03 50)",
  btnNeutralBorder:  "oklch(0.32 0.008 90)",
  btnNeutralText:    "oklch(0.7 0.008 90)",
} as const;

function ConnectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const reasonParam = searchParams.get("reason");
  const githubParam = searchParams.get("github");

  const [jira, setJira] = useState<JiraStatus | null>(null);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let done = 0;
    function tick() { if (++done === 2) setLoading(false); }

    fetch("/api/auth/jira/status")
      .then((r) => r.json())
      .then((d: JiraStatus) => { setJira(d); tick(); })
      .catch(() => { setJira({ connected: false }); tick(); });

    fetch("/api/auth/github/status")
      .then((r) => r.json())
      .then((d: GitHubStatus) => { setGithub(d); tick(); })
      .catch(() => { setGithub({ connected: false, appConfigured: false }); tick(); });
  }, [statusParam, githubParam]);

  const jiraConnected = jira?.connected ?? false;
  const githubConnected = github?.connected ?? false;
  const appConfigured = github?.appConfigured ?? false;
  const installUrl = github?.appSlug
    ? `https://github.com/apps/${github.appSlug}/installations/new`
    : "#";

  function jiraDetail(): string {
    if (jiraConnected && jira) {
      const parts: string[] = [];
      if (jira.siteName) parts.push(jira.siteName);
      if (jira.siteUrl) parts.push(jira.siteUrl);
      if (jira.expiresAt) parts.push(`Token expires ${fmtExpiry(jira.expiresAt)}`);
      return parts.join(" · ");
    }
    return "Ticket history is the source of every profile, estimate and citation. Without it there is nothing to show.";
  }

  function githubDetail(): string {
    if (githubConnected && github) {
      const parts: string[] = [];
      if (github.account) parts.push(github.account);
      if (github.repos?.length) parts.push(`${github.repos.length} repo${github.repos.length !== 1 ? "s" : ""}`);
      return parts.join(" · ") || "Connected";
    }
    return "Adds review and merge activity to profiles. Estimates still work without it, with fewer signals.";
  }

  async function disconnectJira() {
    await fetch("/api/auth/jira/disconnect", { method: "POST" }).catch(() => {});
    setJira({ connected: false });
  }

  function cardBorder(connected: boolean) {
    return connected ? C.connectedCardBorder : C.disconnectedBorder;
  }

  function badgeBg(connected: boolean) {
    return connected ? C.connectedChipBg : C.disconnectedChipBg;
  }

  function badgeFg(connected: boolean) {
    return connected ? C.connectedFg : C.disconnectedFg;
  }

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.19 0.007 90)", color: "oklch(0.93 0.006 90)", fontFamily: "var(--font-ui), sans-serif" }}>
      <AppHeader meta={null} />

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "72px 32px 90px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
          Connect your sources
        </h1>
        <p style={{ margin: "0 0 30px", maxWidth: "58ch", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.66 0.008 90)" }}>
          Foreman reads history you already have. Nothing is shown until a source is connected — no estimates, no candidates, no profiles.
        </p>

        {/* Jira OAuth error */}
        {statusParam === "error" && <ErrorBanner reason={reasonParam} />}

        {/* GitHub install error */}
        {githubParam === "error" && (
          <div style={{ marginBottom: 24, padding: "10px 14px", borderRadius: 4, background: "oklch(0.24 0.03 30)", border: "1px solid oklch(0.42 0.1 30)", fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.75 0.05 30)" }}>
            GitHub installation failed. Check that the App is registered and its Setup URL is set to{" "}
            <code style={{ fontFamily: "var(--font-code)", fontSize: 11 }}>/api/auth/github/setup</code>.
          </div>
        )}

        {loading ? (
          <div style={{ border: "1px solid oklch(0.28 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: 28, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.06em", color: "oklch(0.5 0.008 90)" }}>
              CHECKING CONNECTIONS…
            </div>
          </div>
        ) : (
          <>
            {/* ── Jira card ──────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 18, alignItems: "center", border: `1px solid ${cardBorder(jiraConnected)}`, borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 6, display: "grid", placeItems: "center", background: "oklch(0.26 0.008 90)", fontFamily: "var(--font-code)", fontSize: 15, fontWeight: 600, color: jiraConnected ? C.connectedDot : C.disconnectedDot }}>
                JR
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                  <div style={{ fontSize: "15.5px", fontWeight: 650, letterSpacing: "-0.015em" }}>Jira</div>
                  <span style={{ fontFamily: "var(--font-code)", fontSize: "9.5px", letterSpacing: "0.06em", padding: "2.5px 7px", borderRadius: 3, background: badgeBg(jiraConnected), color: badgeFg(jiraConnected) }}>
                    {jiraConnected ? "CONNECTED" : "REQUIRED"}
                  </span>
                </div>
                <div style={{ fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.63 0.008 90)" }}>
                  {jiraDetail()}
                </div>
              </div>
              {jiraConnected ? (
                <button
                  onClick={disconnectJira}
                  style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 550, padding: "8px 16px", borderRadius: 5, border: `1px solid ${C.btnNeutralBorder}`, background: "none", color: C.btnNeutralText, cursor: "pointer" }}
                >
                  Disconnect
                </button>
              ) : (
                <a
                  href="/api/auth/jira/start"
                  style={{ display: "inline-block", fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 650, padding: "9px 18px", borderRadius: 5, border: "none", background: C.btnOrangeBg, color: C.btnOrangeText, cursor: "pointer", textDecoration: "none" }}
                >
                  Connect Jira
                </a>
              )}
            </div>

            {/* ── GitHub card ────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 18, alignItems: "center", border: `1px solid ${cardBorder(githubConnected)}`, borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 6, display: "grid", placeItems: "center", background: "oklch(0.26 0.008 90)", fontFamily: "var(--font-code)", fontSize: 15, fontWeight: 600, color: githubConnected ? C.connectedDot : C.disconnectedDot }}>
                GH
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                  <div style={{ fontSize: "15.5px", fontWeight: 650, letterSpacing: "-0.015em" }}>GitHub</div>
                  <span style={{ fontFamily: "var(--font-code)", fontSize: "9.5px", letterSpacing: "0.06em", padding: "2.5px 7px", borderRadius: 3, background: badgeBg(githubConnected), color: badgeFg(githubConnected) }}>
                    {githubConnected ? "CONNECTED" : "OPTIONAL"}
                  </span>
                </div>
                <div style={{ fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.63 0.008 90)" }}>
                  {githubDetail()}
                </div>
                {!appConfigured && !githubConnected && (
                  <div style={{ marginTop: 8, display: "inline-block", fontSize: "11.5px", color: "oklch(0.78 0.05 60)", padding: "5px 10px", borderRadius: 4, background: "oklch(0.225 0.014 60)", border: "1px solid oklch(0.36 0.05 60)", lineHeight: 1.4 }}>
                    GITHUB_APP_ID or private key is missing — see{" "}
                    <code style={{ fontFamily: "var(--font-code)", fontSize: 10 }}>docs/GITHUB_APP_SETUP.md</code>
                  </div>
                )}
              </div>
              {githubConnected ? (
                <a
                  href={installUrl}
                  style={{ display: "inline-block", fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 550, padding: "8px 16px", borderRadius: 5, border: `1px solid ${C.btnNeutralBorder}`, background: "none", color: C.btnNeutralText, cursor: "pointer", textDecoration: "none" }}
                >
                  Manage
                </a>
              ) : (
                <a
                  href={appConfigured ? installUrl : undefined}
                  onClick={!appConfigured ? (e) => e.preventDefault() : undefined}
                  style={{ display: "inline-block", fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 650, padding: "9px 18px", borderRadius: 5, border: "none", background: appConfigured ? C.btnOrangeBg : "oklch(0.3 0.008 90)", color: appConfigured ? C.btnOrangeText : "oklch(0.5 0.008 90)", cursor: appConfigured ? "pointer" : "not-allowed", textDecoration: "none" }}
                >
                  Connect GitHub
                </a>
              )}
            </div>

            {/* ── How it works (subordinated; only when Jira not connected) ── */}
            {!jiraConnected && (
              <div style={{ border: "1px solid oklch(0.27 0.008 90)", borderRadius: 6, background: "oklch(0.205 0.006 90)", padding: "16px 20px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.52 0.008 90)", marginBottom: 14 }}>
                  What happens when you connect Jira
                </div>
                {HOW_IT_WORKS.map((step, i) => (
                  <div
                    key={step.n}
                    style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: "0 14px", paddingBottom: i < HOW_IT_WORKS.length - 1 ? 14 : 0, marginBottom: i < HOW_IT_WORKS.length - 1 ? 14 : 0, borderBottom: i < HOW_IT_WORKS.length - 1 ? "1px solid oklch(0.27 0.008 90)" : "none" }}
                  >
                    <div style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", color: "oklch(0.44 0.08 50)", paddingTop: 2, letterSpacing: "0.03em" }}>
                      {step.n}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: 3, letterSpacing: "-0.01em" }}>{step.title}</div>
                      <div style={{ fontSize: "12px", lineHeight: 1.6, color: "oklch(0.64 0.006 90)" }}>{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Jira Server / DC footnote ──────────────────────────────── */}
            <div style={{ border: "1px solid oklch(0.26 0.007 90)", borderRadius: 6, background: "oklch(0.205 0.006 90)", padding: "14px 18px", marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.48 0.007 90)", marginBottom: 6 }}>
                Jira Server or Data Center
              </div>
              <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.6, color: "oklch(0.58 0.005 90)" }}>
                OAuth 2.0 is for Jira Cloud only. Server and Data Center instances use a personal API token — set{" "}
                <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>JIRA_BASE_URL</code>{" "}
                and{" "}
                <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>JIRA_API_TOKEN</code>{" "}
                in <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>.env</code> instead.
              </p>
            </div>

            <p style={{ margin: "22px 0 0", fontSize: "11.5px", lineHeight: 1.6, color: "oklch(0.52 0.008 90)", maxWidth: "64ch" }}>
              Read-only access. Foreman never writes to a ticket or a repository, and history stays scoped to the projects you select.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectInner />
    </Suspense>
  );
}
