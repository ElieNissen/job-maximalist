import type { Page } from "playwright";
import type { NormalizedJob } from "@/lib/types";
import { captureEvidence, extractWithRecipe, type PageEvidence, type ScrapingRecipe } from "@/lib/scraping-recipes";

export type NavigationStop = "end" | "limit" | "stalled" | "blocked" | "login_required";
export interface RecipeCollection { jobs: NormalizedJob[]; pages: number; stop: NavigationStop; advanced: boolean }
export interface NavigationBudget { maxPages?: number; maxJobs?: number; timeoutMs?: number; signal?: AbortSignal }

export function validateNavigation(recipe: ScrapingRecipe, evidence: PageEvidence) {
  const nav = recipe.navigation;
  if (!nav || nav.kind === "none") return;
  if (nav.kind === "scroll") {
    if (nav.selector && !evidence.scrollContainers?.includes(nav.selector)) throw new Error("Zone de défilement non observée.");
    return;
  }
  if (!evidence.controls?.some((control) => control.selector === nav.selector && control.kind === nav.kind)) {
    throw new Error("Le bouton de pagination proposé n’existe pas sur cette page.");
  }
}

export async function collectRecipe(page: Page, url: string, recipe: ScrapingRecipe, initial?: PageEvidence, budget: NavigationBudget = {}): Promise<RecipeCollection> {
  const maxPages = Math.min(30, Math.max(1, budget.maxPages ?? 20));
  const maxJobs = Math.min(1000, Math.max(1, budget.maxJobs ?? 500));
  const deadline = Date.now() + (budget.timeoutMs ?? 45000);
  const collected = new Map<string, NormalizedJob>();
  let evidence = initial ?? await captureEvidence(page, url);
  let pages = 0, advanced = false, idleScrolls = 0;
  const result = (stop: NavigationStop): RecipeCollection => ({ jobs: [...collected.values()].slice(0, maxJobs), pages, advanced, stop });
  const origin = new URL(url).origin;
  const nav = recipe.navigation ?? { kind: "none", selector: "" };
  while (true) {
    budget.signal?.throwIfAborted();
    if (evidence.loginRequired) return result("login_required");
    if (evidence.blocked) return result("blocked");
    if (evidence.empty) return result("end");
    const jobs = await extractWithRecipe(page, evidence, recipe, url);
    const before = collected.size;
    for (const job of jobs) collected.set(job.url, job);
    pages += 1;
    const changed = collected.size > before;
    if (pages > 1 && changed) advanced = true;
    if (!jobs.length && pages === 1) return result("stalled");
    if (pages > 1 && !changed) {
      if (nav.kind !== "scroll") return result("stalled");
      idleScrolls += 1;
      if (idleScrolls >= 2) return result(evidence.expectedCount && collected.size < evidence.expectedCount ? "stalled" : "end");
    } else { idleScrolls = 0; }
    // Counters can describe just the visible page; an enabled next/load-more control takes precedence.
    if (collected.size > maxJobs) return result("limit");
    if (nav.kind === "none") return result(evidence.expectedCount && collected.size < evidence.expectedCount ? "stalled" : "end");
    if (pages >= maxPages || collected.size >= maxJobs || Date.now() >= deadline) return result("limit");

    if (nav.kind !== "scroll") {
      // Recheck observed controls on every page: never click a selector that became an unrelated action.
      const control = evidence.controls?.find((c) => c.selector === nav.selector && c.kind === nav.kind);
      if (!control) return result(evidence.expectedCount && collected.size < evidence.expectedCount ? "stalled" : "end");
      const button = page.locator(nav.selector);
      if (await button.count() !== 1 || !await button.isVisible() || !await button.isEnabled()) return result("stalled");
      const href = await button.getAttribute("href");
      if (href && (!/^https?:$/.test(new URL(href, page.url()).protocol) || new URL(href, page.url()).origin !== origin)) return result("blocked");
    }
    try {
      if (nav.kind === "scroll" && nav.selector && await page.locator(nav.selector).count() !== 1) return result("stalled");
      evidence = await captureEvidence(page, url, async () => {
        if (nav.kind === "scroll") {
          await page.evaluate((selector) => {
            const root = selector ? document.querySelector(selector) : document.scrollingElement;
            if (root) root.scrollTop = root.scrollHeight;
          }, nav.selector);
        } else {
          await page.locator(nav.selector).click({ timeout: Math.max(1, Math.min(5000, deadline - Date.now())), noWaitAfter: true });
        }
        await page.waitForTimeout(750);
      });
      if (new URL(page.url()).origin !== origin && !evidence.loginRequired) return result("blocked");
    } catch {
      budget.signal?.throwIfAborted();
      return result(Date.now() >= deadline ? "limit" : "stalled");
    }
  }
}
