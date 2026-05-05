import fs from "fs/promises";
import path from "path";
import {
  cloneUrlRadarFilters,
  sanitizeUrlRadarFilters,
  URL_RADAR_DEFAULT_FILTERS
} from "@/lib/url-radar-filters";
import {
  getRuntimeConfigBackupFilePath,
  getRuntimeConfigFilePath
} from "@/lib/runtime-paths";

export interface UrlRadarConfig {
  enabled: boolean;
  intervalMinutes: number;
  urls: string[];
  filters: ReturnType<typeof cloneUrlRadarFilters>;
  removedUrlsHistory: Array<{ url: string; removedAt: string }>;
}

const FILE_PATH = getRuntimeConfigFilePath();
const BACKUP_FILE_PATH = getRuntimeConfigBackupFilePath();
const REMOVED_URL_HISTORY_MAX_ENTRIES = 30;
const REMOVED_URL_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

export const URL_RADAR_DEFAULT_URLS = [] as const;

const DEFAULT_CONFIG: UrlRadarConfig = {
  enabled: true,
  intervalMinutes: 60,
  urls: [...URL_RADAR_DEFAULT_URLS],
  filters: cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
  removedUrlsHistory: []
};

function normalizeUrlKey(url: string): string {
  return url.trim().toLowerCase();
}

function isRemovedUrlHistoryEntryFresh(removedAt: string, now = Date.now()): boolean {
  const timestamp = new Date(removedAt).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now - timestamp <= REMOVED_URL_HISTORY_RETENTION_MS;
}

function pruneRemovedUrlsHistory(
  entries: Array<{ url: string; removedAt: string }>,
  now = Date.now()
): Array<{ url: string; removedAt: string }> {
  return entries
    .filter((entry) => isRemovedUrlHistoryEntryFresh(entry.removedAt, now))
    .sort((left, right) => new Date(right.removedAt).getTime() - new Date(left.removedAt).getTime())
    .slice(0, REMOVED_URL_HISTORY_MAX_ENTRIES);
}

function sanitizeUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.urls;

  const cleaned = Array.from(
    new Set(
      input
        .map(String)
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );

  return cleaned;
}

function sanitizeConfig(input: unknown): UrlRadarConfig {
  const raw = (input ?? {}) as Record<string, unknown>;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    intervalMinutes:
      typeof raw.intervalMinutes === "number" && raw.intervalMinutes >= 15
        ? Math.min(24 * 60, raw.intervalMinutes)
        : DEFAULT_CONFIG.intervalMinutes,
    urls: sanitizeUrls(raw.urls),
    filters: sanitizeUrlRadarFilters(raw.filters),
    removedUrlsHistory: sanitizeRemovedUrlsHistory(raw.removedUrlsHistory)
  };
}

function sanitizeRemovedUrlsHistory(input: unknown): Array<{ url: string; removedAt: string }> {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const cleaned: Array<{ url: string; removedAt: string }> = [];
  const now = Date.now();

  for (const entry of input) {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const url = String(raw.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) continue;

    const key = normalizeUrlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);

    const removedAtRaw = String(raw.removedAt ?? "").trim();
    const removedAt =
      removedAtRaw && !Number.isNaN(new Date(removedAtRaw).getTime())
        ? new Date(removedAtRaw).toISOString()
        : new Date().toISOString();

    if (!isRemovedUrlHistoryEntryFresh(removedAt, now)) continue;

    cleaned.push({ url, removedAt });
  }

  return pruneRemovedUrlsHistory(cleaned, now);
}

function mergeRemovedUrlsHistory(
  previous: UrlRadarConfig,
  next: UrlRadarConfig
): Array<{ url: string; removedAt: string }> {
  const activeKeys = new Set(next.urls.map(normalizeUrlKey));
  const historyByKey = new Map<string, { url: string; removedAt: string }>();
  const now = Date.now();

  for (const entry of [...next.removedUrlsHistory, ...previous.removedUrlsHistory]) {
    const key = normalizeUrlKey(entry.url);
    if (!key || activeKeys.has(key) || historyByKey.has(key)) continue;
    if (!isRemovedUrlHistoryEntryFresh(entry.removedAt, now)) continue;
    historyByKey.set(key, {
      url: entry.url.trim(),
      removedAt: entry.removedAt
    });
  }

  for (const url of previous.urls) {
    const key = normalizeUrlKey(url);
    if (!key || activeKeys.has(key) || historyByKey.has(key)) continue;
    historyByKey.set(key, {
      url: url.trim(),
      removedAt: new Date().toISOString()
    });
  }

  return pruneRemovedUrlsHistory(Array.from(historyByKey.values()), now);
}

export async function getUrlRadarConfig(): Promise<UrlRadarConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cleaned = sanitizeConfig(parsed);

    if (!("filters" in parsed) || !("removedUrlsHistory" in parsed)) {
      await fs.writeFile(FILE_PATH, JSON.stringify(cleaned, null, 2), "utf8");
    }

    return cleaned;
  } catch {
    try {
      const backupRaw = await fs.readFile(BACKUP_FILE_PATH, "utf8");
      const backupParsed = JSON.parse(backupRaw) as Record<string, unknown>;
      const cleanedBackup = sanitizeConfig(backupParsed);
      await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
      await fs.writeFile(FILE_PATH, JSON.stringify(cleanedBackup, null, 2), "utf8");
      return cleanedBackup;
    } catch {
      await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
      await fs.writeFile(FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
      return DEFAULT_CONFIG;
    }
  }
}

export async function setUrlRadarConfig(config: UrlRadarConfig): Promise<UrlRadarConfig> {
  const cleaned = sanitizeConfig(config);
  let previous = DEFAULT_CONFIG;
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  try {
    const currentRaw = await fs.readFile(FILE_PATH, "utf8");
    if (currentRaw.trim()) {
      previous = sanitizeConfig(JSON.parse(currentRaw) as Record<string, unknown>);
      await fs.writeFile(BACKUP_FILE_PATH, currentRaw, "utf8");
    }
  } catch {
    // no prior config to back up
  }
  const merged: UrlRadarConfig = {
    ...cleaned,
    removedUrlsHistory: mergeRemovedUrlsHistory(previous, cleaned)
  };
  await fs.writeFile(FILE_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}
