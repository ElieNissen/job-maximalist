import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/url-radar-service", () => ({
  refreshUrlRadar: vi.fn().mockResolvedValue({ totalNew: 2, summary: {} })
}));

vi.mock("@/lib/url-radar-config", () => ({
  getUrlRadarConfig: vi.fn().mockResolvedValue({
    enabled: true,
    intervalMinutes: 60,
    urls: [],
    filters: {
      keywordsInclude: [],
      keywordsExclude: [],
      locations: [],
      contractTypes: ["CDI", "CDD"],
      sources: []
    },
    removedUrlsHistory: [],
    onboardingCompletedAt: null,
    onboardingDismissedAt: null
  })
}));

import { initScheduler } from "@/lib/scheduler";

describe("scheduler", () => {
  it("can be initialized once", () => {
    expect(() => initScheduler()).not.toThrow();
  });
});
