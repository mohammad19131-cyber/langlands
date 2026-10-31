/** Best-effort sliding-window rate limit for API routes (per process). */

export const API_RATE_LIMIT = 20;
export const API_RATE_WINDOW_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
};

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

/** Normalize API path so dynamic segments share one bucket (e.g. /api/rounds/:id/lock). */
export function rateLimitRouteKey(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  return path
    .replace(
      /\/api\/rounds\/[^/]+/g,
      "/api/rounds/:id",
    )
    .replace(
      /\/api\/admin\/teams\/[^/]+\/members\/[^/]+/g,
      "/api/admin/teams/:teamId/members/:userId",
    )
    .replace(
      /\/api\/admin\/teams\/[^/]+/g,
      "/api/admin/teams/:teamId",
    )
    .replace(
      /\/api\/rounds\/:id\/support\/[^/]+/g,
      "/api/rounds/:id/support/:teamId",
    );
}

/** Client key from proxy headers. Never trusts body fields. */
export function rateLimitClientKey(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  return "unknown";
}

export function rateLimitBucketKey(clientKey: string, routeKey: string): string {
  return `${clientKey}::${routeKey}`;
}

/**
 * Consume one request against the 20/min sliding window for this bucket.
 * Pure enough to unit-test via an injectable store.
 */
export function consumeRateLimit(
  bucketKey: string,
  nowMs: number = Date.now(),
  store: Map<string, Bucket> = buckets,
  limit: number = API_RATE_LIMIT,
  windowMs: number = API_RATE_WINDOW_MS,
): RateLimitResult {
  const cutoff = nowMs - windowMs;
  let bucket = store.get(bucketKey);
  if (!bucket) {
    bucket = { hits: [] };
    store.set(bucketKey, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    return { allowed: false, limit, remaining: 0, retryAfterSec };
  }
  bucket.hits.push(nowMs);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSec: 0,
  };
}

/** Test helper — clears the default in-memory store. */
export function resetRateLimitStoreForTests(): void {
  buckets.clear();
}
