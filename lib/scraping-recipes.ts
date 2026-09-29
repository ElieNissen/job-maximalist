import type { Page } from "playwright";
import type { NormalizedJob } from "@/lib/types";
import { canonicalUrl, parseContractType } from "@/lib/utils";
import { deterministicHash } from "@/lib/hash";
import { inferSourceFromUrl } from "@/lib/url-radar-sources";

// Declarative only: no generated JavaScript, fetch URLs, headers or credentials.
export interface ScrapingRecipe {
  version: 1;
  kind: "dom" | "json";
  container: string;
  endpoint: string;
  title: string;
  company: string;
  location: string;
  url: string;
  urlPrefix: string;
  description: string;
  date: string;
}
export interface JsonSample { endpoint: string; container: string; rows: Record<string, unknown>[] }
export interface PageEvidence {
  html: string;
  text: string;
  links: string[];
  samples: JsonSample[];
  blocked: boolean;
  empty: boolean;
  hasJobs: boolean;
}
const fields = ["container", "endpoint", "title", "company", "location", "url", "urlPrefix", "description", "date"] as const;
export function validateRecipe(input: unknown): ScrapingRecipe {
  if (!input || typeof input !== "object") throw new Error("Règles illisibles.");
  const r = input as ScrapingRecipe;
  if (r.version !== 1 || !["dom", "json"].includes(r.kind) || fields.some((key) => typeof r[key] !== "string" || r[key].length > 300)) {
    throw new Error("Format des règles invalide.");
  }
  if (!r.title || !r.url || (r.kind === "dom" && !r.container)) throw new Error("Règles incomplètes.");
  if (r.kind === "json" && [r.container, r.title, r.company, r.location, r.url, r.description, r.date].some((p) => p && !/^[\w.-]+$/.test(p))) {
    throw new Error("Chemin de données invalide.");
  }
  if (r.urlPrefix && !/^https?:\/\//.test(r.urlPrefix)) throw new Error("Préfixe de lien invalide.");
  return Object.fromEntries([...["version", "kind"].map((k) => [k, r[k as keyof ScrapingRecipe]]), ...fields.map((k) => [k, r[k]])]) as unknown as ScrapingRecipe;
}
export function readField(value: unknown, field: string): unknown {
  if (!field) return undefined;
  return field.split(".").reduce<unknown>((current, key) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) return undefined;
    return current && typeof current === "object" && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}
export function discoverArrays(value: unknown, endpoint: string, container = "", depth = 0): JsonSample[] {
  if (depth > 5 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    const rows = value.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
    // Ignore tracking, configuration and contact data; retain likely job collections only.
    return rows.some((r) => Object.keys(r).some((k) => /^(title|jobTitle|missionTitle|job_title|position)$/i.test(k)))
      ? [{ endpoint, container, rows: rows.slice(0, 200) }] : [];
  }
  return Object.entries(value).slice(0, 60).flatMap(([key, child]) =>
    /token|secret|password|contact|candidate|profile/i.test(key) ? [] : discoverArrays(child, endpoint, container ? `${container}.${key}` : key, depth + 1)
  ).slice(0, 12);
}

export async function captureEvidence(page: Page, target: string): Promise<PageEvidence> {
  const samples: JsonSample[] = [];
  const pending: Promise<void>[] = [];
  const listener = (response: import("playwright").Response) => {
    if (pending.length >= 40 || !/json/i.test(response.headers()["content-type"] ?? "")) return;
    pending.push((async () => {
      if (Number(response.headers()["content-length"] ?? 0) > 2_000_000) return;
      const body = await response.text();
      if (body.length > 2_000_000) return;
      const u = new URL(response.url());
      samples.push(...discoverArrays(JSON.parse(body), `${u.origin}${u.pathname}`));
    })().catch(() => undefined));
  };
  page.on("response", listener);
  try {
    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, 2000))]);
    const dom = await page.evaluate(() => {
      const root = document.querySelector("main, [role=main]") ?? document.body;
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script,style,svg,iframe,header,footer,nav,form,input,textarea").forEach((e) => e.remove());
      clone.querySelectorAll("*").forEach((el) => {
        for (const attr of Array.from(el.attributes)) if (!["class", "id", "href", "datetime", "role"].includes(attr.name)) el.removeAttribute(attr.name);
      });
      return {
        html: clone.outerHTML.slice(0, 28000),
        text: (root as HTMLElement).innerText.slice(0, 20000),
        links: Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.href).slice(0, 1000)
      };
    });
    const blocked = [401, 403, 429].includes(response?.status() ?? 0) || /verify you are human|vérifiez que vous êtes humain|access denied|just a moment/i.test(dom.text);
    const empty = /(?:aucune? (?:offre|résultat)|0 (?:offres|résultats)|no (?:jobs|results|vacancies) found)/i.test(dom.text);
    const hasJobs = samples.some((s) => s.rows.length > 0) || dom.links.filter((l) => /\/(?:jobs?|offres?|careers?|positions?)\/[\w-]+/i.test(l) && !/\/(?:search|recherche)(?:[/?#]|$)/i.test(l)).length >= 2 || /\b[1-9]\d*\s+(?:offres?|jobs?|résultats?|vacancies)\b/i.test(dom.text);
    return { ...dom, samples: samples.slice(0, 12), blocked, empty: empty && !samples.some((sample) => sample.rows.length > 0), hasJobs };
  } finally { page.off("response", listener); }
}

export async function extractWithRecipe(page: Page, evidence: PageEvidence, input: ScrapingRecipe, target: string): Promise<NormalizedJob[]> {
  const recipe = validateRecipe(input);
  if (evidence.blocked || evidence.empty) return [];
  type Row = { title: string; company: string; location: string; url: string; description: string; date: string };
  let rows: Row[];
  if (recipe.kind === "json") {
    const sample = evidence.samples.find((s) => s.endpoint === recipe.endpoint && s.container === recipe.container);
    if (!sample) return [];
    const scalar = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
    rows = sample.rows.map((item) => ({
      title: scalar(readField(item, recipe.title)), company: scalar(readField(item, recipe.company)),
      location: scalar(readField(item, recipe.location)), url: recipe.urlPrefix + scalar(readField(item, recipe.url)),
      description: scalar(readField(item, recipe.description)), date: scalar(readField(item, recipe.date))
    }));
    if (recipe.urlPrefix && !rows.some((r) => evidence.links.includes(r.url))) return [];
  } else {
    rows = await page.evaluate((r) => {
      const get = (el: Element, selector: string) => !selector ? null : selector === ":scope" ? el : el.querySelector(selector);
      return Array.from(document.querySelectorAll(r.container)).slice(0, 200).map((el) => ({
        title: get(el, r.title)?.textContent?.trim() ?? "", company: get(el, r.company)?.textContent?.trim() ?? "",
        location: get(el, r.location)?.textContent?.trim() ?? "", url: (get(el, r.url) as HTMLAnchorElement | null)?.href ?? "",
        description: get(el, r.description)?.textContent?.trim() ?? "", date: get(el, r.date)?.getAttribute("datetime") ?? ""
      }));
    }, recipe);
  }
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const row of rows) {
    let url: URL;
    try { url = new URL(row.url, target); } catch { continue; }
    const title = row.title.replace(/\s+/g, " ").trim();
    if (!row.url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || !title || title.length < 4 || title.length > 200 || /^(postuler|voir l.offre|apply|en savoir plus)$/i.test(title)) continue;
    if (canonicalUrl(url.href) === canonicalUrl(target) || seen.has(url.href)) continue;
    if (recipe.kind === "dom" && !evidence.links.includes(url.href)) continue;
    seen.add(url.href);
    const date = new Date(row.date);
    jobs.push({ extractionMethod: "saved_recipe", source: inferSourceFromUrl(target), sourceJobId: deterministicHash(canonicalUrl(url.href)), title,
      company: row.company.slice(0, 180), location: row.location.slice(0, 180), url: canonicalUrl(url.href),
      postedAt: Number.isFinite(date.getTime()) ? date : new Date(), contractType: parseContractType(row.description),
      metadataText: row.description.slice(0, 6000) });
  }
  // Reject recipes that mostly match navigation or collapse unrelated cards into one title.
  if (!jobs.length || jobs.length < rows.length * 0.8 || (jobs.length > 2 && new Set(jobs.map((j) => j.title)).size === 1)) return [];
  return jobs;
}

export function repairPrompt(evidence: PageEvidence): string {
  const samples = evidence.samples.map((s) => ({ ...s, rows: s.rows.slice(0, 2).map((r) => Object.fromEntries(
    Object.entries(r).filter(([k]) => !/token|secret|password|email|contact|phone|candidate/i.test(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 400) : typeof v === "number" ? v : null])
  )) }));
  return JSON.stringify({ html: evidence.html, samples, links: evidence.links.slice(0, 80) }).slice(0, 44000);
}
