"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AskResponse, Complexity, Candidate, EvidenceTicket, TeamMeta } from "@/lib/types";
import { initials, tintOf, pips, fmtDays, complexityColor, candidateBand } from "@/lib/helpers";
import { AppHeader } from "@/app/page";

// Example tasks shown as chips in the input card
const EXAMPLES = [
  {
    label: "Rebalance latency regression",
    title: "Consumer group rebalance latency regression after 3.7 upgrade",
    desc: "Several teams report rebalances taking 30–60s where they used to take under 5s. Suspected in the group coordinator path but not confirmed. Needs reproduction, then a fix or a revert recommendation.",
  },
  {
    label: "Add tiered-storage metrics",
    title: "Expose per-partition tiered storage lag metrics",
    desc: "Operators cannot currently tell how far behind remote log upload is for a given partition. Add metrics and wire them through the broker metrics registry.",
  },
];

// ─── ComplexityCard ────────────────────────────────────────────────────────────
// Shows complexity label (colour-coded), the range bar with median marker,
// and the rationale paragraph. All values come from the API Complexity shape.

export function ComplexityCard({ complexity }: { complexity: Complexity }) {
  const color = complexityColor(complexity.label);
  const scaleMax = Math.ceil((complexity.rangeDays[1] * 1.15) / 5) * 5;
  const barLeft  = ((complexity.rangeDays[0] / scaleMax) * 100).toFixed(1) + "%";
  const barWidth = (((complexity.rangeDays[1] - complexity.rangeDays[0]) / scaleMax) * 100).toFixed(1) + "%";
  const medianLeft = ((complexity.medianDays / scaleMax) * 100).toFixed(1) + "%";
  const rangeText = `${complexity.rangeDays[0]}–${complexity.rangeDays[1]} days, likely`;

  return (
    <div style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "20px 22px" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.58 0.008 90)", marginBottom: 14 }}>Estimated complexity</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color }}>{complexity.label}</div>
        <div style={{ fontFamily: "var(--font-code)", fontSize: 13, color: "oklch(0.68 0.008 90)" }}>{rangeText}</div>
      </div>
      {/* Range bar */}
      <div style={{ position: "relative", height: 34, marginBottom: 8 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 14, height: 4, borderRadius: 2, background: "oklch(0.27 0.008 90)" }} />
        <div style={{ position: "absolute", top: 14, height: 4, borderRadius: 2, background: color, left: barLeft, width: barWidth }} />
        <div style={{ position: "absolute", top: 6, width: 2, height: 20, background: "oklch(0.95 0.006 90)", left: medianLeft }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-code)", fontSize: "10.5px", color: "oklch(0.55 0.008 90)", marginBottom: 16 }}>
        <span>0d</span>
        <span>{complexity.medianDays}d median</span>
        <span>{scaleMax}d</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "oklch(0.78 0.006 90)" }}>{complexity.rationale}</p>
    </div>
  );
}

// ─── EvidenceList ──────────────────────────────────────────────────────────────
// Expandable list of past tickets that back a candidate recommendation.
// Default open per design spec. Shows thin-evidence caveat when <2 tickets.

