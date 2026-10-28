/**
 * Official 20-town standings are organiser-only.
 * Hiding a HUD control is not access control — APIs and pages must use this.
 */
export function mayReadOfficialBoard(isOrganiser: boolean): boolean {
  return isOrganiser === true;
}
