import { describe, expect, it } from "vitest";
import {
  HOSTED_COMPETITION_PROJECT_REF,
  assertProvisionTarget,
  organiserCredentialsTrust,
  projectRefFromSupabaseUrl,
} from "./supabase-target";

const REHEARSAL = "fgqitafevklmuhybuwzw";
const rehearsalUrl = `https://${REHEARSAL}.supabase.co`;
const hostedUrl = `https://${HOSTED_COMPETITION_PROJECT_REF}.supabase.co`;

describe("provision target guard", () => {
  it("reads the project ref from a Supabase URL and ignores missing values", () => {
    expect(projectRefFromSupabaseUrl(rehearsalUrl)).toBe(REHEARSAL);
    expect(projectRefFromSupabaseUrl(hostedUrl)).toBe(HOSTED_COMPETITION_PROJECT_REF);
    expect(projectRefFromSupabaseUrl("")).toBeNull();
    expect(projectRefFromSupabaseUrl("not-a-url")).toBeNull();
  });

  it("allows the rehearsal project and refuses the hosted competition", () => {
    expect(assertProvisionTarget(rehearsalUrl, {}).ok).toBe(true);
    const hosted = assertProvisionTarget(hostedUrl, {});
    expect(hosted.ok).toBe(false);
    if (!hosted.ok) {
      expect(hosted.error).toMatch(/hosted competition/i);
    }
  });

  it("allows hosted only when ALLOW_HOSTED_PROVISION is the string true", () => {
    expect(assertProvisionTarget(hostedUrl, { ALLOW_HOSTED_PROVISION: "true" }).ok).toBe(true);
    expect(assertProvisionTarget(hostedUrl, { ALLOW_HOSTED_PROVISION: "1" }).ok).toBe(false);
  });

  it("enforces LANGLANDS_ALLOWED_PROJECT_REF when set", () => {
    expect(
      assertProvisionTarget(rehearsalUrl, { LANGLANDS_ALLOWED_PROJECT_REF: REHEARSAL }).ok,
    ).toBe(true);
    const blocked = assertProvisionTarget(rehearsalUrl, {
      LANGLANDS_ALLOWED_PROJECT_REF: HOSTED_COMPETITION_PROJECT_REF,
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("organiser credentials file trust", () => {
  it("treats a file without projectRef as stale, not as a rehearsal organiser", () => {
    const stale = organiserCredentialsTrust(
      { email: "organiser-local@langlands.dev", competitionId: "other" },
      rehearsalUrl,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe("stale");
  });

  it("refuses a hosted projectRef and a mismatched rehearsal file", () => {
    const hosted = organiserCredentialsTrust({ projectRef: HOSTED_COMPETITION_PROJECT_REF }, rehearsalUrl);
    expect(hosted.ok).toBe(false);
    if (!hosted.ok) expect(hosted.reason).toBe("hosted");
    const mismatch = organiserCredentialsTrust({ projectRef: REHEARSAL }, hostedUrl);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe("mismatch");
  });

  it("accepts a file tagged with the current rehearsal ref", () => {
    const trusted = organiserCredentialsTrust({ projectRef: REHEARSAL }, rehearsalUrl);
    expect(trusted).toEqual({ ok: true, ref: REHEARSAL });
  });
});
