"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppHeader } from "@/app/page";
import { GithubPanel } from "./GithubPanel";

interface StatusResponse {
  connected: boolean;
  siteName?: string;
  siteUrl?: string;
  expiresAt?: number;
}

function fmtExpiry(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Three steps shown in the disconnected state to explain what connecting does.
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
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "oklch(0.7 0.16 30)",
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: "13px", fontWeight: 650, marginBottom: 3, color: "oklch(0.88 0.04 30)" }}>
          Connection failed
        </div>
        <div style={{ fontSize: "12px", color: "oklch(0.72 0.02 30)", lineHeight: 1.55 }}>{msg}</div>
      </div>
    </div>
  );
}

function DisconnectedCard() {
  return (
    <>
      {/* Primary CTA card */}
      <div
        style={{
          border: "1px solid oklch(0.3 0.008 90)",
          borderRadius: 6,
          background: "oklch(0.215 0.007 90)",
          padding: "28px 28px 24px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "oklch(0.55 0.008 90)",
            marginBottom: 14,
          }}
        >
          Step 1 of 1
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
            Log in with Atlassian
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "13.5px",
              lineHeight: 1.65,
              color: "oklch(0.7 0.006 90)",
              maxWidth: "52ch",
            }}
          >
            One click opens Atlassian&apos;s consent screen. Approve read access and you are
            redirected straight back — no API tokens, no manual copying.
          </p>
        </div>

        <a
          href="/api/auth/jira/start"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-ui), sans-serif",
            fontSize: "13.5px",
            fontWeight: 650,
            padding: "11px 26px",
            borderRadius: 5,
            border: "none",
            background: "oklch(0.74 0.13 155)",
            color: "oklch(0.14 0.02 155)",
            cursor: "pointer",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Connect Jira
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M2.5 6.5H10.5M10.5 6.5L7 3M10.5 6.5L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>

        <div style={{ marginTop: 14, fontSize: "11.5px", color: "oklch(0.52 0.008 90)", lineHeight: 1.5 }}>
          Read-only access to issues and users &nbsp;·&nbsp; Token stored locally &nbsp;·&nbsp; Revoke anytime in Atlassian settings
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          border: "1px solid oklch(0.27 0.008 90)",
          borderRadius: 6,
          background: "oklch(0.205 0.006 90)",
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "oklch(0.52 0.008 90)",
            marginBottom: 18,
          }}
        >
          What happens when you connect
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.n}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr",
                gap: "0 14px",
                paddingBottom: i < HOW_IT_WORKS.length - 1 ? 18 : 0,
                marginBottom: i < HOW_IT_WORKS.length - 1 ? 18 : 0,
                borderBottom: i < HOW_IT_WORKS.length - 1 ? "1px solid oklch(0.27 0.008 90)" : "none",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "10.5px",
                  color: "oklch(0.44 0.06 155)",
                  paddingTop: 2,
                  letterSpacing: "0.03em",
                }}
              >
                {step.n}
              </div>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: 4, letterSpacing: "-0.01em" }}>
                  {step.title}
                </div>
                <div style={{ fontSize: "12.5px", lineHeight: 1.6, color: "oklch(0.64 0.006 90)" }}>
                  {step.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ConnectedCard({
  status,
  onNavigate,
}: {
  status: StatusResponse;
  onNavigate: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid oklch(0.42 0.07 155)",
        borderRadius: 6,
        background: "oklch(0.215 0.018 155)",
        padding: "28px 28px 24px",
        marginBottom: 16,
      }}
    >
      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "oklch(0.74 0.13 155)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "oklch(0.72 0.1 155)",
          }}
        >
          Connected
        </div>
      </div>

      {/* Site identity */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          {status.siteName}
        </div>
        <div
          style={{
            fontFamily: "var(--font-code)",
            fontSize: "11.5px",
            color: "oklch(0.58 0.007 90)",
          }}
        >
          {status.siteUrl}
        </div>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "flex",
          gap: 20,
          paddingTop: 16,
          paddingBottom: 20,
          borderTop: "1px solid oklch(0.32 0.03 155)",
          borderBottom: "1px solid oklch(0.32 0.03 155)",
          marginBottom: 22,
        }}
      >
        {status.expiresAt && (
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "oklch(0.55 0.008 90)",
                marginBottom: 4,
              }}
            >
              Token expires
            </div>
            <div style={{ fontFamily: "var(--font-code)", fontSize: "12.5px", color: "oklch(0.78 0.006 90)" }}>
              {fmtExpiry(status.expiresAt)}
            </div>
          </div>
        )}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "oklch(0.55 0.008 90)",
              marginBottom: 4,
            }}
          >
            Auto-refresh
          </div>
          <div style={{ fontFamily: "var(--font-code)", fontSize: "12.5px", color: "oklch(0.78 0.006 90)" }}>
            Enabled
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "oklch(0.55 0.008 90)",
              marginBottom: 4,
            }}
          >
            Access
          </div>
          <div style={{ fontFamily: "var(--font-code)", fontSize: "12.5px", color: "oklch(0.78 0.006 90)" }}>
            Read-only
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={onNavigate}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-ui), sans-serif",
            fontSize: "13.5px",
            fontWeight: 650,
            padding: "11px 26px",
            borderRadius: 5,
            border: "none",
            background: "oklch(0.74 0.13 155)",
            color: "oklch(0.14 0.02 155)",
            cursor: "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          Go to Team view
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M2.5 6.5H10.5M10.5 6.5L7 3M10.5 6.5L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <a
          href="/api/auth/jira/start"
          style={{
            fontFamily: "var(--font-ui), sans-serif",
            fontSize: "12.5px",
            fontWeight: 550,
            padding: "10px 18px",
            borderRadius: 5,
            border: "1px solid oklch(0.38 0.06 155)",
            background: "none",
            color: "oklch(0.72 0.08 155)",
            cursor: "pointer",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Re-connect
        </a>
      </div>
    </div>
  );
}

function ConnectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const reasonParam = searchParams.get("reason");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/jira/status")
      .then((r) => r.json())
      .then((d: StatusResponse) => {
        setStatus(d);
        setLoading(false);
      })
      .catch(() => {
        setStatus({ connected: false });
        setLoading(false);
      });
  }, [statusParam]);

  const connected = status?.connected ?? false;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "oklch(0.19 0.007 90)",
        color: "oklch(0.93 0.006 90)",
        fontFamily: "var(--font-ui), sans-serif",
      }}
    >
      <AppHeader meta={null} />

      <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 32px 100px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontFamily: "var(--font-code)",
              fontSize: "10.5px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "oklch(0.5 0.06 155)",
              marginBottom: 10,
            }}
          >
            Jira Cloud &nbsp;·&nbsp; OAuth 2.0
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.028em",
              lineHeight: 1.1,
            }}
          >
            {connected ? "Jira is connected" : "Connect your Jira"}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.65,
              color: "oklch(0.64 0.007 90)",
              maxWidth: "56ch",
            }}
          >
            {connected
              ? "Foreman is reading your resolved ticket history. Head to the Team view to see estimates and candidates."
              : "Foreman uses your resolved Jira tickets to estimate task complexity and suggest who has done this kind of work before."}
          </p>
        </div>

        {/* Error banner — only shown on failed OAuth redirect */}
        {statusParam === "error" && <ErrorBanner reason={reasonParam} />}

        {/* Loading skeleton */}
        {loading && (
          <div
            style={{
              border: "1px solid oklch(0.28 0.008 90)",
              borderRadius: 6,
              background: "oklch(0.215 0.007 90)",
              padding: "28px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-code)",
                fontSize: 11,
                letterSpacing: "0.06em",
                color: "oklch(0.5 0.008 90)",
              }}
            >
              CHECKING CONNECTION…
            </div>
          </div>
        )}

        {/* Main content — shows after status check */}
        {!loading && (
          <>
            {connected && status ? (
              <ConnectedCard status={status} onNavigate={() => router.push("/")} />
            ) : (
              <DisconnectedCard />
            )}

            {/* GitHub App connect — PR context for tickets */}
            <div style={{ marginBottom: 16 }}>
              <GithubPanel />
            </div>

            {/* Server / DC footnote — always visible */}
            <div
              style={{
                border: "1px solid oklch(0.26 0.007 90)",
                borderRadius: 6,
                background: "oklch(0.205 0.006 90)",
                padding: "14px 18px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "oklch(0.48 0.007 90)",
                  marginBottom: 6,
                }}
              >
                Jira Server or Data Center
              </div>
              <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.6, color: "oklch(0.58 0.005 90)" }}>
                OAuth 2.0 is for Jira Cloud only. Server and Data Center instances use a
                personal API token — set{" "}
                <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>JIRA_BASE_URL</code>{" "}
                and{" "}
                <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>JIRA_API_TOKEN</code>{" "}
                in <code style={{ fontFamily: "var(--font-code)", fontSize: "10.5px" }}>.env</code> instead.
              </p>
            </div>
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
