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
