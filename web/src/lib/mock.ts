import type {
  PersonSummary,
  PersonDetailResponse,
  AskResponse,
  CycleTrendPoint,
  RecentTicket,
  Collaborator,
} from "./types";

// ─── People ───────────────────────────────────────────────────────────────────

export const PEOPLE: PersonSummary[] = [
  {
    id: "p1",
    name: "Amara Osei",
    ticketsResolved: 142,
    medianCycleDays: 3.5,
    activeWip: 2,
    topComponents: ["broker", "network", "clients"],
    typeMix: { Bug: 52, Feature: 61, Task: 29 },
  },
  {
    id: "p2",
    name: "Luca Ferretti",
    ticketsResolved: 98,
    medianCycleDays: 5.1,
    activeWip: 4,
    topComponents: ["streams", "consumer", "connect"],
    typeMix: { Bug: 30, Feature: 48, Task: 20 },
  },
  {
    id: "p3",
    name: "Yuki Tanaka",
    ticketsResolved: 211,
    medianCycleDays: 2.8,
    activeWip: 1,
    topComponents: ["broker", "producer", "group-coordinator"],
    typeMix: { Bug: 90, Feature: 78, Task: 43 },
  },
  {
    id: "p4",
    name: "Priya Nair",
    ticketsResolved: 77,
    medianCycleDays: 7.2,
    activeWip: 3,
    topComponents: ["security", "connect", "clients"],
    typeMix: { Bug: 22, Feature: 35, Task: 20 },
  },
  {
    id: "p5",
    name: "Marcus Holden",
    ticketsResolved: 155,
    medianCycleDays: 4.0,
    activeWip: 2,
    topComponents: ["storage", "broker", "network"],
    typeMix: { Bug: 55, Feature: 70, Task: 30 },
  },
  {
    id: "p6",
    name: "Fatima Al-Rashidi",
    ticketsResolved: 63,
    medianCycleDays: 9.4,
    activeWip: 5,
    topComponents: ["connect", "streams", "security"],
    typeMix: { Bug: 18, Feature: 28, Task: 17 },
  },
  {
    id: "p7",
    name: "Diego Vargas",
    ticketsResolved: 187,
    medianCycleDays: 3.1,
    activeWip: 2,
    topComponents: ["consumer", "group-coordinator", "broker"],
    typeMix: { Bug: 70, Feature: 82, Task: 35 },
  },
  {
    id: "p8",
    name: "Anika Patel",
    ticketsResolved: 44,
    medianCycleDays: 12.0,
    activeWip: 6,
    topComponents: ["streams", "clients", "producer"],
    typeMix: { Bug: 10, Feature: 20, Task: 14 },
  },
  {
    id: "p9",
    name: "Kofi Mensah",
    ticketsResolved: 129,
    medianCycleDays: 4.7,
    activeWip: 3,
    topComponents: ["network", "storage", "broker"],
    typeMix: { Bug: 45, Feature: 55, Task: 29 },
  },
  {
    id: "p10",
    name: "Sofia Lindqvist",
    ticketsResolved: 93,
    medianCycleDays: 5.8,
    activeWip: 1,
    topComponents: ["producer", "streams", "connect"],
    typeMix: { Bug: 28, Feature: 45, Task: 20 },
  },
  {
    id: "p11",
    name: "Tariq Mahmood",
    ticketsResolved: 168,
    medianCycleDays: 3.9,
    activeWip: 4,
    topComponents: ["security", "group-coordinator", "network"],
    typeMix: { Bug: 60, Feature: 72, Task: 36 },
  },
  {
    id: "p12",
    name: "Ingrid Björk",
    ticketsResolved: 56,
    medianCycleDays: 8.3,
    activeWip: 7,
    topComponents: ["clients", "consumer", "storage"],
    typeMix: { Bug: 15, Feature: 27, Task: 14 },
  },
];

