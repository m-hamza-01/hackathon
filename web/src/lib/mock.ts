import type {
  PersonSummary,
  PersonDetailResponse,
  AskResponse,
  TeamMeta,
} from "./types";

// ─── People — from approved design export ─────────────────────────────────────

export const PEOPLE: PersonSummary[] = [
  { id:1,  name:"A. Varin",       ticketsResolved:214, medianCycleDays:3.2,  activeWip:2, topComponents:["streams","core","clients"],          typeMix:{Bug:118,Improvement:71,"New Feature":17,Task:8}},
  { id:2,  name:"M. Okonkwo",     ticketsResolved:186, medianCycleDays:6.8,  activeWip:5, topComponents:["broker","kraft","core"],              typeMix:{Bug:74,Improvement:69,"New Feature":31,Task:12}},
  { id:3,  name:"J. Lindqvist",   ticketsResolved:171, medianCycleDays:2.1,  activeWip:1, topComponents:["connect","clients"],                  typeMix:{Bug:102,Improvement:52,"New Feature":9,Task:8}},
  { id:4,  name:"R. Devarakonda", ticketsResolved:148, medianCycleDays:11.4, activeWip:6, topComponents:["streams","state-store","core"],        typeMix:{Improvement:66,Bug:44,"New Feature":30,Task:8}},
  { id:5,  name:"T. Marchetti",   ticketsResolved:133, medianCycleDays:4.5,  activeWip:3, topComponents:["security","admin","broker"],           typeMix:{Bug:61,Improvement:48,"New Feature":16,Task:8}},
  { id:6,  name:"S. Haruki",      ticketsResolved:119, medianCycleDays:1.4,  activeWip:0, topComponents:["docs","clients","tools"],              typeMix:{Task:52,Bug:41,Improvement:22,"New Feature":4}},
  { id:7,  name:"D. Fereira",     ticketsResolved:97,  medianCycleDays:18.6, activeWip:4, topComponents:["kraft","broker","replication"],        typeMix:{"New Feature":38,Improvement:34,Bug:21,Task:4}},
  { id:8,  name:"N. Abbasi",      ticketsResolved:88,  medianCycleDays:5.9,  activeWip:2, topComponents:["consumer","clients","core"],           typeMix:{Bug:47,Improvement:29,"New Feature":8,Task:4}},
  { id:9,  name:"K. Osei",        ticketsResolved:74,  medianCycleDays:9.1,  activeWip:7, topComponents:["connect","transforms"],               typeMix:{Improvement:33,Bug:28,"New Feature":9,Task:4}},
  { id:10, name:"P. Ivanković",   ticketsResolved:61,  medianCycleDays:3.7,  activeWip:1, topComponents:["producer","clients"],                 typeMix:{Bug:38,Improvement:17,"New Feature":4,Task:2}},
  { id:11, name:"L. Nyström",     ticketsResolved:44,  medianCycleDays:27.3, activeWip:3, topComponents:["streams","core"],                     typeMix:{"New Feature":19,Improvement:15,Bug:9,Task:1}},
  { id:12, name:"H. Salazar",     ticketsResolved:31,  medianCycleDays:2.8,  activeWip:0, topComponents:["tools","docs"],                       typeMix:{Task:16,Bug:11,Improvement:4}},
  { id:13, name:"B. Achterberg",  ticketsResolved:12,  medianCycleDays:14.0, activeWip:1, topComponents:["security"],                           typeMix:{Bug:7,Improvement:4,"New Feature":1}},
  { id:14, name:"Y. Takahara",    ticketsResolved:8,   medianCycleDays:41.5, activeWip:2, topComponents:["kraft"],                              typeMix:{"New Feature":5,Improvement:3}},
];

const PEOPLE_MAP = new Map(PEOPLE.map((p) => [p.id, p]));

// ─── Team meta ────────────────────────────────────────────────────────────────

export const TEAM_META: TeamMeta = {
  totalTickets: PEOPLE.reduce((s, p) => s + p.ticketsResolved, 0),
  dateRange: ["2021", "2024"],
};

