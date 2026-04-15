import { fetchWithRetry } from "@/lib/http";
import type { ConnectorResult, JobSearchFilters, NormalizedJob } from "@/lib/types";
import { parseContractType } from "@/lib/utils";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";

function buildSearchUrl(filters: JobSearchFilters, pageNum: number): string {
  const keywords = encodeURIComponent(filters.keywordsInclude.join(" OR "));
  const location = encodeURIComponent("Ile-de-France");
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${keywords}&location=${location}&f_TPR=r604800&position=1&pageNum=${pageNum}`;
}

function normalizeLinkedinUrl(url: string): string {
  return url
    .replace(/&amp;/g, "&")
    .replace(/\?trk=.*$/i, "")
    .trim();
}

function extractLinkedinJobs(html: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  const blocks = html.split("<li").slice(1);

  for (const block of blocks) {
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
    const url = rawUrl ? normalizeLinkedinUrl(rawUrl) : "";
    const jobId = /\/view\/(\d+)/.exec(url)?.[1] || /currentJobId=(\d+)/i.exec(url)?.[1];
    const postedRaw = /time[^>]+datetime="([^"]+)"/i.exec(block)?.[1];

    if (!title || !url || !jobId) continue;
    if (/\/jobs\/search\//i.test(url)) continue;

    jobs.push({
      source: "linkedin",
      sourceJobId: jobId,
      title,
      company,
      location,
      contractType: parseContractType(block),
      url,
      postedAt: postedRaw ? new Date(postedRaw) : new Date()
    });
  }

  return jobs;
}

export async function fetchLinkedInJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  try {
    const allJobs: NormalizedJob[] = [];
    const errors: string[] = [];

    for (let pageNum = 0; pageNum < 5; pageNum += 1) {
      const url = buildSearchUrl(filters, pageNum);
      try {
        const response = await fetchWithRetry(url, {}, { retries: 2, initialDelayMs: 700, timeoutMs: 12000 });
        const html = await response.text();
        const pageJobs = extractLinkedinJobs(html);
        allJobs.push(...pageJobs);
        if (pageJobs.length === 0 && pageNum > 0) break;
      } catch (error) {
        errors.push(`linkedin page ${pageNum}: ${error instanceof Error ? error.message : "fetch error"}`);
      }
    }

    const deduped = Array.from(new Map(allJobs.map((job) => [job.sourceJobId, job])).values());
    if (deduped.length > 0) {
      return { jobs: deduped, errors };
    }

    const fallback = await fetchDomainJobsViaSearch("linkedin", "linkedin.com", filters, 4);
    return {
      jobs: fallback.jobs,
      errors: ["LinkedIn API returned no parsable job details", ...errors, ...fallback.errors]
    };
  } catch (error) {
    const fallback = await fetchDomainJobsViaSearch("linkedin", "linkedin.com", filters, 4);
    return {
      jobs: fallback.jobs,
      errors: [error instanceof Error ? error.message : "LinkedIn connector failed", ...fallback.errors]
    };
  }
}
