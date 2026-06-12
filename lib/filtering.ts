import type { JobSearchFilters, NormalizedJob } from "@/lib/types";
import { normalizeLocation, normalizeText } from "@/lib/utils";

const IDF_LOCATIONS = [
  "ile-de-france",
  "ile de france",
  "paris",
  "boulogne-billancourt",
  "saint-denis",
  "nanterre",
  "creteil",
  "75",
  "77",
  "78",
  "91",
  "92",
  "93",
  "94",
  "95",
  "puteaux",
  "courbevoie",
  "levallois",
  "neuilly",
  "maison-alfort",
  "maisons-alfort",
  "villepinte",
  "pantin",
  "puteaux",
  "boulogne-billancourt"
];

const TITLE_TOKEN_ALIASES: Record<string, string> = {
  developpeur: "developpeur",
  developpeuse: "developpeur",
  developer: "developpeur",
  dev: "developpeur",
  designer: "designer",
  design: "designer",
  designing: "designer",
  product: "product",
  produit: "product",
  produits: "product",
  manager: "manager",
  management: "manager",
  analyste: "analyst",
  analyst: "analyst",
  analysts: "analyst",
  data: "data",
  marketing: "marketing",
  customer: "customer",
  success: "success"
};

const IGNORABLE_TOKENS = new Set(["h", "f", "fh", "hf", "mx", "m", "and", "et", "ou", "or", "de", "du", "des"]);

function normalizeForMatch(input: string): string {
  return normalizeText(input)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeTitleToken(token: string): string {
  return TITLE_TOKEN_ALIASES[token] ?? token;
}

function tokenizeForFlexibleMatch(input: string): string[] {
  return normalizeForMatch(input)
    .split(" ")
    .map((token) => canonicalizeTitleToken(token))
    .filter((token) => token && !IGNORABLE_TOKENS.has(token));
}

function matchesKeywordStrict(titleNormalized: string, keyword: string): boolean {
  const keywordNormalized = normalizeForMatch(keyword);
  if (!keywordNormalized) return false;
  if (titleNormalized.includes(keywordNormalized)) return true;

  const compactTitle = titleNormalized.replace(/\s+/g, "");
  const compactKeyword = keywordNormalized.replace(/\s+/g, "");
  return compactTitle.includes(compactKeyword);
}

function matchesKeywordFlexibly(titleNormalized: string, keyword: string): boolean {
  if (matchesKeywordStrict(titleNormalized, keyword)) {
    return true;
  }

  const keywordTokens = tokenizeForFlexibleMatch(keyword);
  if (keywordTokens.length === 0) return false;

  const titleTokens = tokenizeForFlexibleMatch(titleNormalized);
  if (titleTokens.length === 0) return false;

  const titleTokenSet = new Set(titleTokens);
  return keywordTokens.every((token) => titleTokenSet.has(token));
}

function matchesIncludedKeywords(titleNormalized: string, filters: JobSearchFilters): string[] {
  const includeKeywords = filters.keywordsInclude.map((keyword) => keyword.trim()).filter(Boolean);
  if (includeKeywords.length === 0) {
    return ["no_include_filter"];
  }

  return includeKeywords.filter((keyword) => matchesKeywordFlexibly(titleNormalized, keyword));
}

function findExcludedKeywords(titleLoose: string, excludedKeywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const keyword of excludedKeywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword || !titleLoose.includes(normalizedKeyword) || seen.has(normalizedKeyword)) {
      continue;
    }

    seen.add(normalizedKeyword);
    matches.push(keyword.trim());
  }

  return matches;
}

function hasFreelanceSignal(job: NormalizedJob): boolean {
  const searchableText = normalizeText(
    [job.title, job.metadataText, job.experienceHint, job.url].filter(Boolean).join(" ")
  );

  return /\b(freelance|freelancer|independant|independent)\b/.test(searchableText);
}

export function matchesFilters(job: NormalizedJob, filters: JobSearchFilters): {
  match: boolean;
  matchedKeywords: string[];
  excludedReason: string | null;
  excludedKeywords: string[];
} {
  const isVieJob = /businessfrance\.fr/i.test(job.url);

  const titleNormalized = normalizeForMatch(job.title);
  const titleLoose = normalizeText(job.title);
  const location = normalizeLocation(job.location);

  const matchedKeywords = matchesIncludedKeywords(titleNormalized, filters);
  if (matchedKeywords.length === 0) {
    return { match: false, matchedKeywords: [], excludedReason: "no_include_keyword_match", excludedKeywords: [] };
  }

  const excludedKeywords = findExcludedKeywords(titleLoose, filters.keywordsExclude);
  if (excludedKeywords.length > 0) {
    return { match: false, matchedKeywords, excludedReason: "excluded_keyword", excludedKeywords };
  }

  const locationFilters = filters.locations.map((candidate) => normalizeLocation(candidate)).filter(Boolean);
  const hasLocationFilter = locationFilters.length > 0;
  const hasLocationMatch = locationFilters.some((candidate) => {
    if (location.includes(candidate)) return true;
    if (candidate === "ile-de-france" || candidate === "ile de france") {
      return IDF_LOCATIONS.some((idf) => location.includes(idf));
    }
    return false;
  });

  if (!isVieJob && hasLocationFilter && !hasLocationMatch) {
    return { match: false, matchedKeywords, excludedReason: "location_mismatch", excludedKeywords: [] };
  }

  if (typeof filters.postedSinceHours === "number" && Number.isFinite(job.postedAt.getTime())) {
    const maxAgeMs = filters.postedSinceHours * 60 * 60 * 1000;
    const ageMs = Date.now() - job.postedAt.getTime();
    if (ageMs > maxAgeMs) {
      return { match: false, matchedKeywords, excludedReason: "posted_too_old", excludedKeywords: [] };
    }
  }

  // Contract is often missing in feeds. Keep CDI/CDD strict when present, tolerate unknown.
  if (job.contractType !== "OTHER" && !filters.contractTypes.includes(job.contractType)) {
    return { match: false, matchedKeywords, excludedReason: "contract_type_mismatch", excludedKeywords: [] };
  }

  if (hasFreelanceSignal(job) && !filters.contractTypes.includes("FREELANCE")) {
    return { match: false, matchedKeywords, excludedReason: "contract_type_mismatch", excludedKeywords: [] };
  }

  return { match: true, matchedKeywords, excludedReason: null, excludedKeywords: [] };
}
