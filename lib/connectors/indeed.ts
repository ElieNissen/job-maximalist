import type { ConnectorResult, JobSearchFilters } from "@/lib/types";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";

export function fetchIndeedJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  return fetchDomainJobsViaSearch("indeed", "indeed.com", filters);
}
