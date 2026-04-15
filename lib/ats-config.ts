import fs from "fs/promises";
import path from "path";
import type { AtsConfig, AtsSource } from "@/lib/types";

const FILE_PATH = path.join(process.cwd(), "data", "ats-config.json");

const DEFAULT_CONFIG: AtsConfig = {
  enabled: true,
  intervalMinutes: 60,
  sources: ["greenhouse", "lever", "smartrecruiters"],
  targets: [
    "https://boards.greenhouse.io/doctolib",
    "https://jobs.lever.co/qonto",
    "https://jobs.smartrecruiters.com/Contentsquare"
  ],
  autoDiscoveryEnabled: true,
  discoveryMaxTargetsPerSource: 20,
  discordWebhookUrl: ""
};

function sanitizeSources(input: unknown): AtsSource[] {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.sources;
  const allowed = new Set<AtsSource>(["greenhouse", "lever", "smartrecruiters"]);
  const filtered = input.map(String).filter((v): v is AtsSource => allowed.has(v as AtsSource));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : DEFAULT_CONFIG.sources;
}

function sanitizeTargets(input: unknown): string[] {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.targets;
  const cleaned = Array.from(
    new Set(
      input
        .map(String)
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );
  return cleaned.length > 0 ? cleaned : DEFAULT_CONFIG.targets;
}


function sanitizeConfig(input: unknown): AtsConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    intervalMinutes:
      typeof raw.intervalMinutes === "number" && raw.intervalMinutes >= 15 ? raw.intervalMinutes : 60,
    sources: sanitizeSources(raw.sources),
    targets: sanitizeTargets(raw.targets),
    autoDiscoveryEnabled:
      typeof raw.autoDiscoveryEnabled === "boolean" ? raw.autoDiscoveryEnabled : DEFAULT_CONFIG.autoDiscoveryEnabled,
    discoveryMaxTargetsPerSource:
      typeof raw.discoveryMaxTargetsPerSource === "number" && raw.discoveryMaxTargetsPerSource >= 5
        ? Math.min(50, raw.discoveryMaxTargetsPerSource)
        : DEFAULT_CONFIG.discoveryMaxTargetsPerSource,
    discordWebhookUrl: typeof raw.discordWebhookUrl === "string" ? raw.discordWebhookUrl.trim() : ""
  };
}

export async function getAtsConfig(): Promise<AtsConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return DEFAULT_CONFIG;
  }
}

export async function setAtsConfig(config: AtsConfig): Promise<AtsConfig> {
  const cleaned = sanitizeConfig(config);
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(cleaned, null, 2), "utf8");
  return cleaned;
}

