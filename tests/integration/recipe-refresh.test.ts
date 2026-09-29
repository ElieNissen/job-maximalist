import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneUrlRadarFilters, URL_RADAR_DEFAULT_FILTERS } from "@/lib/url-radar-filters";
import type { NormalizedJob } from "@/lib/types";

const mocks = vi.hoisted(() => ({ jobs: [] as NormalizedJob[], schedule: vi.fn() }));
vi.mock("@/lib/local-assistance", () => ({ trySavedRecipe: async () => mocks.jobs, scheduleRepair: mocks.schedule }));
const previous = process.env.JOBMAX_APP_DATA_DIR;
afterEach(() => { if (previous === undefined) delete process.env.JOBMAX_APP_DATA_DIR; else process.env.JOBMAX_APP_DATA_DIR = previous; vi.resetModules(); });
describe("refresh with a saved recipe", () => {
  it("keeps favourites, avoids duplicates and does not repair filtered-out jobs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "jobmax-recipe-refresh-"));
    process.env.JOBMAX_APP_DATA_DIR = directory;
    vi.resetModules(); mocks.schedule.mockClear();
    try {
      const { setUrlRadarConfig } = await import("@/lib/url-radar-config");
      const service = await import("@/lib/url-radar-service");
      const config = await setUrlRadarConfig({ enabled: false, intervalMinutes: 60, urls: ["https://mon-vie-via.businessfrance.fr/offres/recherche?query=designer"], filters: { ...cloneUrlRadarFilters(URL_RADAR_DEFAULT_FILTERS), keywordsInclude: ["unmatched-keyword"] }, removedUrlsHistory: [], onboardingCompletedAt: null, onboardingDismissedAt: null, assistanceMode: "auto" });
      mocks.jobs = [{ extractionMethod: "saved_recipe", source: "career_sites", sourceJobId: "12", title: "Designer", company: "Acme", location: "Berlin", contractType: "OTHER", url: "https://mon-vie-via.businessfrance.fr/offres/12345", postedAt: new Date("2026-09-29"), metadataText: "A job description without company or title" }];
      await service.refreshUrlRadar(config);
      const first = (await service.getUrlRadarJobs(config, 1, 10, true)).items[0];
      expect(first.title).toBe("Designer");
      await service.updateUrlRadarJobStatus(first.id, true, true);
      mocks.jobs = [{ ...mocks.jobs[0], sourceJobId: "changed-id-after-repair", title: "Product Designer" }];
      await service.refreshUrlRadar(config);
      const data = await service.getUrlRadarJobs(config, 1, 10, true);
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toMatchObject({ id: first.id, title: "Product Designer", company: "Acme", location: "Berlin", viewed: true, saved: true });
      expect(mocks.schedule).not.toHaveBeenCalled();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
