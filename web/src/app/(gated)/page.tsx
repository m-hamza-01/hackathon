"use client";

import { useEffect, useState } from "react";
import type { ReportResponse, ReportFinding, FindingSeverity } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";

const CHIP: Record<FindingSeverity, { label: string; bg: string; border: string; fg: string }> = {
  conversation: { label: "WORTH A CONVERSATION", bg: "oklch(0.225 0.014 60)", border: "oklch(0.36 0.05 60)", fg: "oklch(0.78 0.09 60)" },
  watch: { label: "KEEP AN EYE ON IT", bg: "oklch(0.24 0.008 90)", border: "oklch(0.32 0.008 90)", fg: "oklch(0.66 0.008 90)" },
  healthy: { label: "HEALTHY", bg: "oklch(0.3 0.05 155)", border: "oklch(0.4 0.07 155)", fg: "oklch(0.82 0.1 155)" },
};

function FindingCard({ finding, index }: { finding: ReportFinding; index: number }) {
  const chip = CHIP[finding.severity];
  const maxBar = finding.bars?.length ? Math.max(...finding.bars.map((b) => b.value)) : 0;

  return (
    <div style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", color: "oklch(0.5 0.008 90)" }}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: "9.5px", letterSpacing: "0.06em", padding: "2.5px 8px", borderRadius: 3, background: chip.bg, border: `1px solid ${chip.border}`, color: chip.fg }}>
          {chip.label}
        </div>
      </div>
      <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.015em", marginBottom: 7 }}>{finding.claim}</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "oklch(0.74 0.006 90)", maxWidth: "68ch" }}>{finding.body}</p>
      {finding.bars && finding.bars.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420, marginTop: 14 }}>
          {finding.bars.map((bar, i) => (
            <div key={bar.label} style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 40px", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: "11.5px", color: "oklch(0.72 0.008 90)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bar.label}</div>
              <div style={{ height: 6, borderRadius: 2, background: "oklch(0.27 0.008 90)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${maxBar > 0 ? (bar.value / maxBar) * 100 : 0}%`, background: i === 0 && finding.severity === "conversation" ? "oklch(0.68 0.14 30)" : "oklch(0.62 0.05 90)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "oklch(0.7 0.008 90)", textAlign: "right" }}>{bar.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportPage() {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load the report."));
  }, []);

  const meta = data?.meta ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.19 0.007 90)", color: "oklch(0.93 0.006 90)", fontFamily: "var(--font-ui), sans-serif" }}>
      <AppHeader meta={meta} />

      <main style={{ maxWidth: 940, margin: "0 auto", padding: "44px 32px 80px" }}>
        {/* Page title + stat strip */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, marginBottom: 30 }}>
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>Team health report</h1>
            <p style={{ margin: 0, maxWidth: "54ch", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.66 0.008 90)" }}>
              Written from your finished tickets. Patterns, not performance reviews — every claim comes from the history, nothing else.
            </p>
          </div>

          {data && meta && (
            <div style={{ display: "flex", border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ padding: "12px 20px", borderRight: "1px solid oklch(0.3 0.008 90)" }}>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 19, fontWeight: 500 }}>{data.peopleCount}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(0.6 0.008 90)", marginTop: 3 }}>engineers</div>
              </div>
              <div style={{ padding: "12px 20px", borderRight: "1px solid oklch(0.3 0.008 90)" }}>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 19, fontWeight: 500 }}>{meta.totalTickets.toLocaleString()}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(0.6 0.008 90)", marginTop: 3 }}>tickets</div>
              </div>
              <div style={{ padding: "12px 20px" }}>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 19, fontWeight: 500 }}>{meta.dateRange[0]} – {meta.dateRange[1]}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(0.6 0.008 90)", marginTop: 3 }}>range</div>
              </div>
            </div>
          )}
        </div>

        {/* Trust banner slot — lands with the backtest harness (Unit 2). */}

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>What the history shows</h2>
          {meta && (
            <span style={{ fontFamily: "var(--font-code)", fontSize: 10, letterSpacing: "0.05em", color: "oklch(0.55 0.008 90)" }}>
              HISTORY {meta.dateRange[0]}–{meta.dateRange[1]}
            </span>
          )}
        </div>
        <div style={{ height: 1, background: "oklch(0.3 0.008 90)", marginBottom: 18 }} />

        {error && <p style={{ color: "oklch(0.74 0.13 30)" }}>{error}</p>}
        {!data && !error && (
          <p style={{ color: "oklch(0.58 0.008 90)", fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.05em" }}>LOADING…</p>
        )}

        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.findings.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} />
            ))}
          </div>
        )}

        <p style={{ margin: "32px 0 0", fontSize: "11.5px", lineHeight: 1.6, color: "oklch(0.52 0.008 90)", maxWidth: "70ch" }}>
          Foreman reads history; it never writes to Jira or GitHub. These numbers describe past work patterns, not anyone&rsquo;s ability. Availability, growth goals, and everything the tickets can&rsquo;t see stay yours to weigh.
        </p>
      </main>
    </div>
  );
}
