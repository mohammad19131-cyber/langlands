/**
 * Trust boundary (docs/security-and-permissions.md)
 *
 * The browser may propose: sector allocations, up to two catalogue codes,
 * an idempotency key, and a client clock that is logged and ignored.
 *
 * The server alone decides: whether the round is open (database now() vs
 * opens_at/closes_at), how many credits the town has, which starts are
 * legal, the simulated town, the official score, and when results publish.
 *
 * Teams never read rival submissions or unpublished town_states. After
 * publish they read published_results (TownPublic fields) only. RLS is
 * the backstop; Next.js still checks session + membership.
 *
 * Official writes (town_states, published_results, scores, process runs,
 * audit) use the service role on the server after an advisory lock. The
 * anon key may exist in the browser; the service role key must not.
 */

export const TRUST = {
  clientMaySubmit: ["allocations", "projectStarts", "idempotencyKey"] as const,
  serverAuthoritative: [
    "round open/close",
    "available credits",
    "catalogue validity",
    "simulation",
    "scores",
    "published results",
  ] as const,
} as const;
