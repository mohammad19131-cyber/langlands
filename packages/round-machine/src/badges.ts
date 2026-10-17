import type { Town } from "@langlands/sim";

/**
 * Map-tile badges from mix fields. Assumptions for the public board, not
 * extra score terms. Thresholds chosen so the T0 Ashfen template is
 * thermal-heavy / intensive / light.
 */
export function townBadges(town: Town): {
  energyMix: "thermal-heavy" | "mixed" | "clean-leaning";
  agriculture: "intensive" | "mixed" | "regenerative";
  industry: "light" | "heavy";
} {
  const energyMix =
    town.dirty_energy >= town.green_energy + 0.25
      ? "thermal-heavy"
      : town.green_energy >= town.dirty_energy + 0.25
        ? "clean-leaning"
        : "mixed";
  const agriculture =
    town.intensive_ag >= town.regenerative_ag + 0.25
      ? "intensive"
      : town.regenerative_ag >= town.intensive_ag + 0.25
        ? "regenerative"
        : "mixed";
  const industry = town.industrial_intensity >= 0.55 ? "heavy" : "light";
  return { energyMix, agriculture, industry };
}
