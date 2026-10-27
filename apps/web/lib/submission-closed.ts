export const DEADLINE_PASSED_MESSAGE = "Deadline passed. Waiting for results.";
export const ROUND_NOT_OPEN_MESSAGE = "Round is not open yet.";

/**
 * Copy for a rejected submit after the RPC reports the window is closed.
 * HTTP status stays 403 `closed`. Scheduled rounds are not a passed deadline.
 */
export function submissionClosedMessage(roundStatus: string | null | undefined): string {
  if (roundStatus === "scheduled") return ROUND_NOT_OPEN_MESSAGE;
  return DEADLINE_PASSED_MESSAGE;
}
