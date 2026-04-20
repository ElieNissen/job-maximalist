import fs from "fs/promises";
import path from "path";
import { extractJobPostingJsonLd, mapJsonLdToJob } from "@/lib/connectors/jsonld";
import { matchesFilters } from "@/lib/filtering";
import { deterministicHash } from "@/lib/hash";
import { fetchWithRetry } from "@/lib/http";
import type { ContractType, JobSearchFilters, JobSource, NormalizedJob } from "@/lib/types";
import type { UrlRadarConfig } from "@/lib/url-radar-config";
import { cloneUrlRadarFilters, sanitizeUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";
import { canonicalUrl, decodeHtmlEntities, normalizeText, parseContractType } from "@/lib/utils";
import { canUseCloudflareForUrl, fetchRenderedHtmlViaCloudflare, fetchRenderedHtmlViaCloudflareCrawl } from "@/lib/cloudflare-browser-rendering";
import { inferSourceFromUrl } from "@/lib/url-radar-sources";

type RunStatus = "SUCCESS" | "PARTIAL" | "FAILED";
type AttemptStatus = "success" | "empty" | "error" | "skipped";

export interface StrategyAttempt {
  method: string;
  status: AttemptStatus;
  parsed: number;
  visible: number;
  qualityScore?: number;
  note?: string;
}

interface ScrapeResult {
  jobs: NormalizedJob[];
  errors: string[];
  attempts: StrategyAttempt[];
  selectedMethod?: string | null;
}

export interface UrlRadarJob {
  id: string;
  source: JobSource;
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  contractType: ContractType;
  url: string;
  postedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  scrapedAt: string;
  matchedKeywords: string[];
  excludedReason: string | null;
  excludedKeywords: string[];
  viewed: boolean;
  saved: boolean;
  experienceHint: string | null;
  metadataText: string | null;
}

export interface UrlRadarRun {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  newCount: number;
  error: string | null;
  summary: Record<string, { parsed: number; visible: number; errors: string[]; attempts: StrategyAttempt[]; selectedMethod: string | null }>;
}

interface UrlRadarState {
  jobs: UrlRadarJob[];
  runs: UrlRadarRun[];
}

const FILE_PATH = path.join(process.cwd(), "data", "url-radar-state.json");
const BACKUP_FILE_PATH = path.join(process.cwd(), "data", "url-radar-state.backup.json");

const EMPTY_STATE: UrlRadarState = {
  jobs: [],
  runs: []
};

function getUrlRadarFilters(config?: Pick<UrlRadarConfig, "filters"> | null): JobSearchFilters {
  return sanitizeUrlRadarFilters(config?.filters ?? URL_RADAR_DEFAULT_FILTERS);
}

function countVisibleMatches(jobs: NormalizedJob[]): number {
  const filters = cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS);
  return jobs.reduce((count, job) => count + (matchesFilters(job, filters).excludedReason === null ? 1 : 0), 0);
}

function titleLooksClean(title: string): boolean {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  if (normalized.length > 140) return false;
  if (normalized.split(/\s+/).length > 18) return false;
  if (/\b(cdi|cdd|alternance|stage|teletravail|salaire|brut annuel)\b/.test(normalized)) return false;
  return true;
}

function companyLooksClean(company: string): boolean {
  const normalized = normalizeText(company);
  if (!normalized) return false;
  if (/\./.test(company) && !/\s/.test(company)) return false;
  if (/^(linkedin|wttj|hellowork|apec|indeed|choisirleservicepublic)\b/.test(normalized)) return false;
  return true;
}

function locationLooksSpecific(location: string): boolean {
  const normalized = normalizeText(location);
  return Boolean(normalized) && !/^(france|remote|full remote)$/.test(normalized);
}

function scoreJobsQuality(jobs: NormalizedJob[]): { visible: number; score: number; note: string } {
  if (jobs.length === 0) {
    return { visible: 0, score: 0, note: "aucune offre" };
  }

  const visible = countVisibleMatches(jobs);
  const cleanTitles = jobs.filter((job) => titleLooksClean(job.title)).length;
  const cleanCompanies = jobs.filter((job) => companyLooksClean(job.company)).length;
  const cleanLocations = jobs.filter((job) => locationLooksSpecific(job.location)).length;
  const withPostedAt = jobs.filter((job) => Number.isFinite(job.postedAt.getTime())).length;

  const visibleRatio = visible / jobs.length;
  const cleanTitleRatio = cleanTitles / jobs.length;
  const cleanCompanyRatio = cleanCompanies / jobs.length;
  const cleanLocationRatio = cleanLocations / jobs.length;
  const postedRatio = withPostedAt / jobs.length;

  const score =
    visible * 10 +
    Math.min(jobs.length, 20) +
    cleanTitleRatio * 20 +
    cleanCompanyRatio * 15 +
    cleanLocationRatio * 10 +
    postedRatio * 5;

  const parts = [
    `${visible} visibles`,
    `${cleanTitles}/${jobs.length} titres propres`,
    `${cleanCompanies}/${jobs.length} entreprises plausibles`
  ];
  if (cleanLocations > 0) {
    parts.push(`${cleanLocations}/${jobs.length} lieux precis`);
  }

  return { visible, score: Math.round(score * 10) / 10, note: parts.join(" | ") };
}

function buildSuccessAttempt(method: string, jobs: NormalizedJob[], note?: string): StrategyAttempt {
  const quality = scoreJobsQuality(jobs);
  return {
    method,
    status: jobs.length > 0 ? "success" : "empty",
    parsed: jobs.length,
    visible: quality.visible,
    qualityScore: quality.score,
    note: note ? `${quality.note} | ${note}` : quality.note
  };
}

function buildFailureAttempt(method: string, status: AttemptStatus, note?: string): StrategyAttempt {
  return {
    method,
    status,
    parsed: 0,
    visible: 0,
    qualityScore: 0,
    note
  };
}

function chooseBestResult(candidates: Array<{ method: string; jobs: NormalizedJob[]; errors?: string[]; note?: string }>): ScrapeResult {
  const attempts = candidates.map((candidate) =>
    candidate.jobs.length > 0 ? buildSuccessAttempt(candidate.method, candidate.jobs, candidate.note) : buildFailureAttempt(candidate.method, "empty", candidate.note)
  );
  const ranked = candidates
    .filter((candidate) => candidate.jobs.length > 0)
    .map((candidate) => ({
      ...candidate,
      quality: scoreJobsQuality(candidate.jobs)
    }))
    .sort((a, b) => b.quality.score - a.quality.score);

  const best = ranked[0];
  return {
    jobs: best?.jobs ?? [],
    errors: candidates.flatMap((candidate) => candidate.errors ?? []),
    attempts,
    selectedMethod: best?.method ?? null
  };
}

function isSatisfactory(jobs: NormalizedJob[]): boolean {
  const quality = scoreJobsQuality(jobs);
  return quality.visible > 0 || quality.score >= 28;
}

function inferSource(url: string): JobSource {
  return inferSourceFromUrl(url);
}

function inferLocationFromTarget(targetUrl: string, linkText: string): string {
  const text = normalizeText(linkText);
  if (/paris|ile de france|\bidf\b/.test(text)) return "Ile-de-France";

  const normalizedTarget = decodeURIComponent(targetUrl).toLowerCase();
  if (/choisirleservicepublic\.gouv\.fr/.test(normalizedTarget) && /\/localisation\/208\/?/.test(normalizedTarget)) {
    return "Ile-de-France";
  }
  if (/paris|ile-de-france|\bidf\b/.test(normalizedTarget)) return "Ile-de-France";

  return "France";
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isCallToActionTitle(input: string): boolean {
  const normalized = normalizeText(input);
  return /^(voir l offre( d origine)?|postuler|voir l offre \/ postuler|open job|apply|apply now|details?|en savoir plus|learn more)$/.test(normalized);
}

function cleanIndeedTitle(input: string): string {
  const decoded = decodeHtmlEntities(input).replace(/\s+/g, " ").trim();
  if (!decoded) return "";

  let cleaned = decoded
    .replace(/\s*[»]\s*/g, " ")
    .split(/Rechercher les salaires\s*:|Voir toutes les offres de type|Voir toutes les offres|Emploi\s+[A-Z0-9&' -]+/i)[0]
    .trim();

  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[|/-]\s*$/, "")
    .trim();

  return cleaned;
}

function cleanIndeedMetadataText(input: string): string {
  const decoded = decodeHtmlEntities(input).replace(/\s+/g, " ").trim();
  return decoded
    .replace(/Rechercher les salaires\s*:[^.\n\r|]*/i, "")
    .replace(/Voir toutes les offres de type.*$/i, "")
    .replace(/\s*[»]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isIndeedNoiseTitle(input: string): boolean {
  const normalized = normalizeText(input);
  return (
    !normalized ||
    /rechercher les salaires|voir toutes les offres|emploi [a-z]/i.test(normalized) ||
    /^rechercher\b/.test(normalized)
  );
}

function isIndeedJobHref(input: string): boolean {
  try {
    const url = new URL(input);
    return url.hostname.includes("indeed.") && (/^\/viewjob$/i.test(url.pathname) || /^\/rc\/clk$/i.test(url.pathname));
  } catch {
    return false;
  }
}

function buildIndeedJobUrl(rawHref: string, sourceJobId: string): string {
  const canonical = canonicalUrl(rawHref);
  if (/indeed\.[^/]+\/(?:rc\/clk|viewjob)$/i.test(canonical) && sourceJobId && !sourceJobId.startsWith("http")) {
    return `https://fr.indeed.com/viewjob?jk=${encodeURIComponent(sourceJobId)}`;
  }
  return canonical;
}

function toAbsolute(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseExperienceHint(input: string): string | null {
  const normalized = normalizeText(input);
  const yearsMatch = /(\d{1,2})\s*(?:\+|plus)?\s*(?:ans|an|years|year)/i.exec(normalized);
  if (yearsMatch?.[1]) {
    const suffix = /\+|plus/.test(yearsMatch[0]) ? "+" : "";
    return `${yearsMatch[1]}${suffix} ans`;
  }

  if (/0\s*[\-a]\s*1/.test(normalized)) return "0-1 an";
  if (/1\s*[\-a]\s*3/.test(normalized)) return "1-3 ans";
  if (/3\s*[\-a]\s*5/.test(normalized)) return "3-5 ans";
  if (/junior|entry level|debutant|debutante|debut/.test(normalized)) return "Junior";
  if (/confirmed|confirme|mid level|intermediate/.test(normalized)) return "Confirme";
  return null;
}

function parsePostedAtFromText(input: string): Date | null {
  const normalized = normalizeText(input);
  const now = new Date();

  let match = /il y a\s+(\d+)\s+minute/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 60 * 1000);

  if (normalized.includes("avant hier")) {
    return new Date(now.getTime() - 48 * 60 * 60 * 1000);
  }
  if (normalized.includes("hier")) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (/today|aujourd hui/.test(normalized)) {
    return now;
  }

  match = /il y a\s+(\d+)\s+heure/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 60 * 60 * 1000);

  match = /il y a\s+(\d+)\s+jour/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 24 * 60 * 60 * 1000);

  match = /il y a\s+(\d+)\s+semaine/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 7 * 24 * 60 * 60 * 1000);

  match = /il y a\s+(\d+)\s+mois/.exec(normalized);
  if (match?.[1]) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - Number(match[1]));
    return date;
  }

  match = /posted\s+(\d+)\s+hour/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 60 * 60 * 1000);

  match = /posted\s+(\d+)\s+day/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 24 * 60 * 60 * 1000);

  match = /posted\s+(\d+)\s+week/.exec(normalized);
  if (match?.[1]) return new Date(now.getTime() - Number(match[1]) * 7 * 24 * 60 * 60 * 1000);

  match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(normalized);
  if (match?.[1] && match?.[2] && match?.[3]) {
    const [, day, month, year] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  }

  return null;
}

