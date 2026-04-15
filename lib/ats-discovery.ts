import type { AtsSource, JobSearchFilters } from "@/lib/types";
import { fetchWithRetry } from "@/lib/http";

type DiscoveryResult = {
  bySource: Record<AtsSource, string[]>;
  errors: Record<AtsSource, string[]>;
};

const SOURCE_DOMAINS: Record<AtsSource, string> = {
  greenhouse: "boards.greenhouse.io",
  lever: "jobs.lever.co",
  smartrecruiters: "jobs.smartrecruiters.com"
};

const CATALOG_TARGETS: Record<AtsSource, string[]> = {
  greenhouse: [
    "https://boards.greenhouse.io/doctolib",
    "https://boards.greenhouse.io/alan",
    "https://boards.greenhouse.io/backmarket",
    "https://boards.greenhouse.io/payfit",
    "https://boards.greenhouse.io/malt",
    "https://boards.greenhouse.io/notion",
    "https://boards.greenhouse.io/aircall",
    "https://boards.greenhouse.io/datadog",
    "https://boards.greenhouse.io/openai",
    "https://boards.greenhouse.io/contentsquare"
  ],
  lever: [
    "https://jobs.lever.co/qonto",
    "https://jobs.lever.co/swile",
    "https://jobs.lever.co/pennylane",
    "https://jobs.lever.co/brex",
    "https://jobs.lever.co/figma",
    "https://jobs.lever.co/sorare",
    "https://jobs.lever.co/mirakl",
    "https://jobs.lever.co/airbyte",
    "https://jobs.lever.co/v7",
    "https://jobs.lever.co/contentsquare"
  ],
  smartrecruiters: [
    "https://jobs.smartrecruiters.com/Contentsquare",
    "https://jobs.smartrecruiters.com/Deezer",
    "https://jobs.smartrecruiters.com/PublicisGroupe",
    "https://jobs.smartrecruiters.com/Ubisoft2",
    "https://jobs.smartrecruiters.com/Kapten",
    "https://jobs.smartrecruiters.com/Believe",
    "https://jobs.smartrecruiters.com/Voodoo",
    "https://jobs.smartrecruiters.com/ALSTOM",
    "https://jobs.smartrecruiters.com/AccorCorpo",
    "https://jobs.smartrecruiters.com/Miro"
  ]
};

function extractHttpLinks(html: string): string[] {
  const hrefMatches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
  const links: string[] = [];

  for (const match of hrefMatches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    if (/^https?:\/\//i.test(raw)) {
      links.push(raw);
      continue;
    }

    try {
      const wrapped = new URL(raw, "https://duckduckgo.com");
      const redirected =
        wrapped.searchParams.get("uddg") ||
        wrapped.searchParams.get("url") ||
        wrapped.searchParams.get("q") ||
        wrapped.searchParams.get("u");

      if (redirected && /^https?:\/\//i.test(redirected)) {
        links.push(decodeURIComponent(redirected));
      }
    } catch {
      // ignore malformed URL
    }
  }

  return Array.from(new Set(links));
}

function buildQueries(source: AtsSource, filters: JobSearchFilters): string[] {
  const roles = filters.keywordsInclude.map((k) => `"${k}"`).join(" OR ");
  const locations = '"Ile-de-France" OR Paris OR France';
  const contracts = "CDI OR CDD";

  return [
    `site:${SOURCE_DOMAINS[source]} (${roles}) (${locations}) (${contracts})`,
    `site:${SOURCE_DOMAINS[source]} ("Product Designer" OR "UX Designer") Paris`,
    `site:${SOURCE_DOMAINS[source]} design jobs france`
  ];
}

function normalizeTarget(source: AtsSource, input: string): string | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();

    if (source === "greenhouse") {
      if (!host.includes("greenhouse.io")) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1] === "job_board") {
        const company = url.searchParams.get("for")?.trim();
        if (!company) return null;
        return `https://boards.greenhouse.io/${company}`;
      }
      if (parts.length >= 1) {
        return `https://boards.greenhouse.io/${parts[0]}`;
      }
      return null;
    }

    if (source === "lever") {
      if (!host.includes("lever.co")) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 1) {
        return `https://jobs.lever.co/${parts[0]}`;
      }
      return null;
    }

    if (source === "smartrecruiters") {
      if (!host.includes("smartrecruiters.com")) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 1) {
        return `https://jobs.smartrecruiters.com/${parts[0]}`;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

async function searchProvider(url: string): Promise<string[]> {
  const response = await fetchWithRetry(url, {}, { retries: 1, timeoutMs: 9000, initialDelayMs: 250 });
  const html = await response.text();
  return extractHttpLinks(html);
}

async function discoverForSource(source: AtsSource, filters: JobSearchFilters, maxTargets: number) {
  const errors: string[] = [];
  const discovered = new Set<string>();

  for (const seed of CATALOG_TARGETS[source]) {
    const normalized = normalizeTarget(source, seed);
    if (normalized) discovered.add(normalized);
    if (discovered.size >= maxTargets) {
      return { targets: Array.from(discovered).slice(0, maxTargets), errors };
    }
  }

  const providerBase = [
    "https://html.duckduckgo.com/html/?q=",
    "https://duckduckgo.com/html/?q=",
    "https://www.bing.com/search?q="
  ];

  for (const query of buildQueries(source, filters)) {
    const encoded = encodeURIComponent(query);

    for (const base of providerBase) {
      try {
        const links = await searchProvider(`${base}${encoded}`);
        for (const link of links) {
          const normalized = normalizeTarget(source, link);
          if (normalized) discovered.add(normalized);
          if (discovered.size >= maxTargets) break;
        }
        if (discovered.size >= maxTargets) break;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "search provider failed");
      }
    }

    if (discovered.size >= maxTargets) break;
  }

  return {
    targets: Array.from(discovered).slice(0, maxTargets),
    errors
  };
}

export async function discoverAtsTargets(
  filters: JobSearchFilters,
  sources: AtsSource[],
  maxTargetsPerSource: number
): Promise<DiscoveryResult> {
  const bySource: Record<AtsSource, string[]> = {
    greenhouse: [],
    lever: [],
    smartrecruiters: []
  };
  const errors: Record<AtsSource, string[]> = {
    greenhouse: [],
    lever: [],
    smartrecruiters: []
  };

  const safeLimit = Math.max(5, Math.min(50, maxTargetsPerSource));

  for (const source of sources) {
    const result = await discoverForSource(source, filters, safeLimit);
    bySource[source] = result.targets;
    errors[source] = result.errors;
  }

  return { bySource, errors };
}
