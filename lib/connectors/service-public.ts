import type { ConnectorResult, JobSearchFilters } from "@/lib/types";
import { fetchDomainJobsViaSearch } from "@/lib/connectors/web-domain";

export function fetchServicePublicJobs(filters: JobSearchFilters): Promise<ConnectorResult> {
  return fetchDomainJobsViaSearch("service_public", "choisirleservicepublic.gouv.fr", filters);
}
