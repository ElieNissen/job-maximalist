import type { JobSource } from "@/lib/types";

export interface UrlSourceMeta {
  label: string;
  color: string;
  textColor?: string;
}

type SourceMatcher = {
  match: string[];
  meta: UrlSourceMeta;
  source?: JobSource;
  disableCloudflare?: boolean;
};

const SOURCE_MATCHERS: SourceMatcher[] = [
  {
    match: ["linkedin.com"],
    meta: { label: "LINKEDIN", color: "#2b61be", textColor: "white" },
    source: "linkedin",
    disableCloudflare: true
  },
  {
    match: ["welcometothejungle.com"],
    meta: { label: "WTTJ", color: "#f0c419", textColor: "#141414" },
    source: "wttj",
    disableCloudflare: true
  },
  {
    match: ["choisirleservicepublic.gouv.fr"],
    meta: { label: "SERVICE PUBLIC", color: "#264899", textColor: "white" },
    source: "service_public",
    disableCloudflare: true
  },
  {
    match: ["hellowork.com"],
    meta: { label: "HELLOWORK", color: "#ca5a17", textColor: "white" },
    source: "hellowork",
    disableCloudflare: true
  },
  {
    match: ["indeed.com", "fr.indeed.com"],
    meta: { label: "INDEED", color: "#4b49b6", textColor: "white" },
    source: "indeed",
    disableCloudflare: true
  },
  {
    match: ["apec.fr"],
    meta: { label: "APEC", color: "#6a3db0", textColor: "white" },
    source: "career_sites",
    disableCloudflare: true
  },
  {
    match: ["adzuna.fr", "adzuna.com"],
    meta: { label: "ADZUNA", color: "#16705f", textColor: "white" },
    source: "career_sites",
    disableCloudflare: true
  },
  {
    match: ["businessfrance.fr"],
    meta: { label: "VIE", color: "#b44c45", textColor: "white" },
    source: "career_sites",
    disableCloudflare: true
  },
  {
    match: ["free-work.com"],
    meta: { label: "FREE-WORK", color: "#166b7a", textColor: "white" },
    source: "career_sites",
    disableCloudflare: true
  },
  {
    match: ["hiring.cafe"],
    meta: { label: "HIRING CAFE", color: "#65453b", textColor: "white" },
    source: "hiring_cafe",
    disableCloudflare: true
  },
  {
    match: ["licornesociety.com"],
    meta: { label: "LICORNE SOCIETY", color: "#9f4b73", textColor: "white" },
    source: "licorne_society",
    disableCloudflare: true
  }
];

export function getHostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getSourceMatcher(host: string): SourceMatcher | undefined {
  return SOURCE_MATCHERS.find((entry) => entry.match.some((domain) => host.includes(domain)));
}

export function getCanonicalSourceHost(url: string): string {
  const host = getHostFromUrl(url);
  const matched = getSourceMatcher(host);
  return matched?.match[0] ?? host;
}

export function inferSourceFromUrl(url: string): JobSource {
  const host = getHostFromUrl(url);
  return getSourceMatcher(host)?.source ?? "career_sites";
}

export function getUrlSourceMeta(url: string, fallbackSource: JobSource = "career_sites"): UrlSourceMeta {
  const host = getHostFromUrl(url);
  const matched = getSourceMatcher(host);
  if (matched) {
    return matched.meta;
  }

  const label = host
    ? host.replace(/^app\./, "").replace(/\.(com|fr|io|net|org)$/i, "").replace(/[-.]/g, " ").toUpperCase()
    : fallbackSource.toUpperCase().replace(/_/g, " ");
  const hue = hashString(host || fallbackSource) % 360;

  return {
    label,
    color: `hsl(${hue} 72% 34%)`,
    textColor: "white"
  };
}

export function canUseCloudflareForHost(url: string): boolean {
  const host = getHostFromUrl(url);
  const matched = getSourceMatcher(host);
  return matched?.disableCloudflare ? false : true;
}
