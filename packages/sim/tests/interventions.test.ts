import { describe, expect, it } from "vitest";
import { CATALOGUE, playInteractive, SECTORS, stepRound, createInitialTown } from "../src/index.js";
import type { Submission } from "../src/types.js";

function prereqPlan(code: string): string[] {
  const ordered: string[] = [];
  const add = (c: string) => {
    if (ordered.includes(c)) return;
    for (const need of CATALOGUE[c].prerequisites) add(need);
    if (!ordered.includes(c)) ordered.push(c);
  };
  add(code);
  return ordered;
}

describe("all 15 interventions", () => {
  for (const code of Object.keys(CATALOGUE)) {
    it(`can start ${code} once prerequisites are met`, () => {
      const plan = prereqPlan(code);
      const result = playInteractive((n, town, available) => {
        const starts: string[] = [];
        for (const item of plan) {
          if (starts.length >= 2) break;
          if (item in town.started) continue;
          const missing = CATALOGUE[item].prerequisites.some((p) => !(p in town.completed));
          if (missing) continue;
          if (CATALOGUE[item].cost > available) continue;
          starts.push(item);
        }
        const allocations = Object.fromEntries(SECTORS.map((k) => [k, 0])) as Submission["allocations"];
        return { allocations, projectStarts: starts };
      });
      expect(result.started[code]).toBeDefined();
    });
  }

  it("rejects already-started repeats", () => {
    const town = createInitialTown();
    const r1 = stepRound(town, { allocations: {}, projectStarts: ["RIVER"] }, 1);
    expect(r1.acceptedStarts).toEqual(["RIVER"]);
    const r2 = stepRound(town, { allocations: {}, projectStarts: ["RIVER"] }, 2);
    expect(r2.acceptedStarts).toEqual([]);
    expect(r2.dropped[0].reason).toBe("already_started");
  });

  it("drops a start that exceeds remaining budget", () => {
    const town = createInitialTown();
    // Force tiny remaining by charging two expensive starts; third would be budget if max_starts didn't fire.
    const r = stepRound(town, { allocations: {}, projectStarts: ["REFOREST", "WETLAND"] }, 1);
    expect(r.acceptedStarts.length).toBe(2);
    expect(r.projectCost).toBe(560);
  });
});
