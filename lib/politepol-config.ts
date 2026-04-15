import fs from "fs/promises";
import path from "path";
import type { PolitepolConfig } from "@/lib/types";

const FILE_PATH = path.join(process.cwd(), "data", "politepol-config.json");

const DEFAULT_CONFIG: PolitepolConfig = {
  enabled: true,
  intervalMinutes: 60,
  feedUrls: ["https://politepaul.com/fd/wglJ5MNWqwlq.json"]
};

function sanitizeFeedUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.feedUrls;

  const cleaned = Array.from(
    new Set(
      input
        .map(String)
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );

  return cleaned.length > 0 ? cleaned : DEFAULT_CONFIG.feedUrls;
}

function sanitizeConfig(input: unknown): PolitepolConfig {
  const raw = (input ?? {}) as Record<string, unknown>;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    intervalMinutes:
      typeof raw.intervalMinutes === "number" && raw.intervalMinutes >= 15
        ? Math.min(24 * 60, raw.intervalMinutes)
        : DEFAULT_CONFIG.intervalMinutes,
    feedUrls: sanitizeFeedUrls(raw.feedUrls)
  };
}

export async function getPolitepolConfig(): Promise<PolitepolConfig> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return DEFAULT_CONFIG;
  }
}

export async function setPolitepolConfig(config: PolitepolConfig): Promise<PolitepolConfig> {
  const cleaned = sanitizeConfig(config);
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(cleaned, null, 2), "utf8");
  return cleaned;
}