const PEOPLE_MAP = new Map(PEOPLE.map((p) => [p.id, p]));

// ─── Trend helpers ────────────────────────────────────────────────────────────

function cycleTrend(base: number): CycleTrendPoint[] {
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  return months.map((month, i) => ({
    month,
    medianDays: parseFloat((base + Math.sin(i * 0.7) * 1.2 + (i * 0.05)).toFixed(1)),
  }));
}

// ─── Ticket helpers ───────────────────────────────────────────────────────────

const TICKET_TITLES: Record<string, string[]> = {
  broker: [
    "Leader election race condition under network partition",
    "Log segment compaction stalls under high throughput",
    "Partition reassignment blocks controller for 60s+",
    "Broker refuses connection after rolling restart",
  ],
  streams: [
    "Streams app accumulates heap when changelog topic lags",
    "Exactly-once semantics breaks after broker failover",
    "RocksDB checkpoint amplification on state store",
    "Rebalance timeout causes state loss on standbys",
  ],
  connect: [
    "Source connector drops messages when target unavailable",
    "JDBC sink fails on schema evolution with nullable columns",
    "Connector offsets reset after worker restart",
    "DLQ overflow under schema registry unavailability",
  ],
  clients: [
    "Consumer group hangs after metadata refresh",
    "Producer retries exhaust timeout on transient failure",
    "Client config reload breaks in-flight requests",
    "Fetch backoff not respected after 429 response",
  ],
  consumer: [
    "Poll loop starvation when commit latency spikes",
    "Auto-offset-reset ignores timestamp resolver",
    "Partition revocation callback deadlocks on close",
    "Consumer lag metric reports incorrect after rebalance",
  ],
  producer: [
    "Batch compression corrupts record ordering",
    "Idempotent producer duplicates on epoch rollover",
    "Max.block.ms exceeded even with available buffer",
    "Transaction timeout not propagated to brokers",
  ],
  network: [
    "SSL handshake timeout under mixed TLS versions",
    "SASL/GSSAPI token refresh fails silently",
    "Connection pool exhaustion under rapid topic creation",
    "Send buffer overflow causes silent message drop",
  ],
  storage: [
    "Index file corruption after unclean shutdown",
    "Log retention policy doesn't enforce size limit",
    "Tiered storage fsync delay increases p99 latency",
    "Segment file rotation races with consumer reads",
  ],
  security: [
    "ACL cache inconsistency after ZooKeeper session reset",
    "Delegation token not invalidated on principal deletion",
    "Audit log misses denials from inter-broker requests",
    "mTLS cert rotation causes brief authorization gap",
  ],
  "group-coordinator": [
    "Rebalance storm caused by transient heartbeat gaps",
    "Group metadata loss after coordinator failover",
    "Consumer JoinGroup timeout when group is large",
    "OffsetFetch returns stale offsets after election",
  ],
};

function randomTickets(components: string[], count: number, personId: string): RecentTicket[] {
  const types = ["Bug", "Feature", "Task"];
  const tickets: RecentTicket[] = [];
  const seed = personId.charCodeAt(1);
  for (let i = 0; i < count; i++) {
    const comp = components[i % components.length];
    const pool = TICKET_TITLES[comp] ?? TICKET_TITLES["broker"];
    const title = pool[(seed + i * 3) % pool.length];
    const num = 14000 + seed * 10 + i * 7;
    const cycleDays = Math.max(1, Math.round((seed % 5) + i * 1.3 + 1));
    const daysAgo = 10 + i * 8;
    const resolved = new Date(Date.now() - daysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10);
    tickets.push({
      key: `KAFKA-${num}`,
      title,
      type: types[(seed + i) % types.length],
      cycleDays,
      resolved,
    });
  }
  return tickets;
}

function collaborators(personId: string): Collaborator[] {
  const others = PEOPLE.filter((p) => p.id !== personId).slice(0, 4);
  return others.map((p, i) => ({
    id: p.id,
    name: p.name,
    sharedTickets: 8 + i * 4,
  }));
}

