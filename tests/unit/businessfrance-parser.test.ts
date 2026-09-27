import { describe, expect, it } from "vitest";
import { parseBusinessFranceSearchApiOffers } from "@/lib/url-radar-service";

describe("parseBusinessFranceSearchApiOffers", () => {
  it("maps the rendered search API results to radar jobs", () => {
    const jobs = parseBusinessFranceSearchApiOffers({
      result: [
        {
          id: 246116,
          missionTitle: "Digital product designer with Figma experience (H/F)",
          organizationName: "ORANGE",
          countryName: "ROUMANIE",
          cityName: "BUCAREST",
          missionType: "VIE",
          missionDescription: "Design digital experiences in Figma.",
          startBroadcastDate: "2026-09-23T00:00:00Z"
        }
      ]
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "246116",
      title: "Digital product designer with Figma experience (H/F)",
      company: "ORANGE",
      location: "ROUMANIE - BUCAREST",
      contractType: "OTHER",
      url: "https://mon-vie-via.businessfrance.fr/offres/246116"
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("ignores malformed API entries", () => {
    expect(parseBusinessFranceSearchApiOffers({ result: [{ id: 1 }, null] })).toEqual([]);
  });
});
