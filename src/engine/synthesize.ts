/**
 * Claude synthesis layer for /api/ask.
 *
 * Takes a QueryResult + the task text, returns the AskResponse shape
 * (FRONTEND_SPEC.md). The LLM writes ONLY prose: complexity rationale,
 * clarifying questions, and per-candidate "why" sentences. Every number,
 * score, ETA, and candidate ORDER passes through from the engine untouched.
 *
 * Key invariants:
 *   - Citation integrity (the hill to die on): every KAFKA-XXXX key the LLM
 *     emits must appear in evidence or neighbor_tickets for that query. On
 *     violation: retry once; if still violated, strip offending keys.
 *   - No API key → deterministic template fallback. Never throws; never 500.
 *   - Divergence: if rank-1 ETA median differs from complexity median by more
 *     than 3× in either direction, the rationale prompt explicitly requires
 *     reconciliation.
 *   - ETA mapping: QueryResult.eta.p25_days → lo, p75_days → hi.
 */

import type { QueryResult } from "./engine.js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// ── AskResponse (matches FRONTEND_SPEC.md / web/src/lib/types.ts) ─────────────

export interface EvidenceTicket {
  key: string;
  title: string;
  cycleDays: number;
  resolved: string;
}

export interface AskCandidate {
  personId: number;
  name: string;
  matchScore: number;
  eta: { lo: number; hi: number };
  activeWip: number;
  evidence: EvidenceTicket[];
  why: string;
}

export interface AskResponse {
  complexity: {
    label: "Low" | "Medium" | "High" | "Very High";
    medianDays: number;
    rangeDays: [number, number];
    rationale: string;
  };
  clarifyingQuestions: string[];
  candidates: AskCandidate[];
}

// ── Internal prose shape (LLM output, pre-assembly) ───────────────────────────

interface ProseOutput {
  rationale: string;
  clarifyingQuestions: string[];
  candidateWhys: Array<{ rank: number; why: string }>;
}

// ── .env loader ───────────────────────────────────────────────────────────────
// Tries cwd (repo root when running CLI) then cwd/.. (web/ when running as
// Next.js server). Does not overwrite already-set env vars.

function loadDotenv(): void {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "../.env"),
  ];
  for (const envPath of candidates) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key]) process.env[key] = val;
      }
      return; // parsed; stop
    } catch {
      // try next candidate
    }
  }
}

// ── Evidence date formatting ──────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format an ISO timestamp (e.g. "2026-08-06T12:23:32.000+0000") as "6 Aug 2026". */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── Citation integrity ─────────────────────────────────────────────────────────

const KAFKA_KEY_RE = /KAFKA-\d+/g;

export function buildValidKeySet(qr: QueryResult): Set<string> {
  const keys = new Set<string>();
  for (const c of qr.candidates) {
    for (const e of c.evidence) keys.add(e.key);
  }
  for (const n of qr.neighbor_tickets) keys.add(n.key);
  return keys;
}

function proseHasInvalidKey(text: string, valid: Set<string>): boolean {
  for (const m of text.matchAll(KAFKA_KEY_RE)) {
    if (!valid.has(m[0])) return true;
  }
  return false;
}

function outputHasInvalidKey(prose: ProseOutput, valid: Set<string>): boolean {
  if (proseHasInvalidKey(prose.rationale, valid)) return true;
  for (const q of prose.clarifyingQuestions) {
    if (proseHasInvalidKey(q, valid)) return true;
  }
  for (const cw of prose.candidateWhys) {
    if (proseHasInvalidKey(cw.why, valid)) return true;
  }
  return false;
}

