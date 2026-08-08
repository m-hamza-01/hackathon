# Project Tracker

> Last updated: 2026-08-08 (scoring engine + WIP complete)

## Project Summary
TaskScope — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — pre-hackathon prep (data + scaffold)

## In Progress
- [ ] Dashboard scaffold (Next.js in `web/`, mocked data behind the API contract) — dashboard-engineer agent

## Recently Completed
- [x] Scoring engine (BM25 + candidate ranking + complexity/ETA): src/engine/{bm25,score,ask}.ts, `npm run ask` CLI works — (2026-08-08)
- [x] Open-ticket WIP snapshot: fetch:open + load, 2022 open tickets → open_tickets table, WIP penalty live in scoring — (2026-08-08)
- [x] Jira ingest pipeline (fetch → load → report): 2,000 tickets, 431 people, data/taskscope.db live — (2026-08-08)
- [x] Validated Apache Jira API: anonymous search works, ~10,146 resolved+assigned KAFKA issues, full comments AND changelog inline in one paginated call — (2026-08-08)
- [x] Engine scaffold: package.json, tsconfig, .gitignore — (2026-08-08)

## Upcoming / Planned
- [ ] Claude synthesis layer for /api/ask (structured output with ticket citations + clarifying questions)
- [ ] Wire dashboard API routes to real SQLite data (replace mocks)
- [ ] Demo hardening: precomputed demo queries, canned fallbacks, 3-min script

## Deferred
- [ ] ClickUp integration — post-hackathon
- [ ] GitHub PR/commit join (codebase-aware blast radius) — strong v2, not needed for people-profiles MVP
- [ ] Chrome extension injection into Jira ticket pages — garnish only if time remains
- [ ] Auth/multi-tenancy/OAuth — hackathon is single-user, hardcoded

## Blockers
- None

## Key Decisions
- (2026-08-08) Data source: Apache Kafka public Jira, pseudonymized contributor names — real enterprise-scale history, zero permission needed, no awkward real-person profiling
- (2026-08-08) Ranking math lives in deterministic code; LLM only synthesizes/explains with citations — defensible to judges, no hallucinated rankings
- (2026-08-08) Repo layout: root = engine (ingest/scoring scripts, SQLite in `data/`), `web/` = Next.js dashboard reading the same DB — non-overlapping agent territories
- (2026-08-08) Positioning line: "it recommends with evidence, the manager decides"

## Notes
- Jira API facts (validated): `https://issues.apache.org/jira/rest/api/2/search`, JQL `project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC`, `expand=changelog`, maxResults=100; comments + changelog come back complete inline. Status flow: Open → Patch Available → Resolved.
