import { describe, expect, it } from "vitest";
import { matchesFilters } from "@/lib/filtering";
import { URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";

describe("matchesFilters", () => {
  it("matches include keywords and contract/location", () => {
    const result = matchesFilters(
      {
        source: "wttj",
        sourceJobId: "1",
        title: "UX Designer",
        company: "Acme",
        location: "Paris",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      },
      URL_RADAR_DEFAULT_FILTERS
    );

    expect(result.match).toBe(true);
    expect(result.excludedReason).toBeNull();
  });

  it("rejects excluded keywords with accent/case variations", () => {
    const result = matchesFilters(
      {
        source: "linkedin",
        sourceJobId: "2",
        title: "Sénior UX Designer",
        company: "Acme",
        location: "Ile-de-France",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      },
      URL_RADAR_DEFAULT_FILTERS
    );

    expect(result.match).toBe(false);
    expect(result.excludedReason).toBe("excluded_keyword");
    expect(result.excludedKeywords).toEqual(["senior"]);
  });
});
