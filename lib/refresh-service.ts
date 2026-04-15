import { prisma } from "@/lib/prisma";
import { fetchJobsFromSource } from "@/lib/connectors";
import { DEFAULT_FILTERS } from "@/lib/config/defaults";
import type { JobSearchFilters, JobSource } from "@/lib/types";
import { upsertJob } from "@/lib/jobs-service";

interface RefreshOptions {
  sources?: JobSource[];
  filters?: JobSearchFilters;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function refreshSingleSource(source: JobSource, filters: JobSearchFilters) {
  const run = await prisma.refreshRun.create({
    data: {
      source,
      status: "RUNNING",
      startedAt: new Date(),
      newCount: 0
    }
  });

  try {
    const result = await withTimeout(fetchJobsFromSource(source, filters), 20000, `${source} connector`);
    let newCount = 0;

    for (const job of result.jobs) {
      const upsert = await upsertJob(job, filters);
      if (upsert.created && upsert.job.excludedReason === null) {
        newCount += 1;
      }
    }

    await prisma.refreshRun.update({
      where: { id: run.id },
      data: {
        endedAt: new Date(),
        status: result.errors.length > 0 ? "PARTIAL" : "SUCCESS",
        newCount,
        error: result.errors.join(" | ") || null
      }
    });

    return {
      source,
      newCount,
      errors: result.errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh error";

    await prisma.refreshRun.update({
      where: { id: run.id },
      data: {
        endedAt: new Date(),
        status: "FAILED",
        error: message,
        newCount: 0
      }
    });

    return {
      source,
      newCount: 0,
      errors: [message]
    };
  }
}

export async function refreshJobs(options: RefreshOptions = {}) {
  const sources = options.sources ?? DEFAULT_FILTERS.sources;
  const filters = options.filters ?? DEFAULT_FILTERS;

  const summary = Object.fromEntries(
    sources.map((source) => [source, { newCount: 0, errors: [] as string[] }])
  ) as Record<JobSource, { newCount: number; errors: string[] }>;

  const settled = await Promise.allSettled(
    sources.map(async (source) => ({ source, result: await refreshSingleSource(source, filters) }))
  );

  for (const item of settled) {
    if (item.status === "fulfilled") {
      const { source, result } = item.value;
      summary[source] = {
        newCount: result.newCount,
        errors: result.errors
      };
      continue;
    }

    const reason = item.reason instanceof Error ? item.reason.message : "Unknown source failure";
    // Promise wrapper preserves source in most cases; fallback to global error bucket on linkedin
    const fallbackSource = sources[0]; if (fallbackSource) { summary[fallbackSource].errors.push(reason); }
  }

  const totalNew = Object.values(summary).reduce((acc, item) => acc + item.newCount, 0);

  return {
    totalNew,
    summary
  };
}

