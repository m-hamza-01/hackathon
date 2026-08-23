# Foreman — Business Model, Risks, Security & Compliance

> Status: analysis, 2026-08-23. Regulatory dates verified against primary
> sources on that date; items marked UNVERIFIED could not be confirmed.
> Companion: `ALGORITHM_RESEARCH.md` (engine design this analysis assumes).

---

## 1. Business model and feasibility

**Who buys, who is profiled.** The engineering manager buys; the engineers
are the subject of the profiles. That split is the defining business fact:
adoption dies if engineers see a surveillance tool, and most of the legal
exposure (below) follows from profiling people. Design consequences:
engineers can see their own profile; no individual speed leaderboards; the
product recommends and the manager decides — and the UI must make the
override genuinely easy, not a rubber stamp.

**Ideal customer profile.** Teams with a *shared inbound queue* where "who
takes this?" is a daily question: platform/infra teams, support engineering,
SRE, open-source maintainers, 15–150 engineers, ≥1,000 historical tickets.
Below ~15 engineers everyone already knows who does what; below ~300 tickets
the engine must abstain (see `ALGORITHM_RESEARCH.md` §4). Both are sales
qualification questions, not engineering problems.

**Value moments.** (1) New ticket triage — daily. (2) Sprint planning —
batch assignment mode. (3) Onboarding a new manager — "who knows what" in
one view. (4) Risk — ownership concentration / bus factor from PR data.

**Conversion mechanic.** The per-tenant backtest doubles as the trial:
"connect Jira, and in five minutes see how often Foreman would have matched
your own history." Reliability shown on their data, before they pay.

**Pricing sketch.** Per-manager seat or per-project; engineers are never
"seats" (they are subjects, and charging per profiled person reads badly).

**Cost structure.** Compute is trivial (SQLite + one container); LLM prose
is cents per query. The real costs are compliance and sales: SOC 2
(~$25–50k year one), legal templates (DPA, LIA, DPIA, works agreement), and
EU AI Act conformity by December 2027.

**Platform risk.** Atlassian already ships assignee suggestions (recall@5,
no explanation) and owns the data. Foreman cannot out-data Atlassian; it can
out-trust and out-explain it (citations, calibration certificate, multi-source
Jira + GitHub, later ClickUp/Linear). Cross-tool coverage is also the hedge
against bundling.

---

## 2. Honest flaws and risks

1. **Regulatory weight is disproportionate for a small company.** Under the
   EU AI Act Foreman is a *high-risk* system (§4.1) — the same tier as
   recruitment AI. The Article 6(3) exemption is blocked because the system
   profiles natural persons. Options: (a) accept and build the quality-
   management system, targeting the December 2027 deadline; (b) strip
   per-person metrics and route only at team/component level — kills the core
   value; (c) US/UK-first go-to-market with an EU-ready architecture.
   **Recommendation: (c) now, (a) as the roadmap.** Logging, human-oversight
   affordances, and technical documentation are cheap when designed in and
   expensive to retrofit.
2. **German works councils have a veto.** No signed works agreement, no
   deployment (§4.2). Needs a "Betriebsrat kit" before any German deal.
3. **Engineer backlash and metric gaming** (Goodhart). Visible speed stats
   change behaviour (smaller diffs, split tickets, cherry-picked easy work)
   and corrupt the very history the engine learns from.
4. **Data-hygiene dependence.** Teams with sloppy Jira get poor results and
   blame the tool. Mitigation: the calibration interview + a "data hygiene
   report" as a feature, and honest abstention.
5. **Thin-data teams get nothing** — accept it; qualify them out.
6. **"Recommends, manager decides" must be real.** Regulators (GDPR Art. 22,
   ICO, EDPB) require *meaningful* human review: authority, information,
   discretion. A one-click accept flow is a compliance failure.
7. **Disparate-impact exposure** (Illinois, California ADMT). Foreman uses no
   demographic data, but tenure, time zone, and component history are proxies.
   Document non-use of protected attributes and run proxy-impact checks in
   the backtest.

---

## 3. Data security requirements (gap vs. today)

Today (hackathon): single tenant; OAuth tokens as plain JSON on a Railway
volume (`data/jira-oauth.json`); SQLite on the same volume; **API routes
unauthenticated** (the connect gate protects pages only — see tracker
2026-08-09). None of this survives a first real customer.

Required before real customers:

