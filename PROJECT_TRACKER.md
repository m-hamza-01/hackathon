# Project Tracker

> Last updated: 2026-08-09 (connect flows + dynamic ingest + PR data landed)

## Project Summary
Foreman — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — demo-ready. Front end + API + SQLite all live on real data; `web && npm run build && npm start` serves the full app. Only optional item outstanding: ANTHROPIC_API_KEY in root `.env` for Claude-written prose (template fallback works without it).

## In Progress
- [ ] None — all four connect/integration builds landed and committed

## Recently Completed
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
- [ ] User: register the Atlassian OAuth app (docs/JIRA_OAUTH_SETUP.md) and the GitHub App (docs/GITHUB_APP_SETUP.md) — both need Basim's own logins; flows are live at /connect once credentials land in `.env`
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

## Notes
- Deploy: any Node host (better-sqlite3 is native — plain VM/container fine, serverless needs rework). `cd web && npm run build && npm start`.
- Jira API facts (validated): `https://issues.apache.org/jira/rest/api/2/search`, JQL `project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC`, `expand=changelog`, maxResults=100; comments + changelog come back complete inline.
- Known data quirks: KAFKA-967 zombie (4,775d cycle — excluded from trend chart, shown raw in ticket list); `'producer '` component needs trim; 99 single-ticket people below roster cutoff.
