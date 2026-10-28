import { describe, expect, it } from "vitest";
import {
  RESET_PLAY_CONFIRM,
  officialCredits,
  parseDisplayName,
  parseTeamName,
  resetPlayConfirmed,
  parseMemberRole,
} from "./admin-ops";

describe("officialCredits", () => {
  it("uses the town template reserve when nothing is published", () => {
    expect(officialCredits({ startingReserve: 220, publishedReserve: null })).toEqual({
      credits: 220,
      source: "starting",
    });
  });

  it("uses the last published reserve and never a client total", () => {
    expect(officialCredits({ startingReserve: 220, publishedReserve: 61.5 })).toEqual({
      credits: 61.5,
      source: "published",
    });
  });
});

describe("organiser input guards", () => {
  it("accepts schema-legal names and the exact reset phrase", () => {
    expect(parseTeamName("  Ashfen North  ")).toBe("Ashfen North");
    expect(parseTeamName("x")).toBeNull();
    expect(parseDisplayName("Captain Lee")).toBe("Captain Lee");
    expect(parseDisplayName("A")).toBeNull();
    expect(resetPlayConfirmed(RESET_PLAY_CONFIRM)).toBe(true);
    expect(resetPlayConfirmed("reset play")).toBe(false);
    expect(parseMemberRole("captain")).toBe("captain");
    expect(parseMemberRole("organiser")).toBe(false);
  });
});
