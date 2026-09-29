// Run against a locally started app: node scripts/verify-local-assistance-ui.mjs http://localhost:3107
// All application API calls are mocked: no source, download or user data is changed.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = "https://example.org/jobs/search";
  const config = { enabled: false, intervalMinutes: 60, urls: [url], filters: { keywordsInclude: [], keywordsExclude: [], locations: [], contractTypes: [], sources: [] }, removedUrlsHistory: [], onboardingCompletedAt: "2026-09-29T10:00:00Z", onboardingDismissedAt: null, assistanceMode: "ask" };
  let repairRequested = false;
  await page.route("**/api/url-radar/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let payload = {};
    if (path.endsWith("/config")) payload = config;
    if (path.endsWith("/jobs")) payload = { items: [], total: 0 };
    if (path.endsWith("/status")) payload = { runs: [], lastRunSummary: {} };
    if (path.endsWith("/assistance")) {
      if (route.request().method() === "POST") { repairRequested = route.request().postDataJSON().action === "repair"; payload = { ok: true }; }
      else payload = { available: false, modelReady: false, downloading: false, mode: "ask", urls: [url], sources: { [url]: { status: repairRequested ? "repairing" : "needs_permission", message: repairRequested ? "Rétablissement de la récupération…" : "Des offres sont présentes mais mal récupérées. Autoriser une réparation locale ?", updatedAt: "2026-09-29T10:00:00Z" } } };
    }
    await route.fulfill({ json: payload });
  });
  await page.goto(process.argv[2] ?? "http://localhost:3107");
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("radio", { name: "Me demander", exact: true }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "Me demander", exact: true }).isChecked(), true);
  await page.getByRole("link", { name: "Installer Ollama" }).waitFor();
  await page.waitForTimeout(1500);
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/local-assistance-settings.png", fullPage: true });
  await page.getByRole("tab", { name: "Diagnostic", exact: true }).click();
  await page.getByRole("button", { name: "Autoriser cette réparation" }).click();
  await page.getByRole("button", { name: "Réparation en cours…" }).waitFor();
  assert.equal(repairRequested, true);
  await page.screenshot({ path: "test-results/local-assistance-repair.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "URLs", exact: true }).click();
  await page.getByText("Désactivée", { exact: true }).click();
  assert.equal(await page.getByRole("link", { name: "Installer Ollama" }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: "test-results/local-assistance-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("UI verified: settings, missing Ollama, consent, background repair, disabled mode, mobile width.");
} finally { await browser.close(); }
