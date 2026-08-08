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

Demo dataset: Apache Kafka's public Jira (~10k resolved, assigned tickets), contributor names pseudonymized at ingest.

## API contract (web ↔ engine)

- `GET /api/team` — roster with per-person stats (resolved count, median cycle days, active WIP, top components, type mix)
- `GET /api/person/[id]` — full profile: trend series, recent tickets, collaborators
- `POST /api/ask` `{title, description}` — `{complexity{label, medianDays, rangeDays, rationale}, clarifyingQuestions[], candidates[{personId, name, matchScore, eta, activeWip, evidence[{key,title,cycleDays}], why}]}`
