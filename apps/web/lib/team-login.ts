/**
 * Qualified Team IDs are the public login usernames (e.g. 004, 010, 025).
 * They are not seat numbers and not internal UUIDs.
 */

export const QUALIFIED_TEAM_ID_PATTERN = /^[0-9]{1,6}$/;
export const REQUIRED_TEAM_COUNT = 20;

/** Normalize raw input; preserve leading zeros. Returns null if invalid. */
export function parseQualifiedTeamId(raw: string): string | null {
  const normalized = raw.trim().replace(/\s+/g, "");
  if (!QUALIFIED_TEAM_ID_PATTERN.test(normalized)) return null;
  return normalized;
}

export type ProvisionListResult =
  | { ok: true; teamIds: string[] }
  | { ok: false; error: string };

/**
 * Validates a night-before qualified-team list: exactly 20 unique IDs.
 * List order maps to seats 1..20.
 */
export function parseProvisionTeamIdList(raw: string[] | string): ProvisionListResult {
  const parts = Array.isArray(raw)
    ? raw
    : raw.split(/[\s,;]+/).filter((part) => part.length > 0);

  const teamIds: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const id = parseQualifiedTeamId(part);
    if (!id) {
      return { ok: false, error: `Invalid Team ID "${part.trim()}". Use digits only (e.g. 004).` };
    }
    if (seen.has(id)) {
      return { ok: false, error: `Duplicate Team ID "${id}".` };
    }
    seen.add(id);
    teamIds.push(id);
  }

  if (teamIds.length !== REQUIRED_TEAM_COUNT) {
    return {
      ok: false,
      error: `Expected exactly ${REQUIRED_TEAM_COUNT} Team IDs, got ${teamIds.length}.`,
    };
  }

  return { ok: true, teamIds };
}

/** Seat 1..20 assigned by list order. */
export function seatForProvisionIndex(index: number): number {
  if (index < 0 || index >= REQUIRED_TEAM_COUNT) {
    throw new Error("provision index out of range");
  }
  return index + 1;
}
