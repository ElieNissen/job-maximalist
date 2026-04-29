export type JobSource =
  | "linkedin"
  | "wttj"
  | "indeed"
  | "hellowork"
  | "service_public"
  | "hiring_cafe"
  | "licorne_society"
  | "career_sites";

export type ContractType = "CDI" | "CDD" | "OTHER";

export interface JobSearchFilters {
  keywordsInclude: string[];
  keywordsExclude: string[];
  locations: string[];
  contractTypes: Array<"CDI" | "CDD">;
  sources: JobSource[];
  postedSinceHours?: number;
}

export interface NormalizedJob {
  source: JobSource;
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  contractType: ContractType;
  url: string;
  postedAt: Date;
  experienceHint?: string | null;
  metadataText?: string | null;
}

export interface ConnectorResult {
  jobs: NormalizedJob[];
  errors: string[];
}

export interface JobDTO {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  contractType: ContractType;
  url: string;
  postedAt: string;
  scrapedAt: string;
  viewed: boolean;
  saved: boolean;
}

export interface ConnectorHealth {
  source: JobSource;
  lastStatus: "SUCCESS" | "PARTIAL" | "FAILED" | "NEVER";
  lastError: string | null;
  lastRunAt: string | null;
}
