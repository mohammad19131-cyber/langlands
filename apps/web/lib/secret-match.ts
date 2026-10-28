import { createHash, timingSafeEqual } from "node:crypto";

/** Bearer token from an Authorization header. Empty when the header is missing or not Bearer. */
export function bearerToken(authorization: string | null | undefined): string {
  const raw = authorization ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

/**
 * Compare secrets in constant time relative to digest length.
 * Empty values never match.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
