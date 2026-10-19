import { describe, expect, it } from "vitest";
import { effectFieldLabel, formatEffects } from "./format";

describe("effect field labels", () => {
  it("maps published indicator keys to the same labels used on the board", () => {
    expect(effectFieldLabel("water_q")).toBe("Water quality");
    expect(effectFieldLabel("bio")).toBe("Biodiversity");
    expect(effectFieldLabel("dirty_energy")).toBe("Thermal share");
    expect(effectFieldLabel("HEATWAVE")).toBe("Heatwave");
  });

  it("formats effect lists with those labels", () => {
    expect(formatEffects({ water_q: 5, bio: -1 })).toBe("Water quality +5, Biodiversity -1");
    expect(formatEffects({})).toBe("—");
  });
});
