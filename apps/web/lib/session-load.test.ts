import { describe, expect, it } from "vitest";
import { classifySessionLoad, sessionLoadBlocksPlay } from "./session-load";

describe("session load", () => {
  it("keeps 401/403 distinct from a failed context fetch so the UI is not stuck loading", () => {
    expect(classifySessionLoad(200)).toBe("ok");
    expect(classifySessionLoad(401)).toBe("unauthorized");
    expect(classifySessionLoad(403)).toBe("forbidden");
    expect(classifySessionLoad(500)).toBe("unavailable");
    expect(classifySessionLoad(503)).toBe("unavailable");
    expect(sessionLoadBlocksPlay("ok")).toBe(false);
    expect(sessionLoadBlocksPlay("unauthorized")).toBe(true);
    expect(sessionLoadBlocksPlay("forbidden")).toBe(true);
    expect(sessionLoadBlocksPlay("unavailable")).toBe(true);
  });
});