| Area | Requirement |
|---|---|
| Tenant isolation | One SQLite file per tenant (clean file-level isolation, fits current design) or Postgres with row-level security. Per-tenant encryption keys. |
| Secrets | OAuth/refresh tokens encrypted at rest (KMS / envelope encryption), never plain files. |
| AuthN/AuthZ | SSO (SAML/OIDC); RBAC — managers see their team, engineers see only themselves, admins configure. All API routes authenticated. |
| Audit logging | Who queried what, what was recommended, what the manager chose. Doubles as EU AI Act Art. 12 logging (retain ≥6 months). |
| Retention & deletion | Per-tenant purge on churn; token revocation flows; documented retention periods (already promised on `/privacy`). |
| Scopes | Keep read-only minimal scopes (Jira read; GitHub `metadata:read` + `pull_requests:read` only). |
| Pseudonymization | Make the existing `PSEUDONYMIZE` ingest toggle a product mode: names hashed in our store, mapping held inside the tenant boundary. |
| Residency | EU-region hosting option; or **self-hosted / bring-your-own-cloud**: the single-container + SQLite design makes "run it in your VPC, we never see your data" realistic and is the strongest trust posture available. |
| LLM boundary | Anthropic commercial API: no training on API data (contractual, DPA since Jan 2026), 7-day log retention, zero-data-retention available for enterprise. Send minimal context (keys, titles, numbers — not full descriptions or comments). Offer customer-owned keys / Bedrock / Vertex for strict boundaries. |
| Hygiene | Pen test, vulnerability management, incident response plan — all SOC 2 line items. |

---

## 4. Regulatory landscape (verified 2026-08-23)

### 4.1 EU AI Act — Foreman is high-risk

Annex III point 4(b): systems "intended to be used to … allocate tasks based
on individual behaviour or personal traits or characteristics or to monitor
and evaluate the performance and behaviour of persons in such
relationships." Both limbs describe Foreman. The Art. 6(3) exemption cannot
apply: an Annex III system "shall always be considered to be high-risk where
the AI system performs profiling of natural persons" — per-engineer profiles
are profiling by definition (GDPR Art. 4(4)). Human final decision does not
change the classification.

**Timeline:** the Digital Omnibus, Regulation (EU) 2026/1744 (published 24
July 2026, in force 27 July 2026), moved the Annex III standalone-system
deadline from 2 August 2026 to **2 December 2027**.

**Provider obligations:** risk-management system (Art. 9), data governance
(Art. 10), technical documentation (Art. 11), automatic logging (Art. 12),
transparency to deployers (Art. 13), human-oversight design (Art. 14),
accuracy/robustness (Art. 15), quality-management system (Art. 17),
self-assessed conformity (Art. 43), declaration of conformity + CE marking
(Art. 49), EU database registration (Art. 71), EU authorised representative
if the provider sits outside the EU.

### 4.2 GDPR (employee data)

- Customer = controller, Foreman = processor → Art. 28 DPA mandatory.
- Lawful basis: legitimate interests (Art. 6(1)(f)) with a documented
  balancing test; consent is not viable in employment (EDPB Opinion 2/2017).
  Ship a sample LIA template.
- **DPIA mandatory** for systematic employee performance profiling (Art.
  35(3)(a), EDPB Guidelines 4/2019). Ship a DPIA template.
- Art. 22: avoided by human decision — only if oversight is meaningful.
- Minimization: tickets, PRs, cycle times, WIP are defensible; never ingest
  communication content, sentiment, health-adjacent signals, or personal
  GitHub activity outside the work org.
- Transfers: EU–US Data Privacy Framework upheld by the General Court
  (3 Sept 2025); CJEU appeal C-703/25 P pending (UNVERIFIED outcome).
  Certify under DPF *and* sign SCCs as fallback.
- **Germany, BetrVG §87(1) No. 6:** software *capable* of monitoring
  performance requires a signed works agreement where a works council exists;
  intent is irrelevant. Prepare a Betriebsrat kit (technical description, data
  flows, retention, template agreement).

### 4.3 UK

Data (Use and Access) Act 2025 replaced the Art. 22 prohibition with a
safeguard-led regime (Arts. 22A–22D): notification, right to human review,
right to contest, explanation of logic. Friendlier to Foreman's design. ICO
final ADM/profiling guidance: consultation closed 29 May 2026, publication
UNVERIFIED. Need a UK privacy notice and an employee "request human review"
mechanism.

