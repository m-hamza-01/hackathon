"use client";

/**
 * GithubPanel — self-contained GitHub App connection card.
 *
 * The supervisor mounts this into the /connect page alongside the Jira panel.
 * Do NOT import it from any existing page directly — it reads its own state via
 * /api/auth/github/status and re-fetches after a GitHub redirect back.
 *
 * Design matches the dark oklch idiom used throughout the app (see ask/page.tsx).
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface GitHubStatus {
  connected: boolean;
  account?: string;
  repos?: string[];
  appConfigured: boolean;
  appSlug?: string;
}

export function GithubPanel() {
  const searchParams = useSearchParams();
  const githubParam = searchParams.get("github");

  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/auth/github/status")
      .then((r) => r.json())
      .then((d: GitHubStatus) => {
        setStatus(d);
        setLoading(false);
      })
      .catch(() => {
        setStatus({ connected: false, appConfigured: false });
        setLoading(false);
      });
  }, [githubParam]); // re-fetch after redirect back from GitHub

  const connected = status?.connected ?? false;
  const installUrl = status?.appSlug
    ? `https://github.com/apps/${status.appSlug}/installations/new`
    : "#";

  return (
    <div
      style={{
        border: `1px solid ${connected ? "oklch(0.42 0.07 155)" : "oklch(0.3 0.008 90)"}`,
        borderRadius: 6,
        background: connected ? "oklch(0.225 0.02 155)" : "oklch(0.215 0.007 90)",
        padding: "24px 26px",
      }}
    >
      {/* Section label */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "oklch(0.55 0.008 90)",
          marginBottom: 14,
        }}
      >
        GitHub
      </div>

      {loading ? (
        <div
          style={{
            fontFamily: "var(--font-code)",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "oklch(0.58 0.008 90)",
          }}
        >
          CHECKING CONNECTION…
        </div>
      ) : connected ? (
        <ConnectedState status={status!} installUrl={installUrl} />
      ) : (
        <DisconnectedState status={status} installUrl={installUrl} githubParam={githubParam} />
      )}
    </div>
  );
}

// ── Connected state ─────────────────────────────────────────────────────────

function ConnectedState({
  status,
  installUrl,
}: {
  status: GitHubStatus;
  installUrl: string;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 8,
            height: 8,
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
            color: "oklch(0.7 0.09 155)",
          }}
        >
          Connected
        </div>
      </div>

      <div
        style={{
          fontSize: 18,
          fontWeight: 650,
          letterSpacing: "-0.015em",
          marginBottom: 14,
        }}
      >
        {status.account}
      </div>

      {status.repos && status.repos.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "oklch(0.55 0.008 90)",
              marginBottom: 8,
            }}
          >
            {status.repos.length} repo{status.repos.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {status.repos.slice(0, 8).map((repo) => (
              <div
                key={repo}
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "11.5px",
                  color: "oklch(0.7 0.008 90)",
                }}
              >
                {repo}
              </div>
            ))}
            {status.repos.length > 8 && (
              <div
                style={{
                  fontFamily: "var(--font-code)",
                  fontSize: "11.5px",
                  color: "oklch(0.5 0.008 90)",
                }}
              >
                +{status.repos.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          paddingTop: 18,
          borderTop: "1px solid oklch(0.32 0.03 155)",
        }}
      >
        <a
          href={installUrl}
          style={{
            display: "inline-block",
            fontFamily: "var(--font-ui), sans-serif",
            fontSize: "12.5px",
            fontWeight: 600,
            padding: "8px 18px",
            borderRadius: 5,
            border: "1px solid oklch(0.42 0.07 155)",
            background: "none",
            color: "oklch(0.8 0.09 155)",
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          Manage installation
        </a>
      </div>
    </>
  );
}

// ── Disconnected state ──────────────────────────────────────────────────────

function DisconnectedState({
  status,
  installUrl,
  githubParam,
}: {
  status: GitHubStatus | null;
  installUrl: string;
  githubParam: string | null;
}) {
  const appConfigured = status?.appConfigured ?? false;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "oklch(0.58 0.008 90)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "oklch(0.58 0.008 90)",
          }}
        >
          Not connected
        </div>
      </div>

      {/* Error banner on redirect back */}
      {githubParam === "error" && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 4,
            background: "oklch(0.24 0.03 30)",
            border: "1px solid oklch(0.42 0.1 30)",
            fontSize: "12.5px",
            lineHeight: 1.5,
            color: "oklch(0.75 0.05 30)",
          }}
        >
          Installation failed. Check that the App is registered and its Setup
          URL is set to{" "}
          <code style={{ fontFamily: "var(--font-code)", fontSize: 11 }}>
            /api/auth/github/setup
          </code>
          .
        </div>
      )}

      {/* Config warning when App ID or PEM are missing */}
      {!appConfigured && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 4,
            background: "oklch(0.225 0.014 60)",
            border: "1px solid oklch(0.36 0.05 60)",
            fontSize: "12.5px",
            lineHeight: 1.5,
            color: "oklch(0.78 0.05 60)",
          }}
        >
          GITHUB_APP_ID or the private key file is missing. See{" "}
          <code style={{ fontFamily: "var(--font-code)", fontSize: 11 }}>
            docs/GITHUB_APP_SETUP.md
          </code>
          .
        </div>
      )}

      <p
        style={{
          margin: "0 0 22px",
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: "oklch(0.72 0.006 90)",
          maxWidth: "46ch",
        }}
      >
        An org admin installs the GitHub App once. It gets read-only access to
        the repos you choose — no long-lived tokens stored anywhere.
      </p>

      <a
        href={appConfigured ? installUrl : undefined}
        onClick={!appConfigured ? (e) => e.preventDefault() : undefined}
        style={{
          display: "inline-block",
          fontFamily: "var(--font-ui), sans-serif",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 24px",
          borderRadius: 5,
          border: "none",
          background: appConfigured ? "oklch(0.74 0.13 155)" : "oklch(0.3 0.008 90)",
          color: appConfigured ? "oklch(0.19 0.02 155)" : "oklch(0.5 0.008 90)",
          cursor: appConfigured ? "pointer" : "not-allowed",
          textDecoration: "none",
        }}
      >
        Install GitHub App
      </a>
    </>
  );
}
