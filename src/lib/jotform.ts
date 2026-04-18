type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE = new Map<string, CacheEntry<unknown>>();

/**
 * Rate-limited keys are remembered for this many ms so we don't keep retrying them
 * on every request within the same process lifetime.
 */
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const RATE_LIMITED: Map<string, number> = new Map();

function nowMs() {
  return Date.now();
}

export type JotformFetchOptions = {
  /** Cache TTL in milliseconds. Set 0 to disable. */
  cacheTtlMs?: number;
  /** Max pages to fetch to prevent runaway pagination. */
  maxPages?: number;
  /** Page size; Jotform defaults may vary. */
  limit?: number;
};

export type JotformFetchError = Error & { status?: number };

function makeErr(status: number, msg: string): JotformFetchError {
  const e = new Error(msg) as JotformFetchError;
  e.status = status;
  return e;
}

function activeKeys(keys: string[]): string[] {
  const now = nowMs();
  return keys.filter((k) => {
    const until = RATE_LIMITED.get(k);
    return !until || until <= now;
  });
}

async function fetchWithKeyRotation(
  url: string,
  keys: string[]
): Promise<Response> {
  const candidates = activeKeys(keys);
  const tryOrder = candidates.length > 0 ? candidates : keys;

  let lastStatus = 0;
  let lastBody = "";

  for (const key of tryOrder) {
    const res = await fetch(url, {
      headers: { APIKEY: key },
      cache: "no-store",
    });

    if (res.status === 429) {
      RATE_LIMITED.set(key, nowMs() + RATE_LIMIT_COOLDOWN_MS);
      lastStatus = 429;
      lastBody = await res.text().catch(() => "");
      continue;
    }

    return res;
  }

  throw makeErr(
    lastStatus || 429,
    `All Jotform API keys rate-limited (${lastStatus} Too Many Requests): ${lastBody}`.slice(
      0,
      600
    )
  );
}

export async function fetchJotformJson<T>(
  url: string,
  keys: string[],
  opts?: { cacheKey?: string; cacheTtlMs?: number }
): Promise<T> {
  const cacheKey = opts?.cacheKey;
  const cacheTtlMs = opts?.cacheTtlMs ?? 0;

  if (cacheKey && cacheTtlMs > 0) {
    const hit = CACHE.get(cacheKey);
    if (hit && hit.expiresAt > nowMs()) return hit.value as T;
  }

  const res = await fetchWithKeyRotation(url, keys);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw makeErr(
      res.status,
      `Jotform fetch failed (${res.status} ${res.statusText}): ${text}`.slice(
        0,
        600
      )
    );
  }

  const json = (await res.json()) as T;

  if (cacheKey && cacheTtlMs > 0) {
    CACHE.set(cacheKey, { expiresAt: nowMs() + cacheTtlMs, value: json });
  }

  return json;
}

export type JotformSubmissionsResponse = {
  responseCode: number;
  message: string;
  content: Array<unknown>;
  limit?: number;
  offset?: number;
  [k: string]: unknown;
};

export async function fetchAllFormSubmissions(
  formId: string,
  keys: string[],
  options?: JotformFetchOptions
): Promise<unknown[]> {
  if (!keys || keys.length === 0) {
    throw makeErr(500, "No Jotform API keys configured");
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 200, 1000));
  const maxPages = Math.max(1, Math.min(options?.maxPages ?? 25, 200));
  const cacheTtlMs = options?.cacheTtlMs ?? 15_000;

  const all: unknown[] = [];
  let offset = 0;
  let pages = 0;

  while (pages < maxPages) {
    const url = `https://api.jotform.com/form/${encodeURIComponent(
      formId
    )}/submissions?limit=${limit}&offset=${offset}`;

    const page = await fetchJotformJson<JotformSubmissionsResponse>(
      url,
      keys,
      {
        cacheKey: `form:${formId}:submissions:${limit}:${offset}`,
        cacheTtlMs,
      }
    );

    const chunk = Array.isArray(page?.content) ? page.content : [];
    all.push(...chunk);

    if (chunk.length < limit) break;

    offset += limit;
    pages += 1;
  }

  return all;
}

export function parseApiKeysFromEnv(): string[] {
  const raw =
    process.env.JOTFORM_API_KEYS ?? process.env.JOTFORM_API_KEY ?? "";
  const list = raw
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(list));
}
