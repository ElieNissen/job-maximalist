import { NextRequest, NextResponse } from "next/server";
import { getUrlRadarConfig } from "@/lib/url-radar-config";
import { getUrlRadarJobs } from "@/lib/url-radar-service";
import { initScheduler } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  initScheduler();

  try {
    const config = await getUrlRadarConfig();
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 30);
    const includeExcludedParam = (request.nextUrl.searchParams.get("includeExcluded") ?? "").toLowerCase();
    const includeExcluded = includeExcludedParam === "1" || includeExcludedParam === "true";

    const data = await getUrlRadarJobs(config, page, pageSize, includeExcluded);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        page: 1,
        pageSize: 30,
        newSinceLastRefresh: 0,
        lastRefreshAt: null,
        memory: { allJobs: 0, saved: 0, viewed: 0 },
        error: error instanceof Error ? error.message : "URL Radar jobs failed"
      },
      { status: 200 }
    );
  }
}
