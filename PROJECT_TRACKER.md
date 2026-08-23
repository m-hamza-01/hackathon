# Project Tracker

> Last updated: 2026-08-23 (algorithm reliability research + business/compliance analysis documented; engine rewrite roadmap set, backtest harness is next)

## Project Summary
Foreman — hackathon project. Ingests a Jira project's full history (tickets, assignees, comments, transitions), builds per-engineer profiles and a manager dashboard, and answers "who should take this new task, how complex is it, how long will it take" — with every claim citing the real past tickets it's based on. Recommends, never decides.

## Current Status
**Status**: Active — demo-ready. Front end + API + SQLite all live on real data; `web && npm run build && npm start` serves the full app. Only optional item outstanding: ANTHROPIC_API_KEY in root `.env` for Claude-written prose (template fallback works without it).

## In Progress
- [ ] Cloudflare: edit the "foreman" redirect rule from 301 → 302 so the temporary forward isn't browser-cached past the hackathon

## Recently Completed
- [x] Business & compliance analysis → docs/BUSINESS_AND_COMPLIANCE.md: ICP/pricing/platform risk, honest flaws, security gap table vs. today (unauthenticated APIs, plain-file tokens), verified regulatory map (EU AI Act high-risk — Annex III 4(b), deadline moved to 2027-12-02 by Reg. 2026/1744; GDPR DPA/LIA/DPIA; BetrVG works-council veto; UK DUA Act; Illinois/California/Colorado), standards roadmap (SOC 2 → ISO 27001/Cloud Fortified → ISO 42001), data-pooling resolution — (2026-08-23)
- [x] Algorithm reliability research → docs/ALGORITHM_RESEARCH.md: 4-angle literature sweep (ML triage, duration estimation, graph methods, game theory + market), diagnosis of why ETAs are vague (p75/p25 = 18.6×, cycle≠effort, pooled metrics, n<3 samples, no calibration), target architecture (retrieval + graph features + fitted weights → conformally calibrated ETAs → guardrailed LLM adjudication), generalization principles + Kafka-overfit table, onboarding calibration interview design — (2026-08-23)
- [x] Old project name fully scrubbed: design canvas renamed to design/Foreman.dc.html (content updated), tracker history rephrased, project folder renamed to `foreman` — grep for the old name is zero across the repo — (2026-08-20)
- [x] GitHub App CONNECTED IN PROD: Basim replaced the Railway GITHUB_APP_PRIVATE_KEY with the base64 line (probe flipped jwt_error → installation_not_found, proving signing), supervisor re-triggered setup with installation 152337776 → github=ok, connected:true, Simba256, 46 repos. Both sources now live in prod. Privacy page also live at /privacy — (2026-08-09)
- [x] Demo mode (agent: demo-mode; supervisor verified + added stale-cookie flash guard): "Explore with sample data" button on /connect sets a 30-day foreman_demo cookie that passes the hard gate without Jira; SAMPLE DATA header chip + "Exit demo" affordance; real connections take precedence everywhere; verified via curl matrix on simulated pre-connect prod (seed DB, no oauth file) — judges can now browse without connecting — (2026-08-09, cc888e4)
- [x] Ask-page ghost suggestion (supervisor, inline): replaced the two example chips with one translucent placeholder task (same as DEMO.md deep-link — "Streams state store corruption after rebalance"), Tab fills both fields, hint chip disappears once typing starts; deliberate ::placeholder color in globals.css — (2026-08-09, 894ffce)
- [x] Privacy policy page at /privacy (needed for Atlassian Distribution "Sharing" form): static server component outside the connect gate, matches app design (dark, mono overlines, orange accent), honest content — read-only scopes, server-side token storage, Anthropic API for prose, retention/revocation via provider settings; verified 200 + prerenders static so data-less Railway builds are safe — (2026-08-09)
- [x] GitHub App CONNECTED locally: install (id 152337776, Simba256, all repos, metadata+PR read) existed on GitHub but the Setup URL callback had never completed, so `data/github-app.json` was missing everywhere; verified App ID 4532979 + local PEM against GET /app (200), re-triggered `/api/auth/github/setup?installation_id=152337776` locally → connected, 46 repos. Prod re-trigger fails with reason=jwt_error (Railway key var malformed — see In Progress). "Foreman-gdg-kolachi" on the install page is just the App's registered name (GITHUB_APP_SLUG), not an error — (2026-08-09)
- [x] Favicon + UI basics: brand-mark icons (icon.svg, multi-size favicon.ico, apple-icon.png — header's orange square mark on #151410), metadata polish (title template, OG tags, theme-color via viewport export), styled root 404 page, Next.js boilerplate SVGs removed from public/; verified via build + served-HTML head + live 404 — (2026-08-09)
- [x] Post-OAuth localhost redirect fixed (supervisor): jira/callback + github/setup built absolute redirects from req.url, which is the internal address behind Railway's proxy — browser landed on localhost after connecting even though tokens saved fine; new appOrigin() helper honors APP_BASE_URL / x-forwarded-host; verified via simulated proxy headers — (2026-08-09)
- [x] DEPLOYED AND LIVE: https://hackaton-production-bd42.up.railway.app — build green, volume seeded, Jira OAuth completed IN PROD (callback flip worked), gate verified live; simbaforge.com → www → Railway forward active via Cloudflare Redirect Rule (Vercel git push route didn't deploy — project not git-connected; vercel.json 1b696b7 left in repo, harmless) — (2026-08-09)
- [x] Hard connect gate (agent: connect-gate; Basim's call, overrides earlier always-show-seed decision): /, /ask, /person 307 to /connect until data/jira-oauth.json holds a session; (gated) route group with force-dynamic server layout so data-less Railway builds don't bake the redirect; AppHeader extracted to components/; APIs stay open; verified connected/disconnected + both build conditions — (2026-08-09, 3db5a57)
- [x] GITHUB_APP_PRIVATE_KEY env-var support (agent: pem-env): raw or base64 PEM via env, file fallback kept; appConfigured checks updated; verified all three key sources live — (2026-08-09, 00f8650)
- [x] Jira OAuth consent WORKS locally — real data/jira-oauth.json session from this morning; GitHub PEM downloaded by user → data/github-app.pem, stale .env path override cleared — (2026-08-09)
- [x] railway.env finalized: real Railway domain in redirect URI, GitHub App ID/slug active, PEM-via-UI note — (2026-08-09)
- [x] Updated design applied (agent: design-update, stopped mid-run; supervisor finished): green→orange accent everywhere (avatar tints/type badges intentionally kept), header Jira/GitHub status pills + Manage button on live status endpoints, /connect reskinned to "Connect your sources" cards, GitHub hint banner; design gate deliberately NOT implemented (seed data always shows); build + served-HTML verified — (2026-08-09, d957676)
- [x] railway.env created in project root (gitignored) with real ANTHROPIC_API_KEY + Jira OAuth creds, placeholder redirect URI — (2026-08-09)
- [x] Railway deploy config (agent: railway-deploy): root build/start scripts, seed/foreman.db (12 MB) + scripts/ensure-db.mjs first-boot copy that respects volume mounts, README deploy section; verified via root build + live PORT test — (2026-08-09, a6bba92)
- [x] Rename app to Foreman everywhere (agent: rename-foreman): UI, docs, package names, env vars renamed to FOREMAN_*, data/foreman.db; grep-zero verified, server restarted on new build — (2026-08-09, 3932fa1)
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
- [ ] Backtest harness (ALGORITHM_RESEARCH.md §5.1) — time-travel eval over resolved tickets: top-1/top-3 hit rate vs. final resolver, interval coverage at 50/80/95%, log-MAE, abstention rate. Prerequisite for every engine change — next up
- [ ] Engine reliability pass (§5.2–5.4, §7 roadmap): final-resolver labels, work_days-only log-space target, similarity floor, sample-size tiers + abstention, conformal calibration, survival-style ETA display + calibration table
- [ ] Generalization sweep (§4 table): replace Kafka component regexes, absolute complexity thresholds, KAFKA-key citation regex, literal status names (→ statusCategory), hand-tuned constants
- [ ] Tossing-graph + PR-ownership features; fit score weights against backtest (subsumes the PR-metrics surfacing decision below)
- [ ] Onboarding calibration interview + per-tenant calibration profile (§6)
- [ ] Business-side immediate actions (BUSINESS_AND_COMPLIANCE.md §6): authenticate API routes, encrypt tokens at rest, DPA/LIA/DPIA templates, Anthropic wording on /privacy
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
- (2026-08-23) Algorithm direction: not one paradigm — retrieval + graph *features* + fitted weights for ranking, conformally calibrated statistics for ETAs, combinatorial optimization (Hungarian) for batch assignment; game theory rejected for the core (Goodhart/metric-gaming kept as a product rule: no individual speed leaderboards); GNNs deferred until ~10× data
- (2026-08-23) "Works everywhere" = self-calibrating per-tenant procedure with a per-tenant backtest certificate, not a global model — literature shows cross-project models don't transfer; nothing absolute, corpus-relative everything
- (2026-08-23) LLM stays off the numbers; may adjudicate only within backtest-measured statistical ties, with validated justifications and memoized verdicts; must earn its place in the backtest
- (2026-08-23) Manager calibration feedback adjusts definitions, workflow semantics, roster, calendar and sparse-segment priors — never overrides measured quantiles (planning fallacy / reference-class forecasting)
- (2026-08-23) Never pool raw customer data — single-tenant by default, opt-in aggregate metrics only, self-hosted tier for zero egress; trust is the moat against Atlassian's data advantage
- (2026-08-23) GTM geography: US/UK first with EU-ready architecture; EU AI Act high-risk conformity (Annex III 4(b), profiling blocks the Art. 6(3) exemption) targeted for the 2027-12-02 deadline
- (2026-08-08) Data source: Apache Kafka public Jira, pseudonymized contributor names — real enterprise-scale history, zero permission needed, no awkward real-person profiling
- (2026-08-08) Ranking math lives in deterministic code; LLM only synthesizes/explains with citations — defensible to judges, no hallucinated rankings
- (2026-08-08) Repo layout: root = engine (ingest/scoring scripts, SQLite in `data/`), `web/` = Next.js dashboard reading the same DB
- (2026-08-08) Positioning line: "it recommends with evidence, the manager decides"
- (2026-08-09) Engine is duplicated into web/src/lib (not imported from root) so the dashboard builds and deploys standalone; root copy stays for CLI/eval. Two files, one contract, unify later.
- (2026-08-09) Winsorized+clamped ETA formula kept over anchored redo — differentiated per-person bands beat uniform ones (redo preserved at scratchpad eta-anchored-redo.patch)
- (2026-08-09) Connect-style auth is the primary path everywhere (Atlassian OAuth 3LO, install-once GitHub App); .env API tokens are developer fallback only — Basim's standing UX preference
- (2026-08-09) GitHub App chosen over OAuth App: fine-grained read-only repo grants, survives org OAuth restrictions, short-lived installation tokens never stored on disk
- (2026-08-09) PR data (prs, pr_tickets) loaded into the live DB — additive tables only, original tables untouched, pre-load backup was kept in that session's scratchpad (since expired); nothing reads them until the user approves the surfacing proposal
- (2026-08-09) App renamed to Foreman from its original working title (Basim's call); project folder followed on 2026-08-20 (`personalProjects/foreman`)
- (2026-08-09) Railway over Vercel for production — connect flows persist rotating OAuth tokens on disk and serverless filesystems would drop them; volume at /app/data + committed seed DB (seed/foreman.db) copied on first boot
- (2026-08-09) Hard connect gate per Basim — dashboard hidden until Jira connects (reverses the earlier demo-safety choice to always show seed data); risk accepted knowing local OAuth now works
- (2026-08-09) simbaforge.com temporarily 307-forwards to the Railway domain (vercel.json in AIBiz/site-v2) — app's canonical domain stays hackaton-production-bd42.up.railway.app so OAuth callbacks never change; marketing site dark meanwhile

## Notes
- Deploy: any Node host (better-sqlite3 is native — plain VM/container fine, serverless needs rework). `cd web && npm run build && npm start`.
- Jira API facts (validated): `https://issues.apache.org/jira/rest/api/2/search`, JQL `project=KAFKA AND resolution=Fixed AND assignee is not EMPTY ORDER BY resolved DESC`, `expand=changelog`, maxResults=100; comments + changelog come back complete inline.
- Known data quirks: KAFKA-967 zombie (4,775d cycle — excluded from trend chart, shown raw in ticket list); `'producer '` component needs trim; 99 single-ticket people below roster cutoff.
