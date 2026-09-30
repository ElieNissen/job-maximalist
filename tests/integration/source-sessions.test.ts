import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright";

const fixture = vi.hoisted(() => ({ directory: "", browsers: [] as Browser[] }));
vi.mock("@/lib/runtime-paths", () => ({ getRuntimeDataDirectory: () => fixture.directory }));
vi.mock("playwright", async (original) => {
  const actual = await original<typeof import("playwright")>();
  return { ...actual, chromium: { launch: async () => {
    // Exercise the interactive connection lifecycle headlessly, against an intercepted test site only.
    const browser = await actual.chromium.launch({ headless: true });
    fixture.browsers.push(browser);
    const create = browser.newPage.bind(browser);
    browser.newPage = async (options) => {
      const page = await create(options);
      await page.route("https://fixture.test/**", async (route) => {
        const cookies = await page.context().cookies();
        const authenticated = cookies.some((cookie) => cookie.name === "test_session" && cookie.value === "allowed");
        await route.fulfill({ contentType: "text/html", body: authenticated ? '<main><h1>Mes offres</h1><p>2 offres</p><a href="/jobs/1">Designer</a><a href="/jobs/2">Researcher</a></main>' : '<main><h1>Connexion</h1><input type="password"></main>' });
      });
      return page;
    };
    return browser;
  } } };
});
beforeEach(async () => { fixture.directory = await mkdtemp(path.join(os.tmpdir(), "jobmax-session-")); });
afterEach(async () => { for (const browser of fixture.browsers) await browser.close(); fixture.browsers = []; await rm(fixture.directory, { recursive: true, force: true }); });
describe("site sessions", () => {
  it("validates a login, restores it in another context, isolates origins and forgets it", async () => {
    const api = await import("@/lib/source-sessions");
    const url = "https://fixture.test/search";
    await api.beginSourceConnection(url);
    expect(await api.sourceSessionStatus(url)).toBe("connecting");
    await expect(api.finishSourceConnection(url)).rejects.toThrow("encore une connexion");
    const context = fixture.browsers[0].contexts()[0];
    await context.addCookies([{ name: "test_session", value: "allowed", url: "https://fixture.test", httpOnly: true, secure: true }]);
    await context.pages()[0].evaluate(() => localStorage.setItem("fixture-preference", "saved"));
    await api.finishSourceConnection(url);
    expect(await api.sourceSessionStatus(url)).toBe("saved");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const restored = await api.newSourcePage(browser, url);
    expect((await restored.context().cookies()).some((c) => c.name === "test_session")).toBe(true);
    await restored.goto(url);
    expect(await restored.locator("h1").innerText()).toBe("Mes offres");
    expect(await restored.evaluate(() => localStorage.getItem("fixture-preference"))).toBe("saved");
    const other = await api.newSourcePage(browser, "https://other.test/search");
    expect(await other.context().cookies()).toEqual([]);
    await api.forgetSourceSession(url);
    expect(await api.sourceSessionStatus(url)).toBe("none");
    const forgotten = await api.newSourcePage(browser, url);
    expect(await forgotten.context().cookies()).toEqual([]);
  }, 15000);
  it("cancels without saving an unfinished login", async () => {
    const api = await import("@/lib/source-sessions");
    const url = "https://fixture.test/search";
    await api.beginSourceConnection(url);
    await api.cancelSourceConnection(url);
    expect(await api.sourceSessionStatus(url)).toBe("none");
  }, 10000);
});
