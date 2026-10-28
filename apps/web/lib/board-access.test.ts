import { describe, expect, it } from "vitest";
import { mayReadOfficialBoard } from "./board-access";

describe("official board access", () => {
  it("denies seated delegates and anyone who is not an organiser", () => {
    expect(mayReadOfficialBoard(false)).toBe(false);
    expect(mayReadOfficialBoard(Boolean(undefined))).toBe(false);
  });

  it("allows authorised organisers only", () => {
    expect(mayReadOfficialBoard(true)).toBe(true);
  });
});
