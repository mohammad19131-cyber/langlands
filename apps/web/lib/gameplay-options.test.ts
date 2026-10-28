import { describe, expect, it } from "vitest";
import { CATALOGUE, SECTORS } from "@langlands/sim/public";
import { CATEGORIES, MAX_STARTS_PER_ROUND } from "./game-types";
import {
  projectsForSector,
  startEligibility,
  summariseEffects,
} from "../components/game/game-logic";

const CATALOGUE_CODES = [
  "WETLAND",
  "REFOREST",
  "RIVER",
  "EMISSIONS",
  "WASTEWATER",
  "WATER_TREAT",
  "GRID",
  "COAL",
  "RENEWABLES",
  "REGEN_AG",
  "INTENSE_AG",
  "FACTORIES",
  "GREEN_MFG",
  "FLOOD_WALL",
  "CLINICS",
] as const;

describe("player-selectable options match the engine catalogue", () => {
  it("renders all 15 catalogue codes and no extras", () => {
    const fromUi = CATEGORIES.flatMap((category) =>
      projectsForSector(category.sector).map((project) => project.code),
    );
    expect(fromUi.sort()).toEqual([...CATALOGUE_CODES].sort());
    expect(Object.keys(CATALOGUE).sort()).toEqual([...CATALOGUE_CODES].sort());
    expect(new Set(fromUi).size).toBe(15);
  });

  it("maps the eight desk categories onto the eight engine sectors", () => {
    expect(CATEGORIES.map((category) => category.sector).sort()).toEqual([...SECTORS].sort());
    expect(MAX_STARTS_PER_ROUND).toBe(2);
  });

  it("surfaces published crisis shields rather than unsupported extras", () => {
    const shields = Object.fromEntries(
      CATALOGUE_CODES.map((code) => {
        const crisis = summariseEffects(CATALOGUE[code]).find((row) => row.when === "Crisis shield");
        return [code, crisis?.items ?? []];
      }),
    );
    expect(shields.WATER_TREAT.join(" ")).toMatch(/Drought.*0\.9/);
    expect(shields.WASTEWATER.join(" ")).toMatch(/Pollution incident.*0\.9/);
    expect(shields.WETLAND.join(" ")).toMatch(/Flood.*0\.85/);
    expect(shields.FLOOD_WALL.join(" ")).toMatch(/Flood.*0\.75/);
    expect(shields.CLINICS.join(" ")).toMatch(/Pollution incident.*0\.85/);
    expect(shields.GREEN_MFG.join(" ")).toMatch(/Pollution incident.*0\.9/);
    expect(shields.GRID).toEqual([]);
    expect(shields.RIVER).toEqual([]);
  });

  it("mirrors engine eligibility: prereq, mutex, already started, and two-start cap", () => {
    expect(startEligibility("WATER_TREAT", [], [], []).ok).toBe(true);
    expect(startEligibility("WASTEWATER", [], [], []).ok).toBe(true);
    expect(startEligibility("COAL", [], [], []).ok).toBe(false);
    expect(startEligibility("COAL", [], ["GRID"], []).reason).toBeNull();
    expect(startEligibility("COAL", [], ["GRID"], []).ok).toBe(true);
    expect(startEligibility("COAL", ["RENEWABLES"], ["GRID"], []).ok).toBe(false);
    expect(startEligibility("REGEN_AG", [], [], ["INTENSE_AG"]).ok).toBe(false);
    expect(startEligibility("GREEN_MFG", [], ["EMISSIONS"], []).ok).toBe(false);
    expect(startEligibility("GREEN_MFG", [], ["EMISSIONS", "FACTORIES"], []).ok).toBe(true);
    expect(startEligibility("GRID", ["GRID"], [], []).ok).toBe(false);
    expect(startEligibility("RIVER", [], [], ["WETLAND", "REFOREST"]).ok).toBe(true);
    const full = ["WETLAND", "REFOREST"];
    expect(full.length).toBe(MAX_STARTS_PER_ROUND);
  });
});
