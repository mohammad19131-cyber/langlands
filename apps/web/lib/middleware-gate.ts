/**
 * Cookie presence gates pages. API routes still run requireUser().
 * getUser() in middleware only refreshes the Auth cookie and must not
 * take down a request if GoTrue is briefly unreachable.
 */

/** Refresh when the access token is this close to expiry. Authorization still uses getUser(). */
export const AUTH_REFRESH_SKEW_SECONDS = 60;

export function cookieLooksLikeAuth(name: string): boolean {
  return name.includes("-auth-token");
}

export function isProtectedPage(pathname: string): boolean {
  if (pathname === "/play/fixture") return false;
  return (
    pathname === "/play" ||
    pathname.startsWith("/play/") ||
    pathname === "/board" ||
    pathname === "/room" ||
    pathname.startsWith("/room/")
  );
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export type MiddlewareDestination = "next" | "sign-in" | "play";

export function middlewareDestination(args: {
  pathname: string;
  method: string;
  hasAuthCookie: boolean;
  sessionConfirmed?: boolean | null;
}): MiddlewareDestination {
  if (!args.hasAuthCookie && isProtectedPage(args.pathname)) return "sign-in";
  if (args.hasAuthCookie && args.pathname === "/sign-in" && args.method.toUpperCase() === "GET") {
    if (args.sessionConfirmed === false) return "next";
    return "play";
  }
  return "next";
}

export type AuthRefreshInput = {
  hasAuthCookie: boolean;
  pathname: string;
  cookies?: Array<{ name: string; value: string }>;
  nowMs?: number;
};

/**
 * Middleware refresh is cookie maintenance, not authorization.
 * Skip GoTrue when there is no session, the path already calls getUser(),
 * or the access token is still well inside its lifetime.
 */
export function shouldRefreshAuthSession(input: AuthRefreshInput): boolean {
  if (!input.hasAuthCookie) return false;
  if (isApiPath(input.pathname)) return false;
  if (input.pathname === "/sign-in") return true;
  const expiresAt = authCookieExpiresAt(input.cookies ?? []);
  if (expiresAt == null) return true;
  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  return expiresAt - nowSeconds <= AUTH_REFRESH_SKEW_SECONDS;
}

export async function refreshAuthBestEffort(
  refresh: () => Promise<unknown>,
): Promise<"refreshed" | "skipped"> {
  try {
    await refresh();
    return "refreshed";
  } catch {
    return "skipped";
  }
}

/** Decode session expiry from Auth cookies. Never used to grant access. */
export function authCookieExpiresAt(cookies: Array<{ name: string; value: string }>): number | null {
  const raw = combineAuthCookieValue(cookies);
  if (!raw) return null;
  const session = parseAuthCookieValue(raw);
  if (!session) return null;
  if (typeof session.expires_at === "number" && Number.isFinite(session.expires_at)) {
    return session.expires_at;
  }
  if (typeof session.access_token === "string") {
    return jwtExpSeconds(session.access_token);
  }
  return null;
}

function combineAuthCookieValue(cookies: Array<{ name: string; value: string }>): string | null {
  const auth = cookies.filter((cookie) => cookieLooksLikeAuth(cookie.name) && cookie.value);
  if (auth.length === 0) return null;

  const groups = new Map<string, Array<{ index: number; value: string }>>();
  for (const cookie of auth) {
    const chunk = cookie.name.match(/^(.*)\.(\d+)$/);
    const base = chunk ? chunk[1] : cookie.name;
    const index = chunk ? Number(chunk[2]) : -1;
    const list = groups.get(base) ?? [];
    list.push({ index, value: cookie.value });
    groups.set(base, list);
  }

  for (const parts of groups.values()) {
    const whole = parts.find((part) => part.index < 0);
    if (whole?.value) return whole.value;
    const chunks = parts
      .filter((part) => part.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (chunks.length > 0) return chunks.map((part) => part.value).join("");
  }
  return null;
}

function parseAuthCookieValue(raw: string): { expires_at?: unknown; access_token?: unknown } | null {
  const text = raw.startsWith("base64-") ? decodeBase64Url(raw.slice("base64-".length)) : raw;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { expires_at?: unknown; access_token?: unknown };
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return { access_token: text };
  }
  return null;
}

function jwtExpSeconds(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  const payloadText = decodeBase64Url(parts[1]);
  if (!payloadText) return null;
  try {
    const payload = JSON.parse(payloadText) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (3 - (value.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}
