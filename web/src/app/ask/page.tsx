"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { AskResponse, Candidate, ComplexityLabel } from "@/lib/types";

// ─── Header ───────────────────────────────────────────────────────────────────

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
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-primary bg-surface-2"
        >
          Ask
        </Link>
      </nav>
    </header>
  );
}

// ─── Complexity colours ───────────────────────────────────────────────────────

const COMPLEXITY_STYLE: Record<ComplexityLabel, { bg: string; text: string; ring: string }> = {
  Low:       { bg: "#0f2018", text: "#3dba84", ring: "#1e4030" },
  Medium:    { bg: "#1c1a0b", text: "#e8a03a", ring: "#3a3210" },
  High:      { bg: "#1a0f20", text: "#7c6cf5", ring: "#2e2455" },
  "Very High": { bg: "#1a0c10", text: "#e05c6a", ring: "#3d1820" },
};

// ─── Score ring (inline SVG) ──────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const dash = (score / 100) * C;

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-label={`Match score ${score}%`}>
      <circle
        cx="22" cy="22" r={R}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="3"
      />
      <circle
        cx="22" cy="22" r={R}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={C / 4}
        strokeLinecap="round"
      />
      <text
        x="22" y="26"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="var(--color-accent)"
        fontFamily="var(--font-display)"
      >
        {score}
      </text>
    </svg>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Main row */}
      <div className="p-5 flex items-start gap-4">
        <div className="shrink-0 text-xs font-display font-bold text-tertiary w-5 pt-1">
          #{rank}
        </div>

        <ScoreRing score={candidate.matchScore} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link
              href={`/person/${candidate.personId}`}
              className="font-display text-base font-semibold text-primary hover:text-accent transition-colors"
            >
              {candidate.name}
            </Link>

            {/* WIP indicator */}
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium ${
              candidate.activeWip <= 2
                ? "bg-[#1e2844] text-secondary"
                : "bg-[#2a2555] text-accent"
            }`}>
              {candidate.activeWip} WIP
            </span>
          </div>

          {/* ETA range */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-secondary">
              ETA{" "}
              <span className="text-primary font-mono font-semibold">
                {candidate.eta.lo}–{candidate.eta.hi}d
              </span>
            </span>
            <span className="text-tertiary">·</span>
            <span className="text-xs text-secondary">
              match{" "}
              <span className="text-accent font-semibold">{candidate.matchScore}%</span>
            </span>
          </div>

          {/* Why */}
          <p className="text-xs text-secondary leading-relaxed">{candidate.why}</p>
        </div>
      </div>

      {/* Evidence toggle */}
      <div className="border-t border-border">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-tertiary hover:text-secondary hover:bg-surface-2 transition-colors"
        >
          <span>Evidence ({candidate.evidence.length} tickets)</span>
          <span className="font-mono">{open ? "−" : "+"}</span>
        </button>
        {open && (
          <ul className="px-5 pb-4 space-y-2 bg-surface-2/40">
            {candidate.evidence.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-accent shrink-0">{e.key}</span>
                <span className="text-xs text-secondary flex-1 truncate">{e.title}</span>
                <span className="text-xs font-mono text-tertiary shrink-0">{e.cycleDays}d</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8" cy="8" r="6"
        stroke="var(--color-border)"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  const cs = result ? COMPLEXITY_STYLE[result.complexity.label] : null;

  return (
    <main className="min-h-screen">
      <AppHeader />

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-primary">Ask</h1>
          <p className="text-secondary mt-1.5 text-sm">
            Paste a task. Get complexity, ETA, and ranked candidates — with evidence.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="block text-xs font-medium text-secondary mb-1.5"
            >
              Task title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement leader election recovery for the new KRaft path"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-primary placeholder-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              required
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-xs font-medium text-secondary mb-1.5"
            >
              Description{" "}
              <span className="text-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context, constraints, acceptance criteria…"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-primary placeholder-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-y"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Spinner />
                Analyzing…
              </>
            ) : (
              "Analyze task"
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-6 text-danger text-sm p-4 bg-[#1a0c10] border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div ref={resultsRef} className="mt-10 space-y-6">
            <h2 className="font-display text-xl font-bold text-primary">Results</h2>

            {/* Complexity card */}
            {cs && (
              <div
                className="rounded-xl border p-5"
                style={{ background: cs.bg, borderColor: cs.ring }}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="text-xs text-secondary mb-1">Complexity</div>
                    <div
                      className="font-display text-2xl font-bold"
                      style={{ color: cs.text }}
                    >
                      {result.complexity.label}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-secondary mb-1">Estimated duration</div>
                    <div className="font-display text-2xl font-bold text-primary">
                      {result.complexity.medianDays}d
                    </div>
                    <div className="text-xs text-tertiary">
                      range {result.complexity.rangeDays[0]}–{result.complexity.rangeDays[1]}d
                    </div>
                  </div>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {result.complexity.rationale}
                </p>
              </div>
            )}

            {/* Clarifying questions */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="font-display text-sm font-semibold text-primary mb-3">
                Clarifying questions
              </h3>
              <ul className="space-y-2">
                {result.clarifyingQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-secondary">
                    <span className="text-tertiary shrink-0 font-mono text-xs mt-0.5">
                      {i + 1}.
                    </span>
                    <span className="leading-relaxed">{q}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Candidate cards */}
            <div>
              <h3 className="font-display text-sm font-semibold text-primary mb-3">
                Recommended assignees
              </h3>
              <div className="space-y-4">
                {result.candidates.map((c, i) => (
                  <CandidateCard key={c.personId} candidate={c} rank={i + 1} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
