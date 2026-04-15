import { prisma } from "@/lib/prisma";
import { DEFAULT_FILTERS } from "@/lib/config/defaults";
import type { AtsConfig, AtsSource, JobSearchFilters, JobSource, NormalizedJob } from "@/lib/types";
import { fetchJobsFromDirectUrl } from "@/lib/connectors/web-domain";
import { discoverAtsTargets } from "@/lib/ats-discovery";
import { sendDiscordNotification } from "@/lib/discord-notifier";
import { upsertJob } from "@/lib/jobs-service";
import { deterministicHash } from "@/lib/hash";
import { fetchWithRetry } from "@/lib/http";
import { parseContractType } from "@/lib/utils";

const SOURCE_HOST_MAP: Record<AtsSource, string[]> = {
  greenhouse: ["greenhouse.io", "boards.greenhouse.io"],
  lever: ["lever.co", "jobs.lever.co"],
  smartrecruiters: ["smartrecruiters.com", "jobs.smartrecruiters.com"]
};

const ATS_SOURCES: JobSource[] = ["greenhouse", "lever", "smartrecruiters"];
const MAX_TARGETS_PER_SOURCE_HARD_CAP = 8;
const TARGET_FETCH_TIMEOUT_MS = 12000;

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

function getBoardToken(target: string): string | null {
  try {
    const url = new URL(target);
    const token = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return token || null;
  } catch {
    return null;
  }
}

function toDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function fetchGreenhouseJobs(target: string): Promise<NormalizedJob[]> {
  const token = getBoardToken(target);
  if (!token) return [];

  const endpoint = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
  const response = await fetchWithRetry(endpoint, {}, { retries: 1, timeoutMs: 9000 });
  const payload = (await response.json()) as { jobs?: Array<any> };
  const jobs = payload.jobs ?? [];

  return jobs
    .map((job) => {
      const title = String(job.title ?? "").trim();
      const url = String(job.absolute_url ?? "").trim();
      if (!title || !url) return null;

      return {
        source: "greenhouse" as const,
        sourceJobId: String(job.id ?? deterministicHash(`gh|${url}|${title}`)),
        title,
        company: token,
        location: String(job.location?.name ?? "").trim() || "France",
        contractType: parseContractType(String(job.metadata?.employment_type ?? "")),
        url,
        postedAt: toDate(job.updated_at)
      } satisfies NormalizedJob;
    })
    .filter(Boolean) as NormalizedJob[];
}

async function fetchLeverJobs(target: string): Promise<NormalizedJob[]> {
  const company = getBoardToken(target);
  if (!company) return [];

  const endpoint = `https://api.lever.co/v0/postings/${company}?mode=json`;
  const response = await fetchWithRetry(endpoint, {}, { retries: 1, timeoutMs: 9000 });
  const payload = (await response.json()) as Array<any>;

  return (Array.isArray(payload) ? payload : [])
    .map((job) => {
      const title = String(job.text ?? "").trim();
      const url = String(job.hostedUrl ?? "").trim();
      if (!title || !url) return null;

      return {
        source: "lever" as const,
        sourceJobId: String(job.id ?? deterministicHash(`lever|${url}|${title}`)),
        title,
        company,
        location: String(job.categories?.location ?? "").trim() || "France",
        contractType: parseContractType(String(job.categories?.commitment ?? "")),
        url,
        postedAt: toDate(job.createdAt ? new Date(Number(job.createdAt)).toISOString() : null)
      } satisfies NormalizedJob;
    })
    .filter(Boolean) as NormalizedJob[];
}

function mapSmartRecruitersPayload(company: string, payload: any): NormalizedJob[] {
  const items = Array.isArray(payload?.content)
    ? payload.content
    : Array.isArray(payload?.data?.content)
      ? payload.data.content
      : [];

  return items
    .map((job: any) => {
      const title = String(job.name ?? "").trim();
      const id = String(job.id ?? "").trim();
      if (!title || !id) return null;

      const url = String(job.ref ?? `https://jobs.smartrecruiters.com/${company}/${id}`).trim();
      const location = String(job.location?.city ?? job.location?.region ?? job.location?.country ?? "").trim() || "France";

      return {
        source: "smartrecruiters" as const,
        sourceJobId: id,
        title,
        company,
        location,
        contractType: parseContractType(String(job.typeOfEmployment?.label ?? "")),
        url,
        postedAt: toDate(job.releasedDate ?? job.createdOn)
      } satisfies NormalizedJob;
    })
    .filter(Boolean) as NormalizedJob[];
}

async function fetchSmartRecruitersJobs(target: string): Promise<NormalizedJob[]> {
  const company = getBoardToken(target);
  if (!company) return [];

  const endpoints = [
    `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100&offset=0`,
    `https://api.smartrecruiters.com/v1/companies/${company}/postings`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithRetry(endpoint, {}, { retries: 1, timeoutMs: 9000 });
      const payload = await response.json();
      const jobs = mapSmartRecruitersPayload(company, payload);
      if (jobs.length > 0) return jobs;
    } catch {
      // try next endpoint
    }
  }

  return [];
}

async function fetchAtsJobsFromTarget(source: AtsSource, target: string): Promise<NormalizedJob[]> {
  const nativeJobs =
    source === "greenhouse"
      ? await fetchGreenhouseJobs(target)
      : source === "lever"
        ? await fetchLeverJobs(target)
        : await fetchSmartRecruitersJobs(target);

  if (nativeJobs.length > 0) return nativeJobs;

  return fetchJobsFromDirectUrl(toJobSource(source), new URL(target).hostname, target);
}