// ─── Cycle trends (YYYY-MM format, sparse months allowed) ─────────────────────

const TRENDS: Record<number, [string, number][]> = {
  1: [
    ["2023-01",4.1],["2023-02",3.6],["2023-03",5.2],["2023-05",2.9],
    ["2023-06",3.4],["2023-07",2.2],["2023-09",4.8],["2023-10",3.1],
    ["2023-11",2.6],["2024-01",3.9],["2024-02",2.4],["2024-03",3.0],
  ],
  4: [
    ["2023-02",14.2],["2023-03",9.8],["2023-04",22.6],["2023-06",11.1],
    ["2023-08",7.4], ["2023-09",16.3],["2023-11",10.2],["2023-12",12.8],
    ["2024-02",8.6], ["2024-03",11.4],
  ],
  2: [
    ["2022-09",5.1],["2022-10",8.3],["2022-11",6.7],["2023-01",9.2],
    ["2023-02",5.8],["2023-04",7.4],["2023-06",6.1],["2023-08",8.9],
    ["2023-10",5.3],["2024-01",6.8],["2024-02",7.2],["2024-03",5.5],
  ],
  3: [
    ["2022-11",1.8],["2023-01",2.4],["2023-02",1.9],["2023-04",3.1],
    ["2023-06",2.0],["2023-07",1.6],["2023-09",2.7],["2023-11",1.8],
    ["2024-01",2.2],["2024-02",1.9],["2024-03",2.1],
  ],
  7: [
    ["2022-08",21.3],["2022-11",15.7],["2023-02",32.4],["2023-05",18.6],
    ["2023-08",22.1],["2023-10",14.3],["2024-01",18.6],["2024-03",20.2],
  ],
};

function trendFor(id: number): [string, number][] {
  return TRENDS[id] ?? TRENDS[1];
}

// ─── Recent tickets ───────────────────────────────────────────────────────────

const TICKETS: Record<number, Array<{ key: string; title: string; type: string; cycleDays: number; resolved: string }>> = {
  1: [
    { key:"KAFKA-15841", title:"Streams state store restore does not resume from the correct checkpoint after an unclean shutdown during a standby task reassignment", type:"Bug",         cycleDays:6.5,  resolved:"12 Mar 2024" },
    { key:"KAFKA-15790", title:"Reduce allocation in RecordAccumulator ready() hot path",                                                                              type:"Improvement",cycleDays:2.0,  resolved:"04 Mar 2024" },
    { key:"KAFKA-15702", title:"Consumer rebalance stalls when group coordinator moves mid-assignment",                                                                 type:"Bug",         cycleDays:118.0,resolved:"21 Feb 2024" },
    { key:"KAFKA-15644", title:"Add metric for suppression buffer size",                                                                                               type:"New Feature", cycleDays:3.5,  resolved:"09 Feb 2024" },
    { key:"KAFKA-15611", title:"Flaky test: StreamThreadTest#shouldNotCloseTaskOnCommitFailure",                                                                       type:"Bug",         cycleDays:0.4,  resolved:"31 Jan 2024" },
    { key:"KAFKA-15588", title:"Document the interaction between exactly-once v2 and static membership",                                                               type:"Task",        cycleDays:5.1,  resolved:"22 Jan 2024" },
  ],
  2: [
    { key:"KAFKA-15702", title:"Consumer rebalance stalls when group coordinator moves mid-assignment",          type:"Bug",         cycleDays:118.0, resolved:"21 Feb 2024" },
    { key:"KAFKA-15318", title:"Rebalance timeout not honoured when a member leaves during the prepare phase",   type:"Bug",         cycleDays:12.5,  resolved:"02 Nov 2023" },
    { key:"KAFKA-14992", title:"Group coordinator loads offsets twice after partition reassignment",              type:"Bug",         cycleDays:9.0,   resolved:"18 Aug 2023" },
    { key:"KAFKA-14760", title:"Reduce lock contention in GroupMetadataManager",                                 type:"Improvement", cycleDays:5.5,   resolved:"27 Jun 2023" },
    { key:"KAFKA-14502", title:"KRaft controller heartbeat timeout triggers unnecessary leader election",         type:"Bug",         cycleDays:22.0,  resolved:"14 Apr 2023" },
    { key:"KAFKA-14204", title:"Partition reassignment hangs when target broker is under GC pressure",           type:"Bug",         cycleDays:8.0,   resolved:"05 Feb 2023" },
  ],
  4: [
    { key:"KAFKA-14203", title:"Coordinator state machine transitions are not idempotent during controlled shutdown", type:"Improvement", cycleDays:34.0, resolved:"23 Feb 2023" },
    { key:"KAFKA-13998", title:"Assignment protocol version negotiation fails for mixed-version groups",               type:"Bug",         cycleDays:21.5, resolved:"06 Dec 2022" },
    { key:"KAFKA-15101", title:"RocksDB compaction stalls streams processing for up to 40s under write load",         type:"Bug",         cycleDays:28.3, resolved:"14 Sep 2023" },
    { key:"KAFKA-15049", title:"State store migration fails silently when changelog topic is ahead by >1000 offsets",  type:"Bug",         cycleDays:11.2, resolved:"28 Aug 2023" },
    { key:"KAFKA-14688", title:"Expose per-store cache hit/miss ratio metrics in Streams",                             type:"New Feature", cycleDays:7.8,  resolved:"19 May 2023" },
    { key:"KAFKA-14411", title:"Standby task fails to catch up when source partition count changes",                   type:"Bug",         cycleDays:18.6, resolved:"16 Mar 2023" },
  ],
};

