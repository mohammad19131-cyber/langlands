export type EventStartPlan =
  | { ok: false; error: string }
  | { ok: true; openRound1: boolean; reason: string };

/**
 * Organiser Start is idempotent. It may mark the competition live and open
 * round 1 from `scheduled`. It must not restamp an already-open window.
 */
export function planEventStart(args: {
  competitionStatus: string;
  round1Status: string | null;
}): EventStartPlan {
  const status = args.competitionStatus;
  if (status === "closed" || status === "archived") {
    return { ok: false, error: "This event has already finished." };
  }
  if (!args.round1Status) {
    return { ok: false, error: "Round 1 is missing." };
  }
  if (args.round1Status === "scheduled") {
    return {
      ok: true,
      openRound1: true,
      reason: "Start opens round 1 for 18 minutes on the server clock.",
    };
  }
  return {
    ok: true,
    openRound1: false,
    reason: "Event is already live. The current round window is unchanged.",
  };
}