function isLinkedinReposted(input: string): boolean {
  const normalized = normalizeText(input);
  return /reposted|republie|re publie|re-publie/.test(normalized);
}

function chooseBestPostedAt(source: JobSource, providedPostedAt: Date | null, parsedPostedAt: Date | null): Date {
  if (providedPostedAt && !parsedPostedAt) return providedPostedAt;
  if (!providedPostedAt && parsedPostedAt) return parsedPostedAt;
  if (!providedPostedAt && !parsedPostedAt) return new Date();

  const provided = providedPostedAt as Date;
  const parsed = parsedPostedAt as Date;
  const deltaMs = Math.abs(provided.getTime() - parsed.getTime());
  const parsedIsMeaningfullyOld = Math.abs(Date.now() - parsed.getTime()) >= 60 * 60 * 1000;

  if (deltaMs > 12 * 60 * 60 * 1000 && parsedIsMeaningfullyOld) {
    return parsed;
  }

  if (source === "linkedin") {
    return provided;
  }

  return provided.getTime() <= parsed.getTime() ? provided : parsed;
}

function withMetadata(job: Omit<NormalizedJob, "postedAt"> & { postedAt?: Date | null }, metadataText: string): NormalizedJob {
  const parsedPostedAt = parsePostedAtFromText(metadataText);
  const providedPostedAt = job.postedAt && Number.isFinite(job.postedAt.getTime()) ? job.postedAt : null;

  return {
    ...job,
    postedAt: chooseBestPostedAt(job.source, providedPostedAt, parsedPostedAt),
    experienceHint: parseExperienceHint(`${job.title} ${metadataText}`),
    metadataText
  };
}

function extractLinkedinJobsFromHtml(html: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const blocks = html.split("<li").slice(1);

  for (const block of blocks) {
    const blockText = stripHtml(block);
    if (isLinkedinReposted(blockText)) continue;

    const title =
      /base-search-card__title[^>]*>\s*([^<]+)\s*</i.exec(block)?.[1]?.trim() ||
      /aria-label="([^"]+)"/i.exec(block)?.[1]?.trim();
    const company =
      /base-search-card__subtitle[^>]*>\s*<a[^>]*>\s*([^<]+)\s*</i.exec(block)?.[1]?.trim() ||
      /base-search-card__subtitle[^>]*>\s*([^<]+)\s*</i.exec(block)?.[1]?.trim() ||
      "LinkedIn";
    const location = /job-search-card__location[^>]*>\s*([^<]+)\s*</i.exec(block)?.[1]?.trim() || "Ile-de-France";
    const rawUrl =
      /<a[^>]+href="([^"]*linkedin\.com\/jobs\/view\/[^"]+)"/i.exec(block)?.[1]?.trim() ||
      /<a[^>]+href="([^"]+)"[^>]*base-card__full-link/i.exec(block)?.[1]?.trim();

    if (!title || !rawUrl) continue;

    const url = canonicalUrl(rawUrl.replace(/&amp;/g, "&"));
    const sourceJobId = /\/view\/(\d+)/.exec(url)?.[1] || deterministicHash(url);
    const postedRaw = /time[^>]+datetime="([^"]+)"/i.exec(block)?.[1];

    jobs.push(
      withMetadata(
        {
          source: "linkedin",
          sourceJobId,
          title,
          company,
          location,
          contractType: parseContractType(blockText),
          url,
          postedAt: postedRaw ? new Date(postedRaw) : null
        },
        blockText
      )
    );
  }

  return jobs;
}

