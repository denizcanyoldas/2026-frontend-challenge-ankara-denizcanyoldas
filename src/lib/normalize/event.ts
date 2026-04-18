import { EventItem, LatLng, SourceKind } from "@/lib/types";
import {
  asRecord,
  extractEmail,
  extractPhone,
  normalizePersonKey,
  pickFirstStringDeep,
  stringifyLoose,
} from "@/lib/normalize/utils";

type JotformAnswer = {
  name?: string;
  text?: string;
  type?: string;
  answer?: unknown;
};

const NAME_HINTS = [
  "fullname",
  "full_name",
  "name",
  "yourname",
  "personname",
  "contactname",
  "submittername",
];

const LOCATION_HINTS = [
  "location",
  "address",
  "place",
  "where",
  "city",
  "locationofsighting",
  "sightinglocation",
];

const MESSAGE_HINTS = [
  "message",
  "note",
  "notes",
  "details",
  "description",
  "tip",
  "comment",
  "comments",
  "text",
  "body",
];

const COORDINATE_HINTS = [
  "coordinates",
  "coords",
  "latlng",
  "latlong",
  "geolocation",
  "geo",
];

function hintMatches(hints: string[], key?: string): boolean {
  if (!key) return false;
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return hints.some((h) => k.includes(h));
}

export function stringifyAnswer(a: unknown): string | null {
  if (a == null) return null;
  if (typeof a === "string") return a.trim() || null;
  if (typeof a === "number" || typeof a === "boolean") return String(a);

  if (Array.isArray(a)) {
    const parts = a.map((x) => stringifyAnswer(x)).filter(Boolean) as string[];
    return parts.length ? parts.join(", ") : null;
  }

  if (typeof a === "object") {
    const obj = a as Record<string, unknown>;
    // Jotform "fullname" answer shape
    if (obj.first || obj.last) {
      const first = typeof obj.first === "string" ? obj.first : "";
      const last = typeof obj.last === "string" ? obj.last : "";
      const joined = `${first} ${last}`.trim();
      if (joined) return joined;
    }
    // Jotform "address" answer shape
    if (obj.addr_line1 || obj.city || obj.state || obj.country) {
      const parts = [
        obj.addr_line1,
        obj.addr_line2,
        obj.city,
        obj.state,
        obj.postal,
        obj.country,
      ]
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => (p as string).trim());
      if (parts.length) return parts.join(", ");
    }
    const deep = pickFirstStringDeep(a);
    return deep ?? null;
  }

  return null;
}

function getAnswers(raw: Record<string, unknown>): JotformAnswer[] {
  const answers = raw.answers;
  if (!answers || typeof answers !== "object") return [];
  return Object.values(answers as Record<string, unknown>)
    .filter((v): v is JotformAnswer => !!v && typeof v === "object");
}

function pickByHints(
  answers: JotformAnswer[],
  hints: string[]
): string | null {
  for (const ans of answers) {
    if (hintMatches(hints, ans.name) || hintMatches(hints, ans.text)) {
      const v = stringifyAnswer(ans.answer);
      if (v) return v;
    }
  }
  return null;
}

function parseCreatedAt(raw: Record<string, unknown>): string {
  const c =
    (typeof raw.created_at === "string" && raw.created_at) ||
    (typeof raw.updated_at === "string" && raw.updated_at) ||
    null;
  if (c) {
    // Jotform format: "YYYY-MM-DD HH:mm:ss" — convert to ISO-ish
    const asIso = c.replace(" ", "T");
    const d = new Date(asIso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return c;
  }
  return new Date(0).toISOString();
}

function derivePersonLabel(answers: JotformAnswer[]): string {
  const hit = pickByHints(answers, NAME_HINTS);
  if (hit) return hit.slice(0, 120);
  return "Unknown";
}

function derivePersonKey(
  raw: Record<string, unknown>,
  answers: JotformAnswer[],
  label: string
): string {
  if (label && label !== "Unknown") return normalizePersonKey(label);

  const text = stringifyLoose(raw);
  const email = extractEmail(text);
  if (email) return `email:${email}`;
  const phone = extractPhone(text);
  if (phone) return `phone:${normalizePersonKey(phone)}`;

  // Use any fallback answer text
  const any = answers.map((a) => stringifyAnswer(a.answer)).find(Boolean);
  if (any) return normalizePersonKey(any);

  return "unknown";
}

function deriveLocation(answers: JotformAnswer[]): string | undefined {
  const hit = pickByHints(answers, LOCATION_HINTS);
  return hit ? hit.slice(0, 160) : undefined;
}

function parseCoordinateString(s: string): LatLng | null {
  // Accepts "lat,lng" or "lat lng" (with optional spaces), e.g. "39.90584,32.86089"
  const m = s.match(
    /(-?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)/
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function deriveCoordinates(answers: JotformAnswer[]): LatLng | undefined {
  const raw = pickByHints(answers, COORDINATE_HINTS);
  if (raw) {
    const parsed = parseCoordinateString(raw);
    if (parsed) return parsed;
  }
  // Try any string-looking answer as a fallback (e.g. "lat: 39.9, lng: 32.8").
  for (const a of answers) {
    const s = stringifyAnswer(a.answer);
    if (!s) continue;
    const parsed = parseCoordinateString(s);
    if (parsed) return parsed;
  }
  return undefined;
}

function deriveSummary(
  source: SourceKind,
  answers: JotformAnswer[]
): string {
  const hit = pickByHints(answers, MESSAGE_HINTS);
  if (hit) return hit.slice(0, 200);

  // Fallback: take the first non-name, non-location answer
  for (const a of answers) {
    if (
      hintMatches(NAME_HINTS, a.name) ||
      hintMatches(NAME_HINTS, a.text) ||
      hintMatches(LOCATION_HINTS, a.name) ||
      hintMatches(LOCATION_HINTS, a.text)
    ) {
      continue;
    }
    const v = stringifyAnswer(a.answer);
    if (v) return v.slice(0, 200);
  }

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

  const answers = getAnswers(raw);

  const id =
    (typeof raw.id === "string" && raw.id) ||
    (typeof raw.submission_id === "string" && raw.submission_id) ||
    "";

  const createdAt = parseCreatedAt(raw);
  const personLabel = derivePersonLabel(answers);
  const personKey = derivePersonKey(raw, answers, personLabel);
  const location = deriveLocation(answers);
  const coordinates = deriveCoordinates(answers);
  const summary = deriveSummary(source, answers);

  const finalId =
    id || `${source}:${createdAt}:${personKey}:${summary.slice(0, 32)}`;

  return {
    id: finalId,
    source,
    createdAt,
    personKey,
    personLabel,
    location,
    coordinates,
    summary,
    raw: submission,
  };
}
