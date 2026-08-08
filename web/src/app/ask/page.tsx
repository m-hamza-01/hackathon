"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { AskResponse, Candidate, Complexity, EvidenceTicket } from "@/lib/types";

// ─── ComplexityCard ────────────────────────────────────────────────────────────
// Shows the complexity label, estimated median days, range, and rationale.
// All fields come from the Complexity shape in the API contract.

export function ComplexityCard({ complexity }: { complexity: Complexity }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Complexity</h3>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="inline-block text-lg font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
            {complexity.label}
          </span>
        </div>
        <div className="text-right text-sm">
          <div>
            <span className="font-bold text-gray-900">{complexity.medianDays}d</span>
            <span className="text-gray-500 ml-1">median</span>
          </div>
          <div className="text-gray-400 text-xs">
            range {complexity.rangeDays[0]}–{complexity.rangeDays[1]}d
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{complexity.rationale}</p>
    </div>
  );
}

// ─── EvidenceList ──────────────────────────────────────────────────────────────
// Expandable list of past tickets that support a candidate recommendation.
// Separated so the design of the expansion toggle can be restyled independently.

export function EvidenceList({ tickets }: { tickets: EvidenceTicket[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-600 hover:underline"
      >
        {open ? "Hide" : "Show"} evidence ({tickets.length} tickets)
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-2 border-l border-gray-200">
          {tickets.map((t) => (
            <li key={t.key} className="flex items-baseline gap-2 text-xs">
              <span className="font-mono text-blue-600 shrink-0">{t.key}</span>
              <span className="text-gray-600 flex-1">{t.title}</span>
              <span className="font-mono text-gray-400 shrink-0">{t.cycleDays}d</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── CandidateCard ────────────────────────────────────────────────────────────
// Shows one ranked candidate: match score, name, ETA, WIP, why, and evidence.
// Composes EvidenceList so the evidence block is independently restyable.

export function CandidateCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        {/* Rank + score */}
        <div className="text-center shrink-0">
          <div className="text-xs text-gray-400">#{rank}</div>
          <div className="text-lg font-bold text-blue-600">{candidate.matchScore}%</div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + WIP */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link
              href={`/person/${candidate.personId}`}
              className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
            >
              {candidate.name}
            </Link>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
              {candidate.activeWip} WIP
            </span>
          </div>

          {/* ETA */}
          <div className="text-sm text-gray-500 mb-2">
            ETA{" "}
            <span className="font-semibold text-gray-900">
              {candidate.eta.lo}–{candidate.eta.hi}d
            </span>
          </div>

          {/* Why */}
          <p className="text-sm text-gray-600 leading-relaxed">{candidate.why}</p>

          {/* Evidence (expandable) */}
          <EvidenceList tickets={candidate.evidence} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AskPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data: AskResponse = await res.json();
      setResult(data);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Ask</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Team
        </Link>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Paste a task to get complexity, ETA, and ranked candidates with evidence.
      </p>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Task title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement leader election recovery for the new KRaft path"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional context, constraints, acceptance criteria…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing…" : "Analyze task"}
        </button>
      </form>

      {/* Loading state */}
      {loading && (
        <p className="text-sm text-gray-400">Fetching recommendations…</p>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Results */}
      {result && (
        <div ref={resultsRef} className="space-y-6">
          <h2 className="text-lg font-bold text-gray-900">Results</h2>

          {/* Complexity */}
          <ComplexityCard complexity={result.complexity} />

          {/* Clarifying questions */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Clarifying questions</h3>
            <ol className="space-y-2">
              {result.clarifyingQuestions.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600">
                  <span className="shrink-0 text-gray-400">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Candidate cards */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recommended assignees</h3>
            <div className="space-y-4">
              {result.candidates.map((c, i) => (
                <CandidateCard key={c.personId} candidate={c} rank={i + 1} />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