function extractJsonFromNextData(html: string): unknown | null {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractWttjJobsFromNextData(data: any): NormalizedJob[] {
  const posts =
    data?.props?.pageProps?.searchJobs?.jobs ??
    data?.props?.pageProps?.jobs ??
    data?.props?.pageProps?.dehydratedState?.queries?.flatMap((q: any) => q?.state?.data?.jobs ?? []) ??
    [];

  if (!Array.isArray(posts)) return [];

  return posts
    .map((job: any) => {
      const id = String(job.id ?? job.reference ?? "");
      const slug = job.slug ? `/fr/companies/${job.organization?.slug ?? "unknown"}/jobs/${job.slug}` : "";
      const url = job.url ?? (slug ? `https://www.welcometothejungle.com${slug}` : "");
      const title = job.name ?? job.title ?? "";
      const company = job.organization?.name ?? job.company_name ?? "";
      const location = job.office?.city ?? job.location?.city ?? job.location?.name ?? job.office?.name ?? "France";
      const contractLabel = job.contract_type?.name ?? job.contract_type ?? "";
      const published = job.published_at ?? job.created_at;
      const metadataText = [title, company, location, contractLabel, job.experience_level_minimum].filter(Boolean).join(" ");

      if (!id || !title || !company || !url) return null;

      return withMetadata(
        {
          source: "wttj",
          sourceJobId: id,
          title,
          company,
          location,
          contractType: parseContractType(contractLabel),
          url: canonicalUrl(url),
          postedAt: published ? new Date(published) : null
        },
        metadataText
      );
    })
    .filter(Boolean) as NormalizedJob[];
}

function extractWttjJobsFromJsonLd(html: string): NormalizedJob[] {
  return extractJobPostingJsonLd(html).flatMap((item) => {
    const job = mapJsonLdToJob("wttj", "https://www.welcometothejungle.com/fr/jobs", item);
    if (!job) return [];
    return [withMetadata(job, `${job.title} ${job.company} ${job.location}`)];
  });
}

function extractGenericJobsFromJsonLd(html: string, targetUrl: string): NormalizedJob[] {
  const source = inferSource(targetUrl);
  return extractJobPostingJsonLd(html).flatMap((item) => {
    const job = mapJsonLdToJob(source, targetUrl, item);
    if (!job) return [];
    return [withMetadata(job, `${job.title} ${job.company} ${job.location}`)];
  });
}

function prettifySlug(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\b(h f|f h|m f mx|m f|mx)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWttjJobsFromAnchors(html: string, targetUrl: string): NormalizedJob[] {
  const matches = Array.from(
    html.matchAll(/href=["'](\/fr\/companies\/([^"'\/]+)\/jobs\/([^"'?#]+))[^"']*["']/gi)
  );
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];

  for (const match of matches) {
    const relativeUrl = match[1];
    const companySlug = match[2] ?? "";
    const jobSlug = match[3] ?? "";
    const absoluteUrl = canonicalUrl(`https://www.welcometothejungle.com${relativeUrl}`);

    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);

    const index = match.index ?? 0;
    const start = Math.max(0, index - 1800);
    const end = Math.min(html.length, index + 3000);
    const contextText = stripHtml(html.slice(start, end));

    let title = prettifySlug(jobSlug);
    title = title.replace(/\b(paris|lyon|bordeaux|toulon|gennevilliers|rennes|etterbeek|ris orangis|boulogne billancourt|cesson sevigne)\b$/i, "").trim();

    if (!title) continue;

    jobs.push(
      withMetadata(
        {
          source: "wttj",
          sourceJobId: jobSlug || deterministicHash(absoluteUrl),
          title,
          company: prettifySlug(companySlug) || "wttj",
          location: inferLocationFromTarget(targetUrl, `${contextText} ${jobSlug}`),
          contractType: parseContractType(contextText),
          url: absoluteUrl,
          postedAt: null
        },
        contextText
      )
    );
  }

  return jobs;
}

async function scrapeWttjWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);

      const rawJobs = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href*="/fr/companies/"][href*="/jobs/"]')
        );

        return anchors.map((anchor) => {
          const href = anchor.href;
          const article = anchor.closest("article");
          const container = article ?? anchor.parentElement ?? anchor;
          const text = (container.textContent || anchor.textContent || "").replace(/\s+/g, " ").trim();
          return { href, text };
        });
      });

      const jobs: NormalizedJob[] = [];
      const seen = new Set<string>();

      for (const item of rawJobs) {
        const href = canonicalUrl(item.href);
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const parsed = /\/fr\/companies\/([^/]+)\/jobs\/([^/?#]+)/i.exec(href);
        if (!parsed) continue;

        const companySlug = parsed[1] ?? "";
        const jobSlug = parsed[2] ?? "";
        const title = prettifySlug(jobSlug)
          .replace(
            /\b(paris|lyon|bordeaux|toulon|gennevilliers|rennes|etterbeek|ris orangis|boulogne billancourt|cesson sevigne)\b$/i,
            ""
          )
          .trim();

        if (!title) continue;

        jobs.push(
          withMetadata(
            {
              source: "wttj",
              sourceJobId: jobSlug || deterministicHash(href),
              title,
              company: prettifySlug(companySlug) || "wttj",
              location: inferLocationFromTarget(targetUrl, `${item.text} ${jobSlug}`),
              contractType: parseContractType(item.text),
              url: href,
              postedAt: null
            },
            item.text
          )
        );
      }

      if (jobs.length === 0) {
        return {
          jobs: [],
          errors: ["Playwright opened WTTJ but found no job cards"],
          attempts: [buildFailureAttempt("wttj_playwright", "empty", "browser rendered but no cards found")],
          selectedMethod: null
        };
      }

      return {
        jobs,
        errors: ["WTTJ Playwright fallback used"],
        attempts: [buildSuccessAttempt("wttj_playwright", jobs, "browser fallback")],
        selectedMethod: "wttj_playwright"
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "WTTJ Playwright failed"],
      attempts: [buildFailureAttempt("wttj_playwright", "error", error instanceof Error ? error.message : "WTTJ Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeLinkedinSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const params = new URL(targetUrl).searchParams;
  const keywords = params.get("keywords") ?? "Product Designer OR UX Designer OR UX/UI Designer OR Interaction Designer";
  const location = params.get("location");
  const geoId = params.get("geoId");
  const fTPR = params.get("f_TPR") ?? "r604800";

  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];

  for (let pageNum = 0; pageNum < 5; pageNum += 1) {
    const guest = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
    guest.searchParams.set("keywords", keywords);
    if (location) guest.searchParams.set("location", location);
    if (geoId) guest.searchParams.set("geoId", geoId);
    guest.searchParams.set("f_TPR", fTPR);
    guest.searchParams.set("position", "1");
    guest.searchParams.set("pageNum", String(pageNum));

    try {
      const response = await fetchWithRetry(guest.toString(), {}, { retries: 1, timeoutMs: 12000, initialDelayMs: 400 });
      const html = await response.text();
      const pageJobs = extractLinkedinJobsFromHtml(html);
      jobs.push(...pageJobs);
      if (pageJobs.length === 0 && pageNum > 0) break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "LinkedIn fetch failed");
    }
  }

  const deduped = Array.from(new Map(jobs.map((job) => [job.sourceJobId, job])).values());
  return {
    jobs: deduped,
    errors,
    attempts: [deduped.length > 0 ? buildSuccessAttempt("linkedin_guest_api", deduped, errors[0]) : buildFailureAttempt("linkedin_guest_api", errors.length > 0 ? "error" : "empty", errors[0])],
    selectedMethod: deduped.length > 0 ? "linkedin_guest_api" : null
  };
}

async function scrapeIndeedWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        locale: "fr-FR"
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      const rawJobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-jk], [data-testid*="job"], .job_seen_beacon, [class*="job_seen"]')).slice(0, 80);
        return cards
          .map((card) => {
            const anchor =
              card.querySelector<HTMLAnchorElement>('a[href*="/viewjob"]') ||
              card.querySelector<HTMLAnchorElement>('a[data-jk]') ||
              card.querySelector<HTMLAnchorElement>("a[href]");
            if (!anchor?.href) return null;

            const titleNode =
              card.querySelector<HTMLElement>('[data-testid="jobTitle"]') ||
              card.querySelector<HTMLElement>("h2") ||
              anchor;
            const companyNode =
              card.querySelector<HTMLElement>('[data-testid="company-name"]') ||
              card.querySelector<HTMLElement>("[data-testid='companyName']") ||
              card.querySelector<HTMLElement>("[class*='company']");
            const locationNode =
              card.querySelector<HTMLElement>('[data-testid="text-location"]') ||
              card.querySelector<HTMLElement>("[data-testid='job-location']") ||
              card.querySelector<HTMLElement>("[class*='location']");
            const metaText = (card.textContent || "").replace(/\s+/g, " ").trim();

            return {
              href: anchor.href,
              jk: card.getAttribute("data-jk") || anchor.getAttribute("data-jk") || "",
              title: (titleNode?.textContent || anchor.textContent || "").replace(/\s+/g, " ").trim(),
              company: (companyNode?.textContent || "").replace(/\s+/g, " ").trim(),
              location: (locationNode?.textContent || "").replace(/\s+/g, " ").trim(),
              text: metaText
            };
          })
          .filter(Boolean) as Array<{ href: string; jk: string; title: string; company: string; location: string; text: string }>;
      });

      const jobs = rawJobs
        .map((item) => {
          const title = cleanIndeedTitle(item.title);
          const metadataText = cleanIndeedMetadataText(item.text);
          const company = decodeHtmlEntities(item.company || "").replace(/\s+/g, " ").trim() || "Indeed";
          const location = decodeHtmlEntities(item.location || "").replace(/\s+/g, " ").trim();
          const sourceJobId =
            item.jk ||
            /[?&]jk=([^&]+)/i.exec(item.href)?.[1] ||
            /[?&]vjk=([^&]+)/i.exec(item.href)?.[1] ||
            /viewjob\?jk=([^&]+)/i.exec(item.href)?.[1] ||
            deterministicHash(item.href);

          return {
            ...item,
            sourceJobId,
            title,
            company,
            location,
            metadataText,
            normalizedUrl: buildIndeedJobUrl(item.href, sourceJobId)
          };
        })
        .filter(
          (item) =>
            item.title &&
            item.href &&
            isIndeedJobHref(item.href) &&
            !isCallToActionTitle(item.title) &&
            !isIndeedNoiseTitle(item.title)
        )
        .map((item) =>
          withMetadata(
            {
              source: "indeed",
              sourceJobId: item.sourceJobId,
              title: item.title,
              company: item.company,
              location: item.location || inferLocationFromTarget(targetUrl, item.metadataText),
              contractType: parseContractType(item.metadataText),
              url: item.normalizedUrl,
              postedAt: null
            },
            item.metadataText
          )
        );

      const deduped = Array.from(new Map(jobs.map((job) => [job.sourceJobId, job])).values());
      if (deduped.length === 0) {
        return {
          jobs: [],
          errors: ["Indeed Playwright opened the page but found no job cards"],
          attempts: [buildFailureAttempt("indeed_playwright", "empty", "browser rendered but no cards found")],
          selectedMethod: null
        };
      }

      return {
        jobs: deduped,
        errors: ["Indeed Playwright fallback used"],
        attempts: [buildSuccessAttempt("indeed_playwright", deduped, "browser parsing")],
        selectedMethod: "indeed_playwright"
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Indeed Playwright failed"],
      attempts: [buildFailureAttempt("indeed_playwright", "error", error instanceof Error ? error.message : "Indeed Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeIndeedSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const playwrightResult = await scrapeIndeedWithPlaywright(targetUrl);
  if (isSatisfactory(playwrightResult.jobs)) {
    return playwrightResult;
  }

  const genericResult = await scrapeGenericSearchUrl(targetUrl);
  const chosen = chooseBestResult([
    { method: "indeed_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser parsing" },
    { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
  ]);

  return chosen.jobs.length > 0
    ? chosen
    : {
        jobs: genericResult.jobs,
        errors: [...playwrightResult.errors, ...genericResult.errors],
        attempts: [...playwrightResult.attempts, ...genericResult.attempts],
        selectedMethod: genericResult.selectedMethod
      };
}

async function fetchHtmlWithBestEffort(targetUrl: string): Promise<{ html: string; errors: string[] }> {
  const errors: string[] = [];

  if (canUseCloudflareForUrl(targetUrl)) {
    try {
      const renderedHtml = await fetchRenderedHtmlViaCloudflare(targetUrl);
      if (renderedHtml) {
        return { html: renderedHtml, errors };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Cloudflare content failed");
    }

    try {
      const crawledHtml = await fetchRenderedHtmlViaCloudflareCrawl(targetUrl);
      if (crawledHtml) {
        return { html: crawledHtml, errors };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Cloudflare crawl failed");
    }
  }

  const response = await fetchWithRetry(targetUrl, {}, { retries: 1, timeoutMs: 12000, initialDelayMs: 400 });
  return {
    html: await response.text(),
    errors
  };
}
function extractApecCompanyAndTitle(text: string): { company: string; title: string } {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const titlePattern =
    /(ux\s*\/\s*ui\s+designer|ui\s*\/\s*ux\s+designer|ux\s+designer|product\s+designer|interaction\s+designer|ux\s+writer|content\s+designer|ux\s+researcher|ergonome\s+ux\/?ui\s+designer|designer\s+ux\s*\/\s*ui|designer\s+ux)/i;
  const titleStart = cleaned.search(titlePattern);
  if (titleStart === -1) {
    return { company: 'apec.fr', title: cleaned.slice(0, 140).trim() };
  }

  const company = cleaned.slice(0, titleStart).trim() || 'apec.fr';
  let titleTail = cleaned.slice(titleStart).trim();
  const endMatch = titleTail.match(/^(.*?(?:f\/h|h\/f))/i);
  if (endMatch?.[1]) {
    titleTail = endMatch[1].trim();
  } else {
    titleTail = titleTail.split(/A partir de|A n?gocier|\d{2}\/\d{2}\/\d{4}/i)[0].trim();
  }

  return { company, title: titleTail };
}

function extractApecLocation(text: string): string {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const locationMatch = cleaned.match(/(Paris\s+\d{2}\s*-\s*75|[\p{L}' -]+\s*-\s*(75|77|78|91|92|93|94|95))/iu);
  if (locationMatch?.[1]) {
    return locationMatch[1].trim();
  }
  return inferLocationFromTarget('https://www.apec.fr', cleaned);
}

function extractAdzunaCompanyAndTitle(text: string): { company: string; title: string } {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const titlePattern =
    /(ux\s*\/\s*ui\s+designer|ui\s+designer|ux\s+designer|product\s+designer|interaction\s+designer|ux\s+writer|content\s+designer|ux\s+researcher|ergonome\s+ihm|designer\s+ux\s*\/\s*ui|designer\s+ux|product\s+design)/i;
  const titleStart = cleaned.search(titlePattern);

  if (titleStart === -1) {
    return { company: "adzuna.fr", title: cleaned.slice(0, 120).trim() };
  }

  const titleTail = cleaned.slice(titleStart).trim();
  const title = titleTail.split(/(?:\.\.\.|voir l'annonce|cdi|cdd|interim|freelance|\d{5}|\d{2}\/\d{2}\/\d{4})/i)[0].trim();
  const companyChunk = cleaned.slice(0, titleStart).trim();
  const company = companyChunk.split(/\s{2,}| - | \| /)[0].trim() || "adzuna.fr";
  return { company, title };
}

function extractGenericCompanyAndTitle(text: string, fallbackTitle: string, fallbackCompany: string): { company: string; title: string } {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const fallback = decodeHtmlEntities(fallbackTitle).replace(/\s+/g, " ").trim();
  const titlePattern =
    /(ux\s*\/\s*ui\s+designer|ui\s+designer|ux\s+designer|product\s+designer|interaction\s+designer|ux\s+writer|content\s+designer|ux\s+researcher|ergonome\s+ihm|designer\s+ux\s*\/\s*ui|designer\s+ux|product\s+design)/i;
  const titleStart = cleaned.search(titlePattern);

  if (titleStart >= 0) {
    let title = cleaned.slice(titleStart).trim();
    title = title.split(/(?:\.\.\.|voir l'offre|voir l offre|postuler|open job|apply|cdi|cdd|alternance|stage|freelance|interim|\d{2}\/\d{2}\/\d{4})/i)[0].trim();
    const companyPrefix = cleaned.slice(0, titleStart).trim();
    const company = companyPrefix.split(/\s{2,}| - | \| /)[0].trim() || fallbackCompany;
    return { company, title: title || fallback || cleaned.slice(0, 120).trim() };
  }

  if (fallback && !isCallToActionTitle(fallback) && titleLooksClean(fallback)) {
    return { company: fallbackCompany, title: fallback };
  }

  return { company: fallbackCompany, title: cleaned.slice(0, 120).trim() || fallback || "Offre" };
}

function titleFromUrlSlug(detailUrl: string): string {
  try {
    const url = new URL(detailUrl);
    const raw = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return prettifySlug(raw).replace(/^\-+/, "").trim();
  } catch {
    return "";
  }
}

function extractMetaTagContent(html: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyMatch = new RegExp(
    `<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`,
    "i"
  ).exec(html);
  if (propertyMatch?.[1]) return decodeHtmlEntities(propertyMatch[1]).trim();

  const nameMatch = new RegExp(
    `<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["']`,
    "i"
  ).exec(html);
  if (nameMatch?.[1]) return decodeHtmlEntities(nameMatch[1]).trim();

  return null;
}

function extractFirstHeadingText(html: string): string | null {
  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  if (!heading) return null;
  const text = stripHtml(heading);
  return text || null;
}

function extractBusinessFranceCompanyAndTitle(text: string): { company: string; title: string } {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const titlePattern =
    /(ux\s*\/\s*ui\s+designer|ui\s*\/\s*ux\s+designer|ux\s+designer|product\s+designer|interaction\s+designer|ux\s+writer|content\s+designer|ux\s+researcher|ergonome\s+ihm|designer\s+ux\s*\/\s*ui|designer\s+ux|product\s+design)/i;
  const titleStart = cleaned.search(titlePattern);

  if (titleStart === -1) {
    return { company: "VIE", title: cleaned.slice(0, 140).trim() };
  }

  const company = cleaned
    .slice(0, titleStart)
    .split(/Descriptif du poste|Missions?|A propos|Profil recherché/i)[0]
    .trim() || "VIE";
  let title = cleaned.slice(titleStart).trim();
  title = title
    .split(/Descriptif du poste|Missions?|A propos|Profil recherché|Nous recherchons/i)[0]
    .replace(/\s{2,}/g, " ")
    .trim();

  return { company, title: title.slice(0, 160).trim() };
}

function extractBusinessFranceLocation(text: string): string {
  const cleaned = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
  const titleLocation = cleaned.match(/\b(?:H\/F|F\/H)\)?\s+([A-ZÀ-ÖØ-öø-ÿ' -]+(?:\s*-\s*[A-ZÀ-ÖØ-öø-ÿ' -]+)?)/u);
  if (titleLocation?.[1]) {
    return titleLocation[1].trim();
  }

  const countryMatch = cleaned.match(/\b([A-ZÀ-ÖØ-öø-ÿ' -]+)\s*-\s*([A-ZÀ-ÖØ-öø-ÿ' -]+)\b/u);
  if (countryMatch?.[0]) {
    return countryMatch[0].trim();
  }

  return "International";
}

function extractBusinessFranceOfferUrlsFromHtml(html: string): string[] {
  const ids = Array.from(
    new Set(
      Array.from(html.matchAll(/(?:\\\/|\/)offres(?:\\\/|\/)(\d{4,})/g)).map((match) => match[1]).filter(Boolean)
    )
  );

  return ids.map((id) => `https://mon-vie-via.businessfrance.fr/offres/${id}`);
}

function extractFreeWorkOfferUrlsFromHtml(html: string): string[] {
  return Array.from(
    new Set(
      Array.from(
        html.matchAll(/\/fr\/tech-it\/[^"'?\s<]+\/(?:job-mission|job)\/[^"'?\s<]+/gi)
      ).map((match) => canonicalUrl(`https://www.free-work.com${match[0]}`))
    )
  );
}

function parseDetailPageFromJsonLd(detailUrl: string, html: string): NormalizedJob | null {
  const jobs = extractGenericJobsFromJsonLd(html, detailUrl);
  return jobs[0] ?? null;
}

function parseBusinessFranceDetailPage(detailUrl: string, html: string): NormalizedJob | null {
  const fromJsonLd = parseDetailPageFromJsonLd(detailUrl, html);
  if (fromJsonLd) {
    return withMetadata(
      {
        ...fromJsonLd,
        source: "career_sites",
        sourceJobId: /\/offres\/(\d+)/i.exec(detailUrl)?.[1] ?? fromJsonLd.sourceJobId,
        location: fromJsonLd.location || "International",
        url: canonicalUrl(detailUrl)
      },
      fromJsonLd.metadataText ?? stripHtml(html)
    );
  }

  const rawText = stripHtml(html);
  const heading = extractFirstHeadingText(html);
  const metaTitle = extractMetaTagContent(html, "og:title") ?? extractMetaTagContent(html, "twitter:title");
  const { company, title } = extractBusinessFranceCompanyAndTitle([heading, metaTitle, rawText].filter(Boolean).join(" "));
  const cleanedTitle = title.replace(/\s{2,}/g, " ").trim();
  if (!cleanedTitle || isCallToActionTitle(cleanedTitle)) return null;

  return withMetadata(
    {
      source: "career_sites",
      sourceJobId: /\/offres\/(\d+)/i.exec(detailUrl)?.[1] ?? deterministicHash(detailUrl),
      title: cleanedTitle,
      company,
      location: extractBusinessFranceLocation(rawText),
      contractType: parseContractType(rawText),
      url: canonicalUrl(detailUrl),
      postedAt: null
    },
    rawText
  );
}

function parseLicorneSocietyDetailPage(detailUrl: string, html: string): NormalizedJob | null {
  const fromJsonLd = parseDetailPageFromJsonLd(detailUrl, html);
  if (fromJsonLd) {
    return withMetadata(
      {
        ...fromJsonLd,
        source: "licorne_society",
        sourceJobId: deterministicHash(detailUrl),
        url: canonicalUrl(detailUrl)
      },
      fromJsonLd.metadataText ?? stripHtml(html)
    );
  }

  const rawText = stripHtml(html);
  const title =
    extractMetaTagContent(html, "og:title") ??
    extractMetaTagContent(html, "twitter:title") ??
    extractFirstHeadingText(html) ??
    titleFromUrlSlug(detailUrl);
  const cleanedTitle = decodeHtmlEntities(title).replace(/\s+/g, " ").trim();
  if (!cleanedTitle || isCallToActionTitle(cleanedTitle)) return null;

  return withMetadata(
    {
      source: "licorne_society",
      sourceJobId: deterministicHash(detailUrl),
      title: cleanedTitle,
      company: "Licorne Society",
      location: inferLocationFromTarget(detailUrl, rawText),
      contractType: parseContractType(rawText),
      url: canonicalUrl(detailUrl),
      postedAt: null
    },
    rawText
  );
}

function parseFreeWorkDetailPage(detailUrl: string, html: string): NormalizedJob | null {
  const fromJsonLd = parseDetailPageFromJsonLd(detailUrl, html);
  if (fromJsonLd) {
    return withMetadata(
      {
        ...fromJsonLd,
        source: "career_sites",
        sourceJobId: deterministicHash(detailUrl),
        url: canonicalUrl(detailUrl)
      },
      fromJsonLd.metadataText ?? stripHtml(html)
    );
  }

  const rawText = stripHtml(html);
  const title =
    extractMetaTagContent(html, "og:title") ??
    extractMetaTagContent(html, "twitter:title") ??
    extractFirstHeadingText(html) ??
    titleFromUrlSlug(detailUrl);
  const cleanedTitle = decodeHtmlEntities(title)
    .replace(/\s*-\s*Free-Work.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanedTitle || isCallToActionTitle(cleanedTitle)) return null;

  return withMetadata(
    {
      source: "career_sites",
      sourceJobId: deterministicHash(detailUrl),
      title: cleanedTitle,
      company: extractMetaTagContent(html, "og:site_name") ?? "Free-Work",
      location: inferLocationFromTarget(detailUrl, rawText),
      contractType: parseContractType(rawText),
      url: canonicalUrl(detailUrl),
      postedAt: null
    },
    rawText
  );
}

async function hydrateDetailUrls(
  detailUrls: string[],
  parseDetailPage: (detailUrl: string, html: string) => NormalizedJob | null
): Promise<{ jobs: NormalizedJob[]; errors: string[] }> {
  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const detailUrl of detailUrls.slice(0, 36)) {
    const canonicalDetailUrl = canonicalUrl(detailUrl);
    if (!canonicalDetailUrl || seen.has(canonicalDetailUrl)) continue;
    seen.add(canonicalDetailUrl);

    try {
      const response = await fetchWithRetry(canonicalDetailUrl, {}, { retries: 1, timeoutMs: 12000, initialDelayMs: 400 });
      const html = await response.text();
      const parsed = parseDetailPage(canonicalDetailUrl, html);
      if (parsed && parsed.title && !isCallToActionTitle(parsed.title)) {
        jobs.push(parsed);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Detail fetch failed for ${canonicalDetailUrl}`);
    }
  }

  return {
    jobs: Array.from(new Map(jobs.map((job) => [job.url, job])).values()),
    errors
  };
}

async function scrapeAdzunaWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);

      const rawJobs = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/land/ad/"], a[href*="/details/"]'));
        return anchors.map((anchor) => {
          const href = anchor.href;
          const container = anchor.closest("article, li, [data-testid], [class*='card'], [class*='result']") ?? anchor;
          const text = (container.textContent || anchor.textContent || "").replace(/\s+/g, " ").trim();
          const anchorText = (anchor.textContent || "").replace(/\s+/g, " ").trim();
          return { href, text, anchorText };
        });
      });

      const seen = new Set<string>();
      const jobs: NormalizedJob[] = [];

      for (const item of rawJobs) {
        const href = canonicalUrl(item.href);
        if (!href || seen.has(href) || !/\/land\/ad\/|\/details\//i.test(href)) continue;
        seen.add(href);

        const rawText = decodeHtmlEntities(item.anchorText || item.text || "").trim();
        if (!rawText || /privacy|confidentialite|cookies/i.test(rawText)) continue;

        const { company, title } = extractAdzunaCompanyAndTitle(rawText);
        if (!title || title.length < 5) continue;

        jobs.push(
          withMetadata(
            {
              source: "career_sites",
              sourceJobId: /\/ad\/(\d+)/i.exec(href)?.[1] || deterministicHash(href),
              title,
              company,
              location: inferLocationFromTarget(targetUrl, rawText),
              contractType: parseContractType(rawText),
              url: href,
              postedAt: null
            },
            rawText
          )
        );
      }

      const deduped = Array.from(new Map(jobs.map((job) => [job.url, job])).values());
      if (deduped.length === 0) {
        return {
          jobs: [],
          errors: ["Adzuna Playwright opened the page but found no job cards"],
          attempts: [buildFailureAttempt("adzuna_playwright", "empty", "browser rendered but no cards found")],
          selectedMethod: null
        };
      }

      return {
        jobs: deduped,
        errors: ["Adzuna Playwright fallback used"],
        attempts: [buildSuccessAttempt("adzuna_playwright", deduped, "browser parsing")],
        selectedMethod: "adzuna_playwright"
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Adzuna Playwright failed"],
      attempts: [buildFailureAttempt("adzuna_playwright", "error", error instanceof Error ? error.message : "Adzuna Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeAdzunaSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const htmlResult = await scrapeAdzunaHtmlSearchUrl(targetUrl);
  if (isSatisfactory(htmlResult.jobs)) {
    return htmlResult;
  }

  const playwrightResult = await scrapeAdzunaWithPlaywright(targetUrl);
  if (isSatisfactory(playwrightResult.jobs)) {
    return playwrightResult;
  }

  const genericResult = await scrapeGenericSearchUrl(targetUrl);
  const chosen = chooseBestResult([
    { method: "adzuna_html", jobs: htmlResult.jobs, errors: htmlResult.errors, note: "html detail links" },
    { method: "adzuna_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser parsing" },
    { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
  ]);

  return chosen.jobs.length > 0
    ? chosen
    : {
        jobs: genericResult.jobs,
        errors: [...htmlResult.errors, ...playwrightResult.errors, ...genericResult.errors],
        attempts: [...htmlResult.attempts, ...playwrightResult.attempts, ...genericResult.attempts],
        selectedMethod: genericResult.selectedMethod
      };
}

async function scrapeAdzunaHtmlSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  try {
    const { html, errors } = await fetchHtmlWithBestEffort(targetUrl);
    const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']*(?:\/land\/ad\/|\/details\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi))
      .map((match) => {
        const index = match.index ?? 0;
        const href = toAbsolute(targetUrl, match[1]);
        const context = stripHtml(html.slice(Math.max(0, index - 1200), Math.min(html.length, index + 2200)));
        return { href, context, text: stripHtml(match[2]) };
      })
      .filter((item) => item.href && /\/land\/ad\/|\/details\//i.test(item.href));

    const jobs = Array.from(new Map(links.map((item) => {
      const href = canonicalUrl(item.href);
      const rawText = decodeHtmlEntities(item.context || item.text).trim();
      const { company, title } = extractAdzunaCompanyAndTitle(rawText);
      const job: NormalizedJob = withMetadata(
        {
          source: "career_sites",
          sourceJobId: /\/ad\/(\d+)/i.exec(href)?.[1] || deterministicHash(href),
          title,
          company,
          location: inferLocationFromTarget(targetUrl, rawText),
          contractType: parseContractType(rawText),
          url: href,
          postedAt: null
        },
        rawText
      );
      return [href, job] as const;
    })).values()).filter((job) => job.title && !isCallToActionTitle(job.title));

    return {
      jobs,
      errors,
      attempts: [jobs.length > 0 ? buildSuccessAttempt("adzuna_html", jobs, "html detail links") : buildFailureAttempt("adzuna_html", errors.length > 0 ? "error" : "empty", errors[0] ?? "no detail links found")],
      selectedMethod: jobs.length > 0 ? "adzuna_html" : null
    };
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Adzuna HTML parsing failed"],
      attempts: [buildFailureAttempt("adzuna_html", "error", error instanceof Error ? error.message : "Adzuna HTML parsing failed")],
      selectedMethod: null
    };
  }
}

async function scrapeBusinessFranceWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);

      const detailUrls = await page.evaluate(() =>
        Array.from(
          new Set(
            Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/offres/"]'))
              .map((anchor) => anchor.href)
              .filter((href) => /\/offres\/\d+/i.test(href))
          )
        )
      );

      if (detailUrls.length === 0) {
        return {
          jobs: [],
          errors: ["VIE Playwright opened the page but found no offer links"],
          attempts: [buildFailureAttempt("vie_playwright", "empty", "browser rendered but no /offres/<id> links found")],
          selectedMethod: null
        };
      }

      const hydrated = await hydrateDetailUrls(detailUrls, parseBusinessFranceDetailPage);
      return {
        jobs: hydrated.jobs,
        errors: hydrated.errors,
        attempts: [hydrated.jobs.length > 0 ? buildSuccessAttempt("vie_playwright", hydrated.jobs, "browser detail crawl") : buildFailureAttempt("vie_playwright", hydrated.errors.length > 0 ? "error" : "empty", hydrated.errors[0] ?? "detail crawl returned no jobs")],
        selectedMethod: hydrated.jobs.length > 0 ? "vie_playwright" : null
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "VIE Playwright failed"],
      attempts: [buildFailureAttempt("vie_playwright", "error", error instanceof Error ? error.message : "VIE Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeBusinessFranceSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  try {
    const { html, errors } = await fetchHtmlWithBestEffort(targetUrl);
    const detailUrls = extractBusinessFranceOfferUrlsFromHtml(html);
    const hydrated = detailUrls.length > 0 ? await hydrateDetailUrls(detailUrls, parseBusinessFranceDetailPage) : { jobs: [], errors: [] };
    const htmlAttempt = hydrated.jobs.length > 0
      ? buildSuccessAttempt("vie_nuxt_links", hydrated.jobs, "html embedded links")
      : buildFailureAttempt("vie_nuxt_links", detailUrls.length > 0 ? "empty" : "empty", detailUrls.length > 0 ? "detail crawl returned no jobs" : "no embedded VIE links found");

    if (isSatisfactory(hydrated.jobs)) {
      return {
        jobs: hydrated.jobs,
        errors: [...errors, ...hydrated.errors],
        attempts: [htmlAttempt],
        selectedMethod: "vie_nuxt_links"
      };
    }

    const playwrightResult = await scrapeBusinessFranceWithPlaywright(targetUrl);
    const genericResult = await scrapeGenericSearchUrl(targetUrl);
    const chosen = chooseBestResult([
      { method: "vie_nuxt_links", jobs: hydrated.jobs, errors: [...errors, ...hydrated.errors], note: "html embedded links" },
      { method: "vie_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser detail crawl" },
      { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
    ]);

    return chosen.jobs.length > 0
      ? chosen
      : {
          jobs: genericResult.jobs,
          errors: [...errors, ...hydrated.errors, ...playwrightResult.errors, ...genericResult.errors],
          attempts: [htmlAttempt, ...playwrightResult.attempts, ...genericResult.attempts],
          selectedMethod: genericResult.selectedMethod
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : "VIE fetch failed";
    const playwrightResult = await scrapeBusinessFranceWithPlaywright(targetUrl);
    return {
      jobs: playwrightResult.jobs,
      errors: [message, ...playwrightResult.errors],
      attempts: [buildFailureAttempt("vie_nuxt_links", "error", message), ...playwrightResult.attempts],
      selectedMethod: playwrightResult.selectedMethod
    };
  }
}

async function scrapeLicorneSocietyWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      const detailUrls = await page.evaluate(() =>
        Array.from(
          new Set(
            Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
              .map((anchor) => anchor.href)
              .filter((href) => /\/job\/[^/?#]+/i.test(href) && !/\/job\/?$/i.test(href))
          )
        )
      );

      if (detailUrls.length === 0) {
        return {
          jobs: [],
          errors: ["Licorne Society Playwright found no job links"],
          attempts: [buildFailureAttempt("licorne_playwright", "empty", "browser rendered but no /job/<slug> links found")],
          selectedMethod: null
        };
      }

      const hydrated = await hydrateDetailUrls(detailUrls, parseLicorneSocietyDetailPage);
      return {
        jobs: hydrated.jobs,
        errors: hydrated.errors,
        attempts: [hydrated.jobs.length > 0 ? buildSuccessAttempt("licorne_playwright", hydrated.jobs, "browser detail crawl") : buildFailureAttempt("licorne_playwright", hydrated.errors.length > 0 ? "error" : "empty", hydrated.errors[0] ?? "detail crawl returned no jobs")],
        selectedMethod: hydrated.jobs.length > 0 ? "licorne_playwright" : null
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Licorne Society Playwright failed"],
      attempts: [buildFailureAttempt("licorne_playwright", "error", error instanceof Error ? error.message : "Licorne Society Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeLicorneSocietySearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const playwrightResult = await scrapeLicorneSocietyWithPlaywright(targetUrl);
  if (isSatisfactory(playwrightResult.jobs)) {
    return playwrightResult;
  }

  const genericResult = await scrapeGenericSearchUrl(targetUrl);
  const chosen = chooseBestResult([
    { method: "licorne_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser detail crawl" },
    { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
  ]);

  return chosen.jobs.length > 0
    ? chosen
    : {
        jobs: genericResult.jobs,
        errors: [...playwrightResult.errors, ...genericResult.errors],
        attempts: [...playwrightResult.attempts, ...genericResult.attempts],
        selectedMethod: genericResult.selectedMethod
      };
}

async function scrapeFreeWorkSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  try {
    const { html, errors } = await fetchHtmlWithBestEffort(targetUrl);
    const detailUrls = extractFreeWorkOfferUrlsFromHtml(html);
    const hydrated = detailUrls.length > 0 ? await hydrateDetailUrls(detailUrls, parseFreeWorkDetailPage) : { jobs: [], errors: [] };
    const genericResult = await scrapeGenericSearchUrl(targetUrl);
    const chosen = chooseBestResult([
      { method: "free_work_html", jobs: hydrated.jobs, errors: [...errors, ...hydrated.errors], note: "html job links" },
      { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
    ]);

    return chosen.jobs.length > 0
      ? chosen
      : {
          jobs: genericResult.jobs,
          errors: [...errors, ...hydrated.errors, ...genericResult.errors],
          attempts: [
            hydrated.jobs.length > 0
              ? buildSuccessAttempt("free_work_html", hydrated.jobs, "html job links")
              : buildFailureAttempt("free_work_html", detailUrls.length > 0 ? "empty" : "empty", detailUrls.length > 0 ? "detail crawl returned no jobs" : "no Free-Work job links found"),
            ...genericResult.attempts
          ],
          selectedMethod: genericResult.selectedMethod
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Free-Work scrape failed";
    return {
      jobs: [],
      errors: [message],
      attempts: [buildFailureAttempt("free_work_html", "error", message)],
      selectedMethod: null
    };
  }
}

async function scrapeHiringCafeWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4500);

      const pageText = (await page.textContent("body"))?.replace(/\s+/g, " ").trim() ?? "";
      if (/403|forbidden|access denied|verify you are human/i.test(pageText)) {
        return {
          jobs: [],
          errors: ["Hiring Cafe bloque actuellement le crawl public (403/anti-bot)"],
          attempts: [buildFailureAttempt("hiring_cafe_playwright", "error", "403 or anti-bot page detected")],
          selectedMethod: null
        };
      }

      const rawJobs = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>("article, li, [data-testid*='job'], [class*='job'], [class*='result'], [class*='card']")
        ).slice(0, 160);

        return cards.flatMap((card) => {
          const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((anchor) => {
            const href = anchor.href;
            return Boolean(href) && !/login|sign[- ]?in|privacy|terms|cookie|help|faq/i.test(href);
          });
          if (anchors.length === 0) return [];

          const preferred = anchors.find((anchor) => {
            try {
              return !new URL(anchor.href).hostname.includes("hiring.cafe");
            } catch {
              return false;
            }
          }) ?? anchors[0];

          const text = (card.textContent || "").replace(/\s+/g, " ").trim();
          const anchorText = (preferred.textContent || "").replace(/\s+/g, " ").trim();
          return [{ href: preferred.href, text, anchorText }];
        });
      });

      const jobs = Array.from(
        new Map(
          rawJobs
            .filter((item) => item.href && !isCallToActionTitle(item.anchorText || item.text))
            .map((item) => {
              const href = canonicalUrl(item.href);
              const extracted = extractGenericCompanyAndTitle(item.text || item.anchorText, item.anchorText || item.text, "Hiring Cafe");
              const job: NormalizedJob = withMetadata(
                {
                  source: "hiring_cafe",
                  sourceJobId: deterministicHash(href),
                  title: extracted.title || titleFromUrlSlug(href),
                  company: extracted.company || "Hiring Cafe",
                  location: inferLocationFromTarget(targetUrl, item.text),
                  contractType: parseContractType(item.text),
                  url: href,
                  postedAt: null
                },
                item.text
              );
              return [href, job] as const;
            })
        ).values()
      ).filter((job) => job.title && !isCallToActionTitle(job.title));

      if (jobs.length === 0) {
        return {
          jobs: [],
          errors: ["Hiring Cafe Playwright rendered the page but found no usable jobs"],
          attempts: [buildFailureAttempt("hiring_cafe_playwright", "empty", "no external job cards detected")],
          selectedMethod: null
        };
      }

      return {
        jobs,
        errors: [],
        attempts: [buildSuccessAttempt("hiring_cafe_playwright", jobs, "external links allowed")],
        selectedMethod: "hiring_cafe_playwright"
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Hiring Cafe Playwright failed"],
      attempts: [buildFailureAttempt("hiring_cafe_playwright", "error", error instanceof Error ? error.message : "Hiring Cafe Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeHiringCafeSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const dedicatedResult = await scrapeHiringCafeWithPlaywright(targetUrl);
  if (isSatisfactory(dedicatedResult.jobs)) {
    return dedicatedResult;
  }

  const genericResult = await scrapeGenericSearchUrl(targetUrl);
  const chosen = chooseBestResult([
    { method: "hiring_cafe_playwright", jobs: dedicatedResult.jobs, errors: dedicatedResult.errors, note: "external links allowed" },
    { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
  ]);

  return chosen.jobs.length > 0
    ? chosen
    : {
        jobs: genericResult.jobs,
        errors: [...dedicatedResult.errors, ...genericResult.errors],
        attempts: [...dedicatedResult.attempts, ...genericResult.attempts],
        selectedMethod: genericResult.selectedMethod
      };
}

async function scrapeApecWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      const rawJobs = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((anchor) => {
          const href = anchor.href;
          return /detail-offre|offres-emploi-cadres/i.test(href);
        });

        return anchors.map((anchor) => {
          const href = anchor.href;
          const article = anchor.closest('article, li, [data-testid], [class*="card"], [class*="result"]');
          const container = article ?? anchor.parentElement ?? anchor;
          const text = (container.textContent || anchor.textContent || '').replace(/\s+/g, ' ').trim();
          const anchorText = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
          return { href, text, anchorText };
        });
      });

      const jobs = [];
      const seen = new Set();

      for (const item of rawJobs) {
        const href = canonicalUrl(item.href);
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const sourceJobId = /detail-offre\/([^/?#]+)/i.exec(href)?.[1] || deterministicHash(href);
        const rawText = decodeHtmlEntities(item.anchorText || item.text || '').trim();
        const { company, title } = extractApecCompanyAndTitle(rawText);
        if (!title || title.length < 5) continue;

        jobs.push(
          withMetadata(
            {
              source: "career_sites",
              sourceJobId,
              title,
              company,
              location: extractApecLocation(rawText),
              contractType: parseContractType(rawText),
              url: href,
              postedAt: null
            },
            rawText
          )
        );
      }

      if (jobs.length === 0) {
        return {
          jobs: [],
          errors: ["APEC Playwright opened the page but found no job cards"],
          attempts: [buildFailureAttempt("apec_playwright", "empty", "browser rendered but no cards found")],
          selectedMethod: null
        };
      }

      return {
        jobs: Array.from(new Map(jobs.map((job) => [job.url, job])).values()),
        errors: ["APEC Playwright fallback used"],
        attempts: [buildSuccessAttempt("apec_playwright", jobs, "browser parsing")],
        selectedMethod: "apec_playwright"
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "APEC Playwright failed"],
      attempts: [buildFailureAttempt("apec_playwright", "error", error instanceof Error ? error.message : "APEC Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeApecSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  const playwrightResult = await scrapeApecWithPlaywright(targetUrl);
  if (isSatisfactory(playwrightResult.jobs)) {
    return playwrightResult;
  }

  const genericResult = await scrapeGenericSearchUrl(targetUrl);
  const chosen = chooseBestResult([
    { method: "apec_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser parsing" },
    { method: "generic_html", jobs: genericResult.jobs, errors: genericResult.errors, note: "generic fallback" }
  ]);
  return chosen.jobs.length > 0
    ? chosen
    : {
        jobs: genericResult.jobs,
        errors: [...playwrightResult.errors, ...genericResult.errors],
        attempts: [...playwrightResult.attempts, ...genericResult.attempts],
        selectedMethod: genericResult.selectedMethod
      };
}

async function scrapeWttjSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  try {
    const { html, errors } = await fetchHtmlWithBestEffort(targetUrl);

    const nextData = extractJsonFromNextData(html);
    const nextDataJobs = nextData ? extractWttjJobsFromNextData(nextData) : [];
    const jsonLdJobs = extractWttjJobsFromJsonLd(html);
    const anchorJobs = extractWttjJobsFromAnchors(html, targetUrl);
    const baseCandidates = [
      {
        method: "wttj_next_data",
        jobs: Array.from(new Map(nextDataJobs.map((job) => [job.sourceJobId, job])).values()),
        errors,
        note: "next data"
      },
      {
        method: "wttj_jsonld",
        jobs: Array.from(new Map(jsonLdJobs.map((job) => [job.sourceJobId, job])).values()),
        errors: [...errors, "WTTJ NEXT_DATA unavailable, JSON-LD fallback used"],
        note: "json ld"
      },
      {
        method: "wttj_html_anchors",
        jobs: Array.from(new Map(anchorJobs.map((job) => [job.sourceJobId, job])).values()),
        errors: [...errors, "WTTJ HTML anchor fallback used"],
        note: "html anchors"
      }
    ];

    const baseChoice = chooseBestResult(baseCandidates);
    if (isSatisfactory(baseChoice.jobs)) {
      return baseChoice;
    }

    const playwrightResult = await scrapeWttjWithPlaywright(targetUrl);
    const withPlaywright = chooseBestResult([
      ...baseCandidates,
      { method: "wttj_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser fallback" }
    ]);

    if (withPlaywright.jobs.length > 0) {
      return withPlaywright;
    }

    return {
      jobs: [],
      errors: [...errors, "WTTJ parsing returned no jobs", ...playwrightResult.errors],
      attempts: [...baseChoice.attempts, ...playwrightResult.attempts.filter((attempt) => attempt.method === "wttj_playwright")],
      selectedMethod: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "WTTJ fetch failed";
    const playwrightResult = await scrapeWttjWithPlaywright(targetUrl);
    if (playwrightResult.jobs.length > 0) {
      return {
        jobs: Array.from(new Map(playwrightResult.jobs.map((job) => [job.sourceJobId, job])).values()),
        errors: [message, ...playwrightResult.errors],
        attempts: [buildFailureAttempt("wttj_html_fetch", "error", message), ...playwrightResult.attempts],
        selectedMethod: playwrightResult.selectedMethod
      };
    }

    return {
      jobs: [],
      errors: [message, ...playwrightResult.errors],
      attempts: [buildFailureAttempt("wttj_html_fetch", "error", message), ...playwrightResult.attempts],
      selectedMethod: null
    };
  }
}

async function scrapeGenericWithPlaywright(targetUrl: string): Promise<ScrapeResult> {
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3500);

      const rawJobs = await page.evaluate(() => {
        const selectors = [
          "article",
          "li",
          "[data-testid*='job']",
          "[class*='job']",
          "[class*='offer']",
          "[class*='result']",
          "[class*='card']"
        ];
        const seenKeys = new Set<string>();
        const items: Array<{ href: string; text: string; anchorText: string; selector: string }> = [];

        for (const selector of selectors) {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(0, 200);
          for (const node of nodes) {
            const anchor = node.querySelector<HTMLAnchorElement>("a[href]");
            if (!anchor?.href) continue;

            const href = anchor.href;
            const text = (node.textContent || anchor.textContent || "").replace(/\s+/g, " ").trim();
            const anchorText = (anchor.textContent || "").replace(/\s+/g, " ").trim();
            if (!text) continue;
            if (!/\/jobs?\//i.test(href) && !/emploi|offres?|careers?|positions?|\/land\/ad\/|\/details\//i.test(href)) continue;

            const key = `${selector}|${href}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            items.push({ href, text, anchorText, selector });
          }
        }

        if (items.length > 0) {
          return items;
        }

        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((anchor) => {
          const href = anchor.href;
          const text = (anchor.textContent || "").trim();
          return /\/jobs?\//i.test(href) || /emploi|offres?|careers?|positions?|\/land\/ad\/|\/details\//i.test(href) || text.length > 20;
        });

        return anchors.map((anchor) => {
          const href = anchor.href;
          const container = anchor.closest("article, li, [data-testid], [class*='card'], [class*='result']") ?? anchor;
          const text = (container.textContent || anchor.textContent || "").replace(/\s+/g, " ").trim();
          const anchorText = (anchor.textContent || "").replace(/\s+/g, " ").trim();
          return { href, text, anchorText, selector: "anchor_fallback" };
        });
      });

      const baseHost = new URL(targetUrl).hostname;
      const source = inferSource(targetUrl);
      const jobs = rawJobs
        .filter((item) => {
          try {
            return new URL(item.href).hostname.includes(baseHost.replace(/^www\./i, ""));
          } catch {
            return false;
          }
        })
        .slice(0, 120)
        .map((item) => {
          const companyFallback = new URL(item.href).hostname.replace(/^www\./i, "");
          const extracted = extractGenericCompanyAndTitle(item.text, item.anchorText || item.text, companyFallback);
          return withMetadata(
            {
              source,
              sourceJobId: deterministicHash(item.href),
              title: extracted.title,
              company: extracted.company,
              location: inferLocationFromTarget(targetUrl, item.text),
              contractType: parseContractType(item.text),
              url: canonicalUrl(item.href),
              postedAt: null
            },
            item.text
          );
        });

      const deduped = Array.from(new Map(jobs.map((job) => [job.url, job])).values());
      const selectorSummary = Array.from(new Set(rawJobs.map((item) => item.selector))).join(", ");
      return {
        jobs: deduped,
        errors: deduped.length > 0 ? [] : ["Generic Playwright found no job cards"],
        attempts: [
          deduped.length > 0
            ? buildSuccessAttempt("generic_playwright", deduped, `selectors: ${selectorSummary || "none"}`)
            : buildFailureAttempt("generic_playwright", "empty", "browser rendered but no cards found")
        ],
        selectedMethod: deduped.length > 0 ? "generic_playwright" : null
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      jobs: [],
      errors: [error instanceof Error ? error.message : "Generic Playwright failed"],
      attempts: [buildFailureAttempt("generic_playwright", "error", error instanceof Error ? error.message : "Generic Playwright failed")],
      selectedMethod: null
    };
  }
}

async function scrapeGenericSearchUrl(targetUrl: string): Promise<ScrapeResult> {
  try {
    const { html, errors } = await fetchHtmlWithBestEffort(targetUrl);
    const source = inferSource(targetUrl);
    const baseHost = new URL(targetUrl).hostname;
    const jsonLdJobs = extractGenericJobsFromJsonLd(html, targetUrl);

    const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
      .map((m) => {
        const index = m.index ?? 0;
        const context = stripHtml(html.slice(Math.max(0, index - 1800), Math.min(html.length, index + 3200)));
        return { href: m[1], text: stripHtml(m[2]), context };
      })
      .filter((item) => item.text.length > 0)
      .map((item) => ({ ...item, href: toAbsolute(targetUrl, item.href) }))
      .filter((item) => {
        try {
          const u = new URL(item.href);
          return u.hostname.includes(baseHost.replace(/^www\./i, ""));
        } catch {
          return false;
        }
      })
      .filter((item) => /\/jobs?\//i.test(item.href) || /emploi|offres?|careers?|positions?/i.test(item.href));

    const jobs: NormalizedJob[] = links.slice(0, 80).map((item) => {
      const companyFallback = new URL(item.href).hostname.replace(/^www\./i, "");
      const extracted = extractGenericCompanyAndTitle(item.context || item.text, item.text, companyFallback);
      return withMetadata(
        {
          source,
          sourceJobId: deterministicHash(item.href),
          title: extracted.title,
          company: extracted.company,
          location: inferLocationFromTarget(targetUrl, item.context || item.text),
          contractType: parseContractType(item.context || item.text),
          url: canonicalUrl(item.href),
          postedAt: null
        },
        item.context || item.text
      );
    });

    const deduped = Array.from(new Map(jobs.map((job) => [job.url, job])).values());
    const baseChoice = chooseBestResult([
      { method: "generic_jsonld", jobs: jsonLdJobs, errors, note: "json ld" },
      { method: "generic_html", jobs: deduped, errors, note: errors[0] }
    ]);
    if (isSatisfactory(baseChoice.jobs)) {
      return baseChoice;
    }

    const playwrightResult = await scrapeGenericWithPlaywright(targetUrl);
    const combined = chooseBestResult([
      { method: "generic_jsonld", jobs: jsonLdJobs, errors, note: "json ld" },
      { method: "generic_html", jobs: deduped, errors, note: errors[0] },
      { method: "generic_playwright", jobs: playwrightResult.jobs, errors: playwrightResult.errors, note: "browser fallback" }
    ]);
    return combined.jobs.length > 0
      ? combined
      : {
          jobs: playwrightResult.jobs,
          errors: [...errors, ...playwrightResult.errors],
          attempts: [buildFailureAttempt("generic_jsonld", "empty", "json ld absent"), buildFailureAttempt("generic_html", "empty", errors[0]), ...playwrightResult.attempts],
          selectedMethod: playwrightResult.selectedMethod
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generic scrape failed";
    const playwrightResult = await scrapeGenericWithPlaywright(targetUrl);
    return {
      jobs: playwrightResult.jobs,
      errors: [message, ...playwrightResult.errors],
      attempts: [buildFailureAttempt("generic_jsonld", "error", message), buildFailureAttempt("generic_html", "error", message), ...playwrightResult.attempts],
      selectedMethod: playwrightResult.selectedMethod
    };
  }
}

async function scrapeTarget(targetUrl: string): Promise<ScrapeResult> {
  const host = new URL(targetUrl).hostname.toLowerCase();
  if (host.includes("linkedin.com") && /\/jobs\/search/i.test(targetUrl)) {
    return scrapeLinkedinSearchUrl(targetUrl);
  }
  if (host.includes("welcometothejungle.com") && /\/fr\/jobs/i.test(targetUrl)) {
    return scrapeWttjSearchUrl(targetUrl);
  }
  if (host.includes("indeed.") && /\/jobs/i.test(targetUrl)) {
    return scrapeIndeedSearchUrl(targetUrl);
  }
  if (host.includes("apec.fr") && /recherche-emploi.html\/emploi/i.test(targetUrl)) {
    return scrapeApecSearchUrl(targetUrl);
  }
  if (host.includes("adzuna.")) {
    return scrapeAdzunaSearchUrl(targetUrl);
  }
  if (host.includes("businessfrance.fr")) {
    return scrapeBusinessFranceSearchUrl(targetUrl);
  }
  if (host.includes("app.licornesociety.com")) {
    return scrapeLicorneSocietySearchUrl(targetUrl);
  }
  if (host.includes("free-work.com")) {
    return scrapeFreeWorkSearchUrl(targetUrl);
  }
  if (host.includes("hiring.cafe")) {
    return scrapeHiringCafeSearchUrl(targetUrl);
  }
  return scrapeGenericSearchUrl(targetUrl);
}

function migrateJob(job: any, filters?: JobSearchFilters): UrlRadarJob {
  const firstSeenAt = job.firstSeenAt ?? job.scrapedAt ?? new Date().toISOString();
  const lastSeenAt = job.lastSeenAt ?? job.scrapedAt ?? firstSeenAt;
  const source = (job.source ?? "career_sites") as JobSource;
  const sourceJobId = String(job.sourceJobId ?? job.id ?? "");
  const rawUrl = String(job.url ?? "");
  const url =
    source === "indeed"
      ? buildIndeedJobUrl(rawUrl, sourceJobId)
      : canonicalUrl(rawUrl);
  const metadataText = job.metadataText ?? null;
  const isApec = url.includes("apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/");
  const isBusinessFrance = url.includes("businessfrance.fr/offres/");
  const isLicorneSociety = url.includes("licornesociety.com/job/");
  const reparsedApec = isApec
    ? (() => {
        const raw = String(metadataText ?? job.title ?? "");
        const { company, title } = extractApecCompanyAndTitle(raw);
        return {
          title,
          company,
          location: extractApecLocation(raw),
          postedAt: parsePostedAtFromText(raw)?.toISOString() ?? String(job.postedAt ?? firstSeenAt)
        };
      })()
    : null;
  const reparsedBusinessFrance = isBusinessFrance
    ? (() => {
        const raw = String(metadataText ?? `${job.company ?? ""} ${job.title ?? ""}`);
        const parsed = parseBusinessFranceDetailPage(url, `<html><body>${raw}</body></html>`);
        return parsed
          ? {
              title: parsed.title,
              company: parsed.company,
              location: parsed.location,
              postedAt: parsed.postedAt.toISOString()
            }
          : null;
      })()
    : null;
  const reparsedLicorne = isLicorneSociety
    ? (() => {
        const rawTitle = String(job.title ?? "");
        const fallbackTitle = titleFromUrlSlug(url);
        const title =
          !rawTitle || isCallToActionTitle(rawTitle) || normalizeText(rawTitle).includes("mot de passe oublie")
            ? fallbackTitle
            : rawTitle;
        return title
          ? {
              title,
              company: String(job.company ?? "Licorne Society") || "Licorne Society",
              location: String(job.location ?? "France") || "France"
            }
          : null;
      })()
    : null;
  const normalizedForFilters: NormalizedJob = {
    source,
    sourceJobId,
    title: reparsedBusinessFrance?.title || reparsedLicorne?.title || reparsedApec?.title || String(job.title ?? ""),
    company: reparsedBusinessFrance?.company || reparsedLicorne?.company || reparsedApec?.company || String(job.company ?? ""),
    location: reparsedBusinessFrance?.location || reparsedLicorne?.location || reparsedApec?.location || String(job.location ?? ""),
    contractType: (job.contractType ?? "OTHER") as ContractType,
    url,
    postedAt: new Date(reparsedBusinessFrance?.postedAt || reparsedApec?.postedAt || String(job.postedAt ?? firstSeenAt)),
    experienceHint: job.experienceHint ?? null,
    metadataText: metadataText ?? null
  };
  const shouldReclassify =
    Boolean(filters) || !Array.isArray(job.matchedKeywords) || !("excludedReason" in job) || !Array.isArray(job.excludedKeywords);
  const filterResult = shouldReclassify
    ? matchesFilters(normalizedForFilters, filters ?? cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS))
    : null;

  return {
    id: String(job.id),
    source,
    sourceJobId,
    title: normalizedForFilters.title,
    company: normalizedForFilters.company,
    location: normalizedForFilters.location,
    contractType: (job.contractType ?? "OTHER") as ContractType,
    url,
    postedAt: reparsedBusinessFrance?.postedAt || reparsedApec?.postedAt || String(job.postedAt ?? firstSeenAt),
    firstSeenAt,
    lastSeenAt,
    scrapedAt: lastSeenAt,
    matchedKeywords: filterResult?.matchedKeywords ?? (Array.isArray(job.matchedKeywords) ? job.matchedKeywords.map(String) : []),
    excludedReason:
      filterResult?.excludedReason ??
      (typeof job.excludedReason === "string" || job.excludedReason === null ? job.excludedReason : null),
    excludedKeywords:
      filterResult?.excludedKeywords ??
      (Array.isArray(job.excludedKeywords)
        ? job.excludedKeywords.filter((keyword: unknown): keyword is string => typeof keyword === "string" && keyword.trim().length > 0)
        : []),
    viewed: Boolean(job.viewed),
    saved: Boolean(job.saved),
    experienceHint: job.experienceHint ?? null,
    metadataText: job.metadataText ?? null
  };
}

async function readState(filters?: JobSearchFilters): Promise<UrlRadarState> {
  const parseState = (raw: string): UrlRadarState => {
    const parsed = JSON.parse(raw) as UrlRadarState;
    const migratedJobs = Array.isArray(parsed.jobs) ? parsed.jobs.map((job) => migrateJob(job, filters)) : [];
    return {
      jobs: migratedJobs.filter((job) => {
        if (job.source === "indeed") {
          return isIndeedJobHref(job.url);
        }
        if (/businessfrance\.fr/i.test(job.url)) {
          return !isCallToActionTitle(job.title);
        }
        if (/licornesociety\.com\/job\//i.test(job.url)) {
          const normalizedTitle = normalizeText(job.title);
          return Boolean(job.title) && !isCallToActionTitle(job.title) && !normalizedTitle.includes("mot de passe oublie");
        }
        return true;
      }),
      runs: Array.isArray(parsed.runs) ? parsed.runs : []
    };
  };

  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return parseState(raw);
  } catch {
    try {
      const backupRaw = await fs.readFile(BACKUP_FILE_PATH, "utf8");
      const backupState = parseState(backupRaw);
      await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
      await fs.writeFile(FILE_PATH, JSON.stringify(backupState, null, 2), "utf8");
      return backupState;
    } catch {
      await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
      await fs.writeFile(FILE_PATH, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
      return EMPTY_STATE;
    }
  }
}

async function writeState(state: UrlRadarState): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  try {
    const currentRaw = await fs.readFile(FILE_PATH, "utf8");
    if (currentRaw.trim()) {
      await fs.writeFile(BACKUP_FILE_PATH, currentRaw, "utf8");
    }
  } catch {
    // no prior state to back up
  }
  await fs.writeFile(FILE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function toStoredJob(
  job: NormalizedJob,
  seenAt: Date,
  matchedKeywords: string[],
  excludedReason: string | null,
  excludedKeywords: string[]
): UrlRadarJob {
  const key = `${job.source}|${job.sourceJobId}|${canonicalUrl(job.url)}`;
  const timestamp = seenAt.toISOString();
  return {
    id: deterministicHash(key),
    source: job.source,
    sourceJobId: job.sourceJobId,
    title: job.title,
    company: job.company,
    location: job.location,
    contractType: job.contractType,
    url: canonicalUrl(job.url),
    postedAt: job.postedAt.toISOString(),
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    scrapedAt: timestamp,
    matchedKeywords,
    excludedReason,
    excludedKeywords,
    viewed: false,
    saved: false,
    experienceHint: job.experienceHint ?? null,
    metadataText: job.metadataText ?? null
  };
}

export async function reclassifyUrlRadarState(config: UrlRadarConfig): Promise<{ total: number; visible: number }> {
  const filters = getUrlRadarFilters(config);
  const state = await readState(filters);
  await writeState(state);

  return {
    total: state.jobs.length,
    visible: state.jobs.filter((job) => job.excludedReason === null).length
  };
}

export async function refreshUrlRadar(config: UrlRadarConfig): Promise<{ totalNew: number; summary: Record<string, { parsed: number; visible: number; errors: string[]; attempts: StrategyAttempt[]; selectedMethod: string | null }> }> {
  const filters = getUrlRadarFilters(config);
  const state = await readState(filters);
  const summary: Record<string, { parsed: number; visible: number; errors: string[]; attempts: StrategyAttempt[]; selectedMethod: string | null }> = {};
  let totalNew = 0;

  const jobsById = new Map(state.jobs.map((job) => [job.id, job]));
  const seenAt = new Date();

  for (const url of config.urls) {
    const result = await scrapeTarget(url);
    summary[url] = {
      parsed: result.jobs.length,
      visible: 0,
      errors: result.errors,
      attempts: result.attempts,
      selectedMethod: result.selectedMethod ?? null
    };

    for (const job of result.jobs) {
      const filter = matchesFilters(job, filters);
      const stored = toStoredJob(job, seenAt, filter.matchedKeywords, filter.excludedReason, filter.excludedKeywords);
      const existing = jobsById.get(stored.id);

      if (existing) {
        const existingPostedAt = new Date(existing.postedAt);
        const storedPostedAt = new Date(stored.postedAt);
        const postedAt =
          Number.isFinite(existingPostedAt.getTime()) &&
          Number.isFinite(storedPostedAt.getTime()) &&
          existingPostedAt.getTime() < storedPostedAt.getTime()
            ? existing.postedAt
            : stored.postedAt;

        jobsById.set(stored.id, {
          ...stored,
          postedAt,
          firstSeenAt: existing.firstSeenAt ?? existing.scrapedAt ?? stored.firstSeenAt,
          lastSeenAt: stored.lastSeenAt,
          scrapedAt: stored.lastSeenAt,
          viewed: existing.viewed,
          saved: existing.saved
        });
      } else {
        jobsById.set(stored.id, stored);
        if (stored.excludedReason === null) {
          totalNew += 1;
          summary[url].visible += 1;
        }
      }
    }
  }

  const hasErrors = Object.values(summary).some((item) => item.errors.length > 0);
  const run: UrlRadarRun = {
    id: deterministicHash(`run|${Date.now()}|${Math.random()}`),
    startedAt: seenAt.toISOString(),
    endedAt: new Date().toISOString(),
    status: hasErrors ? (totalNew > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
    newCount: totalNew,
    error: hasErrors
      ? Object.entries(summary)
          .flatMap(([url, item]) => item.errors.map((err) => `${url}: ${err}`))
          .join(" | ")
      : null,
    summary
  };

  const jobs = Array.from(jobsById.values()).sort((a, b) => {
    const aDate = new Date(a.postedAt).getTime();
    const bDate = new Date(b.postedAt).getTime();
    return bDate - aDate;
  });

  const runs = [run, ...state.runs].slice(0, 60);
  await writeState({ jobs, runs });

  return { totalNew, summary };
}

export async function getUrlRadarStatus(config?: UrlRadarConfig) {
  const state = await readState(config ? getUrlRadarFilters(config) : undefined);
  const visible = state.jobs.filter((job) => job.excludedReason === null).length;
  const lastRun = state.runs[0] ?? null;
  const excludedReasons = state.jobs.reduce<Record<string, number>>((acc, job) => {
    if (!job.excludedReason) return acc;
    acc[job.excludedReason] = (acc[job.excludedReason] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalInDb: state.jobs.length,
    totalVisible: visible,
    excludedReasons,
    runs: state.runs,
    lastRunSummary: lastRun?.summary ?? {},
    lastRunAt: lastRun?.endedAt ?? null,
    lastRunStartedAt: lastRun?.startedAt ?? null
  };
}

export async function getUrlRadarJobs(config: UrlRadarConfig | undefined, page: number, pageSize: number, includeExcluded: boolean) {
  const state = await readState(config ? getUrlRadarFilters(config) : undefined);
  const filtered = includeExcluded ? state.jobs : state.jobs.filter((job) => job.excludedReason === null);
  const items = filtered
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice((page - 1) * pageSize, page * pageSize);

  const lastRun = state.runs[0] ?? null;

  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    newSinceLastRefresh: lastRun?.newCount ?? 0,
    lastRefreshAt: lastRun?.endedAt ?? null,
    lastRunStartedAt: lastRun?.startedAt ?? null,
    lastRunId: lastRun?.id ?? null,
    memory: {
      allJobs: state.jobs.length,
      saved: state.jobs.filter((job) => job.saved).length,
      viewed: state.jobs.filter((job) => job.viewed).length
    }
  };
}

export async function updateUrlRadarJobStatus(id: string, viewed: boolean, saved: boolean) {
  const state = await readState();
  const index = state.jobs.findIndex((job) => job.id === id);
  if (index === -1) return null;

  const current = state.jobs[index];
  state.jobs[index] = { ...current, viewed, saved };
  await writeState(state);
  return state.jobs[index];
}
