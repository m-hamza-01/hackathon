# Project Tracker

> Last updated: 2026-08-09 (demo-ready: full stack live on real data)

## Project Summary
TaskScope — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — demo-ready. Front end + API + SQLite all live on real data; `web && npm run build && npm start` serves the full app. Only optional item outstanding: ANTHROPIC_API_KEY in root `.env` for Claude-written prose (template fallback works without it).

## In Progress
- None

## Recently Completed
- [x] Demo hardening: `/ask?q=&d=` deep-links auto-run queries, DEMO.md 3-min script, degenerate ETA display fix, README run/deploy instructions — (2026-08-09)
- [x] Claude synthesis layer (task #4): claude-sonnet-5 tool-forced prose (rationale, clarifying questions, whys), citation validator with retry-then-strip, template fallback without key, bidirectional divergence guard; wired into web /api/ask; CLI self-test passes — (2026-08-09)
- [x] Dashboard on real SQLite (task #5): /api/team (25-person roster + meta), /api/person (trend, recent tickets, collaborators), /api/ask on ported engine; zombie-ticket trend guard (>365d), server-side date formatting; verified via prod build + screenshots — (2026-08-09)
- [x] Claude Design visual system implemented on all three pages (task #7) — (2026-08-08)
- [x] Demo-safe ETA bands (task #8): winsorized inputs + clamp ladder, ratios ≤ 8 — (2026-08-08)
- [x] Engine aligned to frozen QueryResult contract — (2026-08-08)
- [x] Approved Claude Design composite imported; additive meta on /api/team — (2026-08-08)
- [x] Scoring engine (BM25 + ranking + complexity/ETA): hit@3 = 40% (57× chance) — (2026-08-08)
- [x] Open-ticket WIP ingest (task #6): 555 open tickets — (2026-08-08)
- [x] Jira ingest pipeline: 2,000 resolved tickets, data/taskscope.db — (2026-08-08)

## Upcoming / Planned
- [ ] User: drop ANTHROPIC_API_KEY into project-root `.env` to enable live Claude synthesis (template fallback active until then)
- [ ] Optional: rehearse DEMO.md flow once on the demo machine

## Deferred
- [ ] ClickUp integration — post-hackathon
- [ ] GitHub PR/commit join (codebase-aware blast radius) — strong v2, not needed for people-profiles MVP
- [ ] Chrome extension injection into Jira ticket pages — garnish only if time remains
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

## Notes
- Deploy: any Node host (better-sqlite3 is native — plain VM/container fine, serverless needs rework). `cd web && npm run build && npm start`.
- Jira API facts (validated): `https://issues.apache.org/jira/rest/api/2/search`, JQL `project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC`, `expand=changelog`, maxResults=100; comments + changelog come back complete inline.
- Known data quirks: KAFKA-967 zombie (4,775d cycle — excluded from trend chart, shown raw in ticket list); `'producer '` component needs trim; 99 single-ticket people below roster cutoff.
