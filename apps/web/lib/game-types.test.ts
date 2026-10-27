import { describe, expect, it } from "vitest";
import { playerSector } from "./game-types";

describe("player-facing sector names", () => {
  it("uses the same labels on HUD, map, and desk", () => {
    expect(playerSector("restoration")).toEqual({
      sector: "restoration",
      label: "Habitat & biodiversity",
      short: "Habitat",
    });
    expect(playerSector("infrastructure").short).toBe("Resilience");
    expect(playerSector("agriculture").short).toBe("Farming");
  });
});
