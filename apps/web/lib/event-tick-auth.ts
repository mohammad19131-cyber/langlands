import { bearerToken, secretsMatch } from "./secret-match";

export type EventTickAuth =
  | { kind: "secret" }
  | { kind: "session" }
  | { kind: "deny"; status: 401 | 405; error: string };

/**
 * GET is for Vercel Cron (Bearer secret only). Cookie sessions must not
 * change round state via GET — that is a CSRF footgun.
 * POST may use the cron secret or a signed-in organiser session.
 */
export function classifyEventTickAuth(args: {
  method: string;
  authorization: string | null;
  configuredSecret: string;
}): EventTickAuth {
  const method = args.method.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return { kind: "deny", status: 405, error: "method" };
  }
  const secret = args.configuredSecret.trim();
  const bearer = bearerToken(args.authorization);
  if (secret && bearer && secretsMatch(bearer, secret)) {
    return { kind: "secret" };
  }
  if (method === "GET") {
    return { kind: "deny", status: 401, error: "unauthorized" };
  }
  return { kind: "session" };
}

/** GET without the cron secret must not call runEventTick. */
export function shouldRunEventTick(auth: EventTickAuth): boolean {
  return auth.kind === "secret" || auth.kind === "session";
}
