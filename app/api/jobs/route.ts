import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FILTERS, DEFAULT_PAGINATION } from "@/lib/config/defaults";
import { initScheduler } from "@/lib/scheduler";
import type { JobSearchFilters, JobSource } from "@/lib/types";
import { queryJobs } from "@/lib/jobs-service";

export const runtime = "nodejs";

function parseStringList(value: string | null, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  initScheduler();
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? DEFAULT_PAGINATION.page);
  const pageSize = Number(params.get("pageSize") ?? DEFAULT_PAGINATION.pageSize);

  const filters: JobSearchFilters = {
    keywordsInclude: parseStringList(params.get("keywordsInclude"), DEFAULT_FILTERS.keywordsInclude),
    keywordsExclude: parseStringList(params.get("keywordsExclude"), DEFAULT_FILTERS.keywordsExclude),
    locations: parseStringList(params.get("locations"), DEFAULT_FILTERS.locations),
    contractTypes: parseStringList(params.get("contractTypes"), DEFAULT_FILTERS.contractTypes) as Array<
      "CDI" | "CDD"
    >,
    sources: parseStringList(params.get("sources"), DEFAULT_FILTERS.sources) as JobSource[],
    postedSinceHours: params.get("postedSinceHours") ? Number(params.get("postedSinceHours")) : undefined
  };

  const data = await queryJobs({ filters, page, pageSize });

  return NextResponse.json({
    items: data.items,
    total: data.total,
    page,
    pageSize,
    newSinceLastRefresh: data.newSinceLastRefresh,
    lastRefreshAt: data.lastRefreshAt,
    lastRunId: data.lastRunId,
    memory: data.memory,
    connectors: data.connectors
  });
}