function ticketsFor(id: number): typeof TICKETS[1] {
  return TICKETS[id] ?? TICKETS[1];
}

// ─── Collaborators ────────────────────────────────────────────────────────────

const COLLABS: Record<number, Array<{ id: number; name: string; sharedTickets: number }>> = {
  1: [{ id:3,name:"J. Lindqvist",sharedTickets:41 },{ id:4,name:"R. Devarakonda",sharedTickets:33 },{ id:2,name:"M. Okonkwo",sharedTickets:19 },{ id:8,name:"N. Abbasi",sharedTickets:12 }],
  2: [{ id:1,name:"A. Varin",sharedTickets:19 },{ id:4,name:"R. Devarakonda",sharedTickets:27 },{ id:7,name:"D. Fereira",sharedTickets:14 },{ id:5,name:"T. Marchetti",sharedTickets:9 }],
  3: [{ id:1,name:"A. Varin",sharedTickets:41 },{ id:8,name:"N. Abbasi",sharedTickets:22 },{ id:6,name:"S. Haruki",sharedTickets:15 },{ id:10,name:"P. Ivanković",sharedTickets:8 }],
  4: [{ id:2,name:"M. Okonkwo",sharedTickets:27 },{ id:1,name:"A. Varin",sharedTickets:33 },{ id:7,name:"D. Fereira",sharedTickets:11 },{ id:11,name:"L. Nyström",sharedTickets:6 }],
};

function collabsFor(id: number): typeof COLLABS[1] {
  return COLLABS[id] ?? COLLABS[1];
}

// ─── GET /api/team ────────────────────────────────────────────────────────────

export function getMockTeam() {
  return { people: PEOPLE, meta: TEAM_META };
}

// ─── GET /api/person/[id] ─────────────────────────────────────────────────────

export function getMockPerson(id: number): PersonDetailResponse | null {
  const person = PEOPLE_MAP.get(id);
  if (!person) return null;

  const raw = trendFor(id);
  const cycleTrend = raw.map(([month, medianDays]) => ({ month, medianDays }));

  const recentTickets = ticketsFor(id).map((t) => ({
    key:      t.key,
    title:    t.title,
    type:     t.type,
    cycleDays: t.cycleDays,
    resolved: t.resolved,
  }));

  const collaborators = collabsFor(id).map((c) => ({
    id:           c.id,
    name:         c.name,
    sharedTickets: c.sharedTickets,
  }));

  return { person, cycleTrend, recentTickets, collaborators };
}