### 4.4 United States (state level)

| Law | Status | Relevance |
|---|---|---|
| Illinois HB 3773 | In effect 1 Jan 2026 | Notice required when AI affects "terms, privileges, or conditions of employment" (task allocation likely in scope); disparate impact = civil-rights violation; vendor liability possible. Build a configurable employee-notice mechanism now. |
| California CPPA ADMT regs | Finalized 23 Sept 2025; employer ADMT compliance **1 Jan 2027** | Pre-use notice, opt-out, access with explanation of logic. Service-provider agreement with CA customers. |
| Colorado SB 24-205 (as amended by SB 189, May 2026) | Effective **1 Jan 2027**, scaled back | Employment is a consequential-decision category; remaining duties lighter. Implementing rules UNVERIFIED. |
| NYC Local Law 144 | In effect since July 2023 | Hiring/promotion only — task allocation of existing staff likely out of scope. |

### 4.5 Standards roadmap

| When | What |
|---|---|
| Launch | Privacy policy (exists), DPA, LIA + DPIA templates, Illinois notice mechanism, Atlassian **Cloud Security Participant**, GitHub Marketplace listing (privacy policy + support contact + no-training statement; minimal scopes). |
| Year 1 | **SOC 2 Type II** (Type I in 60–90 days; Type II needs 6–12 months observation; platform $7.5–20k/yr + audit $15–30k). Prerequisite for Cloud Fortified and most enterprise contracts. |
| Year 2 | ISO 27001; Atlassian **Cloud Fortified** (SOC 2 + uptime commitment + Bugcrowd bounty + annual self-assessment). |
| Before Dec 2027 (EU) | EU AI Act high-risk conformity; **ISO/IEC 42001** (maps onto Art. 17 QMS; appearing in ~40% of EU enterprise AI RFPs). |
| 1 Jan 2027 (US) | California ADMT employer duties; Colorado. |

### 4.6 Platform terms

- **Atlassian:** baseline security requirements (rev. 19 Feb 2026), Ecoscanner
  continuous scanning, Partner Agreement with data-processing terms, privacy
  policy must state data accessed/stored/residency. Forge (runs inside
  Atlassian, no token exposure, native residency) vs. Connect/external OAuth
  (full control, needed to combine Jira + GitHub and run our own inference).
  **Stay external OAuth; accept the security obligations.**
- **GitHub:** listing needs privacy policy, support and publisher contacts,
  pricing plan; no certification. API ToS prohibits training ML models on
  customer data without explicit consent.
- **Anthropic:** commercial API inputs/outputs not used for training
  (contractual); 7-day log retention; ZDR available; ISO 42001 certified.
  Suggested `/privacy` wording: "Foreman uses Anthropic's Claude API to
  generate recommendation explanations. Under our commercial agreement, API
  inputs and outputs are not used to train Anthropic's models; logs are
  retained at most 7 days. Zero data retention is available on request."

---

## 5. The data-pooling dilemma

**The question:** pool every customer's tickets to train stronger models, or
collect nothing and win trust?

**Premise check.** The research says cross-project models transfer poorly;
the engine design is per-tenant calibration. Pooled raw ticket data therefore
buys much less than intuition suggests. What pooling *would* help with, and
what each actually needs:

| Benefit | Needs raw tickets? | What it actually needs |
|---|---|---|
| Better default hyperparameters (half-life, weights) | No | Aggregate per-tenant backtest metrics |
| Benchmarks ("teams like yours resolve X in Y") | No | Aggregate distributions, k-anonymised |
| Text understanding | No | Off-the-shelf pretrained embeddings / LLMs |
| Cold-start priors for thin teams | No | Aggregate distributions by domain |
| A "stronger global model" | Yes | — and it would underperform per-tenant calibration anyway |

**What pooling costs:** the security review every buyer runs ("do you train
on our tickets?" — a fail there ends the deal); GitHub ToS (no training on
customer data without explicit consent); GDPR purpose limitation and AI Act
data governance; and competitively it is a game Atlassian wins by default.

**Resolution: never pool raw data — it is the moat, not a sacrifice.**

1. **Default: single-tenant processing.** "Your data trains only your model."
   Contractual in the DPA.
2. **Opt-in aggregate contribution** in exchange for benchmarks: anonymised
   backtest metrics and distribution summaries only — no ticket text, no
   names, minimum-group thresholds; differential privacy when volume allows.
