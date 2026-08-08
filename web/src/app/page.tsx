"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeamResponse, PersonSummary } from "@/lib/types";

// ─── PersonCard ───────────────────────────────────────────────────────────────
// Renders one engineer in the roster grid.
// Props are a plain PersonSummary so a design patch only touches this component.

export function PersonCard({ person }: { person: PersonSummary }) {
  const typeTotal = Object.values(person.typeMix).reduce((s, v) => s + v, 0);

  return (
    <Link href={`/person/${person.id}`} className="block">
      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
        {/* Name + WIP */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900">{person.name}</h3>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {person.activeWip} WIP
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm mb-3">
          <div>
            <span className="font-bold text-gray-900">{person.ticketsResolved}</span>
            <span className="text-gray-500 ml-1">resolved</span>
          </div>
          <div>
            <span className="font-bold text-gray-900">{person.medianCycleDays}d</span>
            <span className="text-gray-500 ml-1">median</span>
          </div>
        </div>

        {/* Top components */}
        <div className="flex flex-wrap gap-1 mb-2">
          {person.topComponents.map((c) => (
            <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>

        {/* Type mix bar */}
        {typeTotal > 0 && (
          <div className="flex h-1.5 rounded overflow-hidden gap-px">
            {Object.entries(person.typeMix).map(([label, count]) => (
              <div
                key={label}
                title={`${label}: ${count}`}
                style={{ width: `${(count / typeTotal) * 100}%` }}
                className={
                  label === "Bug"
                    ? "bg-red-400"
                    : label === "Feature"
                    ? "bg-blue-400"
                    : "bg-green-400"
                }
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    <main className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">TaskScope — Team</h1>
        <Link href="/ask" className="text-sm text-blue-600 hover:underline">
          Ask →
        </Link>
      </div>

      {error && (
        <p className="text-red-600 mb-4">{error}</p>
      )}

      {!data && !error && (
        <p className="text-gray-500">Loading…</p>
      )}

      {data && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {data.people.length} engineers
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.people.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
