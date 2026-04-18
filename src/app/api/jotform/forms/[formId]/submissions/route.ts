import { NextRequest, NextResponse } from "next/server";
import { fetchAllFormSubmissions } from "@/lib/jotform";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ formId: string }> }
) {
  const { formId } = await ctx.params;
  const apiKey = process.env.JOTFORM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing server env var JOTFORM_API_KEY",
      },
      { status: 500 }
    );
  }

  if (!formId || !/^\d+$/.test(formId)) {
    return NextResponse.json(
      { error: "Invalid formId param" },
      { status: 400 }
    );
  }

  try {
    const submissions = await fetchAllFormSubmissions(formId, apiKey, {
      cacheTtlMs: 15_000,
      limit: 200,
      maxPages: 25,
    });

    return NextResponse.json({
      formId,
      count: submissions.length,
      submissions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch Jotform submissions",
        details: message,
      },
      { status: 502 }
    );
  }
}

