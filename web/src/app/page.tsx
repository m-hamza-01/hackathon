"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeamResponse, PersonSummary } from "@/lib/types";

const TYPE_COLORS: Record<string, string> = {
  Bug:     "#e05c6a",
  Feature: "#7c6cf5",
  Task:    "#3dba84",
};

function TypeMixBar({ typeMix }: { typeMix: Record<string, number> }) {
  const total = Object.values(typeMix).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const segments = Object.entries(typeMix).map(([label, count]) => ({
    label,
    pct: (count / total) * 100,
    color: TYPE_COLORS[label] ?? "#4a5880",
  }));

  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px mt-3">
      {segments.map(({ label, pct, color }) => (
        <div
          key={label}
          style={{ width: `${pct}%`, background: color }}
          title={`${label}: ${Math.round(pct)}%`}
        />
      ))}
    </div>
  );
}

function WipBadge({ count }: { count: number }) {
  const color =
    count === 0
      ? "bg-surface-2 text-tertiary"
      : count <= 2
      ? "bg-[#1e2844] text-secondary"
      : count <= 4
      ? "bg-[#2a2555] text-accent"
      : "bg-[#3d1820] text-danger";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {count} WIP
    </span>
  );
}

function PersonCard({ person }: { person: PersonSummary }) {
  return (
    <Link href={`/person/${person.id}`} className="block group">
      <div className="bg-surface border border-border rounded-xl p-5 hover:bg-surface-2 hover:border-accent/30 transition-colors duration-150">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-primary group-hover:text-accent transition-colors leading-tight">
              {person.name}
            </h3>
            <p className="text-xs text-tertiary mt-0.5">
              {person.topComponents.slice(0, 2).join(" · ")}
            </p>
          </div>
          <WipBadge count={person.activeWip} />
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mb-3">
          <div>
            <div className="text-xl font-display font-bold text-primary leading-none">
              {person.ticketsResolved}
            </div>
            <div className="text-xs text-tertiary mt-0.5">resolved</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="text-xl font-display font-bold text-primary leading-none">
              {person.medianCycleDays}d
            </div>
            <div className="text-xs text-tertiary mt-0.5">median cycle</div>
          </div>
        </div>

        {/* Component chips */}
        <div className="flex flex-wrap gap-1 mb-1">
          {person.topComponents.map((c) => (
            <span
              key={c}
              className="text-xs px-2 py-0.5 rounded-full bg-[#0d1320] text-secondary border border-border"
            >
              {c}
            </span>
          ))}
        </div>

        {/* Type mix bar */}
        <TypeMixBar typeMix={person.typeMix} />
      </div>
    </Link>
  );
}

export default function TeamPage() {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load team data."));
  }, []);

  return (
    <main className="min-h-screen">
      {/* Header */}
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
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-primary bg-surface-2"
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

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-primary">Engineering Team</h1>
          <p className="text-secondary mt-1.5 text-sm">
            {data?.people.length ?? "—"} engineers · Kafka platform
          </p>
        </div>

        {/* States */}
        {error && (
          <div className="text-danger text-sm p-4 bg-[#1a0c10] border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-xl p-5 animate-pulse h-44"
              />
            ))}
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.people.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
