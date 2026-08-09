# Foreman — 3-minute demo script

Positioning line (open with it): **"Foreman recommends with evidence — the manager decides."**

## Setup (before the demo)

```bash
cd web && npm run build && npm start   # serves on :3000
```

Optional: `ANTHROPIC_API_KEY` in root `.env` for Claude-written prose and
clarifying questions. Without it everything still works on template prose.

Pre-open these tabs:

1. `http://localhost:3000/` — team overview
2. `http://localhost:3000/person/4` — Carlos Delacroix profile
3. `http://localhost:3000/ask?q=Streams%20state%20store%20corruption%20after%20rebalance&d=RocksDB%20state%20store%20gets%20corrupted%20when%20a%20consumer%20group%20rebalance%20happens%20mid-commit%20in%20Kafka%20Streams` — precomputed ask result

## Minute 1 — the data (tab 1)

- "This is Apache Kafka's real Jira: 2,000 resolved tickets, 2024–2026, names pseudonymized."
- Point at the roster: volume, median cycle, in-flight load, work mix, components — all computed from ticket history, nothing self-reported.
- Point at the subhead: *"working patterns, not performance ratings"* — the product's ethics are in the UI copy.

## Minute 2 — one engineer (tab 2)

- Click into Carlos Delacroix (or use tab 2): trend of median cycle time by month, recent resolved tickets, frequent collaborators from comment threads.
- Note KAFKA-967 in recent tickets: a ticket that sat open for 13 years, resolved last week. "We show the truth; we just don't let it wreck the statistics."

## Minute 3 — the centerpiece (tab 3)

- The ask page has already run the demo query (deep-link auto-runs it).
- Walk down the result:
  - **Complexity** — a range, not a point estimate, grounded in 35 similar past tickets.
  - **Ask before assigning** — what's underspecified, surfaced *before* assignment.
  - **Candidates** — ranked with match strength, personal ETA, current load, and — the whole point — **cited tickets** under every candidate. Click a candidate's name → their profile.
- Close: "Every claim traces to a real ticket. The engine does the math, Claude writes only the explanation, and the manager makes the call."

## Fallback plan

- If anything breaks live, the example chips ("Rebalance latency regression", "Add tiered-storage metrics") re-run known-good queries.
- `/api/ask` never 500s on LLM problems — synthesis falls back to deterministic templates automatically.

## Likely judge questions

- *"Is the LLM ranking people?"* No — ranking, scores, ETAs are deterministic (BM25 + history stats). The LLM writes prose only, and any ticket key it invents is stripped by a citation validator.
- *"Performance review tool?"* No score is ever attached to a person outside the context of one specific task. Copy throughout says patterns, not ratings.
- *"Where does the data come from?"* Public Apache Kafka Jira via its REST API; pseudonymized at ingest. Any Jira project with history would work the same way.
