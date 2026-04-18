import { EventItem } from "@/lib/types";

// Explicit Turkish → ASCII mapping. We apply this before generic Unicode
// normalization because a few of these glyphs (ğ, ı, İ…) don't decompose
// cleanly via NFD on every platform, and we want "Kağan" ≡ "Kagan".
const TURKISH_MAP: Record<string, string> = {
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  İ: "i",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  ç: "c",
  Ç: "c",
};

export function normalizeName(input: string): string {
  if (!input) return "";
  let out = input;
  out = out.replace(/[şŞğĞıİüÜöÖçÇ]/g, (c) => TURKISH_MAP[c] ?? c);
  out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  out = out.toLowerCase();
  out = out.replace(/[^a-z0-9\s]/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export function tokenizeName(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Do two tokens plausibly refer to the same word?
function tokensMatch(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if (t1.length < 2 || t2.length < 2) return false;
  const max = Math.max(t1.length, t2.length);
  const dist = levenshtein(t1, t2);
  if (max <= 8) return dist <= 1;
  return dist <= 2;
}

// Decide whether two normalized person labels refer to the same person.
// We prefer a "shared meaningful token" rule so that "kagan" and
// "kagan a" merge, and "kagan" and "kağan" (→ "kagan") are identical.
export function shouldMergeNames(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const aTokens = tokenizeName(a);
  const bTokens = tokenizeName(b);
  const aLong = aTokens.filter((t) => t.length >= 3);
  const bLong = bTokens.filter((t) => t.length >= 3);

  if (aLong.length && bLong.length) {
    for (const x of aLong) {
      for (const y of bLong) {
        if (tokensMatch(x, y)) return true;
      }
    }
  }

  // Fallback: very similar full strings (catches single-token typos).
  return similarity(a, b) >= 0.9;
}

type PersonBucket = {
  key: string;
  label: string;
  count: number;
};

type Cluster = {
  canonicalKey: string;
  canonicalLabel: string;
  members: PersonBucket[];
  weight: number;
};

export type PersonCanonicalization = {
  keyRemap: Map<string, string>;
  labelRemap: Map<string, string>;
  clusters: Array<{
    canonicalKey: string;
    canonicalLabel: string;
    memberLabels: string[];
    weight: number;
  }>;
};

// Build a map from raw personKey → canonical personKey by clustering
// similar names together. Heavier (more-events) people become anchors.
export function buildPersonCanonicalization(
  events: EventItem[]
): PersonCanonicalization {
  const byKey = new Map<string, PersonBucket>();
  for (const e of events) {
    const k = e.personKey || "unknown";
    const prev = byKey.get(k);
    if (prev) {
      prev.count += 1;
      const candidate = e.personLabel;
      if (
        candidate &&
        candidate !== "Unknown" &&
        (prev.label === "Unknown" || prev.label.length < candidate.length)
      ) {
        prev.label = candidate;
      }
    } else {
      byKey.set(k, {
        key: k,
        label: e.personLabel || "Unknown",
        count: 1,
      });
    }
  }

  const people = Array.from(byKey.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.label?.length ?? 0) - (a.label?.length ?? 0);
  });

  const clusters: Cluster[] = [];

  for (const p of people) {
    const normLabel = normalizeName(p.label);
    if (!normLabel) {
      clusters.push({
        canonicalKey: p.key,
        canonicalLabel: p.label,
        members: [p],
        weight: p.count,
      });
      continue;
    }

    let target: Cluster | null = null;
    for (const c of clusters) {
      const normCanon = normalizeName(c.canonicalLabel);
      if (shouldMergeNames(normLabel, normCanon)) {
        target = c;
        break;
      }
    }

    if (target) {
      target.members.push(p);
      target.weight += p.count;
      // Keep the most informative label: prefer more tokens, then longer text.
      const currTokens = tokenizeName(
        normalizeName(target.canonicalLabel)
      ).length;
      const newTokens = tokenizeName(normLabel).length;
      if (
        newTokens > currTokens ||
        (newTokens === currTokens &&
          p.label.length > target.canonicalLabel.length)
      ) {
        target.canonicalLabel = p.label;
      }
    } else {
      clusters.push({
        canonicalKey: p.key,
        canonicalLabel: p.label,
        members: [p],
        weight: p.count,
      });
    }
  }

  const keyRemap = new Map<string, string>();
  const labelRemap = new Map<string, string>();
  const publicClusters: PersonCanonicalization["clusters"] = [];

  for (const c of clusters) {
    const canonKey = normalizeName(c.canonicalLabel) || c.canonicalKey;
    labelRemap.set(canonKey, c.canonicalLabel);
    for (const m of c.members) {
      keyRemap.set(m.key, canonKey);
    }
    publicClusters.push({
      canonicalKey: canonKey,
      canonicalLabel: c.canonicalLabel,
      memberLabels: c.members.map((m) => m.label),
      weight: c.weight,
    });
  }

  return { keyRemap, labelRemap, clusters: publicClusters };
}

export function applyPersonCanonicalization(
  events: EventItem[],
  dedupe: PersonCanonicalization
): EventItem[] {
  if (dedupe.keyRemap.size === 0) return events;
  return events.map((e) => {
    const canonKey = dedupe.keyRemap.get(e.personKey) ?? e.personKey;
    const canonLabel = dedupe.labelRemap.get(canonKey) ?? e.personLabel;
    if (canonKey === e.personKey && canonLabel === e.personLabel) return e;
    return { ...e, personKey: canonKey, personLabel: canonLabel };
  });
}
