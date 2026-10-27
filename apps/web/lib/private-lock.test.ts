import { describe, expect, it } from "vitest";
import { asPrivateLockEntries, organiserLockHttpBody } from "./private-lock";

const fullEntry = {
  teamId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  seat: 1,
  teamName: "Seat 01",
  disqualified: false,
  submissionId: "sub-1",
  allocations: { water: 10 },
  projectStarts: ["GRID"],
};

describe("private lock payloads", () => {
  it("accepts a 20-seat private capture and rejects the public seat summary", () => {
    const privateRows = Array.from({ length: 20 }, (_, i) => ({
      ...fullEntry,
      seat: i + 1,
      teamId: `team-${String(i + 1).padStart(2, "0")}`,
      teamName: `Seat ${String(i + 1).padStart(2, "0")}`,
    }));
    const parsed = asPrivateLockEntries(privateRows);
    expect(parsed).toHaveLength(20);
    expect(parsed?.[0]?.allocations).toEqual({ water: 10 });

    const publicSummary = privateRows.map((row) => ({
      seat: row.seat,
      teamName: row.teamName,
      disqualified: row.disqualified,
      submissionId: row.submissionId,
    }));
    expect(asPrivateLockEntries(publicSummary)).toBeNull();
  });

  it("strips allocations from the organiser lock HTTP body", () => {
    const body = organiserLockHttpBody({
      ok: true,
      status: "locked",
      idempotent: false,
      lock_manifest: Array.from({ length: 20 }, (_, i) => ({
        ...fullEntry,
        seat: i + 1,
      })),
    });
    expect(JSON.stringify(body)).not.toMatch(/allocations/i);
    expect(JSON.stringify(body)).not.toMatch(/projectStarts/i);
    expect(body.lock_manifest).toHaveLength(20);
    expect(body.lock_manifest[0]).toEqual({
      seat: 1,
      teamName: "Seat 01",
      disqualified: false,
      held: false,
    });
  });
});
