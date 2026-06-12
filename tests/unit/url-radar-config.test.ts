import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobSearchFilters } from "@/lib/types";
import { cloneUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";

const previousAppDataDir = process.env.JOBMAX_APP_DATA_DIR;

afterEach(() => {
  process.env.JOBMAX_APP_DATA_DIR = previousAppDataDir;
  vi.resetModules();
});

describe("url radar config onboarding fields", () => {
  it("creates a neutral default config for a new profile", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "jobmaximalist-config-"));
    process.env.JOBMAX_APP_DATA_DIR = tempDirectory;
    vi.resetModules();

    try {
      const { getUrlRadarConfig } = await import("@/lib/url-radar-config");
      const config = await getUrlRadarConfig();

      expect(config.urls).toEqual([]);
      expect(config.filters.keywordsInclude).toEqual([]);
      expect(config.filters.keywordsExclude).toEqual([]);
      expect(config.filters.locations).toEqual([]);
      expect(config.onboardingCompletedAt).toBeNull();
      expect(config.onboardingDismissedAt).toBeNull();
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("sanitizes onboarding timestamps when saving config", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "jobmaximalist-config-"));
    process.env.JOBMAX_APP_DATA_DIR = tempDirectory;
    vi.resetModules();

    try {
      const { setUrlRadarConfig } = await import("@/lib/url-radar-config");
      const completedAt = "2026-06-12T10:00:00.000Z";
      const saved = await setUrlRadarConfig({
        enabled: true,
        intervalMinutes: 60,
        urls: ["https://www.linkedin.com/jobs/search/?keywords=data"],
        filters: {
          ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
          contractTypes: ["CDI", "FREELANCE", "FREELANCE", "INTERIM"] as unknown as JobSearchFilters["contractTypes"]
        },
        removedUrlsHistory: [],
        onboardingCompletedAt: completedAt,
        onboardingDismissedAt: "not a date"
      });

      expect(saved.filters.contractTypes).toEqual(["CDI", "FREELANCE"]);
      expect(saved.onboardingCompletedAt).toBe(completedAt);
      expect(saved.onboardingDismissedAt).toBeNull();
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
