/** Seat 1–20. Auth users are provisioned as seat-NN@teams.langlands.app. */

export const TEAM_LOGIN_DOMAIN = "teams.langlands.app";

export function parseTeamLoginId(raw: string): number | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "");
  const match = normalized.match(/^(?:seat-?)?0*([1-9]|1[0-9]|20)$/);
  if (!match) return null;
  const seat = Number(match[1]);
  if (seat < 1 || seat > 20) return null;
  return seat;
}

export function teamLoginEmail(seat: number): string {
  return `seat-${String(seat).padStart(2, "0")}@${TEAM_LOGIN_DOMAIN}`;
}
