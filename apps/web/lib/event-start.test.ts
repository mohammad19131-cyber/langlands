import { describe, expect, it } from "vitest";
import { planEventStart } from "./event-start";

describe("planEventStart", () => {
  it("opens round 1 only from scheduled and refuses a finished event", () => {
    expect(planEventStart({ competitionStatus: "ready", round1Status: "scheduled" })).toEqual({
      ok: true,
      openRound1: true,
      reason: "Start opens round 1 for 18 minutes on the server clock.",
    });
    expect(planEventStart({ competitionStatus: "live", round1Status: "open" })).toMatchObject({
      ok: true,
      openRound1: false,
    });
    expect(planEventStart({ competitionStatus: "closed", round1Status: "published" }).ok).toBe(false);
    expect(planEventStart({ competitionStatus: "ready", round1Status: null }).ok).toBe(false);
  });
});
