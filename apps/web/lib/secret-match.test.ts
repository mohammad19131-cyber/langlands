import { describe, expect, it } from "vitest";
import { bearerToken, secretsMatch } from "./secret-match";

describe("secret comparison", () => {
  it("parses a Bearer token and rejects other schemes", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Bearer  abc  ")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBe("");
    expect(bearerToken(null)).toBe("");
  });

  it("matches equal secrets and rejects empty or different values", () => {
    expect(secretsMatch("tick-secret", "tick-secret")).toBe(true);
    expect(secretsMatch("tick-secret", "other")).toBe(false);
    expect(secretsMatch("", "tick-secret")).toBe(false);
    expect(secretsMatch("tick-secret", "")).toBe(false);
  });
});
