import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connectors", () => ({
  fetchJobsFromSource: vi.fn().mockResolvedValue({
    jobs: [
      {
        source: "linkedin",
        sourceJobId: "123",
        title: "UX Designer",
        company: "Acme",
        location: "Paris",
        contractType: "CDI",
        url: "https://example.com",
        postedAt: new Date()
      }
    ],
    errors: []
  })
}));

vi.mock("@/lib/jobs-service", () => ({
  upsertJob: vi.fn().mockResolvedValue({
    created: true,
    job: { excludedReason: null }
  })
}));

vi.mock("@/lib/prisma", () => {
  const mock = {
    refreshRun: {
      create: vi.fn().mockResolvedValue({ id: "run-1" }),
      update: vi.fn().mockResolvedValue({})
    }
  };
  return { prisma: mock };
});

import { refreshJobs } from "@/lib/refresh-service";

describe("refreshJobs", () => {
  it("creates refresh runs and reports new items", async () => {
    const result = await refreshJobs({ sources: ["linkedin"] });
    expect(result.totalNew).toBe(1);
    expect(result.summary.linkedin.newCount).toBe(1);
  });
});
