import { prisma } from "@/lib/prisma";
import { DEFAULT_FILTERS } from "@/lib/config/defaults";
import { deterministicHash } from "@/lib/hash";
import { fetchWithRetry } from "@/lib/http";
import { upsertJob } from "@/lib/jobs-service";
import type { JobSearchFilters, NormalizedJob, PolitepolConfig } from "@/lib/types";
import { parseContractType } from "@/lib/utils";

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toDate(value: unknown): Date {
  if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseJsonFeed(raw: unknown, feedUrl: string): NormalizedJob[] {
  const items: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.items)
      ? (raw as any).items
      : Array.isArray((raw as any)?.feed?.items)
        ? (raw as any).feed.items
        : [];

  return items
    .map((item, idx) => {
      const title = stripHtml(String(item?.title ?? item?.name ?? "")).trim();
      const url = String(item?.url ?? item?.link ?? item?.guid ?? "").trim();
      if (!title || !url) return null;

      const company = stripHtml(String(item?.company ?? item?.author ?? item?.source ?? "")).trim() || "Unknown";
      const location = stripHtml(String(item?.location ?? item?.city ?? item?.region ?? item?.where ?? "")).trim() || "France";
      const contractType = parseContractType(String(item?.contractType ?? item?.employmentType ?? item?.type ?? ""));

      const sourceId =
        String(item?.id ?? item?.guid ?? "").trim() ||
        deterministicHash(`${feedUrl}|${title}|${company}|${url}|${idx}`);

      return {
        source: "politepol" as const,
        sourceJobId: sourceId,
        title,
        company,
        location,
        contractType,
        url,
        postedAt: toDate(item?.datePublished ?? item?.pubDate ?? item?.published ?? item?.date ?? item?.createdAt)
      } satisfies NormalizedJob;
    })
    .filter(Boolean) as NormalizedJob[];
}

function parseXmlTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? stripHtml(match[1]) : "";
}

function parseRssFeed(xml: string, feedUrl: string): NormalizedJob[] {
  const items = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((m) => m[0]);

  return items
    .map((item, idx) => {
      const title = parseXmlTag(item, "title");
      const url = parseXmlTag(item, "link");
      if (!title || !url) return null;

      const description = parseXmlTag(item, "description");
      const sourceId = parseXmlTag(item, "guid") || deterministicHash(`${feedUrl}|${title}|${url}|${idx}`);

      return {
        source: "politepol" as const,
        sourceJobId: sourceId,
        title,
        company: "Unknown",
        location: "France",
        contractType: parseContractType(description),
        url,
        postedAt: toDate(parseXmlTag(item, "pubDate"))
      } satisfies NormalizedJob;
    })
    .filter(Boolean) as NormalizedJob[];
}

async function fetchFeedJobs(feedUrl: string): Promise<NormalizedJob[]> {
  const response = await fetchWithRetry(feedUrl, {}, { retries: 1, timeoutMs: 12000, initialDelayMs: 300 });
  const text = await response.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return parseJsonFeed(parsed, feedUrl);
  }

  if (trimmed.startsWith("<")) {
    return parseRssFeed(trimmed, feedUrl);
  }

  return [];
}

function buildPolitepolFilters(): JobSearchFilters {
  return {
    ...DEFAULT_FILTERS,
    keywordsExclude: [
      ...DEFAULT_FILTERS.keywordsExclude,
      "principal",
      "staff",
      "head",
      "director",
      "manager",
      "engineer",
      "brand",
      "intern",
      "internship",
      "stage",
      "stagiaire",
      "alternance",
      "apprentice",
      "apprentissage"
    ],
    sources: ["politepol"],
    postedSinceHours: 168
  };
}

export async function refreshPolitepol(config: PolitepolConfig) {
  const filters = buildPolitepolFilters();
  const summary: Record<string, { newCount: number; errors: string[]; parsedCount: number }> = {};
  let totalNew = 0;

  for (const feedUrl of config.feedUrls) {
    const run = await prisma.refreshRun.create({
      data: {
        source: "politepol",
        status: "RUNNING",
        startedAt: new Date(),
        newCount: 0
      }
    });

    try {
      const jobs = await fetchFeedJobs(feedUrl);
      let newCount = 0;

      for (const job of jobs) {
        const upsert = await upsertJob(job, filters);
        if (upsert.created && upsert.job.excludedReason === null) {
          newCount += 1;
        }
      }

      await prisma.refreshRun.update({
        where: { id: run.id },
        data: {
          endedAt: new Date(),
          status: "SUCCESS",
          newCount,
          error: null
        }
      });

      summary[feedUrl] = { newCount, errors: [], parsedCount: jobs.length };
      totalNew += newCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : "PolitePol feed refresh failed";

      await prisma.refreshRun.update({
        where: { id: run.id },
        data: {
          endedAt: new Date(),
          status: "FAILED",
          newCount: 0,
          error: message
        }
      });

      summary[feedUrl] = { newCount: 0, errors: [message], parsedCount: 0 };
    }
  }

  return { totalNew, summary };
}

export async function getPolitepolStatus() {
  const [runs, totalVisible, totalInDb, excludedAgg] = await Promise.all([
    prisma.refreshRun.findMany({
      where: { source: "politepol" },
      orderBy: { startedAt: "desc" },
      take: 30
    }),
    prisma.job.count({ where: { source: "politepol", excludedReason: null } }),
    prisma.job.count({ where: { source: "politepol" } }),
    prisma.job.groupBy({
      by: ["excludedReason"],
      where: { source: "politepol", excludedReason: { not: null } },
      _count: { _all: true }
    })
  ]);

  const excludedReasons = excludedAgg.reduce<Record<string, number>>((acc, item) => {
    const key = item.excludedReason ?? "unknown";
    acc[key] = item._count._all;
    return acc;
  }, {});

  return {
    totalVisible,
    totalInDb,
    excludedReasons,
    runs
  };
}

export async function getPolitepolJobs(page: number, pageSize: number, includeExcluded = false) {
  const where = includeExcluded
    ? ({ source: "politepol" as const })
    : ({ source: "politepol" as const, excludedReason: null });

  const [total, items] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { scrapedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return { total, items, page, pageSize, includeExcluded };
}
