# Project Tracker

> Last updated: 2026-08-09 (renamed to Foreman; Railway deploy config landed; user wiring up live Jira + GitHub apps)

## Project Summary
Foreman — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — demo-ready. Front end + API + SQLite all live on real data; `web && npm run build && npm start` serves the full app. Only optional item outstanding: ANTHROPIC_API_KEY in root `.env` for Claude-written prose (template fallback works without it).

## In Progress
- [ ] User testing the live connect flows: Jira OAuth blocked on an Atlassian account with a Jira site (Access denied at consent — creating a free site or switching accounts); GitHub App `foreman-gdg-kolachi` registered, waiting on PEM → data/github-app.pem
- [ ] First Railway deploy: config committed (a6bba92), needs push + volume at /app/data + env vars on Railway

## Recently Completed
- [x] Railway deploy config (agent: railway-deploy): root build/start scripts, seed/foreman.db (12 MB) + scripts/ensure-db.mjs first-boot copy that respects volume mounts, README deploy section; verified via root build + live PORT test — (2026-08-09, a6bba92)
- [x] Rename TaskScope → Foreman everywhere (agent: rename-foreman): UI, docs, package names, TASKSCOPE_* → FOREMAN_* env vars, data/foreman.db; grep-zero verified, server restarted on new build — (2026-08-09, 3932fa1)
- [x] Repo pushed to github.com/m-hamza-01/hackaton (user pushed; classifier blocks supervisor pushes) — (2026-08-09, e455306)
- [x] Supervisor integration wiring: OAuth session preferred over env auth in ingest, GitHub App token feeds `gh` via GH_TOKEN, GithubPanel mounted on /connect; prod smoke + screenshot verified — (2026-08-09, 3d3346f)
- [x] GitHub App "Connect" flow (agent: github-app-connect): RS256 app JWT via node:crypto, install-once Setup URL callback with spoofing guard, no tokens on disk; supervisor fixed relative-redirect crash (NextResponse.redirect needs absolute URLs) — (2026-08-09, fb240ea)
- [x] GitHub PR integration (agent: github-integration): 8,100 apache/kafka PRs since 2024 via GraphQL, prs + pr_tickets tables loaded into live DB (93.8% of resolved tickets covered); engine/UI wiring proposal in docs/GITHUB_INTEGRATION.md awaits user decision — (2026-08-09, 37bef30)
- [x] Jira OAuth "Connect" flow (agent: jira-oauth-connect): one-click Atlassian 3LO login at /connect, rotating refresh tokens handled, tokens never leave data/; supervisor fixed empty-env redirect_uri fallback — (2026-08-09, 7db5086)
- [x] Dynamic Jira ingest (agent: jira-ingest): any Cloud (`/rest/api/3/search/jql`, ADF, accountId) or Server/DC instance via .env; PSEUDONYMIZE toggle; legacy KAFKA JQL preserved for demo reproducibility — (2026-08-09, 3f3e740)
- [x] Verification sweep (4-agent team: docs-auditor, api-tester, ui-verifier, code-reviewer): zero blockers/majors found; fixed all minors — excludeId SQL param binding, NaN timestamp guard, strict numeric id validation, 405 JSON body, person-404 UX, StrictMode double-submit guard, synthesis failure logging, WAL pragma removal, Next.js 16.3.0 (npm audit clean) — (2026-08-09)
- [x] Demo hardening: `/ask?q=&d=` deep-links auto-run queries, DEMO.md 3-min script, degenerate ETA display fix, README run/deploy instructions — (2026-08-09)
- [x] Claude synthesis layer (task #4): claude-sonnet-5 tool-forced prose, citation validator with retry-then-strip, template fallback without key; CLI self-test passes — (2026-08-09)
- [x] Dashboard on real SQLite (task #5): /api/team, /api/person, /api/ask on ported engine; verified via prod build + screenshots — (2026-08-09)

## Upcoming / Planned
- [ ] Decide with user: PR-metrics surfacing (prMetrics on /api/person, complexity corroboration in /ask, PR badges on evidence tickets) — proposal in docs/GITHUB_INTEGRATION.md; data already loaded
- [ ] User: drop ANTHROPIC_API_KEY into project-root `.env` to enable live Claude synthesis (template fallback active until then)
- [ ] Optional: rehearse DEMO.md flow once on the demo machine
- [ ] Future: parameterize apache/kafka owner/repo in fetch-prs.ts (e.g. from GitHub App installation repos) — hardcoded for the demo dataset

## Deferred
- [ ] ClickUp integration — post-hackathon
- [ ] Chrome extension injection into Jira ticket pages — garnish only if time remains; superseded as an auth story by the OAuth connect flow
- [ ] Auth/multi-tenancy/OAuth — hackathon is single-user, hardcoded
- [ ] Reconcile engine duplication (web/src/lib port vs root src/engine) — intentional for hackathon so web/ builds standalone; unify post-hackathon

## Blockers
- None

## Key Decisions
- (2026-08-08) Data source: Apache Kafka public Jira, pseudonymized contributor names — real enterprise-scale history, zero permission needed, no awkward real-person profiling
- (2026-08-08) Ranking math lives in deterministic code; LLM only synthesizes/explains with citations — defensible to judges, no hallucinated rankings
- (2026-08-08) Repo layout: root = engine (ingest/scoring scripts, SQLite in `data/`), `web/` = Next.js dashboard reading the same DB
- (2026-08-08) Positioning line: "it recommends with evidence, the manager decides"
- (2026-08-09) Engine is duplicated into web/src/lib (not imported from root) so the dashboard builds and deploys standalone; root copy stays for CLI/eval. Two files, one contract, unify later.
- (2026-08-09) Winsorized+clamped ETA formula kept over anchored redo — differentiated per-person bands beat uniform ones (redo preserved at scratchpad eta-anchored-redo.patch)
- (2026-08-09) Connect-style auth is the primary path everywhere (Atlassian OAuth 3LO, install-once GitHub App); .env API tokens are developer fallback only — Basim's standing UX preference
- (2026-08-09) GitHub App chosen over OAuth App: fine-grained read-only repo grants, survives org OAuth restrictions, short-lived installation tokens never stored on disk
- (2026-08-09) PR data (prs, pr_tickets) loaded into the live DB — additive tables only, original tables untouched, pre-load backup at scratchpad taskscope-pre-github.db.bak; nothing reads them until the user approves the surfacing proposal
- (2026-08-09) App renamed TaskScope → Foreman (Basim's call); folder name and scratchpad backup filenames unchanged
- (2026-08-09) Railway over Vercel for production — connect flows persist rotating OAuth tokens on disk and serverless filesystems would drop them; volume at /app/data + committed seed DB (seed/foreman.db) copied on first boot

## Notes
- Deploy: any Node host (better-sqlite3 is native — plain VM/container fine, serverless needs rework). `cd web && npm run build && npm start`.
- Jira API facts (validated): `https://issues.apache.org/jira/rest/api/2/search`, JQL `project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC`, `expand=changelog`, maxResults=100; comments + changelog come back complete inline.
- Known data quirks: KAFKA-967 zombie (4,775d cycle — excluded from trend chart, shown raw in ticket list); `'producer '` component needs trim; 99 single-ticket people below roster cutoff.
