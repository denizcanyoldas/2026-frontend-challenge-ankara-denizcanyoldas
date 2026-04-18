export type SourceKind =
  | "checkins"
  | "messages"
  | "sightings"
  | "personal_notes"
  | "anon_tips";

export type EventItem = {
  id: string;
  source: SourceKind;
  createdAt: string;
  personKey: string;
  personLabel: string;
  location?: string;
  summary: string;
  raw: unknown;
};

export type PersonGroup = {
  key: string;
  label: string;
  count: number;
  lastSeenAt?: string;
  sources: Record<SourceKind, number>;
};