// ─── POST /api/ask ────────────────────────────────────────────────────────────

export function getMockAskResponse(): AskResponse {
  return {
    complexity: {
      label: "High",
      medianDays: 14,
      rangeDays: [6, 34],
      rationale:
        "Twelve past tickets touching the group coordinator rebalance path resolved in 6 to 34 days, with a median of 14. The wide range is driven by reproduction difficulty: tickets that arrived with a reliable repro closed in under a week; those that did not took a month or more.",
    },
    clarifyingQuestions: [
      "Is there a reliable reproduction, or does this need to be reproduced first? This is the single biggest driver of the range above.",
      "Which broker version did the affected clusters upgrade from — 3.5 or 3.6? Two similar past regressions turned out to be version-specific.",
      "Is a revert acceptable if the root cause is not found within the sprint?",
    ],
    candidates: [
      {
        personId: 2,
        name: "M. Okonkwo",
        matchScore: 87,
        eta: { lo: 8, hi: 19 },
        activeWip: 5,
        why: "Has resolved the two most recent regressions in the group coordinator rebalance path, both involving coordinator failover during assignment.",
        evidence: [
          { key:"KAFKA-15702", title:"Consumer rebalance stalls when group coordinator moves mid-assignment",     cycleDays:118.0, resolved:"21 Feb 2024" },
          { key:"KAFKA-15318", title:"Rebalance timeout not honoured when a member leaves during the prepare phase", cycleDays:12.5, resolved:"02 Nov 2023" },
          { key:"KAFKA-14992", title:"Group coordinator loads offsets twice after partition reassignment",          cycleDays:9.0,  resolved:"18 Aug 2023" },
          { key:"KAFKA-14760", title:"Reduce lock contention in GroupMetadataManager",                             cycleDays:5.5,  resolved:"27 Jun 2023" },
        ],
      },
      {
        personId: 8,
        name: "N. Abbasi",
        matchScore: 71,
        eta: { lo: 11, hi: 26 },
        activeWip: 2,
        why: "Consistent work on the consumer client side of rebalancing; lighter current load than the closest match.",
        evidence: [
          { key:"KAFKA-15455", title:"Consumer does not rejoin after a coordinator disconnect under cooperative assignment", cycleDays:16.0, resolved:"19 Dec 2023" },
          { key:"KAFKA-15102", title:"Heartbeat thread leaks when the consumer is closed during a rebalance",               cycleDays:4.0,  resolved:"11 Sep 2023" },
          { key:"KAFKA-14871", title:"Improve logging around cooperative assignment transitions",                            cycleDays:2.5,  resolved:"14 Jul 2023" },
        ],
      },
      {
        personId: 4,
        name: "R. Devarakonda",
        matchScore: 58,
        eta: { lo: 14, hi: 41 },
        activeWip: 6,
        why: "Deep coordinator internals knowledge from the KRaft migration work, but the closest matching tickets are older and the current load is the heaviest on the team.",
        evidence: [
          { key:"KAFKA-14203", title:"Coordinator state machine transitions are not idempotent during controlled shutdown", cycleDays:34.0, resolved:"23 Feb 2023" },
          { key:"KAFKA-13998", title:"Assignment protocol version negotiation fails for mixed-version groups",               cycleDays:21.5, resolved:"06 Dec 2022" },
        ],
      },
      {
        personId: 13,
        name: "B. Achterberg",
        matchScore: 34,
        eta: { lo: 18, hi: 60 },
        activeWip: 1,
        why: "One adjacent ticket only — listed for completeness, and a plausible pairing partner rather than a solo owner.",
        evidence: [
          { key:"KAFKA-15009", title:"Rebalance listener callback ordering is undefined on close", cycleDays:27.0, resolved:"30 Aug 2023" },
        ],
      },
    ],
  };
}
