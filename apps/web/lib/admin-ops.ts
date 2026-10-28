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
