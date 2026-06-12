import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";
import type { UrlRadarConfig } from "@/lib/url-radar-config";

const previousAppDataDir = process.env.JOBMAX_APP_DATA_DIR;

afterEach(() => {
  process.env.JOBMAX_APP_DATA_DIR = previousAppDataDir;
});

describe("refreshUrlRadar", () => {
  it("records an empty local refresh without network calls when no URLs are configured", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "jobmaximalist-refresh-"));
    process.env.JOBMAX_APP_DATA_DIR = tempDirectory;
    vi.resetModules();

    try {
      const { refreshUrlRadar } = await import("@/lib/url-radar-service");
      const config: UrlRadarConfig = {
        enabled: true,
        intervalMinutes: 60,
        urls: [],
        filters: cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS),
        removedUrlsHistory: [],
        onboardingCompletedAt: null,
        onboardingDismissedAt: null
      };

      const result = await refreshUrlRadar(config);

      expect(result.totalNew).toBe(0);
      expect(result.summary).toEqual({});
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