3. **Future, if ever needed:** federated / meta-learning over tenant-local
   models. Not before product–market fit.
4. **Self-hosted tier** for customers who want zero data egress.

---

## 6. Immediate actions (business side)

1. Authenticate all API routes; encrypt tokens at rest — before any non-demo
   user.
2. Write the DPA, LIA template, DPIA template; extend `/privacy` with the
   Anthropic wording and the no-training commitment.
3. Decide GTM geography (recommendation: US/UK first; EU-ready architecture).
4. Start SOC 2 scoping when the first paying conversation is real.
5. Design logging, human-override UX, and technical documentation to AI Act
   Arts. 12–14 from the first rewrite — cheap now, expensive later.

---

## 7. Go-to-market plan (decided 2026-08-23)

### Where we stand

A convincing demo, not a sellable product. Real: live Jira + GitHub
connections, the explainability invariant (LLM never touches numbers,
citations validated), a working deploy, and a positioning nobody else
occupies. Not real: the numbers are uncalibrated; the engine breaks on any
non-Kafka project (citation regex, component regexes, literal status names);
security is hackathon-grade (unauthenticated APIs, plain-file tokens, single
tenant). The gap to a credible pilot is weeks, because the architecture is
fundamentally right.

### Strategy: design partners, not a launch

Run a **design-partner program: 3–5 US/UK teams matching the ICP** (shared
inbound queue, 15–150 engineers, ≥1,000 tickets), free or nominal for ~3
months, in exchange for feedback, a testimonial, and permission to publish
aggregate calibration results.

- **One container per customer.** Tenancy is already one SQLite file per
  team; a Railway service per partner sidesteps multi-tenancy, gives real
  isolation, and is the same artifact a later self-hosted tier ships. Build
  multi-tenancy only when there are more customers than can be deployed by
  hand.
- **Run the calibration interview by hand** (30 minutes with each manager)
  before building UI for it — customer discovery and calibration in one.
- **The backtest certificate is the pitch:** "Connect your Jira; here's how
  often we'd have matched *your* history."
- **Showcase wedge:** large OSS projects with public Jira/GitHub (the demo
  corpus is Apache Kafka). Zero privacy friction, publishable proof, lead
  generation — not revenue.

### Non-negotiables before any real customer data

1. **Backtest harness + calibrated numbers** — final-resolver labels,
   `work_days` log-space target, sample-size tiers with abstention, conformal
   bands. The core claim is unsubstantiated without it; it is also the trial
   mechanic.
2. **Generalization sweep** — `ALGORITHM_RESEARCH.md` §4 table. The first
   non-Kafka tenant otherwise gets garbage or broken citations.
3. **Security floor** — authenticated API routes, tokens encrypted at rest,
   per-customer isolation (per-container for now), disconnect/revoke/delete
   flow, basic audit log.
4. **Legal floor** — DPA; `/privacy` updated (Anthropic no-training wording,
   our own no-training commitment); LIA + DPIA templates handed to customers;
   generic employee-notice template (Illinois requires it now).
5. **Product-ethics floor (= GDPR Art. 22 compliance)** — engineers see their
   own profile; no speed leaderboards anywhere; manager override is a real,
   easy decision, never a rubber stamp.

### Explicitly not required for pilots

