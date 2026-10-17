import { describe, expect, it } from "vitest";
import {
  LOCAL_ORGANISER_EMAIL,
  parseOrganiserLogin,
  resolveLoginIdentifier,
} from "./organiser-login";

describe("organiser login identifier", () => {
  it("accepts the local organiser email and rejects team Auth aliases", () => {
    expect(parseOrganiserLogin(LOCAL_ORGANISER_EMAIL)).toBe(LOCAL_ORGANISER_EMAIL);
    expect(parseOrganiserLogin("  organiser-local@langlands.dev ")).toBe(LOCAL_ORGANISER_EMAIL);
    expect(parseOrganiserLogin("team-004@users.langlands.internal")).toBeNull();
    expect(parseOrganiserLogin("004")).toBeNull();
  });

  it("routes digits to the team path and staff email to the organiser path", () => {
    expect(resolveLoginIdentifier("004")).toEqual({ kind: "team", teamId: "004" });
    expect(resolveLoginIdentifier(LOCAL_ORGANISER_EMAIL)).toEqual({
      kind: "organiser",
      email: LOCAL_ORGANISER_EMAIL,
    });
    expect(resolveLoginIdentifier("team-004@users.langlands.internal").kind).toBe("invalid");
    expect(resolveLoginIdentifier("not-a-login").kind).toBe("invalid");
  });
});
