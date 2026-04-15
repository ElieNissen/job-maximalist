import type { ConnectorResult, JobSearchFilters, JobSource } from "@/lib/types";
import { fetchLinkedInJobs } from "@/lib/connectors/linkedin";
import { fetchWttjJobs } from "@/lib/connectors/wttj";
import { fetchIndeedJobs } from "@/lib/connectors/indeed";
import { fetchHelloWorkJobs } from "@/lib/connectors/hellowork";
import { fetchServicePublicJobs } from "@/lib/connectors/service-public";
import { fetchHiringCafeJobs } from "@/lib/connectors/hiring-cafe";
import { fetchLicorneSocietyJobs } from "@/lib/connectors/licorne-society";
import { fetchCareerSitesJobs } from "@/lib/connectors/career-sites";

export async function fetchJobsFromSource(source: JobSource, filters: JobSearchFilters): Promise<ConnectorResult> {
  switch (source) {
    case "linkedin":
      return fetchLinkedInJobs(filters);
    case "wttj":
      return fetchWttjJobs(filters);
    case "indeed":
      return fetchIndeedJobs(filters);
    case "hellowork":
      return fetchHelloWorkJobs(filters);
    case "service_public":
      return fetchServicePublicJobs(filters);
    case "hiring_cafe":
      return fetchHiringCafeJobs(filters);
    case "licorne_society":
      return fetchLicorneSocietyJobs(filters);
    case "career_sites":
      return fetchCareerSitesJobs(filters);
    case "politepol":
      return { jobs: [], errors: [] };
    default:
      return { jobs: [], errors: [`Unsupported source: ${source}`] };
  }
}

export async function fetchAllSources(filters: JobSearchFilters): Promise<Record<JobSource, ConnectorResult>> {
  const entries = await Promise.all(
    filters.sources.map(async (source) => [source, await fetchJobsFromSource(source, filters)] as const)
  );

  return Object.fromEntries(entries) as Record<JobSource, ConnectorResult>;
}
