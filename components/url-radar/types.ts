import type { JobSearchFilters, JobSource } from "@/lib/types";

export type RemovedUrlHistoryEntry = {
  url: string;
  removedAt: string;
};

export type UrlRadarConfig = {
  enabled: boolean;
  intervalMinutes: number;
  urls: string[];
  filters: JobSearchFilters;
  removedUrlsHistory: RemovedUrlHistoryEntry[];
  onboardingCompletedAt: string | null;
  onboardingDismissedAt: string | null;
  isOnboardingTestProfile?: boolean;
};

export type UrlRadarJob = {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  contractType: "CDI" | "CDD" | "OTHER";
  url: string;
  postedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  scrapedAt: string;
  excludedReason: string | null;
  excludedKeywords: string[];
  viewed: boolean;
  saved: boolean;
  experienceHint: string | null;
};

export type UrlRadarJobsResponse = {
  items: UrlRadarJob[];
  total: number;
  newSinceLastRefresh: number;
  lastRefreshAt: string | null;
  lastRunStartedAt: string | null;
  lastRunId: string | null;
  memory: { allJobs: number; saved: 0 | number; viewed: 0 | number };
};

export type CrawlAttemptSummary = {
  method: string;
  status: string;
  parsed: number;
  visible: number;
  qualityScore?: number;
  note?: string;
};

export type UrlRadarStatusResponse = {
  totalInDb: number;
  totalVisible: number;
  excludedReasons: Record<string, number>;
  lastRunSummary: Record<
    string,
    {
      parsed: number;
      visible: number;
      newVisible?: number;
      errors: string[];
      attempts: CrawlAttemptSummary[];
      selectedMethod: string | null;
    }
  >;
  lastRunAt: string | null;
  lastRunStartedAt: string | null;
  runs: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    status: string;
    newCount: number;
    error: string | null;
  }>;
};

export type UrlRadarRefreshResponse = {
  ok: boolean;
  totalNew: number;
  summary: Record<
    string,
    {
      parsed: number;
      visible: number;
      newVisible?: number;
      errors: string[];
      attempts: CrawlAttemptSummary[];
      selectedMethod: string | null;
    }
  >;
  error?: string;
};

export type CloudflareTestResult = {
  ok: boolean;
  targetUrl: string;
  configured: boolean;
  canUse: boolean;
  error?: string;
  content?: { ok: boolean; htmlLength?: number; error?: string };
  crawl?: { ok: boolean; htmlLength?: number; error?: string };
};

export type MainTab = "visible" | "excluded";
export type UtilitySection = "settings";

export type JobClusterSource = {
  source: JobSource;
  url: string;
};

export type JobCluster = {
  key: string;
  ids: string[];
  title: string;
  company: string;
  location: string;
  contractType: string;
  postedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  viewed: boolean;
  saved: boolean;
  experienceHint: string | null;
  sources: JobClusterSource[];
  excludedReasons: string[];
  excludedKeywordMatches: string[];
};

export type SourceFilterOption = {
  key: string;
  label: string;
  color: string;
  textColor: string;
  source: JobSource;
  url: string;
  count: number;
};
