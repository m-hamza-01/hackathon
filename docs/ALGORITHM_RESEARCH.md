# Foreman — Algorithm Research & Reliability Design

> Status: research synthesis + target design. Nothing here is implemented yet.
> Written 2026-08-23 from a four-angle literature sweep (ML bug triage, duration
> estimation, graph methods, game theory + market) and design discussion.
> Companion: `GITHUB_INTEGRATION.md` (PR data already loaded, unused).

---

## 1. The problem with today's numbers

The current engine (`web/src/lib/engine.ts`, mirrored in `src/engine/engine.ts`)
is BM25 retrieval over past tickets + a hand-tuned multiplicative score, with
ETAs read off the cycle-time percentiles of each candidate's matched tickets.
Measured on the seed corpus (2,000 resolved KAFKA tickets):

| Effort-days percentile | p10 | p25 | p50 | p75 | p90 | p99 |
|---|---|---|---|---|---|---|
| days | 0.8 | 2.8 | 11.5 | 52 | 194 | 1,699 |

p75/p25 = **18.6×**. Any honest quantile over this data produces a "3–52 day"
range. Root causes, in order of damage:

1. **Wall-clock time is used as effort.** `cycle_days` = created→resolved;
   `work_days` = first In-Progress→resolved (`src/ingest/load.ts:208-217`).
   Both include idle time.
2. **Two metrics pooled into one distribution.** `effortProxy()` uses
   `work_days` when present (951/2,000 tickets) and raw `cycle_days` otherwise
   (`engine.ts:103-113`).
3. **Tiny per-candidate samples.** A candidate's ETA comes from their slice of
   35 BM25 neighbours — often 1–3 tickets; the n<3 branch uses arbitrary
   0.7/1.3 multipliers (`engine.ts:405-408`) and a chain of clamps.
4. **No similarity floor.** `MIN_MATCHES=1`, `TOP_N=35`; weak matches drag
   estimates to the corpus base rate.
5. **No calibration evidence.** Nothing in the repo checks predictions against
   outcomes. Credibility = demonstrated calibration; we have none.

What is already right: the LLM never touches a number or a rank; citations are
validated (retry-then-strip). That invariant stays.

---

## 2. Research findings (four angles)

### 2.1 ML / bug-triage literature — validates the retrieval backbone

- Lineage: Anvik et al. 2006 ("Who Should Fix This Bug?") → SVM/NB/kNN era →
  DeepTriage (2018) → BERT-era. Published top-1 accuracies sit at 30–55% on
  50K–400K-bug corpora; deep models need that scale.
- **Small-data reality:** at ~2,000 tickets, classical methods (TF-IDF + LR/SVM,
  kNN/BM25 retrieval) beat deep models. Realistic ceiling: 40–60% top-1,
  60–75% top-3. Retrieval natively yields the "similar tickets" citation trail
  — the case-based-reasoning lineage is explicitly the explainable one.
- **Train on the final resolver, not the first assignee.** 37–50% of initial
  assignments are reassigned (Microsoft "Not My Bug", Eclipse/Mozilla studies).
- **Abstain below confidence.** Mozilla BugBug acts only above 60% confidence
  → >80% precision in production. Ericsson's deployed router auto-assigns ~30%
  of trouble reports at 75% accuracy; those resolve 21% faster.
