import type { ContractType, JobSource, NormalizedJob } from "@/lib/types";
import { deterministicHash } from "@/lib/hash";
import { parseContractType } from "@/lib/utils";

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

function parseDate(value: unknown): Date {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function extractCandidates(raw: unknown): any[] {
  const queue = toArray(raw as any);
  const out: any[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") continue;

    const typeValue = (current as any)["@type"];
    const types = toArray(typeValue).map((item) => String(item).toLowerCase());
    if (types.includes("jobposting")) {
      out.push(current);
      continue;
    }

    if ((current as any)["@graph"]) {
      queue.push((current as any)["@graph"]);
    }
  }

  return out;
}

function extractLocation(item: any): string {
  const locations = toArray(item?.jobLocation);

  for (const entry of locations) {
    const locality = extractText(entry?.address?.addressLocality);
    const region = extractText(entry?.address?.addressRegion);
    const country = extractText(entry?.address?.addressCountry);
    const label = extractText(entry?.name);

    const combined = [locality, region, country, label].filter(Boolean).join(", ");
    if (combined) return combined;
  }

  const fallback =
    extractText(item?.jobLocation?.address?.addressLocality) ||
    extractText(item?.jobLocation?.address?.addressRegion) ||
    extractText(item?.jobLocation?.name) ||
    extractText(item?.jobLocation);

  return fallback;
}

export function extractJobPostingJsonLd(html: string): any[] {
  const scripts = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  const jobs: any[] = [];

  for (const script of scripts) {
    const jsonText = script[1]?.trim();
    if (!jsonText) continue;

    try {
      const data = JSON.parse(jsonText);
      jobs.push(...extractCandidates(data));
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  return jobs;
}

export function mapJsonLdToJob(source: JobSource, fallbackUrl: string, item: any): NormalizedJob | null {
  const title = extractText(item.title || item.name);
  const company = extractText(item.hiringOrganization) || "Entreprise";
  const location = extractLocation(item);

  const url = extractText(item.url) || fallbackUrl;
  const identifierRaw =
    extractText(item.identifier?.value) ||
    extractText(item.identifier) ||
    deterministicHash(`${source}|${url}|${title}|${company}`);

  if (!title || !url) {
    return null;
  }

  const contractType: ContractType = parseContractType(extractText(item.employmentType));

  return {
    source,
    sourceJobId: identifierRaw,
    title,
    company,
    location,
    contractType,
    url,
    postedAt: parseDate(item.datePosted)
  };
}
