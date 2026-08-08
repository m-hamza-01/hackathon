"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PersonDetailResponse, CycleTrendPoint } from "@/lib/types";

// ─── Inline SVG sparkline ──────────────────────────────────────────────────

function CycleTrendChart({ data }: { data: CycleTrendPoint[] }) {
  if (data.length < 2) return null;

  const W = 320;
  const H = 64;
  const PAD = { top: 8, right: 8, bottom: 20, left: 28 };

  const values = data.map((d) => d.medianDays);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.medianDays)}`)
    .join(" ");

  const areaPath =
    linePath +
    ` L${x(data.length - 1)},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;

  // Show every other label to avoid crowding
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, overflow: "visible" }}
      aria-label="Cycle time trend"
    >
      {/* Y axis gridlines */}
      {[0, 0.5, 1].map((t) => {
        const yv = PAD.top + innerH - t * innerH;
        return (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yv}
              y2={yv}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 4}
              y={yv + 4}
              textAnchor="end"
              fontSize="8"
              fill="var(--color-tertiary)"
            >
              {(minV + t * range).toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="var(--color-accent)" fillOpacity="0.08" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(d.medianDays)}
          r="2.5"
          fill="var(--color-accent)"
          fillOpacity="0.8"
        />
      ))}

      {/* X axis labels */}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={H - 4}
            textAnchor="middle"
            fontSize="8"
            fill="var(--color-tertiary)"
          >
            {d.month}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ─── Shared header (re-used across pages) ─────────────────────────────────

function AppHeader() {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-base/90 backdrop-blur-sm z-10">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
          <div className="w-3 h-3 rounded-sm bg-accent" />
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-primary">
          TaskScope
        </span>
      </div>
      <nav className="flex items-center gap-1">
        <Link
          href="/"
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          Team
        </Link>
        <Link
          href="/ask"
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          Ask
        </Link>
      </nav>
    </header>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-2xl font-display font-bold text-primary">{value}</div>
      <div className="text-xs text-secondary mt-0.5">{label}</div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PersonDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/person/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("Could not load engineer profile."));
  }, [id]);

  return (
    <main className="min-h-screen">
      <AppHeader />

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <Link href="/" className="text-xs text-tertiary hover:text-secondary transition-colors mb-6 inline-block">
          ← All engineers
        </Link>

        {error && (
          <div className="text-danger text-sm p-4 bg-[#1a0c10] border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="space-y-6 animate-pulse">
            <div className="h-10 bg-surface rounded-xl w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-surface rounded-xl" />
              ))}
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {/* Name + overview */}
            <div>
              <h1 className="font-display text-3xl font-bold text-primary">{data.person.name}</h1>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.person.topComponents.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-2 py-0.5 rounded-full bg-[#0d1320] text-secondary border border-border"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatTile label="Tickets resolved" value={data.person.ticketsResolved} />
              <StatTile label="Median cycle days" value={`${data.person.medianCycleDays}d`} />
              <StatTile label="Active WIP" value={data.person.activeWip} />
              <StatTile
                label="Top type"
                value={
                  Object.entries(data.person.typeMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
                }
              />
            </div>

            {/* Cycle trend */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-primary mb-4">
                Cycle time trend (12 months)
              </h2>
              <CycleTrendChart data={data.cycleTrend} />
            </div>

            {/* Recent tickets + collaborators */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent tickets */}
              <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5">
                <h2 className="font-display text-sm font-semibold text-primary mb-4">
                  Recent tickets
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs text-tertiary font-medium py-2 pr-3">Key</th>
                        <th className="text-left text-xs text-tertiary font-medium py-2 pr-3">Title</th>
                        <th className="text-left text-xs text-tertiary font-medium py-2 pr-3">Type</th>
                        <th className="text-right text-xs text-tertiary font-medium py-2">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentTickets.map((t) => (
                        <tr
                          key={t.key}
                          className="border-b border-border/50 hover:bg-surface-2 transition-colors"
                        >
                          <td className="py-2.5 pr-3">
                            <span className="text-xs font-mono text-accent">{t.key}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-secondary text-xs leading-snug max-w-[18rem]">
                            {t.title}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="text-xs text-tertiary">{t.type}</span>
                          </td>
                          <td className="py-2.5 text-right">
                            <span className="text-xs font-mono text-primary">{t.cycleDays}d</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Collaborators */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <h2 className="font-display text-sm font-semibold text-primary mb-4">
                  Top collaborators
                </h2>
                <ul className="space-y-3">
                  {data.collaborators.map((c) => (
                    <li key={c.id} className="flex items-center justify-between">
                      <Link
                        href={`/person/${c.id}`}
                        className="text-sm text-secondary hover:text-primary transition-colors"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-tertiary font-mono">
                        {c.sharedTickets} shared
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
