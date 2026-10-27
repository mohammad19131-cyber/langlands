import { resolveLoginIdentifier, type LoginIdentifier } from "./organiser-login";

/** Native and JS sign-in both POST here. Never GET. */
export const SIGN_IN_FORM = {
  method: "post",
  action: "/api/auth/login",
  identifierField: "teamId",
  passwordField: "password",
} as const;

export type SignInErrorCode = "invalid" | "unavailable";

const ERROR_MESSAGES: Record<SignInErrorCode, string> = {
  invalid: "Team ID or password is incorrect.",
  unavailable: "Sign-in temporarily unavailable.",
};

const SECRET_QUERY_KEY = /^(password|passwd|pwd|secret|token)$/i;

export function signInErrorHref(code: SignInErrorCode): string {
  return `/sign-in?error=${code}`;
}

export function signInErrorMessage(code: string | null | undefined): string | null {
  if (code === "invalid" || code === "unavailable") return ERROR_MESSAGES[code];
  return null;
}

export function queryHasSecret(params: URLSearchParams | Record<string, unknown>): boolean {
  const keys =
    params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
  return keys.some((key) => SECRET_QUERY_KEY.test(key));
}

const LEAKED_QUERY_KEY = /^(password|passwd|pwd|secret|token|team-id|teamId)$/i;

/** Strip credential query keys. Used by middleware so GET never keeps a password in the URL. */
export function sanitizeSignInSearch(search: URLSearchParams): {
  leaked: boolean;
  search: URLSearchParams;
} {
  const next = new URLSearchParams(search);
  let leaked = false;
  for (const key of [...next.keys()]) {
    if (LEAKED_QUERY_KEY.test(key)) {
      next.delete(key);
      leaked = true;
    }
  }
  if (leaked) next.set("error", "invalid");
  return { leaked, search: next };
}

/** Drop any credential query. Keep only a generic error code. */
export function credentialSafeSignInPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://localhost");
  if (queryHasSecret(url.searchParams) || url.searchParams.has("team-id") || url.searchParams.has("teamId")) {
    return signInErrorHref("invalid");
  }
  const code = url.searchParams.get("error");
  if (code === "invalid" || code === "unavailable") return signInErrorHref(code);
  return "/sign-in";
}

export function urlLeaksPassword(rawUrl: string): boolean {
  const url = new URL(rawUrl, "http://localhost");
  if (queryHasSecret(url.searchParams)) return true;
  return SECRET_QUERY_KEY.test(url.hash.replace(/^#/, "").split("=")[0] ?? "");
}

export function loginFieldsFromRecord(payload: Record<string, unknown>): {
  identifier: LoginIdentifier;
  password: string;
} {
  const password = typeof payload.password === "string" ? payload.password : "";
  const identifierRaw =
    typeof payload.teamId === "string" && payload.teamId.trim()
      ? payload.teamId
      : typeof payload["team-id"] === "string" && payload["team-id"].trim()
        ? payload["team-id"]
        : typeof payload.email === "string"
          ? payload.email
          : "";
  return { identifier: resolveLoginIdentifier(identifierRaw), password };
}

export function isHtmlFormPost(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}
