import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FILTERS } from "@/lib/config/defaults";
import { initScheduler } from "@/lib/scheduler";
import type { JobSource } from "@/lib/types";
import { refreshJobs } from "@/lib/refresh-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  initScheduler();
  try {
    const body = await request.json().catch(() => ({}));
    const sources = Array.isArray(body?.sources) ? (body.sources as JobSource[]) : DEFAULT_FILTERS.sources;

    const result = await refreshJobs({
      sources,
      filters: DEFAULT_FILTERS
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        totalNew: 0,
        summary: {},
        error: error instanceof Error ? error.message : "Refresh endpoint error"
      },
      { status: 200 }
    );
  }
}
