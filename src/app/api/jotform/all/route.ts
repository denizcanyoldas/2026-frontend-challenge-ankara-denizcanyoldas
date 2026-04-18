import { NextResponse } from "next/server";
import { getFormIdForSource, SOURCES } from "@/lib/sources";
import { EventItem, SourceKind } from "@/lib/types";
import { fetchAllFormSubmissions } from "@/lib/jotform";
import { normalizeSubmissionToEvent } from "@/lib/normalize/event";

export async function GET() {
  const apiKey = process.env.JOTFORM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing server env var JOTFORM_API_KEY" },
      { status: 500 }
    );
  }

  const results = await Promise.all(
    SOURCES.map(async (s) => {
      const formId = getFormIdForSource(s.key);
      if (!formId) {
        return { source: s.key, formId: null, events: [] as unknown[] };
      }

      const submissions = await fetchAllFormSubmissions(formId, apiKey, {
        cacheTtlMs: 15_000,
        limit: 200,
        maxPages: 25,
      });

      const events = submissions
        .map((sub) => normalizeSubmissionToEvent(s.key as SourceKind, sub))
        .filter(Boolean);

      return { source: s.key, formId, events };
    })
  );

  const flattened = results.flatMap((r) => r.events) as EventItem[];
  flattened.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    sources: results.map((r) => ({
      source: r.source,
      formId: r.formId,
      count: r.events.length,
    })),
    count: flattened.length,
    events: flattened,
  });
}