// ─── GET /api/team ────────────────────────────────────────────────────────────

export function getMockTeam() {
  return { people: PEOPLE };
}

// ─── GET /api/person/[id] ─────────────────────────────────────────────────────

export function getMockPerson(id: string): PersonDetailResponse | null {
  const person = PEOPLE_MAP.get(id);
  if (!person) return null;
  return {
    person,
    cycleTrend: cycleTrend(person.medianCycleDays),
    recentTickets: randomTickets(person.topComponents, 8, id),
    collaborators: collaborators(id),
  };
}

// ─── POST /api/ask ────────────────────────────────────────────────────────────

export function getMockAskResponse(): AskResponse {
  return {
    complexity: {
      label: "High",
      medianDays: 8,
      rangeDays: [5, 14],
      rationale:
        "Cross-cutting change touching broker replication path and consumer group coordinator. Past work of this kind (KAFKA-14402, KAFKA-13987) averaged 8 days. Requires coordination across two sub-systems and a protocol-level change.",
    },
    clarifyingQuestions: [
      "Should this be backwards-compatible with clients on Kafka 3.x, or can we target 4.0+ only?",
      "Is there an existing test harness for the replication path, or will we need to add integration tests?",
      "Does this require a KIP (Kafka Improvement Proposal) process before implementation?",
    ],
    candidates: [
      {
        personId: "p3",
        name: "Yuki Tanaka",
        matchScore: 91,
        eta: { lo: 5, hi: 10 },
        activeWip: 1,
        evidence: [
          {
            key: "KAFKA-14523",
            title: "Leader election race condition under network partition",
            cycleDays: 4,
            resolved: "2025-07-14",
          },
          {
            key: "KAFKA-14398",
            title: "Partition reassignment blocks controller for 60s+",
            cycleDays: 7,
            resolved: "2025-06-02",
          },
          {
            key: "KAFKA-14211",
            title: "Rebalance storm caused by transient heartbeat gaps",
            cycleDays: 6,
            resolved: "2025-04-21",
          },
        ],
        why: "Strongest match: 211 tickets resolved in broker + group-coordinator, median 2.8 days. Low WIP means immediate availability.",
      },
      {
        personId: "p1",
        name: "Amara Osei",
        matchScore: 74,
        eta: { lo: 7, hi: 13 },
        activeWip: 2,
        evidence: [
          {
            key: "KAFKA-14487",
            title: "Broker refuses connection after rolling restart",
            cycleDays: 5,
            resolved: "2025-07-20",
          },
          {
            key: "KAFKA-14301",
            title: "SSL handshake timeout under mixed TLS versions",
            cycleDays: 6,
            resolved: "2025-05-15",
          },
          {
            key: "KAFKA-14088",
            title: "Connection pool exhaustion under rapid topic creation",
            cycleDays: 9,
            resolved: "2025-03-10",
          },
        ],
        why: "Strong broker + network experience. Good cycle time. Two active tickets may push start by a few days.",
      },
      {
        personId: "p7",
        name: "Diego Vargas",
        matchScore: 68,
        eta: { lo: 8, hi: 16 },
        activeWip: 2,
        evidence: [
          {
            key: "KAFKA-14442",
            title: "Consumer lag metric reports incorrect after rebalance",
            cycleDays: 3,
            resolved: "2025-07-01",
          },
          {
            key: "KAFKA-14199",
            title: "Group metadata loss after coordinator failover",
            cycleDays: 8,
            resolved: "2025-04-05",
          },
          {
            key: "KAFKA-13980",
            title: "OffsetFetch returns stale offsets after election",
            cycleDays: 5,
            resolved: "2025-01-28",
          },
        ],
        why: "Deep group-coordinator ownership. Faster on simpler tasks; larger ETA range reflects less broker-layer exposure.",
      },
    ],
  };
}
