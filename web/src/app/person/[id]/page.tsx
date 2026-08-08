"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PersonDetailResponse, CycleTrendPoint, TeamMeta } from "@/lib/types";
import { initials, tintOf, fmtDays, daysColor, typeBadge } from "@/lib/helpers";
import { AppHeader } from "@/app/page";

// ─── Sparkline ─────────────────────────────────────────────────────────────────
// Inline SVG trend chart matching the approved design spec.
// viewBox 720×170; chart area x:40–720, y:14–140; x-ticks at y=164.

export function Sparkline({ data }: { data: CycleTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p style={{ fontSize: 12, color: "oklch(0.55 0.008 90)", margin: 0 }}>
        Not enough data points to render trend.
      </p>
    );
  }

  const W = 720, chartH = 140, X0 = 40;
  const values = data.map((d) => d.medianDays);
  const max = Math.max(...values) * 1.15;
  const step = (W - X0) / (data.length - 1);

  const pts = data.map((d, i) => ({
    x: X0 + i * step,
    y: chartH - (d.medianDays / max) * (chartH - 14),
    label: d.month,
  }));

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    linePath +
    ` L${pts[pts.length - 1].x.toFixed(1)} ${chartH} L${pts[0].x.toFixed(1)} ${chartH} Z`;

  const gridLines = [0, 1, 2, 3].map((i) => {
    const v = max * (1 - i / 3);
    const y = 14 + (i / 3) * (chartH - 14);
    return {
      y: y.toFixed(1),
      ty: (y + 3.5).toFixed(1),
      label: v >= 10 ? Math.round(v) + "d" : v.toFixed(1) + "d",
    };
  });

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labelEvery = Math.ceil(data.length / 6);
  const xTicks = pts
    .filter((_, i) => i % labelEvery === 0)
    .map((p) => {
      const [y, m] = p.label.split("-");
      const label = y && m ? MONTHS[+m - 1] + " '" + y.slice(2) : p.label;
      return { x: p.x.toFixed(1), label };
    });

  return (
    <svg
      viewBox="0 0 720 170"
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible", fontFamily: "var(--font-code)" }}
    >
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1="34" y1={g.y} x2="720" y2={g.y} stroke="oklch(0.28 0.008 90)" strokeWidth="1" />
          <text x="26" y={g.ty} textAnchor="end" fontSize="10" fill="oklch(0.55 0.008 90)">{g.label}</text>
        </g>
      ))}
      <path d={areaPath} fill="oklch(0.74 0.13 155 / 0.12)" />
      <path d={linePath} fill="none" stroke="oklch(0.74 0.13 155)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.75" fill="oklch(0.19 0.007 90)" stroke="oklch(0.74 0.13 155)" strokeWidth="1.5" />
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y="164" textAnchor="middle" fontSize="10" fill="oklch(0.55 0.008 90)">{t.label}</text>
      ))}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<PersonDetailResponse | null>(null);
  const [meta, setMeta] = useState<TeamMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/person/${id}`).then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
      fetch("/api/team").then((r) => r.json()),
    ])
      .then(([personData, teamData]) => {
        setData(personData);
        setMeta(teamData.meta);
      })
      .catch(() => setError("Could not load engineer profile."));
  }, [id]);

  const p = data?.person;

  const stats = p && meta
    ? (() => {
        const mixTop = Object.entries(p.typeMix).sort((a, b) => b[1] - a[1])[0];
        return [
          {
            label: "Tickets resolved",
            value: String(p.ticketsResolved),
            note: p.ticketsResolved < 20
              ? "sparse history — read with care"
              : `across ${meta.dateRange[0]} – ${meta.dateRange[1]}`,
          },
          { label: "Median cycle time", value: fmtDays(p.medianCycleDays), note: "open to resolved" },
          {
            label: "In flight now",
            value: String(p.activeWip),
            note: p.activeWip >= 5 ? "heavier than team median" : "at or below team median",
          },
          {
            label: "Most common work",
            value: mixTop?.[0] ?? "—",
            note: mixTop ? `${mixTop[1]} of ${p.ticketsResolved} tickets` : "",
          },
        ];
      })()
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.19 0.007 90)", color: "oklch(0.93 0.006 90)", fontFamily: "var(--font-ui), sans-serif" }}>
      <AppHeader meta={meta} />

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 32px 80px" }}>
        <button
          onClick={() => router.push("/")}
          style={{ background: "none", border: "none", padding: 0, margin: "0 0 22px", cursor: "pointer", fontFamily: "var(--font-code)", fontSize: 11, color: "oklch(0.62 0.008 90)", letterSpacing: "0.04em" }}>
          ←&nbsp;&nbsp;ALL ENGINEERS
        </button>

        {error && <p style={{ color: "oklch(0.74 0.13 30)" }}>{error}</p>}
        {!data && !error && (
          <p style={{ color: "oklch(0.58 0.008 90)", fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.05em" }}>LOADING…</p>
        )}

        {data && p && stats && (
          <>
            {/* Avatar + name + chips */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 30 }}>
              <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "var(--font-code)", fontSize: 19, fontWeight: 600, color: "oklch(0.2 0.007 90)", background: tintOf(p.id) }}>
                {initials(p.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>{p.name}</h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.topComponents.map((c) => (
                    <span key={c} style={{ fontFamily: "var(--font-code)", fontSize: 11, padding: "3px 8px", borderRadius: 3, background: "oklch(0.26 0.008 90)", color: "oklch(0.76 0.008 90)" }}>{c}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* 4-stat grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "oklch(0.3 0.008 90)", border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, overflow: "hidden", marginBottom: 26 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ background: "oklch(0.215 0.007 90)", padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.6 0.008 90)", marginBottom: 7 }}>{s.label}</div>
                  <div style={{ fontFamily: "var(--font-code)", fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "oklch(0.58 0.008 90)", marginTop: 6 }}>{s.note}</div>
                </div>
              ))}
            </div>

            {/* Two-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>

                {/* Trend chart */}
                <section style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "20px 22px 14px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em" }}>Median cycle time by month</h2>
                    <span style={{ fontSize: 11, color: "oklch(0.58 0.008 90)" }}>gaps = no resolved tickets that month</span>
                  </div>
                  <Sparkline data={data.cycleTrend} />
                </section>

                {/* Recent tickets */}
                <section style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "18px 22px 14px" }}>
                    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em" }}>Recent resolved tickets</h2>
                    <span style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "oklch(0.58 0.008 90)" }}>{data.recentTickets.length} shown</span>
                  </div>
                  {data.recentTickets.map((t) => {
                    const badge = typeBadge(t.type);
                    return (
                      <div key={t.key} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 108px 92px 92px", gap: 14, alignItems: "center", padding: "11px 22px", borderTop: "1px solid oklch(0.26 0.008 90)" }}>
                        <a href="#" style={{ fontFamily: "var(--font-code)", fontSize: 12, color: "oklch(0.78 0.11 155)" }}>{t.key}</a>
                        <div style={{ fontSize: 13, lineHeight: 1.4, color: "oklch(0.88 0.006 90)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{t.title}</div>
                        <div>
                          <span style={{ fontSize: "10.5px", padding: "2.5px 8px", borderRadius: 3, background: badge.bg, color: badge.fg, whiteSpace: "nowrap" }}>{t.type}</span>
                        </div>
                        <div style={{ textAlign: "right", fontFamily: "var(--font-code)", fontSize: "12.5px", color: daysColor(t.cycleDays) }}>{fmtDays(t.cycleDays)}</div>
                        <div style={{ textAlign: "right", fontFamily: "var(--font-code)", fontSize: "11.5px", color: "oklch(0.56 0.008 90)" }}>{t.resolved}</div>
                      </div>
                    );
                  })}
                </section>
              </div>

              {/* Collaborators */}
              <section style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", overflow: "hidden" }}>
                <div style={{ padding: "18px 20px 12px" }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em" }}>Frequent collaborators</h2>
                  <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.45, color: "oklch(0.58 0.008 90)" }}>Shared comment threads on the same tickets.</p>
                </div>
                {data.collaborators.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/person/${c.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 20px", borderTop: "1px solid oklch(0.26 0.008 90)", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.235 0.008 90)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <div style={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "var(--font-code)", fontSize: "9.5px", fontWeight: 600, color: "oklch(0.2 0.007 90)", background: tintOf(c.id) }}>
                      {initials(c.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontFamily: "var(--font-code)", fontSize: "11.5px", color: "oklch(0.6 0.008 90)", flexShrink: 0 }}>{c.sharedTickets}</div>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
