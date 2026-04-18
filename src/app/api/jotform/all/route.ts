import { NextResponse } from "next/server";
import { getFormIdForSource, SOURCES } from "@/lib/sources";
import { EventItem, SourceKind } from "@/lib/types";
import { fetchAllFormSubmissions, parseApiKeysFromEnv } from "@/lib/jotform";
import { normalizeSubmissionToEvent } from "@/lib/normalize/event";

type SourceResult = {
  source: SourceKind;
  formId: string | null;
  count: number;
  error?: string;
};

export async function GET() {
  const keys = parseApiKeysFromEnv();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: "Missing server env var JOTFORM_API_KEY (or JOTFORM_API_KEYS)" },
      { status: 500 }
    );
  }

  const perSource = await Promise.all(
    SOURCES.map(
      async (
        s
      ): Promise<{ info: SourceResult; events: EventItem[] }> => {
        const formId = getFormIdForSource(s.key);
        if (!formId) {
          return {
            info: {
              source: s.key,
              formId: null,
              count: 0,
              error: "No form id configured",
            },
            events: [],
          };
        }

        try {
          const submissions = await fetchAllFormSubmissions(formId, keys, {
            cacheTtlMs: 15_000,
            limit: 200,
            maxPages: 25,
          });

          const events = submissions
            .map((sub) => normalizeSubmissionToEvent(s.key as SourceKind, sub))
            .filter((e): e is EventItem => e !== null);

          return {
            info: { source: s.key, formId, count: events.length },
            events,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return {
            info: { source: s.key, formId, count: 0, error: message },
            events: [],
          };
        }
      }
    )
  );

  const flattened: EventItem[] = perSource.flatMap((r) => r.events);
  flattened.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    sources: perSource.map((r) => r.info),
    count: flattened.length,
    events: flattened,
    keyCount: keys.length,
  });
}
