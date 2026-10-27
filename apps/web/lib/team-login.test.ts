import { describe, expect, it } from "vitest";
import {
  parseProvisionTeamIdList,
  parseQualifiedTeamId,
  seatForProvisionIndex,
} from "./team-login";
import {
  credentialsCsv,
  generateTeamPassword,
  hashTeamPassword,
  verifyTeamPassword,
} from "./team-password";

function twentyIds(): string[] {
  return Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, "0"));
}

describe("parseQualifiedTeamId", () => {
  it("accepts digit Team IDs and preserves leading zeros", () => {
    expect(parseQualifiedTeamId("004")).toBe("004");
    expect(parseQualifiedTeamId(" 010 ")).toBe("010");
    expect(parseQualifiedTeamId("25")).toBe("25");
  });

  it("accepts team001 as the public username for Team 001", () => {
    expect(parseQualifiedTeamId("team001")).toBe("001");
    expect(parseQualifiedTeamId("Team001")).toBe("001");
    expect(parseQualifiedTeamId(" team001 ")).toBe("001");
  });

  it("rejects non-digit or empty values", () => {
    expect(parseQualifiedTeamId("ASHFEN-TEAM-01")).toBeNull();
    expect(parseQualifiedTeamId("seat-01")).toBeNull();
    expect(parseQualifiedTeamId("")).toBeNull();
    expect(parseQualifiedTeamId("12a")).toBeNull();
    expect(parseQualifiedTeamId("team")).toBeNull();
  });
});

describe("parseProvisionTeamIdList", () => {
  it("accepts exactly 20 unique IDs in list order", () => {
    const ids = twentyIds();
    const parsed = parseProvisionTeamIdList(ids);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.teamIds).toEqual(ids);
      expect(seatForProvisionIndex(0)).toBe(1);
      expect(seatForProvisionIndex(19)).toBe(20);
    }
  });

  it("accepts a comma-separated string", () => {
    const parsed = parseProvisionTeamIdList(twentyIds().join(", "));
    expect(parsed.ok).toBe(true);
  });

  it("rejects wrong count or duplicates", () => {
    expect(parseProvisionTeamIdList(twentyIds().slice(0, 19)).ok).toBe(false);
    const dup = twentyIds();
    dup[5] = dup[0]!;
    expect(parseProvisionTeamIdList(dup).ok).toBe(false);
  });
});

describe("team passwords", () => {
  it("generates unique strong passwords and verifies bcrypt hashes", async () => {
    const a = generateTeamPassword();
    const b = generateTeamPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);

    const hash = await hashTeamPassword(a);
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyTeamPassword(a, hash)).toBe(true);
    expect(await verifyTeamPassword(b, hash)).toBe(false);
  });

  it("builds a CSV export without embedding secrets in the header", () => {
    const csv = credentialsCsv([
      { teamId: "004", password: "secret-a", seat: 1 },
      { teamId: "010", password: "secret-b", seat: 2 },
    ]);
    expect(csv).toBe("team_id,password,seat\n004,secret-a,1\n010,secret-b,2\n");
  });
});
