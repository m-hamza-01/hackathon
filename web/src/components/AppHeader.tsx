"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { TeamMeta } from "@/lib/types";

interface SourceStatus { connected: boolean }

export function AppHeader({ meta }: { meta: TeamMeta | null }) {
  const router = useRouter();
  const path = usePathname();
  const isAsk = path === "/ask";
  const isConnect = path === "/connect";

  const [jira, setJira] = useState<SourceStatus | null>(null);
  const [github, setGithub] = useState<SourceStatus | null>(null);

  useEffect(() => {
    fetch("/api/auth/jira/status")
      .then((r) => r.json())
      .then((d: SourceStatus) => setJira(d))
      .catch(() => setJira({ connected: false }));
    fetch("/api/auth/github/status")
      .then((r) => r.json())
      .then((d: SourceStatus) => setGithub(d))
      .catch(() => setGithub({ connected: false }));
  }, []);

  function navStyle(active: boolean): React.CSSProperties {
    return {
      fontFamily: "var(--font-ui), sans-serif",
      fontSize: "12.5px",
      fontWeight: 550,
      padding: "7px 15px",
      borderRadius: 5,
      cursor: "pointer",
      border: `1px solid ${active ? "oklch(0.46 0.11 50)" : "transparent"}`,
      background: active ? "oklch(0.29 0.05 50)" : "none",
      color: active ? "oklch(0.88 0.1 50)" : "oklch(0.66 0.008 90)",
    };
  }

  function pillStyle(connected: boolean, loaded: boolean): React.CSSProperties {
    if (loaded && connected) {
      return { display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 20, border: "1px solid oklch(0.4 0.07 50)", background: "oklch(0.26 0.03 50)", fontFamily: "var(--font-code)", fontSize: "10px", letterSpacing: "0.05em", color: "oklch(0.82 0.1 50)" };
    }
    return { display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 20, border: "1px solid oklch(0.3 0.008 90)", background: "oklch(0.24 0.008 90)", fontFamily: "var(--font-code)", fontSize: "10px", letterSpacing: "0.05em", color: "oklch(0.6 0.008 90)" };
  }

  const jiraLoaded = jira !== null;
  const jiraConnected = jira?.connected ?? false;
  const githubLoaded = github !== null;
  const githubConnected = github?.connected ?? false;

  // Before fetch resolves: show neutral label without "· OFF" to avoid false-negative flash
  const jiraLabel = !jiraLoaded ? "JIRA" : jiraConnected ? "JIRA" : "JIRA · OFF";
  const githubLabel = !githubLoaded ? "GITHUB" : githubConnected ? "GITHUB" : "GITHUB · OFF";
  const jiraTip = jiraConnected ? "Jira connected — read-only" : "Jira not connected";
  const githubTip = githubConnected ? "GitHub connected — read-only" : "GitHub not connected";

  // When on /connect and Jira is not connected, don't show "Back to dashboard" —
  // clicking it would just bounce straight back to /connect via the gate.
  const showManage = !isConnect || jiraConnected;
  const manageLabel = isConnect ? "Back to dashboard" : (jiraConnected ? "Manage" : "Connect");
  const manageTarget = isConnect ? "/" : "/connect";

  // Banner: show only on dashboard pages when Jira connected but GitHub not, after both fetched
  const showGithubHint = !isConnect && jiraLoaded && githubLoaded && jiraConnected && !githubConnected;

  return (
    <>
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "0 32px", height: 60, background: "oklch(0.19 0.007 90 / 0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid oklch(0.3 0.008 90)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: 3, border: "1.5px solid oklch(0.72 0.18 50)", display: "grid", placeItems: "center" }}>
            <div style={{ width: 8, height: 8, background: "oklch(0.72 0.18 50)", borderRadius: 1 }} />
          </div>
          <div style={{ fontSize: "14.5px", fontWeight: 650, letterSpacing: "-0.01em" }}>Foreman</div>
          <div style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", color: "oklch(0.6 0.008 90)", letterSpacing: "0.04em", paddingLeft: 12, borderLeft: "1px solid oklch(0.3 0.008 90)" }}>
            APACHE&nbsp;KAFKA&nbsp;·&nbsp;{meta ? meta.totalTickets.toLocaleString() : "—"}&nbsp;RESOLVED
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => router.push("/")} style={navStyle(!isAsk && !isConnect)}>Team</button>
            <button onClick={() => router.push("/ask")} style={navStyle(isAsk)}>Ask</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, borderLeft: "1px solid oklch(0.3 0.008 90)" }}>
            <div title={jiraTip} style={pillStyle(jiraConnected, jiraLoaded)}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: jiraLoaded && jiraConnected ? "oklch(0.72 0.18 50)" : "oklch(0.45 0.008 90)" }} />
              {jiraLabel}
            </div>
            <div title={githubTip} style={pillStyle(githubConnected, githubLoaded)}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: githubLoaded && githubConnected ? "oklch(0.72 0.18 50)" : "oklch(0.45 0.008 90)" }} />
              {githubLabel}
            </div>
            {showManage && (
              <button
                onClick={() => router.push(manageTarget)}
                style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: "12px", fontWeight: 550, padding: "6px 13px", borderRadius: 5, border: "1px solid oklch(0.32 0.008 90)", background: "none", color: "oklch(0.72 0.008 90)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.55 0.09 50)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.9 0.006 90)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.32 0.008 90)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.72 0.008 90)"; }}
              >
                {manageLabel}
              </button>
            )}
          </div>
        </nav>
      </header>
      {showGithubHint && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, maxWidth: 1400, margin: "0 auto", padding: "11px 32px", borderBottom: "1px solid oklch(0.3 0.008 90)" }}>
          <div style={{ fontSize: "12.5px", color: "oklch(0.68 0.008 90)" }}>
            GitHub isn&apos;t connected. Ticket history is complete; review and merge activity is missing from every profile.
          </div>
          <button
            onClick={() => router.push("/connect")}
            style={{ flexShrink: 0, fontFamily: "var(--font-ui), sans-serif", fontSize: "12px", fontWeight: 600, padding: "6px 14px", borderRadius: 5, border: "1px solid oklch(0.45 0.09 50)", background: "none", color: "oklch(0.82 0.12 50)", cursor: "pointer" }}
          >
            Connect GitHub
          </button>
        </div>
      )}
    </>
  );
}
