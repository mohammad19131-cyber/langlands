import { describe, expect, it } from "vitest";
import { clockLabel, formatCountdown, remainingMs } from "./clock";

describe("round clock", () => {
  it("counts remaining time from serverNow, not a raw client clock", () => {
    const serverNow = "2026-10-17T12:00:00.000Z";
    const closesAt = "2026-10-17T12:18:00.000Z";
    const clientNow = Date.parse("2026-10-17T15:00:00.000Z");
    const ms = remainingMs(closesAt, serverNow, clientNow);
    expect(ms).toBe(18 * 60 * 1000);
    expect(formatCountdown(ms!)).toBe("18:00");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("labels round states honestly", () => {
    expect(clockLabel({ status: "open", opensAt: null, remainingMs: 90_000 })).toBe("1:30");
    expect(clockLabel({ status: "open", opensAt: null, remainingMs: 0 })).toBe("Deadline passed");
    expect(clockLabel({ status: "locked", opensAt: null, remainingMs: null })).toBe("Locked");
    expect(clockLabel({ status: "processing", opensAt: null, remainingMs: null })).toBe("Locked");
    expect(clockLabel({ status: "published", opensAt: null, remainingMs: null })).toBe("Published");
    expect(clockLabel({ status: "scheduled", opensAt: "2026-10-17T12:00:00.000Z", remainingMs: null })).toMatch(/^Opens /);
  });
});
