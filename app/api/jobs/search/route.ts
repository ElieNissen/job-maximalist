import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_FILTERS } from "@/lib/config/defaults";
import { initScheduler } from "@/lib/scheduler";
import type { JobSearchFilters } from "@/lib/types";
import { fetchAllSources } from "@/lib/connectors";
import { matchesFilters } from "@/lib/filtering";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  initScheduler();
  const params = request.nextUrl.searchParams;
  const postedSinceHours = params.get("postedSinceHours") ? Number(params.get("postedSinceHours")) : undefined;

  const filters: JobSearchFilters = {
    ...DEFAULT_FILTERS,
    postedSinceHours
  };

  const results = await fetchAllSources(filters);
  const merged = Object.values(results).flatMap((result) => result.jobs);
  const errors = Object.values(results).flatMap((result) => result.errors);

  const filtered = merged
    .filter((job) => matchesFilters(job, filters).match)
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

  return NextResponse.json({
    items: filtered,
    errors
  });
}
