import { EventItem, LatLng } from "@/lib/types";
import { normalizeName } from "@/lib/linking/dedupe";

// We identify the victim by the canonicalized label. The app already
// dedupes Kagan / Kağan / Kağan A. before suspects run, so "Podo" here
// covers every spelling variant of the dog's name.
const VICTIM_NAME = "Podo";
const VICTIM_NORM = normalizeName(VICTIM_NAME);

export type SuspectSignalKind =
  | "co_location"
  | "co_mention"
  | "anon_tip"
  | "last_seen";

export type SuspectSignal = {
  kind: SuspectSignalKind;
  label: string;
  detail: string;
  points: number;
  relatedEventIds: string[];
};

export type SuspectScore = {
  personKey: string;
  personLabel: string;
  totalScore: number;
  maxScore: number; // highest score in the pool; handy for bar widths
  signals: SuspectSignal[];
};

export type SuspectAnalysis = {
  victimKey: string | null;
  victimLabel: string;
  suspects: SuspectScore[];
  /** Sum of all points the algorithm distributed. */
  totalPoints: number;
};

// ------------------------------- helpers -------------------------------

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function extractSearchableText(e: EventItem): string {
  const parts: string[] = [];
  if (e.summary) parts.push(e.summary);
  if (e.location) parts.push(e.location);
  const raw = e.raw;
  if (raw && typeof raw === "object") {
    const answers = (raw as Record<string, unknown>).answers;
    if (answers && typeof answers === "object") {
      for (const v of Object.values(answers as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const a = v as { answer?: unknown };
        const ans = a.answer;
        if (typeof ans === "string") parts.push(ans);
        else if (ans && typeof ans === "object") {
          // Jotform fullname / address shapes etc.
          try {
            parts.push(JSON.stringify(ans));
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  return parts.join(" \n ");
}

function textMentions(normText: string, needleNorm: string): boolean {
  if (!needleNorm) return false;
  // Word-boundary-ish match: require non-letter before/after so "ali"
  // doesn't match inside "Valimiz". Normalized text is a-z0-9 + spaces.
  const idx = normText.indexOf(needleNorm);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : normText[idx - 1];
  const afterIdx = idx + needleNorm.length;
  const after = afterIdx >= normText.length ? " " : normText[afterIdx];
  const isBoundary = (c: string) => !/[a-z0-9]/.test(c);
  return isBoundary(before) && isBoundary(after);
}

// Pick the strongest identifying token for a person so "Kağan A." still
// matches anonymous tips that only say "Kagan". We drop single-letter
// initials and take the longest remaining token.
function identifyingToken(label: string): string {
  const norm = normalizeName(label);
  const tokens = norm.split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return norm;
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0];
}

// ------------------------------- main ----------------------------------

export function computeSuspectScores(events: EventItem[]): SuspectAnalysis {
  const victimEvents = events.filter(
    (e) => normalizeName(e.personLabel) === VICTIM_NORM
  );
  const victimKey = victimEvents[0]?.personKey ?? null;

  if (victimEvents.length === 0) {
    return {
      victimKey: null,
      victimLabel: VICTIM_NAME,
      suspects: [],
      totalPoints: 0,
    };
  }

  type Bucket = {
    key: string;
    label: string;
    token: string;
    events: EventItem[];
    signals: SuspectSignal[];
    total: number;
  };

  const byPerson = new Map<string, Bucket>();
  for (const e of events) {
    if (normalizeName(e.personLabel) === VICTIM_NORM) continue;
    if (!e.personLabel || e.personLabel === "Unknown") continue;
    const prev = byPerson.get(e.personKey);
    if (prev) prev.events.push(e);
    else
      byPerson.set(e.personKey, {
        key: e.personKey,
        label: e.personLabel,
        token: identifyingToken(e.personLabel),
        events: [e],
        signals: [],
        total: 0,
      });
  }

  // Pre-compute normalized text for every event — we scan each person's
  // needle across the full corpus.
  const corpus = events.map((ev) => ({
    ev,
    text: normalizeName(
      `${ev.personLabel} ${extractSearchableText(ev)}`
    ),
  }));

  // ---- Signal 1: co-location with Podo (±6h, within ~400m) ----
  const TIME_WINDOW_MS = 6 * 60 * 60 * 1000;
  const DIST_KM = 0.4;

  for (const bucket of byPerson.values()) {
    const matches: string[] = [];
    for (const pe of victimEvents) {
      if (!pe.coordinates) continue;
      const pt = parseTime(pe.createdAt);
      for (const se of bucket.events) {
        if (!se.coordinates) continue;
        const dt = Math.abs(parseTime(se.createdAt) - pt);
        if (dt > TIME_WINDOW_MS) continue;
        const dx = haversineKm(pe.coordinates, se.coordinates);
        if (dx > DIST_KM) continue;
        matches.push(se.id);
      }
    }
    if (matches.length > 0) {
      const unique = Array.from(new Set(matches));
      bucket.signals.push({
        kind: "co_location",
        label: `${unique.length} near-Podo event${unique.length === 1 ? "" : "s"}`,
        detail: `Within ~400 m and ±6 h of one of Podo's movements`,
        points: unique.length * 2,
        relatedEventIds: unique,
      });
    }
  }

  // ---- Signal 2: co-mention with Podo in any record ----
  // ---- Signal 3: named in anonymous tips ----
  for (const bucket of byPerson.values()) {
    const coMentions: string[] = [];
    const anonTips: string[] = [];

    if (!bucket.token) continue;

    for (const { ev, text } of corpus) {
      if (ev.personKey === bucket.key && ev.source !== "sightings") continue;
      const hasName = textMentions(text, bucket.token);
      if (!hasName) continue;
      const hasPodo = textMentions(text, VICTIM_NORM);
      if (hasPodo) {
        coMentions.push(ev.id);
      } else if (ev.source === "anon_tips") {
        anonTips.push(ev.id);
      }
    }

    if (coMentions.length > 0) {
      const unique = Array.from(new Set(coMentions));
      bucket.signals.push({
        kind: "co_mention",
        label: `Mentioned with Podo ×${unique.length}`,
        detail: `Appears in the same record as Podo (messages, sightings, notes…)`,
        points: unique.length * 3,
        relatedEventIds: unique,
      });
    }

    if (anonTips.length > 0) {
      const unique = Array.from(new Set(anonTips));
      bucket.signals.push({
        kind: "anon_tip",
        label: `Named in ${unique.length} anonymous tip${unique.length === 1 ? "" : "s"}`,
        detail: `Anonymous informants brought up this person`,
        points: unique.length * 3,
        relatedEventIds: unique,
      });
    }
  }

  // ---- Signal 4: nearest to Podo's last known location ----
  const lastPodo = victimEvents
    .slice()
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))[0];

  if (lastPodo?.coordinates) {
    const lastT = parseTime(lastPodo.createdAt);
    let best: {
      bucket: Bucket;
      eventId: string;
      score: number;
      hoursGap: number;
      kmGap: number;
    } | null = null;

    for (const bucket of byPerson.values()) {
      for (const se of bucket.events) {
        if (!se.coordinates) continue;
        const hoursGap = Math.abs(parseTime(se.createdAt) - lastT) / 3600000;
        if (hoursGap > 12) continue;
        const kmGap = haversineKm(se.coordinates, lastPodo.coordinates);
        if (kmGap > 1.5) continue;
        const score = 1 / (hoursGap + 0.5) + 1 / (kmGap + 0.1);
        if (!best || score > best.score) {
          best = {
            bucket,
            eventId: se.id,
            score,
            hoursGap,
            kmGap,
          };
        }
      }
    }

    if (best) {
      best.bucket.signals.push({
        kind: "last_seen",
        label: "Closest to Podo's last known location",
        detail: `${best.kmGap.toFixed(2)} km · ${best.hoursGap.toFixed(1)} h from the final Podo record`,
        points: 5,
        relatedEventIds: [best.eventId],
      });
    }
  }

  // Finalize totals + ranking
  const suspects: SuspectScore[] = [];
  let totalPoints = 0;
  for (const bucket of byPerson.values()) {
    const total = bucket.signals.reduce((s, x) => s + x.points, 0);
    if (total <= 0) continue;
    totalPoints += total;
    suspects.push({
      personKey: bucket.key,
      personLabel: bucket.label,
      totalScore: total,
      maxScore: 0, // filled in below
      signals: bucket.signals.sort((a, b) => b.points - a.points),
    });
  }

  suspects.sort((a, b) => b.totalScore - a.totalScore);
  const maxScore = suspects[0]?.totalScore ?? 0;
  for (const s of suspects) s.maxScore = maxScore;

  return {
    victimKey,
    victimLabel: VICTIM_NAME,
    suspects,
    totalPoints,
  };
}
