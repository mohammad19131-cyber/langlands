import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/** Bcrypt cost. Matches Wolf of Tech Street (bcryptjs, cost 10). */
export const PASSWORD_BCRYPT_ROUNDS = 10;

/** Cryptographically strong password; URL-safe for handoff sheets. */
export function generateTeamPassword(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

export async function hashTeamPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
}

export async function verifyTeamPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash || !/^\$2[aby]\$/.test(passwordHash)) return false;
  return bcrypt.compare(password, passwordHash);
}

export function credentialsCsv(
  rows: ReadonlyArray<{ teamId: string; password: string; seat: number }>,
): string {
  const header = "team_id,password,seat";
  const lines = rows.map((row) => `${row.teamId},${row.password},${row.seat}`);
  return [header, ...lines].join("\n") + "\n";
}
