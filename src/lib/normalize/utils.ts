const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

export function pickFirstStringDeep(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (!v || typeof v !== "object") return null;

  if (Array.isArray(v)) {
    for (const item of v) {
      const hit = pickFirstStringDeep(item);
      if (hit) return hit;
    }
    return null;
  }

  for (const key of Object.keys(v as Record<string, unknown>)) {
    const hit = pickFirstStringDeep((v as Record<string, unknown>)[key]);
    if (hit) return hit;
  }
  return null;
}

export function normalizePersonKey(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m?.[0]?.toLowerCase() ?? null;
}

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  return m?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

export function stringifyLoose(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

