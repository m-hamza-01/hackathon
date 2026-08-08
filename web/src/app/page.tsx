"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { TeamResponse, PersonSummary, TeamMeta } from "@/lib/types";
import { initials, tintOf, pips, fmtDays, typeSegmentColor, TYPE_C } from "@/lib/helpers";

// ─── Shared header ────────────────────────────────────────────────────────────

export function AppHeader({ meta }: { meta: TeamMeta | null }) {
  const router = useRouter();
  const path = usePathname();
  const isAsk = path === "/ask";

  function navStyle(active: boolean): React.CSSProperties {
    return {
      fontFamily: "var(--font-ui), sans-serif",
      fontSize: "12.5px",
      fontWeight: 550,
      padding: "7px 15px",
      borderRadius: 5,
      cursor: "pointer",
      border: `1px solid ${active ? "oklch(0.42 0.07 155)" : "transparent"}`,
      background: active ? "oklch(0.27 0.03 155)" : "none",
      color: active ? "oklch(0.9 0.06 155)" : "oklch(0.66 0.008 90)",
    };
  }

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "0 32px", height: 60, background: "oklch(0.19 0.007 90 / 0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid oklch(0.3 0.008 90)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: 3, border: "1.5px solid oklch(0.74 0.13 155)", display: "grid", placeItems: "center" }}>
          <div style={{ width: 8, height: 8, background: "oklch(0.74 0.13 155)", borderRadius: 1 }} />
        </div>
        <div style={{ fontSize: "14.5px", fontWeight: 650, letterSpacing: "-0.01em" }}>TaskScope</div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", color: "oklch(0.6 0.008 90)", letterSpacing: "0.04em", paddingLeft: 12, borderLeft: "1px solid oklch(0.3 0.008 90)" }}>
          APACHE&nbsp;KAFKA&nbsp;·&nbsp;{meta ? meta.totalTickets.toLocaleString() : "—"}&nbsp;RESOLVED
        </div>
      </div>
      <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => router.push("/")} style={navStyle(!isAsk)}>Team</button>
        <button onClick={() => router.push("/ask")} style={navStyle(isAsk)}>Ask</button>
      </nav>
    </header>
  );
}

// ─── PersonCard ───────────────────────────────────────────────────────────────
// One row in the team roster table.

export function PersonCard({ person, onClick }: { person: PersonSummary; onClick: () => void }) {
  const total = Object.values(person.typeMix).reduce((s, v) => s + v, 0);
  const segs = Object.entries(person.typeMix)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ color: typeSegmentColor(k), pct: total > 0 ? (v / total) * 100 : 0 }));
  const wips = pips(person.activeWip);
  const cycleMax = 30;
  const cyclePct = Math.min(100, (person.medianCycleDays / cycleMax) * 100).toFixed(0) + "%";
  const sparse = person.ticketsResolved < 20;

  const rowGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(190px,1.5fr) 92px 128px 104px 132px minmax(210px,1.3fr)",
    gap: 20,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid oklch(0.26 0.008 90)",
    cursor: "pointer",
    transition: "background .12s",
  };

  return (
    <div onClick={onClick} style={rowGrid}
      onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.23 0.008 90)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

      {/* Name + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "var(--font-code)", fontSize: "10.5px", fontWeight: 600, color: "oklch(0.2 0.007 90)", background: tintOf(person.id) }}>
          {initials(person.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</div>
          {sparse && (
            <div style={{ fontSize: "10px", color: "oklch(0.62 0.09 60)", marginTop: 2, letterSpacing: "0.03em" }}>sparse history</div>
          )}
        </div>
      </div>

      {/* Resolved */}
      <div style={{ textAlign: "right", fontFamily: "var(--font-code)", fontSize: "14px" }}>{person.ticketsResolved}</div>

      {/* Cycle bar + label */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9 }}>
        <div style={{ flex: 1, height: 3, background: "oklch(0.27 0.008 90)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "oklch(0.62 0.05 90)", width: cyclePct }} />
        </div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: "13px", flexShrink: 0 }}>{fmtDays(person.medianCycleDays)}</div>
      </div>

      {/* WIP pips */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
        {wips.map((p, i) => (
          <div key={i} style={{ width: 4, height: 14, borderRadius: 1, background: p.c }} />
        ))}
        <div style={{ fontFamily: "var(--font-code)", fontSize: "12px", color: "oklch(0.7 0.008 90)", marginLeft: 5 }}>{person.activeWip}</div>
      </div>

      {/* Type-mix bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 2, overflow: "hidden", gap: 1 }}
        title={Object.entries(person.typeMix).map(([k, v]) => `${k} ${v}`).join(" · ")}>
        {segs.map((s, i) => (
          <div key={i} style={{ background: s.color, width: s.pct + "%" }} />
        ))}
      </div>

      {/* Component chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {person.topComponents.map((c) => (
          <span key={c} style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", padding: "2.5px 7px", borderRadius: 3, background: "oklch(0.26 0.008 90)", color: "oklch(0.75 0.008 90)", whiteSpace: "nowrap" }}>{c}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const router = useRouter();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load team data."));
  }, []);

  const meta = data?.meta ?? null;
  const legend = Object.keys(TYPE_C).slice(0, 4).map((k) => ({ label: k, color: TYPE_C[k][2] }));

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.19 0.007 90)", color: "oklch(0.93 0.006 90)", fontFamily: "var(--font-ui), sans-serif" }}>
      <AppHeader meta={meta} />

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "36px 32px 80px" }}>
        {/* Page title + stat strip */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>Team overview</h1>
            <p style={{ margin: 0, maxWidth: "56ch", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.66 0.008 90)" }}>
              Built from resolved Jira tickets. These are working patterns, not performance ratings — use them to start a conversation, not to close one.
            </p>
          </div>

          {meta && (
            <div style={{ display: "flex", border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ padding: "12px 20px", borderRight: "1px solid oklch(0.3 0.008 90)" }}>
                <div style={{ fontFamily: "var(--font-code)", fontSize: 19, fontWeight: 500 }}>{data!.people.length}</div>
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

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(190px,1.5fr) 92px 128px 104px 132px minmax(210px,1.3fr)", gap: 20, padding: "0 16px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.58 0.008 90)", borderBottom: "1px solid oklch(0.3 0.008 90)" }}>
          <div>Engineer</div>
          <div style={{ textAlign: "right" }}>Resolved</div>
          <div style={{ textAlign: "right" }}>Median cycle</div>
          <div style={{ textAlign: "right" }}>In flight</div>
          <div>Work mix</div>
          <div>Components</div>
        </div>

        {error && <p style={{ color: "oklch(0.74 0.13 30)", padding: "16px 16px 0" }}>{error}</p>}
        {!data && !error && <p style={{ color: "oklch(0.58 0.008 90)", padding: "16px 16px 0", fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.05em" }}>LOADING…</p>}

        {data?.people.map((p) => (
          <PersonCard key={p.id} person={p} onClick={() => router.push(`/person/${p.id}`)} />
        ))}

        {data && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 18, padding: "0 16px", fontSize: "10.5px", color: "oklch(0.58 0.008 90)" }}>
            {legend.map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
