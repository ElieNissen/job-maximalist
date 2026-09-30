import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { collectRecipe, validateNavigation } from "@/lib/recipe-navigation";
import { captureEvidence, type ScrapingRecipe } from "@/lib/scraping-recipes";

const base: ScrapingRecipe = { version: 1, kind: "dom", container: "article", endpoint: "", title: "h2", company: "", location: "", url: "a", urlPrefix: "", description: "", date: "" };
const card = (id: number) => `<article><h2>Designer ${id}</h2><a href="/jobs/${id}">Postuler</a></article>`;
describe("recorded navigation", () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser?.close(); });
  it("follows next links, deduplicates pages and stops at the advertised total", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => {
      const n = Number(new URL(route.request().url()).searchParams.get("page") ?? "1");
      return route.fulfill({ contentType: "text/html", body: `<main><p>4 offres</p>${card(n)}${card(n + 1)}${n < 3 ? `<a id="next" rel="next" href="/search?page=${n + 1}">Suivant</a>` : ""}</main>` });
    });
    const url = "https://fixture.test/search?page=1";
    const evidence = await captureEvidence(page, url);
    const recipe = { ...base, navigation: { kind: "next" as const, selector: "#next" } };
    validateNavigation(recipe, evidence);
    const result = await collectRecipe(page, url, recipe, evidence);
    expect(result).toMatchObject({ pages: 3, advanced: true, stop: "end" });
    expect(result.jobs).toHaveLength(4);
    await page.close();
  }, 15000);
  it("loads additional cards without revisiting the original URL", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<main><p>3 offres</p><div id="cards">${card(1)}</div><button id="more" type="button">Voir plus d’offres</button></main><script>let n=1; document.querySelector('#more').onclick=()=>{n++; document.querySelector('#cards').insertAdjacentHTML('beforeend','<article><h2>Designer '+n+'</h2><a href="/jobs/'+n+'">Postuler</a></article>');if(n===3)document.querySelector('#more').remove();};</script>` }));
    const result = await collectRecipe(page, "https://fixture.test/search", { ...base, navigation: { kind: "load_more", selector: "#more" } });
    expect(result.jobs).toHaveLength(3); expect(result.stop).toBe("end");
    await page.close();
  }, 15000);
  it("collects new JSON responses while loading more results", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => {
      if (route.request().url().includes("/api")) return route.fulfill({ json: { result: [{ id: 2, title: "Designer 2", url: "https://fixture.test/jobs/2" }] } });
      return route.fulfill({ contentType: "text/html", body: `<main><p>2 offres</p>${card(1)}<button id="more">Voir plus</button></main><script>fetch('/api?first=1'); document.querySelector('#more').onclick=async()=>{await fetch('/api?second=1');document.querySelector('main').insertAdjacentHTML('beforeend','${card(2)}'); document.querySelector('#more').remove();};</script>` });
    });
    let first = true;
    await page.route("https://fixture.test/api**", (route) => { const id = first ? 1 : 2; first = false; return route.fulfill({ json: { result: [{ id, title: `Designer ${id}`, url: `https://fixture.test/jobs/${id}` }] } }); });
    const result = await collectRecipe(page, "https://fixture.test/search", { ...base, kind: "json", container: "result", endpoint: "https://fixture.test/api", title: "title", url: "url", navigation: { kind: "load_more", selector: "#more" } });
    expect(result.jobs).toHaveLength(2); expect(result.stop).toBe("end");
    await page.close();
  }, 15000);
  it("stops stalled pagination, rejects unrelated controls, and honours page limits", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<main><p>10 offres</p>${card(1)}<button id="next">Suivant</button><button id="apply">Postuler</button></main>` }));
    const evidence = await captureEvidence(page, "https://fixture.test/search");
    expect(evidence.empty).toBe(false);
    expect(() => validateNavigation({ ...base, navigation: { kind: "next", selector: "#apply" } }, evidence)).toThrow();
    const recipe = { ...base, navigation: { kind: "next" as const, selector: "#next" } };
    expect((await collectRecipe(page, "https://fixture.test/search", recipe, evidence)).stop).toBe("stalled");
    expect((await collectRecipe(page, "https://fixture.test/search", recipe, evidence, { maxPages: 1 })).stop).toBe("limit");
    await page.close();
  }, 15000);
  it("handles infinite scroll and terminates when no new offers arrive", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: `<main><div id="scroll" style="overflow-y:auto;height:200px"><div id="cards" style="min-height:700px">${card(1)}</div></div></main><script>let n=1; const scroll=document.querySelector('#scroll');scroll.onscroll=()=>{if(n<3){n++; const cards=document.querySelector('#cards');cards.insertAdjacentHTML('beforeend','<article><h2>Designer '+n+'</h2><a href="/jobs/'+n+'">Postuler</a></article>');cards.style.minHeight=(n*700)+'px';}};</script>` }));
    const result = await collectRecipe(page, "https://fixture.test/search", { ...base, navigation: { kind: "scroll", selector: "#scroll" } });
    expect(result.jobs).toHaveLength(3); expect(result.stop).toBe("end");
    await page.close();
  }, 15000);
  it("recognizes login walls without asking the model for credentials", async () => {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<main><h1>Connexion</h1><input type="password" value="not-for-the-model"></main>' }));
    const evidence = await captureEvidence(page, "https://fixture.test/login");
    expect(evidence.loginRequired).toBe(true); expect(evidence.html).not.toContain("not-for-the-model");
    expect((await collectRecipe(page, "https://fixture.test/login", base, evidence)).stop).toBe("login_required");
    await page.close();
  });
});