- Failure modes: class imbalance (few experts get everything), concept drift
  (kept recommending departed engineers — Ericsson's #1 real-world failure),
  recommending the overloaded expert (our WIP penalty is the right idea),
  evaluation leakage (train on post-triage fields → optimistic numbers; roll
  tickets back to filing state).
- Features that matter, ranked: title+description text; component field
  (often the single best predictor); developer activity profiles; commit/PR
  co-occurrence; tossing graph; recency-weighted history; live WIP.

### 2.2 Duration estimation — calibrate, don't narrow

- Resolution time is genuinely hard: the literature ceiling is coarse
  fast/slow buckets at 50–67% accuracy; continuous log-scale MAE 0.4–0.8
  log-days (≈1.5–2× error at the median). Text-only models do not replicate
  across projects. **Wide intervals are honest; uncalibrated ones are the flaw.**
- Cycle times are lognormal → do all modelling and interval math in log-space.
- Methods ranked by fit for n≈2,000 heavy-tailed per-engineer data:
  1. **Conformalized Quantile Regression (CQR)** on log(work_days) — adaptive
     intervals with a distribution-free, finite-sample coverage guarantee.
     n=2,000 → 1,600 train / 400 calibrate is comfortable. Split conformal is
     simple enough to implement directly in TypeScript (residual quantiles on
     a held-out set); MAPIE/LightGBM-quantile if we want a Python sidecar.
  2. LogNormal AFT survival model — interpretable covariates, handles
     right-censored open tickets.
  3. Empirical CDF of filtered analogues + conformal calibration — our current
     approach plus one calibration step. Easiest to explain.
  4. Flow-school Monte Carlo (Vacanti, Magennis) — team-level, feature-blind;
     for a single item it reduces to reading the empirical CDF.
- **Communication idiom practitioners trust:** survival-curve read-offs —
  "Of 47 similar tickets, 50% resolved within 6 days, 85% within 21" — plus a
  backtest calibration table (nominal vs. empirical coverage). Never "±2σ"
  (implies Gaussian); never a bare median (anchors).
- Per-engineer conditioning needs ≥20–30 resolved tickets per engineer; below
  that fall back to component/team priors.

### 2.3 Graph methods — right data model, wrong place for neural nets

- Developer–component–ticket(–file) bipartite graphs with recency-decayed
  edge weights are the best-validated expertise representation (Expertise
  Recommender, Degree-of-Knowledge, RSTrace+). Code-ownership concentration
  (Bird et al., "Don't Touch My Code!") both ranks experts and flags risk.
- **Tossing graph** (Jeong, Kim & Zimmermann, FSE 2009): model assignee
  reassignment chains as a Markov graph — +23 pp accuracy, −72% tosses over
  text-only. We already ingest transitions; this is nearly free.
- Personalized PageRank / random-walk scoring over the graph is cheap and
  training-free at our scale. **GNNs are premature:** Microsoft's CORAL (GCN
  over 332 repos) beats file-history baselines only on large orgs and loses on
  small projects. Revisit at ~10× data.
- Socio-technical congruence (Cataldo & Herbsleb): assigning someone who
  already collaborates with owners of dependent components → ~32% faster
  resolution. A secondary collaboration-affinity signal.
- **Batch assignment is an optimization problem, not a recommendation
  problem:** greedy top-1 overloads the same three experts. Hungarian /
  min-cost matching with capacity constraints (`linear_sum_assignment`) solves
  a sprint's worth of tasks in <1 ms. WhoReview (multi-objective: expertise +
  workload + collaboration) is the closest published analogue.

### 2.4 Game theory — red herring for the core; Goodhart is real

- Genuine applications (contract-net auctions, stable matching, fair
  chore division) assume strategic agents bidding for work. Foreman
  recommends, the manager decides, nobody bids. Almost no SE production use.
- The real incentive problem is **metric gaming** once per-engineer speed
  stats become visible (documented: smaller diffs, split tickets, cherry-picked
  easy work). Product rule: never expose individual speed leaderboards; speed
  factors stay internal to ranking.
- Fairness (envy-free workload) is a future constraint on batch assignment.

### 2.5 Market

- LinearB / Jellyfish / Swarmia / Uplevel / DX are retrospective team
  analytics; none recommends assignees prospectively. Swarmia ships a
  team-level Monte Carlo initiative forecast (2026).
- Atlassian's assignee suggestion claims "86% accuracy" — recall@5, no
  explanation, no citations.
- Forecasting tools practitioners trust (ActionableAgile, Focused Objective)
  refuse single dates; 85th percentile is the standard commitment threshold.
- **Gap: nobody combines who + how-long + cited evidence + measured
  calibration.** That is Foreman's positioning; Atlassian cannot be out-dataed,
  but can be out-trusted and out-explained.

---

## 3. Framing answer

"Graph theory vs. game theory vs. ML" is a mis-framing. Foreman is three
sub-problems with three right tools:

| Sub-problem | Paradigm | Verdict on each angle |
|---|---|---|
| Who should take it | Retrieval + graph **features** + learned re-ranker | Graph = data model, not GNN |
| How long will it take | Statistics with calibrated intervals | Classical ML yes, deep learning no |
| How to spread work across a team | Combinatorial optimization | Not game theory |