export function EvidenceList({ tickets, candidateIdx }: { tickets: EvidenceTicket[]; candidateIdx: number }) {
  const [open, setOpen] = useState(true); // DEFAULT OPEN per design

  const label = (open ? "▾  " : "▸  ") + tickets.length + " CITED TICKET" + (tickets.length === 1 ? "" : "S");

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: "var(--font-code)", fontSize: "10.5px", letterSpacing: "0.05em", padding: "5px 11px", borderRadius: 4, border: "1px solid oklch(0.32 0.008 90)", background: "none", color: "oklch(0.7 0.008 90)", cursor: "pointer" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.5 0.05 155)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.88 0.006 90)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.32 0.008 90)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.7 0.008 90)"; }}>
        {label}
      </button>

      {open && (
        <div style={{ marginTop: 12, borderLeft: "2px solid oklch(0.4 0.06 155)", paddingLeft: 16 }}>
          {tickets.map((e) => (
            <div key={e.key} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 76px 84px", gap: 12, alignItems: "baseline", padding: "7px 0" }}>
              <a href="#" style={{ fontFamily: "var(--font-code)", fontSize: "11.5px", color: "oklch(0.78 0.11 155)" }}>{e.key}</a>
              <div style={{ fontSize: "12.5px", lineHeight: 1.45, color: "oklch(0.8 0.006 90)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{e.title}</div>
              <div style={{ textAlign: "right", fontFamily: "var(--font-code)", fontSize: "11.5px", color: "oklch(0.62 0.008 90)" }}>{fmtDays(e.cycleDays)}</div>
              <div style={{ textAlign: "right", fontFamily: "var(--font-code)", fontSize: "11px", color: "oklch(0.54 0.008 90)" }}>{e.resolved}</div>
            </div>
          ))}
          {tickets.length < 2 && (
            <div style={{ fontSize: "11.5px", lineHeight: 1.5, color: "oklch(0.66 0.07 60)", padding: "8px 0 2px", maxWidth: "52ch" }}>
              Only {tickets.length} closely matching ticket in this area — treat the fit as a lead to check, not a settled answer.
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── CandidateCard ────────────────────────────────────────────────────────────
// One ranked candidate row: avatar + band + why + evidence toggle | match bar | ETA + WIP.

export function CandidateCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  const router = useRouter();
  const band = candidateBand(candidate.matchScore);
  const wips = pips(candidate.activeWip);
  const rankLabel = String(rank).padStart(2, "0");

  return (
    <div style={{ borderBottom: "1px solid oklch(0.27 0.008 90)", padding: "20px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr) 190px 128px", gap: 20, alignItems: "start" }}>

        {/* Rank */}
        <div style={{ fontFamily: "var(--font-code)", fontSize: 12, color: "oklch(0.5 0.008 90)", paddingTop: 6 }}>{rankLabel}</div>

        {/* Name + band + why + evidence */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: "var(--font-code)", fontSize: 11, fontWeight: 600, color: "oklch(0.2 0.007 90)", background: tintOf(candidate.personId) }}>
              {initials(candidate.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                onClick={() => router.push(`/person/${candidate.personId}`)}
                style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-0.015em", cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.color = "oklch(0.82 0.11 155)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.color = "")}>
                {candidate.name}
              </div>
              <div style={{ fontSize: "11.5px", color: band.color, marginTop: 1 }}>{band.label}</div>
            </div>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.78 0.006 90)", maxWidth: "64ch" }}>{candidate.why}</p>
          <EvidenceList tickets={candidate.evidence} candidateIdx={rank - 1} />
        </div>

        {/* Match strength bar */}
        <div style={{ paddingTop: 4 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.55 0.008 90)", marginBottom: 8 }}>Match strength</div>
          <div style={{ height: 5, borderRadius: 3, background: "oklch(0.27 0.008 90)", overflow: "hidden", marginBottom: 7 }}>
            <div style={{ height: "100%", background: band.color, width: candidate.matchScore + "%" }} />
          </div>
          <div style={{ fontFamily: "var(--font-code)", fontSize: "11.5px", color: "oklch(0.66 0.008 90)" }}>{candidate.matchScore} / 100</div>
        </div>

        {/* ETA + WIP */}
        <div style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.55 0.008 90)", marginBottom: 5 }}>Their ETA</div>
            <div style={{ fontFamily: "var(--font-code)", fontSize: 16 }}>{candidate.eta.lo}–{candidate.eta.hi} days</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "oklch(0.55 0.008 90)", marginBottom: 5 }}>In flight</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {wips.map((p, i) => (
                <div key={i} style={{ width: 4, height: 13, borderRadius: 1, background: p.c }} />
              ))}
              <span style={{ fontFamily: "var(--font-code)", fontSize: 12, color: "oklch(0.7 0.008 90)", marginLeft: 5 }}>{candidate.activeWip}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "loading" | "results" | "error";

export default function AskPage() {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [meta, setMeta] = useState<TeamMeta | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setMeta(d.meta))
      .catch(() => {});
  }, []);

  async function submit() {
    if (!title.trim()) return;
    setPhase("loading");
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: desc }),
      });
      if (!res.ok) throw new Error("failed");
      const data: AskResponse = await res.json();
      setResult(data);
      setPhase("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch {
      setPhase("error");
    }
  }

  const ticketsLabel = meta ? meta.totalTickets.toLocaleString() : "…";

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.19 0.007 90)", color: "oklch(0.93 0.006 90)", fontFamily: "var(--font-ui), sans-serif" }}>
      <AppHeader meta={meta} />

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 32px 90px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.1 }}>Who should pick this up?</h1>
          <p style={{ margin: 0, maxWidth: "62ch", fontSize: "13.5px", lineHeight: 1.55, color: "oklch(0.66 0.008 90)" }}>
            Describe the task. TaskScope estimates it against similar past work and suggests candidates — with the tickets behind every suggestion. The call is yours.
          </p>
        </div>

        {/* Input card */}
        <div style={{ border: "1px solid oklch(0.3 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", padding: "6px 6px 14px", marginBottom: 34 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Task title"
            style={{ width: "100%", border: "none", background: "none", color: "oklch(0.95 0.006 90)", fontFamily: "var(--font-ui), sans-serif", fontSize: 17, fontWeight: 550, letterSpacing: "-0.012em", padding: "14px 16px 8px", outline: "none" }}
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What needs to happen, and what's known so far…"
            rows={3}
            style={{ width: "100%", border: "none", background: "none", color: "oklch(0.82 0.006 90)", fontFamily: "var(--font-ui), sans-serif", fontSize: "13.5px", lineHeight: 1.6, padding: "0 16px 12px", outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "10px 12px 0", borderTop: "1px solid oklch(0.27 0.008 90)" }}>
            {/* Example chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 4 }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => { setTitle(ex.title); setDesc(ex.desc); }}
                  style={{ fontSize: "11.5px", padding: "5px 10px", borderRadius: 20, border: "1px solid oklch(0.32 0.008 90)", background: "none", color: "oklch(0.7 0.008 90)", cursor: "pointer", fontFamily: "var(--font-ui), sans-serif" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.5 0.05 155)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.88 0.006 90)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.32 0.008 90)"; (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.7 0.008 90)"; }}>
                  {ex.label}
                </button>
              ))}
            </div>
            {/* Submit */}
            <button
              onClick={submit}
              disabled={phase === "loading" || !title.trim()}
              style={{ flexShrink: 0, fontFamily: "var(--font-ui), sans-serif", fontSize: 13, fontWeight: 600, padding: "9px 22px", borderRadius: 5, border: "none", background: "oklch(0.74 0.13 155)", color: "oklch(0.19 0.02 155)", cursor: "pointer", opacity: !title.trim() ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (title.trim()) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.8 0.13 155)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.74 0.13 155)"; }}>
              Find candidates
            </button>
          </div>
        </div>

        {/* ── Idle state ── */}
        {phase === "idle" && (
          <div style={{ border: "1px dashed oklch(0.3 0.008 90)", borderRadius: 6, padding: "44px 32px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-code)", fontSize: 11, letterSpacing: "0.08em", color: "oklch(0.55 0.008 90)" }}>NOTHING ASKED YET</div>
            <p style={{ margin: "12px auto 0", maxWidth: "46ch", fontSize: 13, lineHeight: 1.6, color: "oklch(0.6 0.008 90)" }}>
              Every estimate and candidate you see will cite the past tickets it came from. If the history is thin, the answer will say so.
            </p>
          </div>
        )}

        {/* ── Loading state ── */}
        {phase === "loading" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-code)", fontSize: "11.5px", letterSpacing: "0.05em", color: "oklch(0.7 0.09 155)", marginBottom: 18 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "oklch(0.74 0.13 155)", animation: "ts-pulse 1.1s ease-in-out infinite" }} />
              MATCHING AGAINST {ticketsLabel} RESOLVED TICKETS…
            </div>
            {[{ h: "150px" }, { h: "118px" }, { h: "118px" }].map((sk, i) => (
              <div key={i} style={{ height: sk.h, border: "1px solid oklch(0.28 0.008 90)", borderRadius: 6, background: "oklch(0.215 0.007 90)", marginBottom: 14, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: "35%", background: "linear-gradient(90deg,transparent,oklch(0.28 0.008 90 / 0.7),transparent)", animation: "ts-sweep 1.5s linear infinite" }} />
              </div>
            ))}
          </div>
        )}

        {/* ── Error state ── */}
        {phase === "error" && (
          <div style={{ border: "1px solid oklch(0.42 0.1 30)", borderRadius: 6, background: "oklch(0.24 0.03 30)", padding: "22px 24px", display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.68 0.16 30)", marginTop: 6, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 5 }}>The matching engine didn't answer</div>
              <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.55, color: "oklch(0.75 0.02 30)", maxWidth: "56ch" }}>
                Your task text is still here. Nothing was sent to anyone, and no estimate was produced — retry, or check the service and try again.
              </p>
              <button
                onClick={submit}
                style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: "12.5px", fontWeight: 600, padding: "8px 18px", borderRadius: 5, border: "1px solid oklch(0.5 0.08 30)", background: "none", color: "oklch(0.88 0.04 30)", cursor: "pointer" }}>
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {phase === "results" && result && (
          <div ref={resultsRef} style={{ display: "flex", flexDirection: "column", gap: 34, animation: "ts-in .35s ease both" }}>

            {/* Complexity + Questions row */}
            <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch" }}>
              <ComplexityCard complexity={result.complexity} />

              {/* Clarifying questions — amber card */}
              <div style={{ border: "1px solid oklch(0.36 0.05 60)", borderRadius: 6, background: "oklch(0.225 0.014 60)", padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.72 0.09 60)" }}>Ask before assigning</div>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: "11.5px", lineHeight: 1.45, color: "oklch(0.63 0.02 60)" }}>
                  Similar past tickets stalled on these. The estimate assumes they get answered.
                </p>
                {result.clarifyingQuestions.length > 0 ? (
                  result.clarifyingQuestions.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: 11, padding: "9px 0", borderTop: "1px solid oklch(0.32 0.03 60)" }}>
                      <div style={{ fontFamily: "var(--font-code)", fontSize: 11, color: "oklch(0.68 0.09 60)", flexShrink: 0, paddingTop: 1 }}>
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: "oklch(0.88 0.01 60)" }}>{q}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: "9px 0", borderTop: "1px solid oklch(0.32 0.03 60)", fontSize: 13, color: "oklch(0.63 0.02 60)" }}>
                    No open questions — the task description is well-scoped.
                  </div>
                )}
              </div>
            </section>

            {/* Candidates */}
            <section>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 6 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Candidates</h2>
                <span style={{ fontSize: "11.5px", color: "oklch(0.58 0.008 90)" }}>Ordered by fit against past work · not a ranking of people</span>
              </div>
              <div style={{ height: 1, background: "oklch(0.3 0.008 90)", marginBottom: 4 }} />

              {result.candidates.length === 0 ? (
                <div style={{ border: "1px dashed oklch(0.3 0.008 90)", borderRadius: 6, padding: 32, marginTop: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 6 }}>No one in this history is a close match</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "oklch(0.64 0.008 90)", maxWidth: "56ch" }}>
                    Nothing resolved in this project resembles the task closely enough to cite. That's a signal in itself — this may be new ground for the team, or the description may need more detail.
                  </p>
                </div>
              ) : (
                result.candidates.map((c, i) => (
                  <CandidateCard key={c.personId} candidate={c} rank={i + 1} />
                ))
              )}

              <p style={{ margin: "20px 0 0", fontSize: "11.5px", lineHeight: 1.6, color: "oklch(0.52 0.008 90)", maxWidth: "70ch" }}>
                Estimates are drawn from resolved ticket history and describe past work, not a person's capability. Availability, growth goals, and everything TaskScope can't see are yours to weigh.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
