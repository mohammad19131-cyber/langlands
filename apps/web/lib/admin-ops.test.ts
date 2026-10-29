import { describe, expect, it } from "vitest";
import {
  RESET_PLAY_CONFIRM,
  isMissingRpc,
  officialCredits,
  readReserve,
  scheduledRoundReset,
  parseDisplayName,
  parseTeamName,
  resetPlayConfirmed,
  parseMemberRole,
  withStartingReserve,
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

  it("reset patch returns rounds to scheduled without score columns", () => {
    const patch = scheduledRoundReset();
    expect(patch.status).toBe("scheduled");
    expect(patch.process_checksum).toBeNull();
    expect(Object.keys(patch).some((key) => /score|reserve|town/i.test(key))).toBe(false);
    expect(isMissingRpc("Could not find the function public.reset_competition_play(_actor, _competition) in the schema cache")).toBe(
      true,
    );
  });

  it("forces the town template reserve field back to 220", () => {
    expect(withStartingReserve({ reserve: 61.5, air: 32 })).toEqual({ reserve: 220, air: 32 });
    expect(readReserve(withStartingReserve({ reserve: 12 }))).toBe(220);
    expect(readReserve({ reserve: 61.5 })).toBe(61.5);
  });
});
