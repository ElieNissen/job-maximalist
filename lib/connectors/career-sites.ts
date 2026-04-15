import type { ConnectorResult, JobSearchFilters } from "@/lib/types";
import { fetchDomainJobsViaSearch, fetchJobsFromDirectUrl } from "@/lib/connectors/web-domain";
import { getManualSources } from "@/lib/manual-sources";

const CAREER_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "jobs.smartrecruiters.com"
];

function inferDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "career";
  }
}

export async function fetchCareerSitesJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  const merged: ConnectorResult = { jobs: [], errors: [] };

  for (const domain of CAREER_DOMAINS) {
    const result = await fetchDomainJobsViaSearch("career_sites", domain, filters, 4);
    merged.jobs.push(...result.jobs);
    merged.errors.push(...result.errors);
  }

  const manualUrls = await getManualSources();
  for (const url of manualUrls) {
    const domain = inferDomain(url);
    try {
      const jobs = await fetchJobsFromDirectUrl("career_sites", domain, url);
      merged.jobs.push(...jobs);
    } catch (error) {
      merged.errors.push(`manual: ${url} (${error instanceof Error ? error.message : "fetch error"})`);
    }
  }

  return merged;
}
