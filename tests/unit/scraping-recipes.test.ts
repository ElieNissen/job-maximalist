import { describe, expect, it } from "vitest";
import { discoverArrays, extractWithRecipe, readField, validateRecipe, type PageEvidence, type ScrapingRecipe } from "@/lib/scraping-recipes";
import type { Page } from "playwright";

const recipe: ScrapingRecipe = { version: 1, kind: "json", endpoint: "https://example.org/api/offers", container: "result", title: "missionTitle", company: "organizationName", location: "cityName", url: "id", urlPrefix: "https://example.org/offres/", description: "missionDescription", date: "startBroadcastDate" };
const evidence: PageEvidence = { html: "", text: "", links: ["https://example.org/offres/12", "https://example.org/offres/13"], blocked: false, empty: false, hasJobs: true,
  samples: [{ endpoint: recipe.endpoint, container: "result", rows: [
    { id: 12, missionTitle: "UX designer", organizationName: "Orange", cityName: "Bucarest", missionDescription: "Design", startBroadcastDate: "2026-09-29T00:00:00Z" },
    { id: 13, missionTitle: "Product designer", organizationName: "Acme", cityName: "Berlin" }
  ] }] };

describe("declarative scraping recipes", () => {
  it("maps live data without embedding the original jobs in the recipe", async () => {
    const jobs = await extractWithRecipe({} as Page, evidence, recipe, "https://example.org/search");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ title: "UX designer", company: "Orange", location: "Bucarest", extractionMethod: "saved_recipe", url: "https://example.org/offres/12" });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-29T00:00:00.000Z");
    const changed = structuredClone(evidence);
    changed.samples[0].rows[0].missionTitle = "Research designer";
    expect((await extractWithRecipe({} as Page, changed, recipe, "https://example.org/search"))[0].title).toBe("Research designer");
  });
  it("rejects invented link templates and executable field paths", async () => {
    expect(await extractWithRecipe({} as Page, evidence, { ...recipe, urlPrefix: "https://invented.org/" }, "https://example.org/search")).toEqual([]);
    expect(() => validateRecipe({ ...recipe, title: "eval(process.env)" })).toThrow();
    expect(readField({}, "__proto__.toString")).toBeUndefined();
    expect(readField({}, "constructor")).toBeUndefined();
  });
  it("does not produce offers from blocked or empty pages", async () => {
    expect(await extractWithRecipe({} as Page, { ...evidence, blocked: true }, recipe, "https://example.org/search")).toEqual([]);
    expect(await extractWithRecipe({} as Page, { ...evidence, empty: true }, recipe, "https://example.org/search")).toEqual([]);
  });
  it("finds nested collections without exposing unrelated contacts", () => {
    expect(discoverArrays({ contacts: [{ title: "Mr" }], result: evidence.samples[0].rows }, recipe.endpoint)).toEqual(evidence.samples);
  });
  it("rejects selectors that mainly produce incomplete rows", async () => {
    const broken = structuredClone(evidence);
    delete broken.samples[0].rows[0].missionTitle;
    expect(await extractWithRecipe({} as Page, broken, recipe, "https://example.org/search")).toEqual([]);
  });
});
