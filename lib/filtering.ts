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

const STRICT_TITLE_PATTERNS = [
  /\bproduct designer\b/,
  /\bproduct design\b/,
  /\bux\s*\/\s*ui\s+designer\b/,
  /\bui\s*\/\s*ux\s+designer\b/,
  /\bux\s+ui\s+designer\b/,
  /\bux\s+designer\b/,
  /\bui\s+designer\b/,
  /\bdesigner\s+ux\b/,
  /\bdesigner\s+ui\b/,
  /\bdesigner\s+ux\s*\/\s*ui\b/,
  /\bdesigner\s+ui\s*\/\s*ux\b/,
  /\bdesigner\s+ux\s+ui\b/,
  /\bdesigner\s+ui\s+ux\b/,
  /\binteraction\s+designer\b/,
  /\bdesigner\s+interaction\b/,
  /\bergonome\s+ihm\b/,
  /\bergonome\s+ux\b/,
  /\bux\s+writer\b/,
  /\bcontent\s+designer\b/,
  /\bux\s+researcher\b/,
  /\banalyste\s+ux\b/,
  /\banalyste\s+ui\b/,
  /\banalyste\s+ux\s*\/\s*ui\b/,
  /\bix\s+designer\b/
];

const UNKNOWN_LOCATION_TOKENS = new Set(["", "france", "fr", "remote", "europe"]);

const TITLE_TOKEN_ALIASES: Record<string, string> = {
  designer: "design",
  design: "design",
  designing: "design",
  analyste: "analyst",
  analyst: "analyst",
  analysts: "analyst",
  researcher: "research",
  research: "research",
  researchers: "research",
  consultant: "consultant",
  consultante: "consultant",
  consultants: "consultant",
  consultantes: "consultant",
  writer: "writer",
  writers: "writer",
  ergonome: "ergonome",
  ergonomes: "ergonome",
  product: "product",
  produits: "product",
  produit: "product",
  interaction: "interaction",
  interactions: "interaction",
  ux: "ux",
  ui: "ui",
  ihm: "ihm",
  ix: "ix"
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

function matchesDesignTitle(titleNormalized: string, filters: JobSearchFilters): string[] {
  const matchesFromKeywords = filters.keywordsInclude.filter((keyword) =>
    matchesKeywordFlexibly(titleNormalized, keyword)
  );

  if (matchesFromKeywords.length > 0) {
    return matchesFromKeywords;
  }

  if (STRICT_TITLE_PATTERNS.some((pattern) => pattern.test(titleNormalized))) {
    return ["strict_design_pattern"];
  }

  const compactTitle = titleNormalized.replace(/\s+/g, "");
  const hasDesignWord =
    /\b(designer|design|writer|researcher|ergonome|analyste)\b/.test(titleNormalized) ||
    /(designer|design|writer|researcher|ergonome|analyste)/.test(compactTitle);
  const hasUxFamily =
    /\b(ux|ui|ihm|interaction|product)\b/.test(titleNormalized) ||
    /(ux|ui|ihm|interaction|product)/.test(compactTitle);

  if (hasDesignWord && hasUxFamily) {
    return ["flex_design_pattern"];
  }

  return [];
}

export function matchesFilters(job: NormalizedJob, filters: JobSearchFilters): {
  match: boolean;
  matchedKeywords: string[];
  excludedReason: string | null;
} {
  const isVieJob = /businessfrance\.fr/i.test(job.url);

  if (!filters.sources.includes(job.source)) {
    return { match: false, matchedKeywords: [], excludedReason: "source_mismatch" };
  }

  const titleNormalized = normalizeForMatch(job.title);
  const titleLoose = normalizeText(job.title);
  const location = normalizeLocation(job.location);

  const matchedKeywords = matchesDesignTitle(titleNormalized, filters);
  if (matchedKeywords.length === 0) {
    return { match: false, matchedKeywords: [], excludedReason: "no_include_keyword_match" };
  }

  const hasExcludedWord = filters.keywordsExclude.some((keyword) =>
    titleLoose.includes(normalizeText(keyword))
  );
  if (hasExcludedWord) {
    return { match: false, matchedKeywords, excludedReason: "excluded_keyword" };
  }

  const hasLocationMatch = filters.locations.some((candidate) =>
    location.includes(normalizeLocation(candidate))
  );
  const isLikelyIDF = IDF_LOCATIONS.some((idf) => location.includes(idf));
  const isUnknownPolitepolLocation =
    job.source === "politepol" &&
    Array.from(UNKNOWN_LOCATION_TOKENS).some((token) => location === token || location.includes(`${token} `));

  if (!isVieJob && !hasLocationMatch && !isLikelyIDF && !isUnknownPolitepolLocation) {
    return { match: false, matchedKeywords, excludedReason: "location_mismatch" };
  }

  if (typeof filters.postedSinceHours === "number" && Number.isFinite(job.postedAt.getTime())) {
    const maxAgeMs = filters.postedSinceHours * 60 * 60 * 1000;
    const ageMs = Date.now() - job.postedAt.getTime();
    if (ageMs > maxAgeMs) {
      return { match: false, matchedKeywords, excludedReason: "posted_too_old" };
    }
  }

  // Contract is often missing in feeds. Keep CDI/CDD strict when present, tolerate unknown.
  if (job.contractType !== "OTHER" && !filters.contractTypes.includes(job.contractType as "CDI" | "CDD")) {
    return { match: false, matchedKeywords, excludedReason: "contract_type_mismatch" };
  }

  return { match: true, matchedKeywords, excludedReason: null };
}
