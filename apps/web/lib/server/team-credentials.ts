import "server-only";
export {
  PASSWORD_BCRYPT_ROUNDS,
  credentialsCsv,
  generateTeamPassword,
  hashTeamPassword,
  verifyTeamPassword,
} from "../team-password";

/**
 * Opaque Auth identity for GoTrue only. Never shown in the player UI and never
 * used as a participant login field. Required because profiles.id → auth.users.
 */
export const AUTH_IDENTITY_DOMAIN = "users.langlands.internal";

export function systemAuthEmail(loginId: string): string {
  return `team-${loginId}@${AUTH_IDENTITY_DOMAIN}`;
}
