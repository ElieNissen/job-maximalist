import type { ConnectorResult, JobSearchFilters, JobSource } from "@/lib/types";
import { fetchWithRetry } from "@/lib/http";
import { extractJobPostingJsonLd, mapJsonLdToJob } from "@/lib/connectors/jsonld";

function extractHttpLinks(html: string): string[] {
  const hrefMatches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
  const links: string[] = [];

  for (const match of hrefMatches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      links.push(raw);
      continue;
    }

    try {
      const wrapped = new URL(raw, "https://duckduckgo.com");
      const redirected =
        wrapped.searchParams.get("uddg") ||
        wrapped.searchParams.get("url") ||
        wrapped.searchParams.get("q") ||
        wrapped.searchParams.get("u");

      if (redirected && /^https?:\/\//i.test(redirected)) {
        links.push(decodeURIComponent(redirected));
      }
    } catch {
      // ignore malformed URL
    }
  }

  return Array.from(new Set(links));
}

function extractCandidateJobLinks(html: string, pageUrl: string, domain: string): string[] {
  const matches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
  const links = new Set<string>();

  for (const m of matches) {
    const href = m[1];
    if (!href) continue;

    try {
      const url = new URL(href, pageUrl);
      const absolute = url.toString();
      if (!absolute.includes(domain)) continue;
      if (!/(\/jobs?\/|\/emploi\/|\/offres?\/|\/careers?\/|\/positions?\/|\/view\/)/i.test(url.pathname)) continue;
      if (/(\/search|\/recherche)/i.test(url.pathname) && !/\/view\//i.test(url.pathname)) continue;
      links.add(absolute);
    } catch {
      // ignore malformed URL
    }
  }

  return Array.from(links);
}

function buildSearchQuery(domain: string, filters: JobSearchFilters): string {
  const roleQuery = filters.keywordsInclude.map((k) => `"${k}"`).join(" OR ");
  const location = "\"Ile-de-France\" OR Paris";
  const contract = "CDI OR CDD";
  return `site:${domain} (${roleQuery}) (${location}) (${contract})`;
}

function buildSeedUrls(source: JobSource, filters: JobSearchFilters): string[] {
  const q = encodeURIComponent(filters.keywordsInclude.join(" OR "));

  const seeds: Record<JobSource, string[]> = {
    linkedin: [
      `https://www.linkedin.com/jobs/search/?keywords=${q}&location=Ile-de-France%2C%20France`,
      `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${q}&location=Ile-de-France`
    ],
    wttj: [`https://www.welcometothejungle.com/fr/jobs?query=${q}&aroundQuery=Ile-de-France`],
    indeed: [`https://fr.indeed.com/jobs?q=${q}&l=Ile-de-France`],
    hellowork: [`https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${q}&l=Ile-de-France`],
    service_public: ["https://choisirleservicepublic.gouv.fr/nos-offres/"],
    hiring_cafe: ["https://hiring.cafe/"],
    licorne_society: ["https://jobs.licornesociety.com/jobs"],
    career_sites: [
      "https://boards.greenhouse.io/",
      "https://jobs.lever.co/",
      "https://www.workable.com/jobs/search",
      "https://jobs.smartrecruiters.com/"
    ],
    greenhouse: [],
    lever: [],
    smartrecruiters: [],
    politepol: []
  };

  return seeds[source] ?? [];
}

async function searchLinksViaEngines(domain: string, filters: JobSearchFilters): Promise<string[]> {
  const query = encodeURIComponent(buildSearchQuery(domain, filters));
  const searchUrls = [
    `https://html.duckduckgo.com/html/?q=${query}`,
    `https://duckduckgo.com/html/?q=${query}`,
    `https://www.bing.com/search?q=${query}`
  ];

  const found = new Set<string>();

  for (const searchUrl of searchUrls) {
    try {
      const response = await fetchWithRetry(searchUrl, {}, { retries: 1, initialDelayMs: 300, timeoutMs: 8000 });
      const html = await response.text();
      for (const link of extractHttpLinks(html)) {
        if (link.includes(domain)) found.add(link);
      }
      if (found.size >= 8) break;
    } catch {
      // keep trying next provider
    }
  }

  return Array.from(found);
}

export async function fetchJobsFromDirectUrl(source: JobSource, domain: string, link: string) {
  const response = await fetchWithRetry(link, {}, { retries: 1, initialDelayMs: 250, timeoutMs: 9000 });
  const html = await response.text();
  const jobs = extractJobPostingJsonLd(html)
    .map((item) => mapJsonLdToJob(source, link, item))
    .filter(Boolean) as Array<ReturnType<typeof mapJsonLdToJob> extends infer T ? Exclude<T, null> : never>;

  if (jobs.length > 0) return jobs;

  const candidateLinks = extractCandidateJobLinks(html, link, domain).slice(0, 12);
  const nestedJobs = [];

  for (const candidate of candidateLinks) {
    try {
      const nestedResponse = await fetchWithRetry(candidate, {}, { retries: 1, initialDelayMs: 150, timeoutMs: 7000 });
      const nestedHtml = await nestedResponse.text();
      const nestedPostings = extractJobPostingJsonLd(nestedHtml)
        .map((item) => mapJsonLdToJob(source, candidate, item))
        .filter(Boolean) as Array<ReturnType<typeof mapJsonLdToJob> extends infer T ? Exclude<T, null> : never>;
      nestedJobs.push(...nestedPostings);
    } catch {
      // ignore nested page failures
    }
  }

  return nestedJobs;
}

export async function fetchDomainJobsViaSearch(
  source: JobSource,
  domain: string,
  filters: JobSearchFilters,
  maxPages = 4
): Promise<ConnectorResult> {
  const errors: string[] = [];
  const jobs = [];

  const seedUrls = buildSeedUrls(source, filters);
  for (const link of seedUrls.slice(0, maxPages)) {
    try {
      const pageJobs = await fetchJobsFromDirectUrl(source, domain, link);
      jobs.push(...pageJobs);
    } catch (error) {
      errors.push(`${source}: ${link} (${error instanceof Error ? error.message : "fetch error"})`);
    }
  }

  if (jobs.length > 0) return { jobs, errors };

  const links = (await searchLinksViaEngines(domain, filters)).slice(0, maxPages);

  if (links.length === 0) {
    return {
      jobs: [],
      errors: [...errors, `${source}: no URL found via web search for ${domain}`]
    };
  }

  for (const link of links) {
    try {
      const pageJobs = await fetchJobsFromDirectUrl(source, domain, link);
      jobs.push(...pageJobs);
    } catch (error) {
      errors.push(`${source}: ${link} (${error instanceof Error ? error.message : "fetch error"})`);
    }
  }

  if (jobs.length === 0 && errors.length === 0) {
    errors.push(`${source}: search completed but no usable jobs found`);
  }

  return { jobs, errors };
}