function isTargetForSource(source: AtsSource, url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOURCE_HOST_MAP[source].some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function buildAtsFilters(): JobSearchFilters {
  return {
    ...DEFAULT_FILTERS,
    keywordsExclude: [...DEFAULT_FILTERS.keywordsExclude, "principal", "staff", "head", "director"],
    sources: ATS_SOURCES,
    postedSinceHours: 168
  };
}

function toJobSource(source: AtsSource): JobSource {
  return source;
}

function formatJobLine(job: NormalizedJob): string {
  return `- ${job.title} | ${job.company} | ${job.location} | ${job.url}`;
}

export async function refreshAts(config: AtsConfig) {
  const filters = buildAtsFilters();
  const summary: Record<string, { newCount: number; errors: string[] }> = {};
  const allNewJobs: NormalizedJob[] = [];

  const discovered = config.autoDiscoveryEnabled
    ? await discoverAtsTargets(filters, config.sources, config.discoveryMaxTargetsPerSource)
    : {
        bySource: { greenhouse: [], lever: [], smartrecruiters: [] },
        errors: { greenhouse: [], lever: [], smartrecruiters: [] }
      };

  for (const source of config.sources) {
    const manualTargets = config.targets.filter((target) => isTargetForSource(source, target));
    const autoTargets = discovered.bySource[source] ?? [];
    const targets = Array.from(new Set([...manualTargets, ...autoTargets])).slice(0, MAX_TARGETS_PER_SOURCE_HARD_CAP);

    if (targets.length === 0) {
      summary[source] = {
        newCount: 0,
        errors: ["No target configured/discovered for this source", ...(discovered.errors[source] ?? [])]
      };
      continue;
    }

    let sourceNewCount = 0;
    const sourceErrors: string[] = [...(discovered.errors[source] ?? [])];

    for (const target of targets) {
      const run = await prisma.atsRun.create({
        data: {
          source: toJobSource(source),
          target,
          status: "RUNNING",
          startedAt: new Date(),
          newCount: 0
        }
      });

      try {
        const jobs = await withTimeout(fetchAtsJobsFromTarget(source, target), TARGET_FETCH_TIMEOUT_MS, `${source}:${target}`);

        if (jobs.length === 0) {
          await prisma.atsRun.update({
            where: { id: run.id },
            data: {
              endedAt: new Date(),
              status: "PARTIAL",
              newCount: 0,
              error: "No jobs parsed from target"
            }
          });
          sourceErrors.push(`${target}: No jobs parsed from target`);
          continue;
        }

        let targetNewCount = 0;

        for (const job of jobs) {
          const upsert = await upsertJob(job, filters);
          if (upsert.created && upsert.job.excludedReason === null) {
            targetNewCount += 1;
            allNewJobs.push(job);
          }
        }

        await prisma.atsRun.update({
          where: { id: run.id },
          data: {
            endedAt: new Date(),
            status: "SUCCESS",
            newCount: targetNewCount,
            error: null
          }
        });

        sourceNewCount += targetNewCount;
      } catch (error) {
        const message = error instanceof Error ? error.message : "ATS target refresh failed";
        sourceErrors.push(`${target}: ${message}`);

        await prisma.atsRun.update({
          where: { id: run.id },
          data: {
            endedAt: new Date(),
            status: "FAILED",
            newCount: 0,
            error: message
          }
        });
      }
    }

    summary[source] = { newCount: sourceNewCount, errors: sourceErrors };
  }

  const totalNew = Object.values(summary).reduce((acc, item) => acc + item.newCount, 0);

  if (totalNew > 0 && config.discordWebhookUrl) {
    const lines = [`ATS Radar: ${totalNew} new jobs`, ...allNewJobs.slice(0, 10).map(formatJobLine)];
    await sendDiscordNotification(config.discordWebhookUrl, lines);
  }

  return {
    totalNew,
    summary,
    discovery: {
      greenhouse: discovered.bySource.greenhouse.length,
      lever: discovered.bySource.lever.length,
      smartrecruiters: discovered.bySource.smartrecruiters.length
    }
  };
}

export async function getAtsStatus() {
  const [latestRuns, totalVisibleAtsJobs, totalAtsJobs, excludedReasonsRaw, sourceStatsRaw] = await Promise.all([
    prisma.atsRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.job.count({ where: { source: { in: ATS_SOURCES }, excludedReason: null } }),
    prisma.job.count({ where: { source: { in: ATS_SOURCES } } }),
    prisma.job.groupBy({
      by: ["excludedReason"],
      where: { source: { in: ATS_SOURCES }, excludedReason: { not: null } },
      _count: { _all: true }
    }),
    prisma.job.groupBy({ by: ["source"], where: { source: { in: ATS_SOURCES } }, _count: { _all: true } })
  ]);

  const excludedReasons = Object.fromEntries(
    excludedReasonsRaw
      .filter((row) => typeof row.excludedReason === "string" && row.excludedReason.length > 0)
      .map((row) => [row.excludedReason as string, row._count._all])
  );

  const statsBySource = Object.fromEntries(sourceStatsRaw.map((row) => [row.source, row._count._all]));

  return { totalVisibleAtsJobs, totalAtsJobs, excludedReasons, statsBySource, runs: latestRuns };
}

export async function getAtsJobs(page: number, pageSize: number) {
  const where = { source: { in: ATS_SOURCES }, excludedReason: null };

  const [total, items] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { scrapedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return { total, items, page, pageSize };
}
