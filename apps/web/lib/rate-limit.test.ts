import { afterEach, describe, expect, it } from "vitest";
import {
  API_RATE_LIMIT,
  API_RATE_WINDOW_MS,
  consumeRateLimit,
  rateLimitBucketKey,
  rateLimitClientKey,
  rateLimitRouteKey,
  resetRateLimitStoreForTests,
} from "./rate-limit";

afterEach(() => {
  resetRateLimitStoreForTests();
});

describe("API rate limit (20/min per client per route)", () => {
  it("normalizes dynamic round and team paths", () => {
    expect(rateLimitRouteKey("/api/rounds/abc-123/lock")).toBe("/api/rounds/:id/lock");
    expect(rateLimitRouteKey("/api/admin/teams/t1/members/u1")).toBe(
      "/api/admin/teams/:teamId/members/:userId",
    );
    expect(rateLimitRouteKey("/api/play/clock")).toBe("/api/play/clock");
  });

  it("reads the leftmost forwarded IP", () => {
    expect(
      rateLimitClientKey({
        get: (name) => (name === "x-forwarded-for" ? "1.2.3.4, 10.0.0.1" : null),
      }),
    ).toBe("1.2.3.4");
  });

  it("allows 20 hits then rejects until the window slides", () => {
    const key = rateLimitBucketKey("1.1.1.1", "/api/auth/login");
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < API_RATE_LIMIT; i++) {
      const ok = consumeRateLimit(key, t0 + i);
      expect(ok.allowed).toBe(true);
      expect(ok.remaining).toBe(API_RATE_LIMIT - (i + 1));
    }
    const blocked = consumeRateLimit(key, t0 + API_RATE_LIMIT);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    const afterWindow = consumeRateLimit(key, t0 + API_RATE_WINDOW_MS + 1);
    expect(afterWindow.allowed).toBe(true);
  });

  it("isolates clients and routes", () => {
    const a = rateLimitBucketKey("a", "/api/play/clock");
    const b = rateLimitBucketKey("b", "/api/play/clock");
    const c = rateLimitBucketKey("a", "/api/room");
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < API_RATE_LIMIT; i++) {
      expect(consumeRateLimit(a, t0 + i).allowed).toBe(true);
    }
    expect(consumeRateLimit(a, t0 + 50).allowed).toBe(false);
    expect(consumeRateLimit(b, t0 + 50).allowed).toBe(true);
    expect(consumeRateLimit(c, t0 + 50).allowed).toBe(true);
  });
});
