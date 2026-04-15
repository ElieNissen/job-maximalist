import fs from "fs/promises";
import path from "path";
import {
  cloneUrlRadarFilters,
  sanitizeUrlRadarFilters,
  URL_RADAR_DEFAULT_FILTERS
} from "@/lib/url-radar-filters";

export interface UrlRadarConfig {
  enabled: boolean;
  intervalMinutes: number;
  urls: string[];
  filters: ReturnType<typeof cloneUrlRadarFilters>;
  removedUrlsHistory: Array<{ url: string; removedAt: string }>;
}

const FILE_PATH = path.join(process.cwd(), "data", "url-radar-config.json");
const BACKUP_FILE_PATH = path.join(process.cwd(), "data", "url-radar-config.backup.json");

export const URL_RADAR_DEFAULT_URLS = [
  "https://www.linkedin.com/jobs/search/?currentJobId=4381874800&distance=25.0&f_TPR=r86400&geoId=104246759&keywords=%22product%20designer%22%20OR%20%22ux%20designer%22%20OR%20%22ux%2Fui%20designer%22%20OR%20%22interaction%20designer%22&origin=JOB_SEARCH_PAGE_JOB_FILTER",
  "https://www.welcometothejungle.com/fr/jobs?refinementList%5Boffices.country_code%5D%5B%5D=FR&refinementList%5Bcontract_type%5D%5B%5D=full_time&refinementList%5Bcontract_type%5D%5B%5D=temporary&refinementList%5Bexperience_level_minimum%5D%5B%5D=0-1&refinementList%5Bexperience_level_minimum%5D%5B%5D=1-3&refinementList%5Bexperience_level_minimum%5D%5B%5D=3-5&refinementList%5Bhas_experience_level_minimum%5D%5B%5D=0&query=ux%20ui%20designer&page=1&sortBy=mostRecent&searchTitle=false",
  "https://choisirleservicepublic.gouv.fr/nos-offres/filtres/mot-cles/designer/localisation/208/",
  "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=UX+designer&k_autocomplete=http%3A%2F%2Fwww.rj.com%2FCommun%2FPost%2FDesigner_interactivite&l=%C3%8Ele-de-France&l_autocomplete=http%3A%2F%2Fwww.rj.com%2Fcommun%2Flocalite%2Fregion%2F11&st=date&msa=0&ray=20&d=all",
  "https://www.apec.fr/candidat/recherche-emploi.html/emploi?typesConvention=143684&typesConvention=143685&typesConvention=143686&typesConvention=143687&typesConvention=143706&lieux=711&motsCles=ux%20or%20product&sortsType=SCORE&page=0",
  "https://www.adzuna.fr/search?q=ux%20ui%20designer%20ou%20product%20designer&w=Ile-de-France%2C%20France",
  "https://mon-vie-via.businessfrance.fr/offres/recherche?query=ux%20ui%20%20product%20designer&teletravail=0&porteEnv=0",
  "https://fr.indeed.com/jobs?q=ux+designer+product+-alternance&l=Paris+%2875%29&radius=25&from=searchOnDesktopSerp&vjk=82ccf33515b4ff1b",
  "https://hiring.cafe/?searchState=%7B%22searchQuery%22%3A%22product+designer%22%2C%22dateFetchedPastNDays%22%3A14%7D",
  "https://app.licornesociety.com/jobs",
  "https://www.free-work.com/fr/tech-it/jobs?locations=fr~~~&query=product%20designer"
] as const;

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

  return cleaned.length > 0 ? cleaned : DEFAULT_CONFIG.urls;
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

    cleaned.push({ url, removedAt });
  }

  return cleaned.slice(0, 30);
}

function mergeRemovedUrlsHistory(
  previous: UrlRadarConfig,
  next: UrlRadarConfig
): Array<{ url: string; removedAt: string }> {
  const activeKeys = new Set(next.urls.map(normalizeUrlKey));
  const historyByKey = new Map<string, { url: string; removedAt: string }>();

  for (const entry of [...next.removedUrlsHistory, ...previous.removedUrlsHistory]) {
    const key = normalizeUrlKey(entry.url);
    if (!key || activeKeys.has(key) || historyByKey.has(key)) continue;
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

  return Array.from(historyByKey.values())
    .sort((left, right) => new Date(right.removedAt).getTime() - new Date(left.removedAt).getTime())
    .slice(0, 30);
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