One line: a statistics problem wearing an ML hat, fed by graph features, with
optimization for allocation. Credibility comes from conformal calibration + a
published backtest, not a fancier model.

---

## 4. Generalization: works on any team, any size, any domain

The literature is consistent that models **do not transfer across projects**.
So "works everywhere" ≠ one global model. It means a **self-calibrating
procedure with guarantees**, like BM25: universal algorithm, per-corpus index.

Principles:

1. **Nothing absolute.** Every "what's normal" constant is computed from the
   tenant's own history (complexity labels = corpus quantiles, not day
   thresholds).
2. **Conformal calibration is the mathematical works-everywhere tool** — its
   coverage guarantee is distribution-free; calibrate on the tenant's held-out
   tickets and the band is valid for *their* distribution.
3. **Hierarchical fallback + abstention handles team size.** Person-level
   (≥30 tickets) → component-level → team-level → abstain ("not enough history
   for per-person ETAs; routing by component only"). Floors: ~300 tickets,
   ~5 active engineers.
4. **The per-tenant backtest is the reliability certificate.** Every
   deployment measures and reports its own numbers: "On your 2,400 tickets,
   our top-3 contained the actual resolver 71% of the time; our 80% bands
   covered 79% of outcomes."

Current Kafka-specific overfits to remove:

| Overfit | Location | Replacement |
|---|---|---|
| Hardcoded component regexes (streams/kraft/broker…) | `web/src/lib/engine.ts:145-153` | Tenant's Jira component field + term↔component association table learned at ingest (TF-IDF / chi-squared) |
| Complexity thresholds 3/14/60 days; fallbacks 3/15/60 | `engine.ts:96-101`, `:237`, `:283-285` | Corpus quantiles |
| `KAFKA_KEY_RE = /KAFKA-\d+/` citation validator | `web/src/lib/synthesize.ts:104` | Key prefixes derived from the DB |
| Work-start detection by literal status names | `src/ingest/load.ts:209` | Jira `statusCategory` (universal) + calibration-interview overrides |
| Tuning constants (WIP 0.15, comp boost 2.0, 24-mo half-life, ETA clamps) | `engine.ts:61-68, 350, 366, 415` | Defaults, re-fit per tenant in the calibration run |
| `apache/kafka` owner/repo | `src/github/fetch-prs.ts` | From GitHub App installation repos (already tracked) |

---

## 5. Target architecture

```
ingest (Jira + GitHub)
  → calibration interview (definitions, workflow, roster, calendar, sparse priors)
  → per-tenant calibration run
      learn component associations · corpus quantiles · fit score weights
      · conformal-calibrate ETAs · backtest → reliability certificate
  → deterministic metric + ranking engine (retrieval → features → tuned weights → abstention)
  → guardrailed LLM adjudication / synthesis
  → output: recommendation + citations + calibrated ETA + tenant's own reliability numbers
  → outcome feedback loop (resolved tickets auto-update calibration)
```

### 5.1 Backtest harness (prerequisite for everything)

Time-travel evaluation over the tenant's resolved tickets: roll each ticket
back to filing state (no post-triage fields — leakage), predict with only
earlier history, score. Metrics: top-1/top-3 hit rate vs. final resolver;
interval coverage at 50/80/95%; log-MAE of the median; abstention rate.
Output is both the tuning ground and the user-facing certificate.

### 5.2 Labels and target

- Ground truth assignee = final resolver (person holding the ticket at the
  resolving transition), not first assignee.
- Duration target = `work_days` (tenant-defined via interview) in log-space.
  Never pool `cycle_days` and `work_days`.

### 5.3 Ranking

Keep BM25 retrieval as the citation engine (consider adding embeddings for
recall; keep BM25 hits as the cited evidence). Add features: tossing-graph
transition probabilities, ownership concentration from PR data, component
association, recency decay, live WIP, collaboration affinity. Replace
hand-tuned multiplicative constants with weights fit against the backtest
(logistic-regression / pairwise LTR scale — nothing deep). Add an abstention
threshold on score margin.

### 5.4 ETA

Analogue-set quantiles in log-space (optionally LightGBM-quantile with
features via a small Python sidecar), conformally calibrated per tenant.
Display as survival read-offs with sample sizes and a confidence tier; show
the calibration table on demand.

### 5.5 LLM role — adjudicator inside guardrails

Deterministic engine produces metrics **and** a default ranking. The LLM may
only reorder candidates whose score gap is below the backtest-measured noise
floor (statistical ties); must justify any deviation by pointing at a provided
metric; candidates, numbers, and citations are validated exactly as today;
identical queries are memoized so the same input always yields the same
verdict. The backtest measures whether LLM adjudication beats the raw ranking
— it earns its place with evidence or stays a prose layer.

### 5.6 Later / differentiating

Batch "plan my sprint" mode (Hungarian matching with capacity constraints);
socio-technical congruence signal; GNNs only at ~10× data.

---

## 6. Onboarding calibration interview

**Rule: manager feedback calibrates *interpretation and priors*, never
overrides *measured outcomes*.** For well-sampled segments the team's own
history beats the manager's gut (planning fallacy; reference-class
forecasting exists to override inside-view estimates). A model "aligned to
expectations" is the manager's intuition with a UI. A handful of judgments
cannot tune quantiles; it can set a few global knobs.

