import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  cookieLooksLikeAuth,
  isApiPath,
  middlewareDestination,
  refreshAuthBestEffort,
  shouldRefreshAuthSession,
} from "./lib/middleware-gate";
import {
  consumeRateLimit,
  rateLimitBucketKey,
  rateLimitClientKey,
  rateLimitRouteKey,
} from "./lib/rate-limit";
import { sanitizeSignInSearch } from "./lib/sign-in-request";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Auth cookie. Does not grant gameplay rights.
 * Protected pages are gated by cookie presence here so RSC render never reads
 * the GoTrue user or cookie values. A thrown getUser() must not 500 the request.
 * API routes: 20 requests / minute / client / route (sliding window).
 */
export async function middleware(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    const routeKey = rateLimitRouteKey(request.nextUrl.pathname);
    const clientKey = rateLimitClientKey(request.headers);
    const limited = consumeRateLimit(rateLimitBucketKey(clientKey, routeKey));
    if (!limited.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: "Too many requests. Limit is 20 per minute for this API.",
          retryAfterSec: limited.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limited.retryAfterSec),
            "X-RateLimit-Limit": String(limited.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
    const pass = NextResponse.next({ request });
    pass.headers.set("X-RateLimit-Limit", String(limited.limit));
    pass.headers.set("X-RateLimit-Remaining", String(limited.remaining));
    return pass;
  }

  if (request.nextUrl.pathname === "/sign-in" && request.method === "GET") {
    const { leaked, search } = sanitizeSignInSearch(request.nextUrl.searchParams);
    if (leaked) {
      const clean = request.nextUrl.clone();
      clean.search = search.toString();
      return NextResponse.redirect(clean);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  let response = NextResponse.next({ request });

  const cookies = request.cookies.getAll();
  const hasAuthCookie = cookies.some((cookie) => cookieLooksLikeAuth(cookie.name));
  let sessionConfirmed: boolean | null = null;

  if (
    url &&
    anonKey &&
    shouldRefreshAuthSession({
      hasAuthCookie,
      pathname: request.nextUrl.pathname,
      cookies,
    })
  ) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const refreshed = await refreshAuthBestEffort(async () => {
      const { data } = await supabase.auth.getUser();
      sessionConfirmed = Boolean(data.user);
    });
    if (refreshed === "skipped") sessionConfirmed = false;
  }

  const destination = middlewareDestination({
    pathname: request.nextUrl.pathname,
    method: request.method,
    hasAuthCookie,
    sessionConfirmed,
  });
  if (destination === "sign-in") {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (destination === "play") {
    return NextResponse.redirect(new URL("/play", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
