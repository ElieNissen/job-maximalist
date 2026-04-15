import type { JobSearchFilters } from "@/lib/types";

export const DEFAULT_FILTERS: JobSearchFilters = {
  keywordsInclude: ["Product Designer", "UX/UI Designer", "UX Designer"],
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
  postedSinceHours: 168
};

export const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: 20
};