What the manager knows that the data cannot — every item is a fact or a
definition, not an opinion about a number:

1. **Which duration they mean.** Show 3 tickets with both numbers ("3 days
   active work / 41 days created→resolved"); their pick sets the target.
2. **Workflow semantics.** Bulk-close on release day (→ use PR merge time);
   which statuses count as started; "wait on customer" excluded.
3. **Roster reality.** Who left, who is on leave, contractors — concept drift
   the data shows only months later.
4. **Working calendar.** Week length, holidays, time zones → working days.
5. **Priors for thin segments only**, stored as Bayesian priors with an
   explicit equivalent sample size (e.g. "counts as 5 tickets"); data
   overrides as it accumulates.

Interview flow: duration definition → "here's how we'd have predicted your
last 10 tickets vs. what happened" (disagreement is a *diagnostic* of data
semantics, not a number to bend) → roster confirmation → calendar → sparse
priors. Answers are stored as a named, auditable **calibration profile**:
same data + same profile → same output; explanations cite it ("ETA in working
days of active work, per your calibration").

**Continuous loop beats onboarding:** outcomes accrue automatically
(predicted vs. actual on every resolved ticket); structured corrections on
recommendations ("Alice is on leave", "this is a Streams ticket") are facts
the engine applies. The reliability certificate updates itself.

---

## 7. Roadmap

1. Backtest harness (§5.1) — measure today's engine honestly.
2. Labels + target fixes (§5.2); log-space; similarity floor; sample-size
   tiers + abstention.
3. Conformal calibration of ETAs + survival-style display + calibration table.
4. Generalization sweep (§4 table).
5. Tossing-graph + ownership features; fit weights against backtest.
6. Calibration interview (§6) + calibration profile.
7. Guardrailed LLM adjudication, evaluated in the backtest.
8. Batch sprint assignment.

---

## 8. Key sources

ML triage: Anvik et al. 2006; DeepTriage (arXiv 1801.01275); transformer
comparison (arXiv 2310.06913); Mozilla BugBug (hacks.mozilla.org 2019);
Ericsson adoption study (arXiv 2209.08955); Microsoft "Not My Bug" (CSCW
2011); Light Bug Triage Framework (ACM 2022); online-learning drift (arXiv
2505.02437).
Duration: Weiss et al. 2007; interpretable resolution-time study (arXiv
2505.01108); analogy estimation 28-year retrospective (arXiv 2501.14582);
Angelopoulos & Bates conformal intro (arXiv 2107.07511); MAPIE; Vacanti
*Actionable Agile Metrics*; Flyvbjerg reference-class forecasting (arXiv
1302.3642).
Graph: Jeong/Kim/Zimmermann tossing graphs (FSE 2009); Bird et al. ownership
(FSE 2011); Fritz & Murphy DOK; CORAL (arXiv 2202.02385); Cataldo & Herbsleb
STC; WhoReview; CORRECT (arXiv 1807.02965).
Game theory / market: contract-net (Smith 1980); Goodhart/developer-metrics
backlash (2023); Atlassian Smarts; ActionableAgile; Focused Objective.
