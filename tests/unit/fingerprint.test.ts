import { describe, expect, it } from "vitest";
import { buildFingerprint } from "@/lib/fingerprint";

describe("buildFingerprint", () => {
  it("is stable for equivalent urls", () => {
    const base = {
      source: "linkedin" as const,
      sourceJobId: "123",
      title: "Product Designer",
      company: "Acme",
      location: "Paris",
      contractType: "CDI" as const,
      postedAt: new Date()
    };

    const first = buildFingerprint({
      ...base,
      url: "https://example.com/job/1?tracking=abc"
    });
    const second = buildFingerprint({
      ...base,
      url: "https://example.com/job/1"
    });

    expect(first).toBe(second);
  });
});
