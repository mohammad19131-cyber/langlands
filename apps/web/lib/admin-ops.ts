export const RESET_PLAY_CONFIRM = "RESET PLAY";
export const STARTING_RESERVE_FALLBACK = 220;

export type CreditsSource = "starting" | "published";

export function officialCredits(args: {
  startingReserve: number;
  publishedReserve: number | null | undefined;
}): { credits: number; source: CreditsSource } {
  const start = Number.isFinite(args.startingReserve) ? args.startingReserve : STARTING_RESERVE_FALLBACK;
  if (args.publishedReserve == null || !Number.isFinite(args.publishedReserve)) {
    return { credits: start, source: "starting" };
  }
  return { credits: args.publishedReserve, source: "published" };
}

export function parseTeamName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 2 || name.length > 60) return null;
  return name;
}

export function parseDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

export function parseMemberRole(raw: unknown): "captain" | "member" | null | false {
  if (raw == null || raw === "") return null;
  if (raw === "captain" || raw === "member") return raw;
  return false;
}

export function resetPlayConfirmed(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim() === RESET_PLAY_CONFIRM;
}

/** Round columns cleared by an organiser play reset. Does not touch scores or teams. */
export function scheduledRoundReset(): {
  status: "scheduled";
  locked_at: null;
  processed_at: null;
  published_at: null;
  process_checksum: null;
  process_claim_token: null;
  process_claimed_at: null;
  lock_manifest: null;
} {
  return {
    status: "scheduled",
    locked_at: null,
    processed_at: null,
    published_at: null,
    process_checksum: null,
    process_claim_token: null,
    process_claimed_at: null,
    lock_manifest: null,
  };
}

export function isMissingRpc(message: string): boolean {
  return /schema cache/i.test(message) || /could not find the function/i.test(message);
}

/**
 * Force the town template (or any town jsonb) back to the frozen starting reserve.
 * Credits displayed after reset must come from this `reserve` field, not a stale
 * published_results row.
 */
export function withStartingReserve(
  state: unknown,
  reserve: number = STARTING_RESERVE_FALLBACK,
): Record<string, unknown> {
  const base =
    state && typeof state === "object" && !Array.isArray(state)
      ? { ...(state as Record<string, unknown>) }
      : {};
  return { ...base, reserve };
}

export function readReserve(state: unknown): number | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const value = Number((state as { reserve?: unknown }).reserve);
  return Number.isFinite(value) ? value : null;
}