SOC 2 (start scoping when the first paid contract is in sight — 9–15 month
clock), Cloud Fortified, ISO 27001/42001, EU AI Act conformity (design for
it, don't build for it yet), EU customers, calibration-interview UI, LLM
adjudication, batch sprint assignment, multi-tenancy, Marketplace listings.

### Sequence

| Stage | Timing | Content |
|---|---|---|
| 0 | now → ~4–6 weeks | The five non-negotiables. Engineering order: backtest harness → engine reliability → generalization → security floor. Legal templates in parallel. |
| 1 | ~month 2–4 | Design partners: per-customer deploys, hand-run calibration interviews, outcome feedback accruing. Measure: do managers act on recommendations; does the certificate hold on their data. |
| 2 | after PMF signal | Self-serve trial with certificate; Atlassian Cloud Security Participant + GitHub listings; per-manager-seat pricing; SOC 2 started; calibration UI built from interview learnings. |
| 3 | enterprise | Cloud Fortified, multi-tenancy or self-hosted tier, EU readiness (AI Act by 2027-12-02, ISO 42001). |

**First move: the backtest harness.**

---

## 8. Ideal customer: evidence and economics (2026-08-23)

### What teams do today

- **Jira's default assignee dropdown is a recency list** — the last five
  people assigned to plus the reporter (Atlassian docs). "Balanced workload"
  automation = raw open-issue count, no skill weighting. Component default
  assignee = one static person who becomes the bottleneck. AI assignee
  suggestions exist only in Jira Service Management Premium (~$51/agent/mo),
  black-box. **Jira Software dev teams get nothing.**
- **Linear Triage Intelligence (2025, Business tier, $16/user)** — LLM
  reasoning over the backlog with a "thinking trace"; no duration estimate,
  no citations to past tickets, not in Jira. The category is forming.
- ServiceNow Predictive Intelligence routes ITSM tickets at ~85% accuracy —
  to *groups*, not people, unexplained. ITSM is solved; dev engineering is not.
- Triage meetings run 2–3×/week; 18–28% of engineering time goes to triage
  and issue management; sprint planning ≥4 engineer-hours/sprint/team (67%
  call it their least productive meeting). The real workflow is a Slack
  message: "who knows the X subsystem?"
- Estimation: story points / planning poker; 52% report estimates off by
  >25%; mean overrun 44%. **No tool produces a per-person, per-ticket-type
  duration forecast with evidence.** Sharpest unmet need; applies to every
  team, including pull-based ones where "who takes it" does not.

### The pain is measured

37–44% of bugs reassigned at least once (Mozilla/Eclipse); reassignment
causes a ~10× increase in triage time (Microsoft Research); Mozilla BugBug
cut median developer response ~7 → 2 days; Ericsson routed bugs resolve 21%
faster. Counter-evidence: pull-based teams have no assignment pain; below
~15 engineers the EM knows everyone.

### ICP (daily user)

The triage owner in a 20–150-engineer org on Jira Software with a shared
inbound queue and heterogeneous ticket types: platform/infra EM, "bug czar"
/ triage-duty engineer, head of support engineering. Qualifying test: **does
the person assigning know less than the data does?** Anti-ICP: <15
engineers, pull-based Kanban, Linear-native startups, ITSM/helpdesk.

### ROI model (40 engineers, ~300 queue tickets/mo, $100/hr loaded)

| Cost today | ≈ hrs/month |
|---|---|
| Triage meetings (45 min × 6 people × 2.5/wk) | 45 |
| Dispatcher / triage-duty (~5 min/ticket) | 25 |
| Misrouted tickets (37% × 300 ≈ 110 × ~45 min wasted each) | 80 (+ days of latency each) |
| Sprint estimation (4 teams × 2 sprints × 4 h) | 32 |
| **Total** | **~180 h ≈ $18k/month** |

Conservative impact (reassignments −30–40%, triage-meeting time −30%):
~45–60 h ≈ $5–6k/month saved. Break-even at seat pricing is ~8
engineer-hours/month across the org. **ROI is not the risk; salience and
behaviour change are** — validated only by talking to customers.

### Discovery script (Mom-Test style)

"Walk me through the last ticket that landed with the wrong person — how did
you find out, how long did it take?" · "Who assigns, and how many hours a
week does that take?" · "What happened the last time someone asked how long
something would take?" Qualify on: triage meetings exist; queue serves 20+
engineers; Jira Software; heterogeneous tickets.

**Diagnostic hook:** the first thing a prospect sees is *their own*
reassignment rate, its latency cost, estimation error, and ownership
concentration, computed from their own Jira/GitHub — no claims about us.

---

## 9. Positioning: from ticket feature to calibrated org model

**"Who should take this ticket" is a feature, not a premium product.** The
pain is real but diffuse (dozens of small decisions/week, none sinks a
quarter) and the market has priced it (Linear, $16 tier). The same data and
engine answer decisions that cost real money when wrong:

| Decision | Owner | Cost of being wrong | Foreman's answer |
|---|---|---|---|
| Can we commit to X by Q4 with this team? | VP Eng / CTO | Lost deals, churn, credibility | Calibrated per-person forecasts rolled up: "85% by date X", with receipts |
| Hire a specialist, or is it a WIP problem? | CTO | Mis-hire $100k+; missed hire = stalled roadmap | Expertise concentration, component latency, senior load |
| If Alice leaves, what breaks? | CTO | Product stalls for months | Ownership concentration → key-person risk map |
| Why are our best engineers always the bottleneck? | VP Eng | Burnout, attrition of irreplaceable people | Load distribution; capacity-constrained batch assignment |
| I just inherited this org — who knows what? | New VP Eng (trigger event) | Months of guessing | The profiles, instantly |

**The per-ticket loop is the wedge and the calibration loop, not the
headline.** Every resolved ticket is free, unbiased feedback that keeps the
org model calibrated. The product: *a calibrated model of your engineering
organisation's expertise, capacity, and risk.*

**Premium pricing discipline** (most expensive in the market, still a
no-brainer) holds only when all four are true: senior buyer who owns a
number; price anchored to a decision, not a seat (flat annual platform fee
sized to the org; "one avoided mis-hire / kept commitment / retained key
engineer pays for it several times over"); proof on their own data (the
calibration certificate); human attention in the package (white-glove
calibration, quarterly org review).

**Reliability at high stakes:** not an oracle — a rigorous analyst with
receipts. Calibration, abstention, and confidence become *more* central.
"We don't have enough history to say" is what earns the trust.

Trigger events to sell into: missed major commitment, key engineer quit,
hiring-budget review, new VP Eng, board asking why engineering is slow.

---

## 10. Go-to-market decision: consultant-led entry, company-retained tool (2026-08-23)

**Decision.** Do not compete with trusted human advisors for the CTO's
decision; arm them. Enterprise decisions are bought from people who take
responsibility. Foreman's "recommends with evidence, a human decides" DNA
makes the consultant the human. Supersedes the free design-partner
programme in §7 (Stage 0 non-negotiables unchanged).

**Why it works.** Every engagement on an engineering org starts with a
diagnostic — interviews, spreadsheets, a Jira export, 2–3 weeks of senior
time, inconsistent. A calibrated, evidence-cited diagnostic in hours
multiplies their most expensive input. Against a $50k–$1M engagement a
$5–20k tool fee is invisible (premium pricing, no-brainer). Consultants
bring **data access** (signed engagement, client trust) and **leverage**
(one firm = many orgs; one fractional CTO = a new org every year).

**Who, specifically** (not the big firms — they build their own tooling and
guard engagement economics):

1. **Technical due-diligence firms** (VC/PE pre-acquisition). 2–3-week
   assessments from repos and trackers, $30–100k per DD, output is a report,
   and their questions are our outputs: bus factor / key-person risk,
   estimation reliability, delivery predictability, expertise concentration,
   senior-engineer bottlenecks. **Sharpest beachhead.**
2. **Fractional CTOs / VP-Eng-as-a-service.** Day one at every client is
   "I just inherited this org" — our trigger event, recurring in one person.
3. **Engineering-effectiveness boutiques and flow/Kanban coaches.** Already
   sell probabilistic forecasting; wary of per-person metrics — lead with
   initiative forecasting and team views for them.

**Two-sided model.** Consultant brings Foreman in for the diagnostic and
backs recommendations with the client's own evidence; at engagement end
Foreman stays as the **leave-behind** (daily routing + continuous
calibration — nobody hires a consultant for that). Referral fee aligns the
consultant. Entry through the trusted human; retention through the daily
loop.

**Product implications.**
- Multi-client workspace with per-engagement lifecycle: connect → analyse →
  report → purge (deletion at engagement end is a feature).
- The diagnostic report is the core artifact: exportable, white-labelable,
  slide-ready. Consultants present; they don't demo.
- Consent flow: "send your client a connect link" — client authorises, the
  consultant never touches credentials. Consultant = processor, Foreman =
  sub-processor; one DPA template covers the chain.
- Less manager-facing UI polish, more rigour in the numbers.

**Pricing.** Per engagement ($3–10k) or annual practitioner licence with
unlimited engagements, plus a client-paid leave-behind subscription.

**Risks.** Billable-hour disincentive (target fixed-fee / value-priced
practitioners; avoid T&M shops); smaller direct market (the leave-behind
reaches the larger one — not optional); customisation pull (calibrated
numbers are fixed, narrative layer flexes); channel dependence and episodic
usage (mitigated by leave-behind and by running diagnostics ourselves).

**Revised Stage 1.** Run the first 2–3 diagnostics ourselves on real orgs
(learn what the report must contain; produce the proof), then put the
finished artifact in front of DD firms and fractional CTOs and ask "would
you pay to run this on every engagement?" The backtest harness remains the
first brick — it is the diagnostic's engine.
