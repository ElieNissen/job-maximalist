import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/refresh-service", () => ({
  refreshJobs: vi.fn().mockResolvedValue({ totalNew: 2 })
}));

import { initScheduler } from "@/lib/scheduler";

describe("scheduler", () => {
  it("can be initialized once", () => {
    expect(() => initScheduler()).not.toThrow();
  });
});
