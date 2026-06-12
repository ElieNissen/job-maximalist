import { describe, expect, it } from "vitest";
import { matchesFilters } from "@/lib/filtering";
import type { JobSearchFilters } from "@/lib/types";
import { cloneUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";

describe("matchesFilters", () => {
  it("keeps results when no keyword or location filter is configured", () => {
    const result = matchesFilters(
      {
        source: "wttj",
        sourceJobId: "1",
        title: "Account executive",
        company: "Acme",
        location: "Nantes",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      },
      URL_RADAR_DEFAULT_FILTERS
    );

    expect(result.match).toBe(true);
    expect(result.excludedReason).toBeNull();
  });

  it("matches include keywords and contract/location when configured", () => {
    const filters = {
      ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
      keywordsInclude: ["Product Designer"],
      locations: ["Ile-de-France"]
    };

    const result = matchesFilters(
      {
        source: "wttj",
        sourceJobId: "1",
        title: "Product Designer",
        company: "Acme",
        location: "Boulogne-Billancourt",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      },
      filters
    );

    expect(result.match).toBe(true);
    expect(result.excludedReason).toBeNull();
  });

  it("rejects excluded keywords when configured", () => {
    const filters = {
      ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
      keywordsInclude: ["UX Designer"],
      keywordsExclude: ["senior"],
      locations: ["Ile-de-France"]
    };

    const result = matchesFilters(
      {
        source: "linkedin",
        sourceJobId: "2",
        title: "Senior UX Designer",
        company: "Acme",
        location: "Ile-de-France",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      },
      filters
    );

    expect(result.match).toBe(false);
    expect(result.excludedReason).toBe("excluded_keyword");
    expect(result.excludedKeywords).toEqual(["senior"]);
  });

  it("filters explicit freelance jobs when freelance is not enabled", () => {
    const filters = {
      ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
      keywordsInclude: ["developer"],
      contractTypes: ["CDI", "CDD"] as JobSearchFilters["contractTypes"]
    };

    const result = matchesFilters(
      {
        source: "linkedin",
        sourceJobId: "3",
        title: "Freelance developer",
        company: "Acme",
        location: "Remote",
        contractType: "OTHER",
        url: "https://example.com",
        postedAt: new Date()
      },
      filters
    );

    expect(result.match).toBe(false);
    expect(result.excludedReason).toBe("contract_type_mismatch");
  });

  it("keeps explicit freelance jobs when freelance is enabled", () => {
    const filters = {
      ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
      keywordsInclude: ["developer"],
      contractTypes: ["FREELANCE"] as JobSearchFilters["contractTypes"]
    };

    const result = matchesFilters(
      {
        source: "linkedin",
        sourceJobId: "4",
        title: "Freelance developer",
        company: "Acme",
        location: "Remote",
        contractType: "OTHER",
        url: "https://example.com",
        postedAt: new Date()
      },
      filters
    );

    expect(result.match).toBe(true);
    expect(result.excludedReason).toBeNull();
  });
});
