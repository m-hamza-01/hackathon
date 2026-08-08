// ─── Design-system helper functions ──────────────────────────────────────────
// Ported from the approved Claude Design export (TaskScope.dc.html).
// Used on all three pages; keep in sync with the design file's script block.

// 6-tint avatar background palette
const TINT = [
  "oklch(0.78 0.09 155)",
  "oklch(0.79 0.09 60)",
  "oklch(0.76 0.09 30)",
  "oklch(0.77 0.08 250)",
  "oklch(0.78 0.07 320)",
  "oklch(0.8 0.08 120)",
];

// Badge colors per ticket type: [bg, text, segment-color]
export const TYPE_C: Record<string, [string, string, string]> = {
  Bug:           ["oklch(0.32 0.05 30)",  "oklch(0.82 0.1 30)",  "oklch(0.68 0.14 30)"],
  Improvement:   ["oklch(0.3 0.05 155)",  "oklch(0.82 0.1 155)", "oklch(0.74 0.13 155)"],
  "New Feature": ["oklch(0.3 0.04 250)",  "oklch(0.82 0.08 250)","oklch(0.72 0.1 250)"],
  Task:          ["oklch(0.28 0.006 90)", "oklch(0.78 0.006 90)","oklch(0.6 0.02 90)"],
  "Sub-task":    ["oklch(0.26 0.006 90)", "oklch(0.7 0.006 90)", "oklch(0.48 0.015 90)"],
};

export function typeBadge(type: string): { bg: string; fg: string } {
  const c = TYPE_C[type] ?? TYPE_C["Task"];
  return { bg: c[0], fg: c[1] };
}

export function typeSegmentColor(type: string): string {
  return (TYPE_C[type] ?? TYPE_C["Task"])[2];
}

/** Derive up-to-2-letter initials from a name like "A. Varin" → "AV". */
export function initials(name: string): string {
  return name
    .replace(/[^a-zA-ZÀ-ÿ\s.]/g, "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Pick a deterministic avatar background tint from the palette. */
export function tintOf(id: number): string {
  return TINT[id % TINT.length];
}

/**
 * WIP pip descriptors — always returns 8 items.
 * Colour escalates: green < 4, amber 4–5, red ≥ 6.
 */
export function pips(n: number): { c: string }[] {
  const active =
    n >= 6
      ? "oklch(0.72 0.13 30)"
      : n >= 4
      ? "oklch(0.76 0.11 60)"
      : "oklch(0.7 0.09 155)";
  const inactive = "oklch(0.28 0.008 90)";
  return Array.from({ length: 8 }, (_, i) => ({ c: i < n ? active : inactive }));
}

/** Format a cycle-time value as "1.5d" / "14d" / "118d". */
export function fmtDays(d: number): string {
  if (d >= 100) return Math.round(d) + "d";
  if (d >= 10) return d.toFixed(0) + "d";
  return d.toFixed(1) + "d";
}

/** Colour for a days value in the recent-tickets table. */
export function daysColor(cycleDays: number): string {
  if (cycleDays > 60) return "oklch(0.74 0.13 30)";
  if (cycleDays > 20) return "oklch(0.78 0.1 60)";
  return "oklch(0.8 0.006 90)";
}

/** Match-strength band text + colour from a 0–100 score. */
export function candidateBand(matchScore: number): { label: string; color: string } {
  if (matchScore >= 80) return { label: "Strong match",  color: "oklch(0.78 0.11 155)" };
  if (matchScore >= 65) return { label: "Solid match",   color: "oklch(0.8 0.09 120)"  };
  if (matchScore >= 45) return { label: "Possible fit",  color: "oklch(0.8 0.09 60)"   };
  return              { label: "Worth a look",   color: "oklch(0.7 0.02 90)"   };
}

/** Complexity label colour. */
export function complexityColor(label: string): string {
  const m: Record<string, string> = {
    Low:         "oklch(0.76 0.11 155)",
    Medium:      "oklch(0.8 0.1 120)",
    High:        "oklch(0.8 0.11 60)",
    "Very High": "oklch(0.74 0.14 30)",
  };
  return m[label] ?? "oklch(0.8 0.006 90)";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Format an "YYYY-MM" month string as "Jan '23".
 * Falls back to the raw string if the format doesn't match.
 */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return MONTHS[+m - 1] + " '" + y.slice(2);
}
