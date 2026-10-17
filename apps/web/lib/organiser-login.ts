import { isSystemAuthEmail } from "./display-identity";
import { parseQualifiedTeamId } from "./team-login";

/** Local staff identity. Not a Team ID and never a player Auth alias. */
export const LOCAL_ORGANISER_EMAIL = "organiser-local@langlands.dev";

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export type LoginIdentifier =
  | { kind: "team"; teamId: string }
  | { kind: "organiser"; email: string }
  | { kind: "invalid" };

export function parseOrganiserLogin(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return null;
  if (isSystemAuthEmail(email)) return null;
  return email;
}

export function resolveLoginIdentifier(raw: string): LoginIdentifier {
  const teamId = parseQualifiedTeamId(raw);
  if (teamId) return { kind: "team", teamId };
  const email = parseOrganiserLogin(raw);
  if (email) return { kind: "organiser", email };
  return { kind: "invalid" };
}
