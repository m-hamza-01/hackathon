# TaskScope — Frontend Technical Specification

Technical spec only. No design direction — layout, color, typography, and visual treatment are the designer's call. This documents what exists, what each page must let the user view/do, and the data contracts the design must bind to.

## Product context (one paragraph)

TaskScope is a manager-side dashboard over a Jira project's history. It builds per-engineer profiles from resolved tickets and answers, for any new task a manager types in: how complex is it, how long will it take, and which engineers are the best-fit candidates — every claim backed by citations to real past tickets. Core positioning constraint: the product **recommends with evidence; the manager decides**. Nothing in the UI should read as an automated verdict, grade, or performance score.

## Stack / integration constraints

- Next.js 16, App Router, TypeScript, Tailwind (v4), `src/` layout. App lives in `web/`.
- Pages fetch from internal API routes (`/api/...`) — they never import data modules directly. A redesign must preserve this: restyle components, keep fetch logic and route handlers untouched.
- Route handlers live in `web/src/app/api/**` — off-limits to a design patch.
- No component libraries in the build today; charts are inline SVG. A redesign may introduce libraries only if it accepts owning the bundle/build impact.
- Data is real (Apache Kafka's Jira, ~2,000 tickets), names are pseudonymized. Numbers vary wildly (cycle times from hours to 100+ days) — views must tolerate outliers, long ticket titles, and engineers with sparse history.

## Routes and views

### 1. `/` — Team overview
Data: `GET /api/team` → `{ people: PersonSummary[], meta: TeamMeta }`

```ts
TeamMeta = {
  totalTickets: number              // resolved tickets in the dataset
  dateRange: [string, string]       // e.g. ["2013", "2026"] — first/last resolved year
}

PersonSummary = {
  id: number
  name: string                      // pseudonym
  ticketsResolved: number
  medianCycleDays: number           // one decimal is enough precision
  activeWip: number                 // open in-progress tickets right now (0–~8)
  topComponents: string[]           // up to 5, e.g. "streams", "broker"
  typeMix: Record<string, number>   // e.g. {"Bug": 34, "Improvement": 12, "New Feature": 5}
}
```

User needs to: scan the whole roster (~10–25 people); compare people at a glance on volume (ticketsResolved), speed (medianCycleDays), current load (activeWip), and specialty (topComponents, typeMix); navigate to any person's profile. Team-level aggregates (total tickets, people count, data date-range) are available and may be surfaced.

### 2. `/person/[id]` — Engineer profile
Data: `GET /api/person/[id]` →

```ts
{
  person: PersonSummary
  cycleTrend: { month: string, medianDays: number }[]   // chronological, months may be missing/sparse
  recentTickets: { key: string, title: string, type: string, cycleDays: number, resolved: string }[]
  collaborators: { id: number, name: string, sharedTickets: number }[]
}
```

User needs to: see one engineer's identity + summary stats; how their cycle time has trended over time; their recent resolved tickets (key, title, type, duration, date) — ticket keys should be recognizable as Jira keys; who they collaborate with most (comment overlap), with navigation to those people.

### 3. `/ask` — Assignment advisor (demo centerpiece)
Input: form with task `title` (single line) and `description` (multi-line). Submit → `POST /api/ask`.

Response:
```ts
{
  complexity: {
    label: 'Low' | 'Medium' | 'High' | 'Very High'
    medianDays: number
    rangeDays: [number, number]     // honest range, not a point estimate
    rationale: string               // 1–3 sentences grounded in similar past tickets
  }
  clarifyingQuestions: string[]     // 0–5 "what's underspecified before assigning this"
  candidates: {                     // pre-ranked by the engine, order is meaningful
    personId: number
    name: string
    matchScore: number              // 0–100
    eta: { lo: number, hi: number } // days, person-specific
    activeWip: number
    evidence: { key: string, title: string, cycleDays: number, resolved: string }[]  // 1–5 real tickets
    why: string                     // one sentence
  }[]
}
```

User needs to: enter a task; wait through a real ~1–3s latency (loading state required); then view — complexity with its range and rationale; the clarifying questions (this is a first-class result, not a footnote: it's what the manager asks *before* assigning); ranked candidates showing match strength, personal ETA, current load, the one-line why, and **per-candidate evidence tickets** (the citations are the product's credibility — they must be viewable for every candidate, expandable/collapsible is acceptable). Candidate order comes from the engine; the UI must not reorder. States required: idle (nothing asked yet), loading, results, error (engine unreachable).

## Functional invariants for any redesign

1. Every number shown to the user traces to the contract fields above — no invented metrics.
2. Evidence ticket keys visible per candidate; clarifying questions prominent.
3. Language of recommendation, not verdict ("strong match", not "best employee").
4. `/ask` handles: 0 candidates, 0 clarifying questions, sparse-history people (few evidence tickets).
5. Responsive enough for a projector demo at ~1280–1920px; mobile is out of scope.
