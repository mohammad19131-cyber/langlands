import { describe, expect, it } from "vitest";
import {
  SIGN_IN_FORM,
  credentialSafeSignInPath,
  isHtmlFormPost,
  loginFieldsFromRecord,
  queryHasSecret,
  sanitizeSignInSearch,
  signInErrorHref,
  signInErrorMessage,
  urlLeaksPassword,
} from "./sign-in-request";

describe("sign-in form contract", () => {
  it("declares POST to the login API so a native submit cannot become a GET query", () => {
    expect(SIGN_IN_FORM.method).toBe("post");
    expect(SIGN_IN_FORM.action).toBe("/api/auth/login");
    expect(SIGN_IN_FORM.passwordField).toBe("password");
    expect(SIGN_IN_FORM.identifierField).toBe("teamId");
  });

  it("native GET of identifier+password would leak; POST error redirects never include the password", () => {
    const leaked = "http://localhost:3001/sign-in?team-id=004&password=dummy-secret";
    expect(urlLeaksPassword(leaked)).toBe(true);
    expect(credentialSafeSignInPath(leaked)).toBe("/sign-in?error=invalid");
    expect(urlLeaksPassword(signInErrorHref("invalid"))).toBe(false);
    expect(urlLeaksPassword(signInErrorHref("unavailable"))).toBe(false);
    expect(signInErrorHref("invalid")).not.toMatch(/password/i);
    expect(signInErrorHref("invalid")).not.toContain("004");
  });

  it("middleware sanitizer drops password and team-id from GET and keeps a generic error", () => {
    const { leaked, search } = sanitizeSignInSearch(
      new URLSearchParams("team-id=004&password=dummy-secret"),
    );
    expect(leaked).toBe(true);
    expect(search.get("error")).toBe("invalid");
    expect(search.has("password")).toBe(false);
    expect(search.has("team-id")).toBe(false);
    expect(search.toString()).toBe("error=invalid");
  });

  it("detects password query keys without logging values", () => {
    expect(queryHasSecret(new URLSearchParams("password=x"))).toBe(true);
    expect(queryHasSecret(new URLSearchParams("error=invalid"))).toBe(false);
    expect(queryHasSecret({ error: "invalid" })).toBe(false);
  });
});

describe("login field parsing", () => {
  it("keeps Team ID and staff-email paths", () => {
    expect(loginFieldsFromRecord({ teamId: "004", password: "x" }).identifier).toEqual({
      kind: "team",
      teamId: "004",
    });
    expect(
      loginFieldsFromRecord({ "team-id": "010", password: "x" }).identifier,
    ).toEqual({ kind: "team", teamId: "010" });
    expect(
      loginFieldsFromRecord({ email: "organiser-local@langlands.dev", password: "x" }).identifier
        .kind,
    ).toBe("organiser");
  });

  it("maps native form posts to HTML handling and JSON posts away from it", () => {
    expect(
      isHtmlFormPost(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      ),
    ).toBe(true);
    expect(
      isHtmlFormPost(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).toBe(false);
  });

  it("shows the same invalid-credentials copy for native and JS failures", () => {
    expect(signInErrorMessage("invalid")).toBe("Team ID or password is incorrect.");
    expect(signInErrorMessage("unavailable")).toBe("Sign-in temporarily unavailable.");
    expect(signInErrorMessage("nope")).toBeNull();
  });
});
