# TaskScope

Manager-side work intelligence for a Jira project: per-engineer profiles, and grounded answers to "who should take this task, how complex is it, how long will it take" — every claim cites the real tickets it came from. It recommends; the manager decides.

## Layout

- **root** — engine: ingest scripts + SQLite (`data/taskscope.db`)
- **`web/`** — Next.js dashboard (team overview, person profiles, `/ask` flow), reads the same DB

## Engine usage

```bash
npm install
npm run ingest    # fetch Apache Kafka Jira history → data/raw/, load → data/taskscope.db
npm run report    # sanity stats: people, cycle times, expertise mix
```

Demo dataset: Apache Kafka's public Jira (~10k resolved, assigned tickets available; the 2,000 most recent are ingested for the demo, plus 555 open tickets for WIP), contributor names pseudonymized at ingest.

```bash
npm run ask -- --title "Streams state store corruption after rebalance"   # CLI query
npm run ask -- --synth    # synthesis smoke test + citation-validator self-test
```

## Dashboard usage

```bash
cd web
npm install
npm run dev      # development on :3000
# or production:
npm run build && npm start
```

Reads `../data/taskscope.db` directly (run the ingest first). Deploy target
is any Node host (better-sqlite3 is a native module — serverless platforms
need rework, a plain VM/container does not).

**Optional:** copy `.env.example` to `.env` in the project root and add an
`ANTHROPIC_API_KEY`. With it, `/api/ask` prose (complexity rationale,
clarifying questions, per-candidate "why") is written by Claude with
citation-integrity checks; without it, the same endpoint serves
deterministic template prose. Numbers and ranking are engine-computed
either way — the LLM never touches them.

Demo deep-links: `/ask?q=<title>&d=<description>` auto-runs a query on load.

## API contract (web ↔ engine)

- `GET /api/team` — roster with per-person stats (resolved count, median cycle days, active WIP, top components, type mix) + `meta {totalTickets, dateRange}` for header aggregates
- `GET /api/person/[id]` — full profile: trend series, recent tickets, collaborators
- `POST /api/ask` `{title, description}` — `{complexity{label, medianDays, rangeDays, rationale}, clarifyingQuestions[], candidates[{personId, name, matchScore, eta, activeWip, evidence[{key,title,cycleDays}], why}]}`
