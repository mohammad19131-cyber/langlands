import { describe, expect, it } from "vitest";
import { classifyEventTickAuth, shouldRunEventTick } from "./event-tick-auth";

const secret = "event-tick-secret";

describe("classifyEventTickAuth", () => {
  it("allows GET only with the configured bearer secret", () => {
    expect(
      classifyEventTickAuth({
        method: "GET",
        authorization: `Bearer ${secret}`,
        configuredSecret: secret,
      }),
    ).toEqual({ kind: "secret" });
    expect(
      classifyEventTickAuth({
        method: "GET",
        authorization: null,
        configuredSecret: secret,
      }),
    ).toEqual({ kind: "deny", status: 401, error: "unauthorized" });
    expect(
      classifyEventTickAuth({
        method: "GET",
        authorization: "Bearer wrong",
        configuredSecret: secret,
      }),
    ).toEqual({ kind: "deny", status: 401, error: "unauthorized" });
  });

  it("does not treat an organiser cookie as enough for GET", () => {
    const denied = classifyEventTickAuth({
      method: "GET",
      authorization: null,
      configuredSecret: secret,
    });
    expect(denied.kind).toBe("deny");
  });

  it("does not run a tick for GET without the cron secret", () => {
    const denied = classifyEventTickAuth({
      method: "GET",
      authorization: null,
      configuredSecret: secret,
    });
    expect(shouldRunEventTick(denied)).toBe(false);
    expect(
      shouldRunEventTick(
        classifyEventTickAuth({
          method: "GET",
          authorization: `Bearer ${secret}`,
          configuredSecret: secret,
        }),
      ),
    ).toBe(true);
  });

  it("allows POST with the secret or defers to an organiser session", () => {
    expect(
      classifyEventTickAuth({
        method: "POST",
        authorization: `Bearer ${secret}`,
        configuredSecret: secret,
      }),
    ).toEqual({ kind: "secret" });
    expect(
      classifyEventTickAuth({
        method: "POST",
        authorization: null,
        configuredSecret: secret,
      }),
    ).toEqual({ kind: "session" });
  });
});
