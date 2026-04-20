import type { JobSource } from "@/lib/types";
import { getHostFromUrl, getUrlSourceMeta } from "@/lib/url-radar-sources";
import type { JobCluster, JobClusterSource, SourceFilterOption, UrlRadarJob } from "@/components/url-radar/types";

export function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function formatRelativeSameDayOrDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (!isSameDay) {
    return date.toLocaleDateString("fr-FR");
  }

  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "\u00e0 l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  return `il y a ${diffHours} h`;
}

function normalizeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeKeywordMatches(current: string[], incoming: readonly string[]): string[] {
  const seen = new Set(current.map(normalizeKeyPart).filter(Boolean));
  const merged = [...current];

  for (const keyword of incoming) {
    const normalized = normalizeKeyPart(keyword);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(keyword);
  }

  return merged;
}

function fallbackSourceLabel(source: JobSource): string {
  switch (source) {
    case "linkedin":
      return "LINKEDIN";
    case "wttj":
      return "WTTJ";
    case "service_public":
      return "SERVICE PUBLIC";
    default:
      return source.toUpperCase().replace(/_/g, " ");
  }
}

export function sourceLabelFromUrl(source: JobSource, url: string): string {
  return getUrlSourceMeta(url, source).label || fallbackSourceLabel(source);
}

export function sourceColorFromUrl(source: JobSource, url: string): string {
  return getUrlSourceMeta(url, source).color;
}

export function sourceTextColorFromUrl(url: string): string {
  return getUrlSourceMeta(url).textColor ?? "white";
}

export function sourceChipKey(sourceItem: JobClusterSource): string {
  return `${sourceLabelFromUrl(sourceItem.source, sourceItem.url)}|${getHostFromUrl(sourceItem.url)}`;
}

export function sourceMatchesFilter(cluster: JobCluster, filterKey: string | null): boolean {
  if (!filterKey) return true;
  return cluster.sources.some((sourceItem) => sourceChipKey(sourceItem) === filterKey);
}

export function buildSourceOptions(clusters: JobCluster[]): SourceFilterOption[] {
  const counts = new Map<string, SourceFilterOption>();

  for (const cluster of clusters) {
    const localKeys = new Set<string>();
    for (const sourceItem of cluster.sources) {
      const key = sourceChipKey(sourceItem);
      if (localKeys.has(key)) continue;
      localKeys.add(key);

      const current = counts.get(key);
      if (current) {
        current.count += 1;
        continue;
      }

      counts.set(key, {
        key,
        label: sourceLabelFromUrl(sourceItem.source, sourceItem.url),
        color: sourceColorFromUrl(sourceItem.source, sourceItem.url),
        textColor: sourceTextColorFromUrl(sourceItem.url),
        source: sourceItem.source,
        url: sourceItem.url,
        count: 1
      });
    }
  }

  return Array.from(counts.values()).sort((left, right) => left.label.localeCompare(right.label, "fr"));
}

export function clusterJobs(items: UrlRadarJob[]): JobCluster[] {
  const byKey = new Map<string, JobCluster>();

  for (const job of items) {
    const key = `${normalizeKeyPart(job.title)}|${normalizeKeyPart(job.company)}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        ids: [job.id],
        title: job.title,
        company: job.company,
        location: job.location,
        contractType: job.contractType,
        postedAt: job.postedAt,
        firstSeenAt: job.firstSeenAt,
        lastSeenAt: job.lastSeenAt,
        viewed: job.viewed,
        saved: job.saved,
        experienceHint: job.experienceHint,
        sources: [{ source: job.source, url: job.url }],
        excludedReasons: job.excludedReason ? [job.excludedReason] : [],
        excludedKeywordMatches: Array.isArray(job.excludedKeywords) ? mergeKeywordMatches([], job.excludedKeywords) : []
      });
      continue;
    }

    existing.ids.push(job.id);
    existing.sources = Array.from(
      new Map(
        [...existing.sources, { source: job.source, url: job.url }].map((item) => [`${item.source}|${item.url}`, item])
      ).values()
    );
    existing.postedAt = new Date(job.postedAt) > new Date(existing.postedAt) ? job.postedAt : existing.postedAt;
    existing.firstSeenAt = new Date(job.firstSeenAt) < new Date(existing.firstSeenAt) ? job.firstSeenAt : existing.firstSeenAt;
    existing.lastSeenAt = new Date(job.lastSeenAt) > new Date(existing.lastSeenAt) ? job.lastSeenAt : existing.lastSeenAt;
    existing.viewed = existing.viewed && job.viewed;
    existing.saved = existing.saved || job.saved;
    if (!existing.experienceHint && job.experienceHint) existing.experienceHint = job.experienceHint;
    if (existing.location === "France" && job.location !== "France") existing.location = job.location;
    if (existing.contractType === "OTHER" && job.contractType !== "OTHER") existing.contractType = job.contractType;
    if (job.excludedReason && !existing.excludedReasons.includes(job.excludedReason)) {
      existing.excludedReasons.push(job.excludedReason);
    }
    if (Array.isArray(job.excludedKeywords) && job.excludedKeywords.length > 0) {
      existing.excludedKeywordMatches = mergeKeywordMatches(existing.excludedKeywordMatches, job.excludedKeywords);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime());
}
