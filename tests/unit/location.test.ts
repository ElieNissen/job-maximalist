import { describe, expect, it } from "vitest";
import { normalizeLocation } from "@/lib/utils";

describe("normalizeLocation", () => {
  it("normalizes accents and whitespace", () => {
    expect(normalizeLocation(" Île-de-France ")).toBe("ile-de-france");
  });
});
