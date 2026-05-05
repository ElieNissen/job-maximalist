import { describe, expect, it } from "vitest";
import { buildSourceOptions } from "@/components/url-radar/utils";
import type { JobCluster } from "@/components/url-radar/types";

const BASE_CLUSTER: JobCluster = {
  key: "ux designer|acme",
  ids: ["1"],
  title: "UX Designer",
  company: "Acme",
  location: "Paris",
  contractType: "CDI",
  postedAt: "2026-05-05T08:00:00.000Z",
  firstSeenAt: "2026-05-05T08:00:00.000Z",
  lastSeenAt: "2026-05-05T08:00:00.000Z",
  viewed: false,
  saved: false,
  experienceHint: null,
  sources: [],
  excludedReasons: [],
  excludedKeywordMatches: []
};

describe("buildSourceOptions", () => {
  it("keeps configured sources visible even when no jobs were scraped yet", () => {
    const options = buildSourceOptions([], ["https://www.welcometothejungle.com/fr/jobs-matches?published_since=last_3d"]);

    expect(options).toEqual([
      expect.objectContaining({
        label: "WTTJ",
        count: 0,
        url: "https://www.welcometothejungle.com/fr/jobs-matches?published_since=last_3d"
      })
    ]);
  });

  it("reuses the configured source entry and increments its count when jobs exist", () => {
    const options = buildSourceOptions(
      [
        {
          ...BASE_CLUSTER,
          sources: [{ source: "wttj", url: "https://www.welcometothejungle.com/fr/companies/acme/jobs/ux-designer" }]
        }
      ],
      ["https://www.welcometothejungle.com/fr/jobs-matches?published_since=last_3d"]
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual(
      expect.objectContaining({
        label: "WTTJ",
        count: 1
      })
    );
  });

  it("groups configured and scraped URLs from the same source under one tag", () => {
    const options = buildSourceOptions(
      [
        {
          ...BASE_CLUSTER,
          sources: [{ source: "linkedin", url: "https://fr.linkedin.com/jobs/view/123456789" }]
        }
      ],
      ["https://www.linkedin.com/jobs/search/?keywords=product%20designer"]
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual(
      expect.objectContaining({
        label: "LINKEDIN",
        count: 1
      })
    );
  });
});