/** Strip invalid KAFKA-XXXX mentions (and optional surrounding brackets). */
export function stripInvalidKeys(text: string, valid: Set<string>): string {
  return text
    .replace(/\[?(KAFKA-\d+)\]?/g, (match, key) => (valid.has(key) ? match : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripProse(prose: ProseOutput, valid: Set<string>): ProseOutput {
  return {
    rationale: stripInvalidKeys(prose.rationale, valid),
    clarifyingQuestions: prose.clarifyingQuestions.map(q => stripInvalidKeys(q, valid)),
    candidateWhys: prose.candidateWhys.map(cw => ({
      rank: cw.rank,
      why: stripInvalidKeys(cw.why, valid),
    })),
  };
}

// ── Deterministic template fallback ───────────────────────────────────────────

export function templateFallback(qr: QueryResult): AskResponse {
  const { complexity, candidates } = qr;
  const sampleRef = candidates[0]?.evidence.slice(0, 2).map(e => e.key).join(", ");
  const rationale =
    `Based on ${complexity.sample_size} similar past tickets, this task has a ` +
    `${complexity.label.toLowerCase()} complexity profile with a median resolution ` +
    `time of ${complexity.median_days} days.` +
    (sampleRef ? ` Similar work includes ${sampleRef}.` : "");

  return {
    complexity: {
      label: complexity.label,
      medianDays: complexity.median_days,
      rangeDays: [complexity.p25_days, complexity.p75_days],
      rationale,
    },
    clarifyingQuestions: [],
    candidates: candidates.map(c => ({
      personId: c.person_id,
      name: c.display_name,
      matchScore: c.score,
      eta: { lo: c.eta.p25_days, hi: c.eta.p75_days },
      activeWip: c.wip,
      evidence: c.evidence
        .filter(
          (e): e is typeof e & { resolved: string; cycle_days: number } =>
            e.resolved != null && e.cycle_days != null,
        )
        .slice(0, 5)
        .map(e => ({
          key: e.key,
          title: e.title,
          cycleDays: e.cycle_days,
          resolved: fmtDate(e.resolved),
        })),
      why:
        `${c.display_name} has resolved ${c.relevant_count} similar ` +
        `ticket${c.relevant_count !== 1 ? "s" : ""} in this area.`,
    })),
  };
}

// ── Anthropic tool schema ─────────────────────────────────────────────────────
// Tool-use forces structured output without needing Zod. Forcing tool_choice
// to a specific tool guarantees the response contains exactly one tool_use block.

const SYNTH_TOOL = {
  name: "synthesize_prose",
  description:
    "Return the prose-only fields for the task assignment recommendation. " +
    "Numbers, scores, ETA values, and candidate order come from the engine — do not alter them.",
  input_schema: {
    type: "object" as const,
    properties: {
      rationale: {
        type: "string",
        description:
          "1–3 sentences explaining the complexity estimate, grounded in specific past tickets.",
      },
      clarifyingQuestions: {
        type: "array",
        items: { type: "string" },
        description: "0–5 questions a manager should answer before assigning this task.",
      },
      candidateWhys: {
        type: "array",
        description: "One entry per candidate, in rank order.",
        items: {
          type: "object",
          properties: {
            rank: { type: "integer", description: "Candidate rank (1-based)." },
            why: {
              type: "string",
              description:
                "One sentence explaining this candidate's fit for the specific task.",
            },
          },
          required: ["rank", "why"],
          additionalProperties: false,
        },
      },
    },
    required: ["rationale", "clarifyingQuestions", "candidateWhys"],
    additionalProperties: false,
  },
};

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildPrompt(
  qr: QueryResult,
  title: string,
  description: string | undefined,
  diverges: boolean,
): string {
  const { complexity, candidates, neighbor_tickets } = qr;

  const neighborBlock = neighbor_tickets
    .filter(n => n.cycle_days != null)
    .slice(0, 8)
    .map(n => `  [${n.key}] "${n.title.slice(0, 70)}" — ${n.cycle_days}d`)
    .join("\n");

  const candidateBlock = candidates
    .slice(0, 5)
    .map(c => {
      const evLines = c.evidence
        .slice(0, 3)
        .map(
          e =>
            `      [${e.key}] "${e.title.slice(0, 60)}"` +
            (e.cycle_days != null ? ` (${e.cycle_days}d)` : ""),
        )
        .join("\n");
      return (
        `  Rank ${c.rank}: ${c.display_name}\n` +
        `    Match: ${c.score}/100  |  Median pace: ${c.median_cycle_days}d  |  Active WIP: ${c.wip}\n` +
        `    ETA: ${c.eta.p25_days}–${c.eta.p75_days}d\n` +
        `    Evidence:\n${evLines}`
      );
    })
    .join("\n\n");

  const validKeys = [...buildValidKeySet(qr)].join(", ");

  const divergenceNote =
    diverges && candidates.length > 0
      ? `\nIMPORTANT: Rank-1 candidate's ETA median (${candidates[0].eta.median_days}d) ` +
        `differs from the task complexity median (${complexity.median_days}d) by more ` +
        `than 3×. The rationale MUST include a sentence reconciling this gap ` +
        `(e.g. deep specialization makes them much faster, or heavy load slows them down).`
      : "";

  return [
    "You are helping an engineering manager assign a Jira task.",
    "",
    `Task: "${title}"`,
    description ? `Description: "${description}"` : "",
    "",
    "Complexity (engine estimate — do not change these numbers):",
    `  ${complexity.label} — median ${complexity.median_days}d, ` +
      `range ${complexity.p25_days}–${complexity.p75_days}d ` +
      `(${complexity.sample_size} similar past tickets)`,
    "",
    "Reference tickets from the corpus:",
    neighborBlock || "  (none with effort data)",
    "",
    "Candidates (pre-ranked by engine — order is final, do not reorder):",
    candidateBlock,
    "",
    `Valid ticket keys you may cite: ${validKeys}`,
    divergenceNote,
    "",
    "Instructions:",
    "1. rationale — 1–3 sentences grounding the complexity estimate in the reference tickets. Cite at most 2–3 keys.",
    "2. clarifyingQuestions — 0–5 questions a manager should resolve before assigning (scope gaps, unknowns, dependencies).",
    "3. candidateWhys — one specific sentence per candidate on their fit for THIS task, referencing their evidence when relevant.",
    "",
    "Rules:",
    "- Only cite ticket keys from the valid list above. Do not invent keys.",
    '- Use recommendation language ("strong match", "relevant experience") — not verdict or performance score.',
    "- Do not invent or modify any numbers.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Single LLM attempt ─────────────────────────────────────────────────────────

async function llmAttempt(client: Anthropic, prompt: string): Promise<ProseOutput> {
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools: [SYNTH_TOOL],
    tool_choice: { type: "tool", name: "synthesize_prose" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolBlock = response.content.find(b => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("synthesize_prose tool not called");
  }

  const raw = toolBlock.input as Record<string, unknown>;
  return {
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    clarifyingQuestions: Array.isArray(raw.clarifyingQuestions)
      ? raw.clarifyingQuestions.map(String)
      : [],
    candidateWhys: Array.isArray(raw.candidateWhys)
      ? (raw.candidateWhys as Array<Record<string, unknown>>).map(cw => ({
          rank: typeof cw.rank === "number" ? cw.rank : 0,
          why: typeof cw.why === "string" ? cw.why : "",
        }))
      : [],
  };
}

// ── Deterministic assembly (numbers always come from the engine) ───────────────

function assemble(qr: QueryResult, prose: ProseOutput): AskResponse {
  const { complexity, candidates } = qr;
  const whyMap = new Map(prose.candidateWhys.map(cw => [cw.rank, cw.why]));

  return {
    complexity: {
      label: complexity.label,
      medianDays: complexity.median_days,
      rangeDays: [complexity.p25_days, complexity.p75_days],
      rationale: prose.rationale,
    },
    clarifyingQuestions: prose.clarifyingQuestions,
    candidates: candidates.map(c => ({
      personId: c.person_id,
      name: c.display_name,
      matchScore: c.score,
      eta: { lo: c.eta.p25_days, hi: c.eta.p75_days }, // p25→lo, p75→hi
      activeWip: c.wip,
      evidence: c.evidence
        .filter(
          (e): e is typeof e & { resolved: string; cycle_days: number } =>
            e.resolved != null && e.cycle_days != null,
        )
        .slice(0, 5)
        .map(e => ({
          key: e.key,
          title: e.title,
          cycleDays: e.cycle_days,
          resolved: fmtDate(e.resolved),
        })),
      why:
        whyMap.get(c.rank) ??
        `${c.display_name} has ${c.relevant_count} relevant ticket${c.relevant_count !== 1 ? "s" : ""} in this area.`,
    })),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Synthesize an AskResponse from a QueryResult.
 *
 * With ANTHROPIC_API_KEY set: calls claude-sonnet-5 for prose fields, assembles
 * deterministically from engine numbers. Retries once on citation violation;
 * strips remaining invalid keys before returning.
 *
 * Without ANTHROPIC_API_KEY, or on any error: returns templateFallback(qr).
 * Never throws.
 */
export async function synthesizeAsk(
  qr: QueryResult,
  title: string,
  description?: string,
): Promise<AskResponse> {
  loadDotenv();

  if (!process.env.ANTHROPIC_API_KEY) {
    return templateFallback(qr);
  }

  const client = new Anthropic();
  const validKeys = buildValidKeySet(qr);
  const rank1Eta = qr.candidates[0]?.eta.median_days ?? 0;
  const complexityMedian = qr.complexity.median_days;
  const diverges =
    rank1Eta > 0 &&
    complexityMedian > 0 &&
    Math.max(rank1Eta / complexityMedian, complexityMedian / rank1Eta) > 3;
  const prompt = buildPrompt(qr, title, description, diverges);

  try {
    let prose = await llmAttempt(client, prompt);

    // Citation integrity: retry once on violation, then strip
    if (outputHasInvalidKey(prose, validKeys)) {
      try {
        prose = await llmAttempt(client, prompt);
      } catch {
        // retry failed — fall through to strip
      }
      if (outputHasInvalidKey(prose, validKeys)) {
        prose = stripProse(prose, validKeys);
      }
    }

    return assemble(qr, prose);
  } catch (err) {
    // Key was present but the call failed — log so this is distinguishable
    // from the deliberate no-key fallback.
    console.warn("[synthesize] LLM call failed, using template fallback:", err);
    return templateFallback(qr);
  }
}
