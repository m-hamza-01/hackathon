// ─── Shared meta from the dataset ────────────────────────────────────────────

export interface TeamMeta {
  totalTickets: number;
  dateRange: [string, string]; // year strings e.g. ["2021", "2024"]
}

// ─── Core person shape ────────────────────────────────────────────────────────

export interface PersonSummary {
  id: number;
  name: string;
  ticketsResolved: number;
  medianCycleDays: number;
  activeWip: number;
  topComponents: string[];
  typeMix: Record<string, number>; // type label → count
}

// ─── GET /api/team ────────────────────────────────────────────────────────────

export interface TeamResponse {
  people: PersonSummary[];
  meta: TeamMeta;
}

// ─── GET /api/person/[id] ─────────────────────────────────────────────────────

export interface CycleTrendPoint {
  month: string; // "YYYY-MM" format for proper chart labels
  medianDays: number;
}

export interface RecentTicket {
  key: string;
  title: string;
  type: string;
  cycleDays: number;
  resolved: string; // human-readable date e.g. "12 Mar 2024"
}

export interface Collaborator {
  id: number;
  name: string;
  sharedTickets: number;
}

export interface PersonDetailResponse {
  person: PersonSummary;
  cycleTrend: CycleTrendPoint[];
  recentTickets: RecentTicket[];
  collaborators: Collaborator[];
}

// ─── POST /api/ask ────────────────────────────────────────────────────────────

export interface AskRequest {
  title: string;
  description: string;
}

export type ComplexityLabel = "Low" | "Medium" | "High" | "Very High";

export interface Complexity {
  label: ComplexityLabel;
  medianDays: number;
  rangeDays: [number, number];
  rationale: string;
}

export interface EvidenceTicket {
  key: string;
  title: string;
  cycleDays: number;
  resolved: string;
}

export interface Candidate {
  personId: number;
  name: string;
  matchScore: number; // 0–100
  eta: { lo: number; hi: number }; // days
  activeWip: number;
  evidence: EvidenceTicket[];
  why: string;
}

export interface AskResponse {
  complexity: Complexity;
  clarifyingQuestions: string[];
  candidates: Candidate[];
}
