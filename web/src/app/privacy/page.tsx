import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Foreman",
  description: "What Foreman reads, stores, and shares when you connect Jira and GitHub.",
};

const SECTIONS = [
  {
    title: "What Foreman is",
    body: [
      "Foreman is a prototype built for a hackathon. It reads a Jira project's resolved history and suggests who on the team is best placed to take a new task — with the past tickets that back each suggestion. It recommends; it never assigns, edits, or writes anything back to your tools.",
    ],
  },
  {
    title: "What we access",
    body: [
      "Jira (via Atlassian OAuth): read-only access to issues, comments, status change history, and the names of people who worked on them. Foreman requests no write scopes and cannot modify your Jira.",
      "GitHub (via GitHub App): read-only access to pull request metadata on the repositories you choose during installation. Foreman cannot push code, open PRs, or change repository settings.",
    ],
  },
  {
    title: "What we store",
    body: [
      "OAuth tokens for the sources you connect, kept on the server that runs your Foreman instance and used only to fetch the data described above. GitHub tokens are short-lived installation tokens.",
      "An indexed copy of the project history (tickets, comments, timings) in a database on that same server, so the dashboard can answer questions without re-fetching everything.",
      "The public demo runs on the Apache Kafka project's public Jira archive, with contributor names pseudonymized.",
    ],
  },
  {
    title: "What we share",
    body: [
      "Nothing is sold or shared with advertisers. There are no analytics scripts and no tracking cookies.",
      "To generate written summaries, ticket text may be sent to Anthropic's API (the Claude model). Data requests otherwise go only to Atlassian and GitHub — the services you explicitly connected.",
    ],
  },
  {
    title: "Retention and revocation",
    body: [
      "Disconnecting a source from the Connect page removes its stored tokens. You can also revoke access at any time from the provider's side — under Connected apps in your Atlassian account settings, or by uninstalling the GitHub App from your account or organization — which invalidates Foreman's access immediately.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Foreman is an open prototype. Questions or concerns: open an issue on the project repository at github.com/m-hamza-01/hackaton.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          height: 60,
          borderBottom: "1px solid oklch(0.3 0.008 90)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 14, color: "inherit" }}>
          <div style={{ width: 22, height: 22, borderRadius: 3, border: "1.5px solid oklch(0.72 0.18 50)", display: "grid", placeItems: "center" }}>
            <div style={{ width: 8, height: 8, background: "oklch(0.72 0.18 50)", borderRadius: 1 }} />
          </div>
          <div style={{ fontSize: "14.5px", fontWeight: 650, letterSpacing: "-0.01em" }}>Foreman</div>
        </Link>
        <Link
          href="/connect"
          style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 550, padding: "7px 15px", borderRadius: 5, border: "1px solid oklch(0.32 0.008 90)", color: "oklch(0.7 0.008 90)" }}
        >
          Connect
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "72px 32px 90px" }}>
        <div style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", letterSpacing: "0.08em", color: "oklch(0.6 0.008 90)", marginBottom: 14 }}>
          LAST&nbsp;UPDATED&nbsp;·&nbsp;9&nbsp;AUG&nbsp;2026
        </div>
        <h1 style={{ margin: "0 0 10px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
          Privacy Policy
        </h1>
        <p style={{ margin: "0 0 44px", maxWidth: "58ch", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.66 0.008 90)" }}>
          Foreman reads history you already have, and nothing more. This page describes exactly
          what is accessed, where it lives, and how to take it back.
        </p>

        {SECTIONS.map((s, i) => (
          <section key={s.title} style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 10 }}>
              <span style={{ fontFamily: "var(--font-code)", fontSize: "11px", color: "oklch(0.72 0.18 50)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, letterSpacing: "-0.01em" }}>{s.title}</h2>
            </div>
            {s.body.map((p) => (
              <p key={p} style={{ margin: "0 0 10px", paddingLeft: 30, maxWidth: "62ch", fontSize: "13px", lineHeight: 1.65, color: "oklch(0.72 0.008 90)" }}>
                {p}
              </p>
            ))}
          </section>
        ))}

        <p style={{ margin: "48px 0 0", paddingTop: 22, borderTop: "1px solid oklch(0.26 0.007 90)", fontSize: "11.5px", lineHeight: 1.6, color: "oklch(0.52 0.008 90)", maxWidth: "64ch" }}>
          Foreman is a hackathon prototype, not a commercial service. This policy reflects how the
          software actually behaves; if the software changes, this page changes with it.
        </p>
      </main>
    </div>
  );
}
