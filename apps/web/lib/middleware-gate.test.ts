import { describe, expect, it } from "vitest";
import {
  AUTH_REFRESH_SKEW_SECONDS,
  cookieLooksLikeAuth,
  isApiPath,
  isProtectedPage,
  middlewareDestination,
  refreshAuthBestEffort,
  shouldRefreshAuthSession,
} from "./middleware-gate";

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "user-1", exp, role: "authenticated" })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

describe("middleware page gate", () => {
  it("leaves the unsigned fixture public and treats seated play as protected", () => {
    expect(isProtectedPage("/play/fixture")).toBe(false);
    expect(isProtectedPage("/play")).toBe(true);
    expect(isProtectedPage("/play/results")).toBe(true);
    expect(isProtectedPage("/board")).toBe(true);
    expect(isProtectedPage("/room")).toBe(true);
    expect(isProtectedPage("/room/team/1")).toBe(true);
    expect(isProtectedPage("/sign-in")).toBe(false);
    expect(isProtectedPage("/api/play/context")).toBe(false);
  });

  it("redirects unsigned browsers away from protected pages without granting API access", () => {
    expect(
      middlewareDestination({ pathname: "/play", method: "GET", hasAuthCookie: false }),
    ).toBe("sign-in");
    expect(
      middlewareDestination({ pathname: "/api/play/clock", method: "GET", hasAuthCookie: false }),
    ).toBe("next");
    expect(
      middlewareDestination({ pathname: "/sign-in", method: "GET", hasAuthCookie: false }),
    ).toBe("next");
  });

  it("sends a cookie session away from GET /sign-in and otherwise continues", () => {
    expect(
      middlewareDestination({ pathname: "/sign-in", method: "GET", hasAuthCookie: true }),
    ).toBe("play");
    expect(
      middlewareDestination({
        pathname: "/sign-in",
        method: "GET",
        hasAuthCookie: true,
        sessionConfirmed: false,
      }),
    ).toBe("next");
    expect(
      middlewareDestination({ pathname: "/sign-in", method: "POST", hasAuthCookie: true }),
    ).toBe("next");
    expect(
      middlewareDestination({ pathname: "/play", method: "GET", hasAuthCookie: true }),
    ).toBe("next");
  });

  it("only refreshes GoTrue when an Auth cookie is present", () => {
    expect(cookieLooksLikeAuth("sb-fgqitafevklmuhybuwzw-auth-token")).toBe(true);
    expect(cookieLooksLikeAuth("theme")).toBe(false);
    expect(isApiPath("/api/play/clock")).toBe(true);
    expect(
      shouldRefreshAuthSession({ hasAuthCookie: false, pathname: "/play" }),
    ).toBe(false);
    expect(
      shouldRefreshAuthSession({ hasAuthCookie: true, pathname: "/play" }),
    ).toBe(true);
  });

  it("always refreshes on GET /sign-in so an invalid cookie cannot trap the form", () => {
    const nowMs = 1_700_000_000_000;
    const exp = Math.floor(nowMs / 1000) + AUTH_REFRESH_SKEW_SECONDS + 120;
    expect(
      shouldRefreshAuthSession({
        hasAuthCookie: true,
        pathname: "/sign-in",
        nowMs,
        cookies: [
          {
            name: "sb-fgqitafevklmuhybuwzw-auth-token",
            value: JSON.stringify({ access_token: jwtWithExp(exp), expires_at: exp }),
          },
        ],
      }),
    ).toBe(true);
  });

  it("does not refresh GoTrue on API routes that already call getUser", () => {
    const expiring = Math.floor(Date.now() / 1000) + 5;
    expect(
      shouldRefreshAuthSession({
        hasAuthCookie: true,
        pathname: "/api/play/clock",
        cookies: [
          {
            name: "sb-fgqitafevklmuhybuwzw-auth-token",
            value: JSON.stringify({ access_token: jwtWithExp(expiring), expires_at: expiring }),
          },
        ],
      }),
    ).toBe(false);
  });

  it("skips GoTrue while the access token is still well inside its lifetime", () => {
    const nowMs = 1_700_000_000_000;
    const exp = Math.floor(nowMs / 1000) + AUTH_REFRESH_SKEW_SECONDS + 120;
    expect(
      shouldRefreshAuthSession({
        hasAuthCookie: true,
        pathname: "/play",
        nowMs,
        cookies: [
          {
            name: "sb-fgqitafevklmuhybuwzw-auth-token",
            value: JSON.stringify({ access_token: jwtWithExp(exp), expires_at: exp }),
          },
        ],
      }),
    ).toBe(false);
  });

  it("refreshes when the access token is near expiry, including chunked cookies", () => {
    const nowMs = 1_700_000_000_000;
    const exp = Math.floor(nowMs / 1000) + AUTH_REFRESH_SKEW_SECONDS - 1;
    const value = JSON.stringify({ access_token: jwtWithExp(exp), expires_at: exp });
    expect(
      shouldRefreshAuthSession({
        hasAuthCookie: true,
        pathname: "/play",
        nowMs,
        cookies: [
          { name: "sb-fgqitafevklmuhybuwzw-auth-token.0", value: value.slice(0, 20) },
          { name: "sb-fgqitafevklmuhybuwzw-auth-token.1", value: value.slice(20) },
        ],
      }),
    ).toBe(true);
  });

  it("treats a thrown getUser fetch as a skipped refresh, not a crashed request", async () => {
    await expect(
      refreshAuthBestEffort(async () => {
        throw new Error("fetch failed");
      }),
    ).resolves.toBe("skipped");
    await expect(refreshAuthBestEffort(async () => undefined)).resolves.toBe("refreshed");
  });
});
