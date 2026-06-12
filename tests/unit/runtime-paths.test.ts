import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const previousAppDataDir = process.env.JOBMAX_APP_DATA_DIR;

afterEach(() => {
  process.env.JOBMAX_APP_DATA_DIR = previousAppDataDir;
  vi.resetModules();
});

describe("runtime paths", () => {
  it("detects the isolated onboarding test profile", async () => {
    process.env.JOBMAX_APP_DATA_DIR = path.join(os.tmpdir(), "jobmax", ".local-profiles", "onboarding-test");
    vi.resetModules();

    const { isOnboardingTestProfile } = await import("@/lib/runtime-paths");

    expect(isOnboardingTestProfile()).toBe(true);
  });

  it("does not mark the normal profile as onboarding test", async () => {
    process.env.JOBMAX_APP_DATA_DIR = path.join(os.tmpdir(), "JobMAXIMALIST");
    vi.resetModules();

    const { isOnboardingTestProfile } = await import("@/lib/runtime-paths");

    expect(isOnboardingTestProfile()).toBe(false);
  });
});
