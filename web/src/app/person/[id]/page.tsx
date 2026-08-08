"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PersonDetailResponse, CycleTrendPoint } from "@/lib/types";

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Inline SVG line chart for cycle-time trend. No chart libraries.
// Receives CycleTrendPoint[] and renders a labeled area sparkline.

export function Sparkline({ data }: { data: CycleTrendPoint[] }) {
  if (data.length < 2) return null;

  const W = 400;
  const H = 80;
  const PAD = { top: 8, right: 8, bottom: 20, left: 30 };

  const values = data.map((d) => d.medianDays);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const px = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const py = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(d.medianDays)}`).join(" ");
  const areaPath = `${linePath} L${px(data.length - 1)},${PAD.top + innerH} L${PAD.left},${PAD.top + innerH} Z`;

  const labelEvery = Math.ceil(data.length / 6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W }}
      aria-label="Cycle time trend"
    >
      {[0, 0.5, 1].map((t) => {
        const yv = PAD.top + innerH - t * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yv} y2={yv} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD.left - 4} y={yv + 4} textAnchor="end" fontSize="8" fill="#9ca3af">
              {(minV + t * range).toFixed(0)}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill="#3b82f6" fillOpacity="0.1" />
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.medianDays)} r="2.5" fill="#3b82f6" />
      ))}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={px(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">
            {d.month}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    <main className="max-w-4xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
        ← All engineers
      </Link>

      {error && <p className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-gray-500">Loading…</p>}

      {data && (
        <div className="space-y-8">
          {/* Name + components */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{data.person.name}</h1>
            <div className="flex flex-wrap gap-1">
              {data.person.topComponents.map((c) => (
                <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Stat tiles row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Tickets resolved", value: data.person.ticketsResolved },
              { label: "Median cycle days", value: `${data.person.medianCycleDays}d` },
              { label: "Active WIP", value: data.person.activeWip },
              {
                label: "Top type",
                value: Object.entries(data.person.typeMix).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="border border-gray-200 rounded-lg p-4">
                <div className="text-xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Cycle trend sparkline */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Cycle time trend (12 months)</h2>
            <Sparkline data={data.cycleTrend} />
          </div>

          {/* Recent tickets + collaborators */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent tickets</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs text-gray-400 font-medium py-2 pr-3">Key</th>
                      <th className="text-left text-xs text-gray-400 font-medium py-2 pr-3">Title</th>
                      <th className="text-left text-xs text-gray-400 font-medium py-2 pr-3">Type</th>
                      <th className="text-right text-xs text-gray-400 font-medium py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTickets.map((t) => (
                      <tr key={t.key} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-xs font-mono text-blue-600">{t.key}</td>
                        <td className="py-2 pr-3 text-xs text-gray-600 max-w-xs">{t.title}</td>
                        <td className="py-2 pr-3 text-xs text-gray-400">{t.type}</td>
                        <td className="py-2 text-right text-xs font-mono text-gray-700">{t.cycleDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top collaborators</h2>
              <ul className="space-y-2">
                {data.collaborators.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <Link href={`/person/${c.id}`} className="text-blue-600 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-gray-400 text-xs">{c.sharedTickets} shared</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
