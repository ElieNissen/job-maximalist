import type { Job, Prisma, RefreshStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildFingerprint } from "@/lib/fingerprint";
import type { ConnectorHealth, JobSearchFilters, JobSource, NormalizedJob } from "@/lib/types";
import { matchesFilters } from "@/lib/filtering";

export interface UpsertResult {
  created: boolean;
  job: Job;
}

export async function upsertJob(job: NormalizedJob, filters: JobSearchFilters): Promise<UpsertResult> {
  const filterResult = matchesFilters(job, filters);
  const fingerprint = buildFingerprint(job);

  const payload: Prisma.JobUncheckedCreateInput = {
    source: job.source,
    sourceJobId: job.sourceJobId,
    title: job.title,
    company: job.company,
    location: job.location,
    contractType: job.contractType,
    url: job.url,
    postedAt: job.postedAt,
    scrapedAt: new Date(),
    matchedKeywords: JSON.stringify(filterResult.matchedKeywords),
    excludedReason: filterResult.excludedReason,
    fingerprint
  };

  const existingBySource = await prisma.job.findUnique({
    where: {
      source_sourceJobId: {
        source: job.source,
        sourceJobId: job.sourceJobId
      }
    }
  });

  if (existingBySource) {
    const updated = await prisma.job.update({
      where: { id: existingBySource.id },
      data: payload
    });
    return { created: false, job: updated };
  }

  const existingByFingerprint = await prisma.job.findUnique({ where: { fingerprint } });
  if (existingByFingerprint) {
    const updated = await prisma.job.update({
      where: { id: existingByFingerprint.id },
      data: payload
    });
    return { created: false, job: updated };
  }

  const created = await prisma.job.create({ data: payload });
  return { created: true, job: created };
}

export interface QueryJobsOptions {
  filters: JobSearchFilters;
  page: number;
  pageSize: number;
}

const ALL_SOURCES: JobSource[] = [
  "linkedin",
  "wttj",
  "indeed",
  "hellowork",
  "service_public",
  "hiring_cafe",
  "licorne_society",
  "career_sites",
  "greenhouse",
  "lever",
  "smartrecruiters",
  "politepol"
];

function mapRunStatus(status: RefreshStatus): ConnectorHealth["lastStatus"] {
  if (status === "SUCCESS" || status === "PARTIAL" || status === "FAILED") return status;
  return "PARTIAL";
}

function buildConnectorHealthMap(
  runs: Array<{ source: string | null; status: RefreshStatus; error: string | null; endedAt: Date | null }>
): ConnectorHealth[] {
  const map = new Map<JobSource, ConnectorHealth>();

  for (const source of ALL_SOURCES) {
    map.set(source, {
      source,
      lastStatus: "NEVER",
      lastError: null,
      lastRunAt: null
    });
  }

  for (const run of runs) {
    if (!run.source) continue;
    const source = run.source as JobSource;
    if (!map.has(source)) continue;
    if (map.get(source)?.lastStatus !== "NEVER") continue;

    map.set(source, {
      source,
      lastStatus: mapRunStatus(run.status),
      lastError: run.error,
      lastRunAt: run.endedAt ? run.endedAt.toISOString() : null
    });
  }

  return Array.from(map.values());
}

export async function queryJobs({ filters, page, pageSize }: QueryJobsOptions) {
  const where: Prisma.JobWhereInput = {
    source: { in: filters.sources },
    excludedReason: null,
    contractType: { in: [...filters.contractTypes, "OTHER"] },
    NOT: [{ url: { contains: "/jobs/search/" } }, { title: { contains: " jobs in " } }]
  };

  if (filters.postedSinceHours) {
    where.postedAt = {
      gte: new Date(Date.now() - filters.postedSinceHours * 60 * 60 * 1000)
    };
  }

  const [total, items, latestRun, allJobsCount, savedCount, viewedCount, recentRuns] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { scrapedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.refreshRun.findFirst({
      where: { status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { endedAt: "desc" }
    }),
    prisma.job.count({ where: { NOT: [{ url: { contains: "/jobs/search/" } }] } }),
    prisma.job.count({ where: { saved: true } }),
    prisma.job.count({ where: { viewed: true } }),
    prisma.refreshRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      select: {
        source: true,
        status: true,
        error: true,
        endedAt: true
      }
    })
  ]);

  return {
    total,
    items,
    lastRefreshAt: latestRun?.endedAt ?? null,
    newSinceLastRefresh: latestRun?.newCount ?? 0,
    lastRunId: latestRun?.id ?? null,
    memory: {
      allJobs: allJobsCount,
      saved: savedCount,
      viewed: viewedCount
    },
    connectors: buildConnectorHealthMap(recentRuns)
  };
}
