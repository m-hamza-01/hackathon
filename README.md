# Foreman

Manager-side work intelligence for a Jira project: per-engineer profiles, and grounded answers to "who should take this task, how complex is it, how long will it take" — every claim cites the real tickets it came from. It recommends; the manager decides.

## Layout

- **root** — engine: ingest scripts + SQLite (`data/foreman.db`)
- **`web/`** — Next.js dashboard (team overview, person profiles, `/ask` flow), reads the same DB

## Engine usage

```bash
npm install
npm run ingest    # fetch Apache Kafka Jira history → data/raw/, load → data/foreman.db
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

Reads `../data/foreman.db` directly (run the ingest first). Deploy target
is any Node host (better-sqlite3 is a native module — serverless platforms
need rework, a plain VM/container does not).

**Optional:** copy `.env.example` to `.env` in the project root and add an
`ANTHROPIC_API_KEY`. With it, `/api/ask` prose (complexity rationale,
clarifying questions, per-candidate "why") is written by Claude with
citation-integrity checks; without it, the same endpoint serves
deterministic template prose. Numbers and ranking are engine-computed
either way — the LLM never touches them.

Demo deep-links: `/ask?q=<title>&d=<description>` auto-runs a query on load.

## Connecting your own Jira

Copy `.env.example` to `.env` in the project root and set the variables for your instance.

**Jira Cloud** (`*.atlassian.net`):
```bash
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_PROJECT=MYPROJECT
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token   # generate at id.atlassian.com → Security → API tokens
```

**Jira Server / Data Center** (self-hosted):
```bash
JIRA_BASE_URL=https://jira.your-company.com
JIRA_PROJECT=MYPROJECT
JIRA_PAT=your-personal-access-token   # generate in Jira → Profile → Personal Access Tokens
```

The API type (Cloud vs Server) is auto-detected from the URL (`.atlassian.net` → Cloud). Override with `JIRA_API=cloud` or `JIRA_API=server` if needed.

Set `PSEUDONYMIZE=false` to store real contributor names instead of pseudonyms — safe when ingesting your own team's data.

Switching datasets means removing the old DB and raw pages, then re-running ingest:
```bash
rm -rf data/foreman.db data/raw
npm run ingest
```

## Deploy on Railway

1. **Connect the repo** — create a new Railway project and connect this GitHub repo.

2. **Add a volume** — in Railway's service settings, add a volume mounted at `/app/data`. This is where `data/foreman.db` lives at runtime. On first boot the service copies `seed/foreman.db` there automatically; the volume persists the DB across redeploys.

3. **Set environment variables:**

   | Variable | Required | Notes |
   |---|---|---|
   | `JIRA_OAUTH_CLIENT_ID` | Yes | From your Atlassian OAuth app |
   | `JIRA_OAUTH_CLIENT_SECRET` | Yes | From your Atlassian OAuth app |
   | `JIRA_OAUTH_REDIRECT_URI` | Yes | `https://<your-railway-domain>/api/auth/jira/callback` |
   | `ANTHROPIC_API_KEY` | Optional | Enables Claude prose for `/api/ask`; without it the endpoint returns deterministic template prose |
   | `GITHUB_APP_ID` | Optional | Enables GitHub PR integration |
   | `GITHUB_APP_SLUG` | Optional | Your GitHub App's slug |
   | `GITHUB_APP_PRIVATE_KEY_PATH` | Optional | Absolute path to the PEM inside the container |

4. **Atlassian OAuth callback URL** — the Atlassian OAuth app allows a single callback URL per app. For a production demo either update the existing app's callback URL to the Railway domain, or register a second Atlassian OAuth app pointing to Railway and set its credentials in the env vars above.

5. **GitHub App install URL** — same consideration applies if you use the GitHub integration: the GitHub App's install/setup URL needs to point to your Railway domain, or register a separate GitHub App for the production deployment.

Railway injects a `PORT` env var at runtime; `next start` reads it automatically (default 0.0.0.0, so no hostname configuration is needed).

## API contract (web ↔ engine)

- `GET /api/team` — roster with per-person stats (resolved count, median cycle days, active WIP, top components, type mix) + `meta {totalTickets, dateRange}` for header aggregates
- `GET /api/person/[id]` — full profile: trend series, recent tickets, collaborators
- `POST /api/ask` `{title, description}` — `{complexity{label, medianDays, rangeDays, rationale}, clarifyingQuestions[], candidates[{personId, name, matchScore, eta, activeWip, evidence[{key,title,cycleDays}], why}]}`
