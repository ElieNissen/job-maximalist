import { fetchWithRetry } from "@/lib/http";
import type { ConnectorResult, JobSearchFilters, NormalizedJob } from "@/lib/types";
import { parseContractType } from "@/lib/utils";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";
import { extractJobPostingJsonLd, mapJsonLdToJob } from "@/lib/connectors/jsonld";

function buildSearchUrl(filters: JobSearchFilters): string {
  const query = encodeURIComponent(filters.keywordsInclude.join(" OR "));
  const aroundParis = encodeURIComponent("Ile-de-France");
  return `https://www.welcometothejungle.com/fr/jobs?query=${query}&aroundQuery=${aroundParis}`;
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

function extractWttjJobs(data: any): NormalizedJob[] {
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
      const location = job.office?.city ?? job.location?.city ?? job.location?.name ?? "Ile-de-France";
      const contractLabel = job.contract_type?.name ?? job.contract_type ?? "";
      const published = job.published_at ?? job.created_at;

      if (!id || !title || !company || !url) return null;

      return {
        source: "wttj" as const,
        sourceJobId: id,
        title,
        company,
        location,
        contractType: parseContractType(contractLabel),
        url,
        postedAt: published ? new Date(published) : new Date()
      };
    })
    .filter(Boolean) as NormalizedJob[];
}

function extractJsonLdJobs(html: string): NormalizedJob[] {
  const postings = extractJobPostingJsonLd(html);
  return postings
    .map((item) => mapJsonLdToJob("wttj", "https://www.welcometothejungle.com/fr/jobs", item))
    .filter(Boolean) as NormalizedJob[];
}

export async function fetchWttjJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  const url = buildSearchUrl(filters);
  try {
    const response = await fetchWithRetry(url, {}, { retries: 2, initialDelayMs: 700 });
    const html = await response.text();
    const data = extractJsonFromNextData(html);
    const primary = data ? extractWttjJobs(data) : [];

    if (primary.length > 0) {
      return { jobs: primary, errors: [] };
    }

    const jsonLdFallback = extractJsonLdJobs(html);
    if (jsonLdFallback.length > 0) {
      return {
        jobs: jsonLdFallback,
        errors: ["WTTJ NEXT_DATA unavailable, JSON-LD fallback used"]
      };
    }

    const domainFallback = await fetchDomainJobsViaSearch("wttj", "welcometothejungle.com", filters, 4);
    return {
      jobs: domainFallback.jobs,
      errors: ["WTTJ parsing returned no jobs", ...domainFallback.errors]
    };
  } catch (error) {
    const fallback = await fetchDomainJobsViaSearch("wttj", "welcometothejungle.com", filters, 4);
    return {
      jobs: fallback.jobs,
      errors: [error instanceof Error ? error.message : "WTTJ connector failed", ...fallback.errors]
    };
  }
}
