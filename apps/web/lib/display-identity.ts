/**
 * Never surface Supabase Auth system emails (team-*@users.langlands.internal)
 * in the player UI. Prefer Team ID / seat label.
 */
export function publicPlayerLabel(args: {
  loginId?: string | null;
  teamName?: string | null;
  seat?: number | null;
}): string {
  if (args.loginId && /^[0-9]{1,6}$/.test(args.loginId)) {
    return `Team ${args.loginId}`;
  }
  if (args.teamName && args.teamName.trim()) return args.teamName.trim();
  if (args.seat != null && args.seat >= 1 && args.seat <= 20) {
    return `Seat ${String(args.seat).padStart(2, "0")}`;
  }
  return "Signed in";
}

export function isSystemAuthEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith("@users.langlands.internal");
}
