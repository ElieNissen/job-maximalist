import type { JobSearchFilters, JobSource } from "@/lib/types";

export type EditableContractType = "CDI" | "CDD";

export type UrlRadarSourceChoice = {
  value: JobSource;
  label: string;
};

export type UrlRadarPostedSinceChoice = {
  value: number | null;
  label: string;
};

export const URL_RADAR_DEFAULT_FILTERS: JobSearchFilters = {
  keywordsInclude: [
    "Product Designer",
    "UX/UI Designer",
    "UX Designer",
    "Interaction Designer",
    "UX Researcher",
    "Ergonome IHM"
  ],
  keywordsExclude: [
    "senior",
    "lead",
    "manager",
    "engineer",
    "brand",
    "principal",
    "staff",
    "head",
    "director",
    "intern",
    "internship",
    "stage",
    "stagiaire",
    "alternance",
    "apprentice",
    "apprentissage"
  ],
  locations: ["Ile-de-France", "Paris"],
  contractTypes: ["CDI", "CDD"],
  sources: [
    "linkedin",
    "wttj",
    "indeed",
    "hellowork",
    "service_public",
    "hiring_cafe",
    "licorne_society",
    "career_sites"
  ],
  // URL Radar does not currently enforce age by default. Keep it disabled to preserve results.
  postedSinceHours: undefined
};

export const URL_RADAR_SOURCE_CHOICES: UrlRadarSourceChoice[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "wttj", label: "WTTJ" },
  { value: "indeed", label: "Indeed" },
  { value: "hellowork", label: "Hellowork" },
  { value: "service_public", label: "Service Public" },
  { value: "hiring_cafe", label: "Hiring Cafe" },
  { value: "licorne_society", label: "Licorne Society" },
  { value: "career_sites", label: "Career Sites" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "politepol", label: "Politepol" }
];

export const URL_RADAR_CONTRACT_CHOICES: EditableContractType[] = ["CDI", "CDD"];

export const URL_RADAR_POSTED_SINCE_CHOICES: UrlRadarPostedSinceChoice[] = [
  { value: null, label: "Aucune limite" },
  { value: 24, label: "24 heures" },
  { value: 72, label: "3 jours" },
  { value: 168, label: "7 jours" },
  { value: 336, label: "14 jours" },
  { value: 720, label: "30 jours" }
];

export const URL_RADAR_TOGGLE_GROUPS = {
  seniorLead: ["senior", "lead"],
  management: ["manager", "principal", "staff", "head", "director"],
  internships: ["intern", "internship", "stage", "stagiaire", "alternance", "apprentice", "apprentissage"]
} as const;

const JOB_SOURCE_VALUES = new Set<JobSource>(URL_RADAR_SOURCE_CHOICES.map((choice) => choice.value));
const CONTRACT_VALUES = new Set<EditableContractType>(URL_RADAR_CONTRACT_CHOICES);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return [...fallback];

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of input) {
    const value = String(item ?? "").trim();
    if (!value) continue;

    const key = normalizeKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }

  return cleaned;
}

function sanitizeSources(input: unknown): JobSource[] {
  if (!Array.isArray(input)) return [...URL_RADAR_DEFAULT_FILTERS.sources];

  const seen = new Set<JobSource>();
  const cleaned: JobSource[] = [];

  for (const item of input) {
    const value = String(item ?? "") as JobSource;
    if (!JOB_SOURCE_VALUES.has(value) || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }

  return cleaned;
}

function sanitizeContractTypes(input: unknown): EditableContractType[] {
  if (!Array.isArray(input)) return [...URL_RADAR_DEFAULT_FILTERS.contractTypes];

  const seen = new Set<EditableContractType>();
  const cleaned: EditableContractType[] = [];

  for (const item of input) {
    const value = String(item ?? "") as EditableContractType;
    if (!CONTRACT_VALUES.has(value) || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
  }

  return cleaned;
}

function sanitizePostedSinceHours(input: unknown, fallback: number | undefined): number | undefined {
  if (input === null || input === undefined || input === "") return undefined;
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(24 * 365, Math.round(value));
}

export function cloneUrlRadarFilters(filters: JobSearchFilters = URL_RADAR_DEFAULT_FILTERS): JobSearchFilters {
  return {
    keywordsInclude: [...filters.keywordsInclude],
    keywordsExclude: [...filters.keywordsExclude],
    locations: [...filters.locations],
    contractTypes: [...filters.contractTypes],
    sources: [...filters.sources],
    postedSinceHours: filters.postedSinceHours
  };
}

export function sanitizeUrlRadarFilters(input: unknown): JobSearchFilters {
  const raw = (input ?? {}) as Partial<JobSearchFilters>;

  return {
    keywordsInclude: sanitizeStringArray(raw.keywordsInclude, URL_RADAR_DEFAULT_FILTERS.keywordsInclude),
    keywordsExclude: sanitizeStringArray(raw.keywordsExclude, URL_RADAR_DEFAULT_FILTERS.keywordsExclude),
    locations: sanitizeStringArray(raw.locations, URL_RADAR_DEFAULT_FILTERS.locations),
    contractTypes: sanitizeContractTypes(raw.contractTypes),
    sources: sanitizeSources(raw.sources),
    postedSinceHours: sanitizePostedSinceHours(raw.postedSinceHours, URL_RADAR_DEFAULT_FILTERS.postedSinceHours)
  };
}
