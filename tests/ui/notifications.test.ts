import { describe, expect, it } from "vitest";

function shouldNotify(permission: NotificationPermission, newCount: number): boolean {
  return permission === "granted" && newCount > 0;
}

describe("notification behavior", () => {
  it("notifies only when new offers exist and permission granted", () => {
    expect(shouldNotify("granted", 2)).toBe(true);
    expect(shouldNotify("granted", 0)).toBe(false);
    expect(shouldNotify("denied", 2)).toBe(false);
  });
});
