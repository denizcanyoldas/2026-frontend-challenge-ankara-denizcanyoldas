import { EventItem, SourceKind } from "@/lib/types";
import {
  asRecord,
  extractEmail,
  extractPhone,
  normalizePersonKey,
  pickFirstStringDeep,
  stringifyLoose,
} from "@/lib/normalize/utils";

function parseCreatedAt(raw: Record<string, unknown>): string {
  const candidates: unknown[] = [
    raw.created_at,
    raw.createdAt,
    raw.updated_at,
    raw.updatedAt,
    raw.submitted_at,
    raw.submittedAt,
    raw["created at"],
    raw["createdAt"],
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number") return new Date(c * 1000).toISOString();
  }

  const maybe = pickFirstStringDeep(raw);
  if (maybe) {
    const d = new Date(maybe);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return new Date(0).toISOString();
}

function findAnswersContainer(raw: Record<string, unknown>): unknown {
  return (
    raw.answers ??
    raw.content ??
    raw.submission ??
    raw.data ??
    raw
  );
}

function derivePersonLabel(raw: Record<string, unknown>): string {
  const answers = findAnswersContainer(raw);
  const candidate =
    pickFirstStringDeep((asRecord(answers)?.name ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(answers)?.fullName ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(raw)?.name ?? null) as unknown) ??
    pickFirstStringDeep(answers);

  if (candidate) return candidate.slice(0, 120);
  return "Unknown";
}

function derivePersonKey(raw: Record<string, unknown>, label: string): string {
  if (label && label !== "Unknown") return normalizePersonKey(label);

  const text = stringifyLoose(raw);
  const email = extractEmail(text);
  if (email) return `email:${email}`;
  const phone = extractPhone(text);
  if (phone) return `phone:${normalizePersonKey(phone)}`;

  return "unknown";
}

function deriveLocation(raw: Record<string, unknown>): string | undefined {
  const answers = findAnswersContainer(raw);
  const loc =
    pickFirstStringDeep((asRecord(answers)?.location ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(answers)?.address ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(raw)?.location ?? null) as unknown);
  return loc ?? undefined;
}

function deriveSummary(source: SourceKind, raw: Record<string, unknown>): string {
  const answers = findAnswersContainer(raw);
  const short =
    pickFirstStringDeep((asRecord(answers)?.message ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(answers)?.note ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(answers)?.details ?? null) as unknown) ??
    pickFirstStringDeep((asRecord(answers)?.text ?? null) as unknown);

  if (short) return short.slice(0, 160);

  switch (source) {
    case "checkins":
      return "Check-in recorded";
    case "messages":
      return "Message recorded";
    case "sightings":
      return "Sighting recorded";
    case "personal_notes":
      return "Personal note recorded";
    case "anon_tips":
      return "Anonymous tip recorded";
  }
}

export function normalizeSubmissionToEvent(
  source: SourceKind,
  submission: unknown
): EventItem | null {
  const raw = asRecord(submission);
  if (!raw) return null;

  const id =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.submissionID === "string" && raw.submissionID) ||
    (typeof raw.submission_id === "string" && raw.submission_id) ||
    (typeof raw.sid === "string" && raw.sid) ||
    "";

  const createdAt = parseCreatedAt(raw);
  const personLabel = derivePersonLabel(raw);
  const personKey = derivePersonKey(raw, personLabel);
  const location = deriveLocation(raw);
  const summary = deriveSummary(source, raw);

  if (!id) {
    // Stable-ish fallback. Jotform submissions should normally have an id.
    const hashBase = `${source}:${createdAt}:${personKey}:${summary}`;
    return {
      id: hashBase,
      source,
      createdAt,
      personKey,
      personLabel,
      location,
      summary,
      raw: submission,
    };
  }

  return {
    id,
    source,
    createdAt,
    personKey,
    personLabel,
    location,
    summary,
    raw: submission,
  };
}

