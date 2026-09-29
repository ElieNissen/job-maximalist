import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { captureEvidence, extractWithRecipe, type ScrapingRecipe } from "@/lib/scraping-recipes";

describe("recipe extraction in Chromium", () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser?.close(); });
  const recipe: ScrapingRecipe = { version: 1, kind: "dom", container: "article.job", endpoint: "", title: "h2", company: ".company", location: ".location", url: "a", urlPrefix: "", description: "p", date: "time" };
  it("extracts cards and their URLs after rendering without generated code", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<main><p>2 offres</p>${[1, 2].map((id) => `<article class="job"><h2>Designer ${id}</h2><span class="company">Acme</span><span class="location">Paris</span><p>Conception produit</p><a href="/jobs/${id}">Postuler</a><time datetime="2026-09-29"></time></article>`).join("")}</main>` }));
    const evidence = await captureEvidence(page, "https://fixture.test/search");
    const jobs = await extractWithRecipe(page, evidence, recipe, "https://fixture.test/search");
    expect(evidence.hasJobs).toBe(true);
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({ title: "Designer 2", company: "Acme", location: "Paris", url: "https://fixture.test/jobs/2" });
    await page.close();
  });
  it("recognizes empty searches despite navigation links", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<main><p>Aucune offre trouvée</p><nav><a href="/jobs/paris">Paris</a><a href="/jobs/lyon">Lyon</a></nav></main>' }));
    const evidence = await captureEvidence(page, "https://fixture.test/search");
    expect(evidence.empty).toBe(true);
    expect(await extractWithRecipe(page, evidence, recipe, "https://fixture.test/search")).toEqual([]);
    await page.close();
  });
});
