import type { ConnectorResult, JobSearchFilters } from "@/lib/types";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";

export function fetchHiringCafeJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  return fetchDomainJobsViaSearch("hiring_cafe", "hiring.cafe", filters);
}
