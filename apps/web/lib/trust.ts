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
 * Teams never read rival submissions, unpublished town_states, or rival
 * published_results. After publish a captain may read their own TownPublic
 * row. Organisers and judges of that competition may read published
 * TownPublic rows. RLS is the backstop; Next.js still checks session +
 * membership. Play/board loaders use the service role and then filter.
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
