type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const CACHE = new Map<string, CacheEntry<unknown>>();

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

export async function fetchJotformJson<T>(
  url: string,
  apiKey: string,
  opts?: { cacheKey?: string; cacheTtlMs?: number }
): Promise<T> {
  const cacheKey = opts?.cacheKey;
  const cacheTtlMs = opts?.cacheTtlMs ?? 0;

  if (cacheKey && cacheTtlMs > 0) {
    const hit = CACHE.get(cacheKey);
    if (hit && hit.expiresAt > nowMs()) return hit.value as T;
  }

  const res = await fetch(url, {
    headers: {
      APIKEY: apiKey,
    },
    // Route handlers run on the server; we still disable Next fetch caching here,
    // because we implement our own short TTL cache for predictable behavior.
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
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
  /**
   * Jotform sometimes includes pagination metadata; keep flexible.
   * We don't rely on these strictly.
   */
  [k: string]: unknown;
};

export async function fetchAllFormSubmissions(
  formId: string,
  apiKey: string,
  options?: JotformFetchOptions
): Promise<unknown[]> {
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
      apiKey,
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

