import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@langlands/sim/public";
import { MAX_STARTS_PER_ROUND } from "./game-types";
import {
  budgetCheck,
  canonicalizeDecision,
  decisionsEqual,
  emptyAllocations,
  fullAllocations,
  idempotencyKeyFor,
  projectCost,
  saveKind,
  sumAllocations,
} from "./decision";
import { startEligibility } from "../components/game/game-logic";

describe("decision payload", () => {
  it("fills missing sectors with zero", () => {
    const filled = fullAllocations({ water: 40.4, restoration: -3 });
    expect(filled.water).toBe(40);
    expect(filled.restoration).toBe(0);
    expect(Object.keys(filled)).toHaveLength(8);
    expect(sumAllocations(emptyAllocations())).toBe(0);
  });

  it("treats identical allocations and start order as equal", () => {
    const a = canonicalizeDecision({
      allocations: fullAllocations({ water: 20 }),
      projectStarts: ["GRID", "RIVER"],
    });
    const b = {
      allocations: fullAllocations({ water: 20 }),
      projectStarts: ["GRID", "RIVER"],
    };
    expect(decisionsEqual(a, b)).toBe(true);
    expect(decisionsEqual(a, { ...b, projectStarts: ["RIVER", "GRID"] })).toBe(false);
  });

  it("caps catalogue cost and flags overspend", () => {
    expect(projectCost(["GRID", "RIVER"])).toBe(200 + 240);
    const overProjects = budgetCheck(
      { allocations: emptyAllocations(), projectStarts: ["RENEWABLES", "WETLAND"] },
      400,
    );
    expect(overProjects.projectsExceedAvailable).toBe(true);
    const scaleSectors = budgetCheck(
      { allocations: fullAllocations({ water: 500 }), projectStarts: ["GRID"] },
      300,
    );
    expect(scaleSectors.projectsExceedAvailable).toBe(false);
    expect(scaleSectors.sectorsWillScale).toBe(true);
  });

  it("reuses the same idempotency key for the same payload", async () => {
    const payload = { allocations: fullAllocations({ energy: 10 }), projectStarts: ["GRID"] };
    const first = await idempotencyKeyFor("round-a", payload);
    const second = await idempotencyKeyFor("round-a", payload);
    const other = await idempotencyKeyFor("round-a", {
      ...payload,
      projectStarts: ["RIVER"],
    });
    expect(first).toBe(second);
    expect(first.startsWith("sub-")).toBe(true);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(other).not.toBe(first);
  });

  it("labels local edits as drafts until the server accepts them", () => {
    expect(saveKind({ live: true, roundStatus: "open", dirty: true, accepted: false })).toBe("draft");
    expect(saveKind({ live: true, roundStatus: "open", dirty: false, accepted: true })).toBe("accepted");
    expect(saveKind({ live: true, roundStatus: "locked", dirty: true, accepted: true })).toBe("accepted");
    expect(saveKind({ live: true, roundStatus: "locked", dirty: false, accepted: false })).toBe("closed");
    expect(saveKind({ live: false, roundStatus: "open", dirty: true, accepted: false })).toBe("preview");
  });

  it("keeps at most two catalogue starts and drops unknown codes", () => {
    const out = canonicalizeDecision({
      allocations: emptyAllocations(),
      projectStarts: ["GRID", "RIVER", "WETLAND", "NOT_A_PROJECT"],
    });
    expect(out.projectStarts).toEqual(["GRID", "RIVER"]);
    expect(Object.keys(CATALOGUE)).toHaveLength(15);
  });
});

describe("catalogue selection rules (UI only)", () => {
  it("blocks a third start and mutex / prereq violations", () => {
    expect(MAX_STARTS_PER_ROUND).toBe(2);
    const coal = startEligibility("COAL", [], [], ["GRID"]);
    expect(coal.ok).toBe(false);
    const grid = startEligibility("GRID", [], [], []);
    expect(grid.ok).toBe(true);
    const mutex = startEligibility("COAL", ["RENEWABLES"], ["GRID"], []);
    expect(mutex.ok).toBe(false);
    const already = startEligibility("GRID", ["GRID"], [], []);
    expect(already.ok).toBe(false);
  });
});
