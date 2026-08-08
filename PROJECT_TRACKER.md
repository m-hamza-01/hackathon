# Project Tracker

> Last updated: 2026-08-08 (design system live on dashboard)

## Project Summary
TaskScope — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — pre-hackathon prep (data + scaffold)

## In Progress
- [ ] Claude synthesis layer for /api/ask (task #4) — scoring-engineer; deterministic fallback until ANTHROPIC_API_KEY lands in .env
- [ ] Wire /api/team + /api/person to real SQLite (task #5) — dashboard-engineer; /api/ask flips after #4

## Recently Completed
- [x] Claude Design visual system implemented on all three pages (task #7): oklch dark palette, Libre Franklin + Spline Sans Mono, verified screenshots — (2026-08-08)
- [x] Demo-safe ETA bands (task #8): winsorized inputs + clamp ladder, ratios ≤ 8, floors at 0.5d — (2026-08-08)
- [x] Engine aligned to frozen QueryResult contract; dead score.ts removed — (2026-08-08)
- [x] Approved Claude Design composite imported to design/ + additive meta{totalTickets, dateRange} on /api/team — (2026-08-08)
- [x] Scoring engine (BM25 + candidate ranking + complexity/ETA): leave-one-out hit@3 = 40% (57× chance), `npm run ask` CLI works — (2026-08-08)
- [x] Open-ticket WIP (task #6): 555 in-progress/patch-available/reopened tickets → main tickets table (resolved NULL); Active WIP section in report; scoring engine reads WIP from main table — (2026-08-08)
- [x] Jira ingest pipeline (fetch → load → report): 2,000 tickets, 431 people, data/taskscope.db live — (2026-08-08)
- [x] Validated Apache Jira API: anonymous search works, ~10,146 resolved+assigned KAFKA issues, full comments AND changelog inline in one paginated call — (2026-08-08)
- [x] Engine scaffold: package.json, tsconfig, .gitignore — (2026-08-08)

## Upcoming / Planned
- [ ] Flip /api/ask from mock to queryEngine + synthesize (coordinated step after tasks #4 and #5)
- [ ] Demo hardening: precomputed demo queries, canned fallbacks, 3-min script
- [ ] User: drop ANTHROPIC_API_KEY into project-root .env to enable live synthesis

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
