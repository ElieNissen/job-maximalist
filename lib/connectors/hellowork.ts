import type { ConnectorResult, JobSearchFilters } from "@/lib/types";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";

export function fetchHelloWorkJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  return fetchDomainJobsViaSearch("hellowork", "hellowork.com", filters);
}
