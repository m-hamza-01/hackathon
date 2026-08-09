# GitHub PR Integration — Product Proposal

> Status: proposal only. The loader (`src/github/load-prs.ts`) stores the data;
> product wiring described here has NOT been implemented. The supervisor decides timing.

---

## What data is now available

After `npm run github:fetch && npm run github:load`, the SQLite DB gains two tables:

| Table | Key columns |
|---|---|
| `prs` | `id`, `number`, `title`, `author_login`, `created`, `merged`, `state`, `additions`, `deletions`, `changed_files`, `review_count`, `comment_count` |
| `pr_tickets` | `pr_id`, `ticket_key` (many-to-many join) |

Join path for product use: `tickets.key → pr_tickets.ticket_key → prs.*`  
For per-person aggregates: `tickets.assignee_id → people → tickets.key → pr_tickets → prs`.  
**Never** surface `prs.author_login` next to a pseudonym — see Risks below.

---

## 1. Engineer profiles (`/api/person`)

Add a `prMetrics` block to the existing person response:

```json
{
  "person": { "id": 12, "display_name": "..." },
  "prMetrics": {
    "merged_pr_count": 47,
    "median_lines_changed": 312,
    "median_files_changed": 4.0,
    "median_days_to_merge": 6.2,
    "median_review_count": 3
  }
}
```

Computed by aggregating over all merged PRs whose `ticket_key` maps to a ticket
assigned to this person. These numbers complement the existing cycle-days and
reopen-count metrics already on the profile.

**SQL sketch:**

```sql
SELECT
  AVG(pr.additions + pr.deletions) AS avg_lines,   -- use median in app layer
  COUNT(DISTINCT pr.id)            AS merged_count
FROM tickets t
JOIN pr_tickets pt ON pt.ticket_key = t.key
JOIN prs pr        ON pr.id = pt.pr_id
WHERE t.assignee_id = :person_id
  AND pr.state = 'MERGED';
```

---

## 2. `/ask` engine signals

The engine currently ranks tickets by BM25 text relevance + recency. Two PR-derived
signals could improve recommendation quality without changing the ranking contract:

**Complexity corroboration** — `median_lines_changed` for the person's past PRs
corroborates whether a candidate ticket is in their scale range. A ticket with
historically large PRs matched to an engineer whose median is small is a potential
mis-assignment worth flagging.

**Collaboration signal** — `median_review_count` and `comment_count` measure how
much review activity a person's work attracts. High-review engineers are good
candidates for complex or cross-cutting tickets; low-review tickets might suit
junior engineers who need faster feedback loops.

These would be injected into the synthesizer context as `prContext` alongside the
existing ticket rows, not used to rerank directly. The LLM can weigh them naturally
in the explanation it generates.

---

## 3. UI: evidence citations

On the ticket card and the person profile panel:

- Show a "PRs" badge count below the ticket title: `#PR 14521 · #PR 14888 · +2 more`
- Each PR number links to `https://github.com/apache/kafka/pull/<number>`
- On the person profile: add a "Code activity" section showing the three metrics
  above with a small bar indicating scale relative to team median

The citation format (PR number, not description) is intentional: it points the user
to the GitHub UI for diff context rather than duplicating it.

---

## 4. Risks and mitigations

**Pseudonymization leakage via author_login.**  
`prs.author_login` is a real GitHub username. `people.display_name` is a pseudonym.
These must never appear side-by-side in any response. The join for per-person metrics
must go through `tickets.assignee_id → people`, never `prs.author_login → people`.
The reporter is responsible for enforcing this in every SQL query and API response.

**Tickets with many PRs (multi-PR noise).**  
A long-running ticket may accumulate dozens of PRs (fixes, reverts, follow-ups). Per-ticket
PR stats should use the merged PR with the latest `merged` date as the canonical one,
or show aggregate totals explicitly. Avoid averaging across all PRs if some are reverts.

**Unmerged and reverted PRs.**  
A PR with `state = 'CLOSED'` (not merged) or one that was merged then reverted contributes
lines that never shipped. Filter on `state = 'MERGED'` for all quality metrics.
Reverted PRs are harder to detect without fetching revert commit messages — leave for a
future pass if needed.

**Coverage ceiling.**  
~40–60% of resolved tickets are expected to have a linked merged PR (based on Kafka
community patterns: maintainers often push directly to branches for small fixes). Metrics
computed for uncovered tickets will be null/N/A. The product must display null gracefully
and not penalize engineers for tickets with no PR evidence.

**Rate budget for refresh.**  
A full refresh (81 pages × 1 GraphQL request) costs 81 of 5,000 GraphQL requests/hour —
entirely safe. Weekly re-runs via cron are feasible. The fetch script is resumable, so
interrupted runs pick up from the last saved page.
