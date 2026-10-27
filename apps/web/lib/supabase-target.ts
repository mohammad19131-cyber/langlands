/**
 * Prevents account provisioning from targeting the live competition by accident.
 * Project refs are public identifiers from supabase/SETUP.md, not secrets.
 */
export const HOSTED_COMPETITION_PROJECT_REF = "npwgkqfljrqhvuiateqk";

export function projectRefFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.trim()).hostname;
    const ref = host.split(".")[0]?.trim();
    return ref || null;
  } catch {
    return null;
  }
}

export type ProvisionTarget =
  | { ok: true; ref: string }
  | { ok: false; error: string };

/**
 * Fail closed against the hosted project unless ALLOW_HOSTED_PROVISION=true.
 * If LANGLANDS_ALLOWED_PROJECT_REF is set, the URL ref must match it.
 */
export function assertProvisionTarget(
  url: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): ProvisionTarget {
  const ref = projectRefFromSupabaseUrl(url);
  if (!ref) {
    return { ok: false, error: "Supabase URL is missing or has no project ref." };
  }
  const allowHosted = env.ALLOW_HOSTED_PROVISION?.trim() === "true";
  if (ref === HOSTED_COMPETITION_PROJECT_REF && !allowHosted) {
    return {
      ok: false,
      error: "Refusing to provision against the hosted competition project.",
    };
  }
  const allowed = env.LANGLANDS_ALLOWED_PROJECT_REF?.trim();
  if (allowed && ref !== allowed) {
    return {
      ok: false,
      error: "Supabase project ref does not match LANGLANDS_ALLOWED_PROJECT_REF.",
    };
  }
  return { ok: true, ref };
}

export type OrganiserCredentialsTrust =
  | { ok: true; ref: string }
  | { ok: false; reason: "invalid" | "stale" | "hosted" | "mismatch"; error: string };

/**
 * A credentials file without projectRef is leftover from another project and
 * must not be treated as a rehearsal organiser. Never reads password fields.
 */
export function organiserCredentialsTrust(
  file: unknown,
  currentUrl: string | null | undefined,
): OrganiserCredentialsTrust {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return { ok: false, reason: "invalid", error: "Organiser credentials file is not an object." };
  }
  const projectRef =
    typeof (file as { projectRef?: unknown }).projectRef === "string"
      ? (file as { projectRef: string }).projectRef.trim()
      : "";
  if (!projectRef) {
    return {
      ok: false,
      reason: "stale",
      error: "Organiser credentials file has no projectRef and cannot be trusted for this target.",
    };
  }
  if (projectRef === HOSTED_COMPETITION_PROJECT_REF) {
    return {
      ok: false,
      reason: "hosted",
      error: "Organiser credentials file belongs to the hosted competition project.",
    };
  }
  const current = projectRefFromSupabaseUrl(currentUrl);
  if (current && projectRef !== current) {
    return {
      ok: false,
      reason: "mismatch",
      error: "Organiser credentials file does not match the current Supabase project.",
    };
  }
  return { ok: true, ref: projectRef };
}
