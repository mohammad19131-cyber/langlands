import { describe, expect, it } from "vitest";
import {
  actionEndpoint,
  assertNoPrivateRoomFields,
  buildSeatsForRound,
  canExtend,
  canReopen,
  canRestore,
  canVoid,
  currentRoomRound,
  deriveSeatStatus,
  missingCount,
  nextRoomAction,
  predecessorPublished,
  publicManifest,
  publicationReady,
  recoveryGuidance,
  type RoomRound,
  type RoomTeam,
} from "./room-ops";

function round(partial: Partial<RoomRound> & Pick<RoomRound, "index" | "status">): RoomRound {
  return {
    id: partial.id ?? `r${partial.index}`,
    opensAt: "2026-10-17T12:00:00.000Z",
    closesAt: "2026-10-17T12:18:00.000Z",
    eventCode: null,
    processChecksum: null,
    processedAt: null,
    publishedAt: null,
    lockedAt: null,
    manifest: partial.manifest ?? [],
    lastRun: partial.lastRun ?? null,
    ...partial,
  };
}

const scheduledSix: RoomRound[] = [1, 2, 3, 4, 5, 6].map((index) => round({ index, status: "scheduled" }));

const twentyTeams: RoomTeam[] = Array.from({ length: 20 }, (_, i) => ({
  seat: i + 1,
  teamId: `team-${String(i + 1).padStart(2, "0")}`,
  name: `Seat ${String(i + 1).padStart(2, "0")}`,
  loginId: `T${String(i + 1).padStart(2, "0")}`,
  disqualified: false,
}));

describe("pre-event scheduled field", () => {
  it("treats all six scheduled rounds as empty and only allows opening round 1", () => {
    expect(scheduledSix).toHaveLength(6);
    expect(scheduledSix.every((row) => row.status === "scheduled")).toBe(true);
    expect(predecessorPublished(scheduledSix, 1)).toBe(true);
    expect(predecessorPublished(scheduledSix, 2)).toBe(false);
    expect(nextRoomAction({ round: scheduledSix[0]!, rounds: scheduledSix })).toBe("open");
    expect(nextRoomAction({ round: scheduledSix[1]!, rounds: scheduledSix })).toBe("none");
    expect(
      nextRoomAction({ round: scheduledSix[0]!, rounds: scheduledSix, competitionPaused: true }),
    ).toBe("none");
    expect(currentRoomRound(scheduledSix)?.index).toBe(1);
    expect(publicationReady(scheduledSix[0]!)).toBe(false);
    const r1Void = [
      round({ index: 1, status: "void" }),
      ...scheduledSix.slice(1),
    ];
    expect(currentRoomRound(r1Void)?.index).toBe(1);
    expect(canRestore(r1Void[0]!.status)).toBe(true);
  });

  it("shows twenty missing seats and no results when nothing has opened", () => {
    const seats = buildSeatsForRound({
      teams: twentyTeams,
      round: scheduledSix[0]!,
      submissions: [],
      manifest: [],
    });
    expect(seats).toHaveLength(20);
    expect(seats.every((seat) => seat.status === "missing")).toBe(true);
    expect(missingCount(seats)).toBe(20);
    expect(scheduledSix.every((row) => row.manifest.length === 0 && row.lastRun == null)).toBe(true);
  });
});

describe("round transitions", () => {
  it("walks scheduled → open → lock → process → publish and never reopens published", () => {
    const r1 = round({ index: 1, status: "open" });
    expect(nextRoomAction({ round: r1, rounds: [r1] })).toBe("lock");
    const locked = round({ index: 1, status: "locked" });
    expect(nextRoomAction({ round: locked, rounds: [locked] })).toBe("process");
    const processing = round({ index: 1, status: "processing" });
    expect(nextRoomAction({ round: processing, rounds: [processing] })).toBe("process");
    const ready = round({ index: 1, status: "processing", processChecksum: "abc" });
    expect(
      nextRoomAction({
        round: ready,
        rounds: [ready],
        lastRun: { attempt: 1, ok: true, checksum: "abc", error: null, engineVersion: "py-ref-1.1.0", finishedAt: "now" },
      }),
    ).toBe("publish");
    const published = round({ index: 1, status: "published", processChecksum: "abc" });
    expect(nextRoomAction({ round: published, rounds: [published] })).toBe("none");
    expect(canVoid("published")).toBe(false);
    expect(canVoid("open")).toBe(true);
    expect(canExtend("open")).toBe(true);
    expect(canExtend("locked")).toBe(false);
    expect(canReopen(locked)).toBe(true);
    expect(canReopen(published)).toBe(false);
    expect(canReopen(ready)).toBe(false);
    expect(canRestore("void")).toBe(true);
    expect(canRestore("published")).toBe(false);
    expect(canRestore("scheduled")).toBe(false);
  });

  it("blocks publish when the checksum is missing or the last run failed", () => {
    const processing = round({ index: 1, status: "processing" });
    expect(publicationReady(processing, { attempt: 1, ok: true, checksum: null, error: null, engineVersion: null, finishedAt: null })).toBe(
      false,
    );
    const hashed = round({ index: 1, status: "processing", processChecksum: "deadbeef" });
    expect(
      publicationReady(hashed, {
        attempt: 2,
        ok: false,
        checksum: null,
        error: "replay mismatch",
        engineVersion: null,
        finishedAt: null,
      }),
    ).toBe(false);
    expect(
      publicationReady(hashed, {
        attempt: 2,
        ok: true,
        checksum: "deadbeef",
        error: null,
        engineVersion: "py-ref-1.1.0",
        finishedAt: "now",
      }),
    ).toBe(true);
  });

  it("treats a second process after a successful run as publish, not a duplicate write", () => {
    const processing = round({ index: 1, status: "processing", processChecksum: "ok" });
    expect(
      nextRoomAction({
        round: processing,
        rounds: [processing],
        lastRun: { attempt: 1, ok: true, checksum: "ok", error: null, engineVersion: "py-ref-1.1.0", finishedAt: "now" },
      }),
    ).toBe("publish");
  });
});

describe("seat status and missing submissions", () => {
  it("labels open-round writes as saved and lock-time writes as accepted", () => {
    expect(
      deriveSeatStatus({
        disqualified: false,
        roundStatus: "open",
        submissionStatus: "accepted",
        lockedWithSubmission: null,
      }),
    ).toBe("saved");
    expect(
      deriveSeatStatus({
        disqualified: false,
        roundStatus: "locked",
        submissionStatus: "accepted",
        lockedWithSubmission: true,
      }),
    ).toBe("accepted");
    expect(
      deriveSeatStatus({
        disqualified: false,
        roundStatus: "locked",
        submissionStatus: null,
        lockedWithSubmission: false,
      }),
    ).toBe("missing");
    expect(
      deriveSeatStatus({
        disqualified: true,
        roundStatus: "open",
        submissionStatus: "accepted",
        lockedWithSubmission: true,
      }),
    ).toBe("dq");
    expect(
      deriveSeatStatus({
        disqualified: false,
        roundStatus: "open",
        submissionStatus: "late",
        lockedWithSubmission: null,
      }),
    ).toBe("late");
  });

  it("counts missing holds without treating disqualified seats as missing", () => {
    expect(
      missingCount([
        { status: "missing", disqualified: false },
        { status: "missing", disqualified: true },
        { status: "saved", disqualified: false },
      ]),
    ).toBe(1);
  });

  it("does not copy an open round's saves onto a later scheduled round", () => {
    const r1 = round({ index: 1, status: "open", id: "r1" });
    const r2 = round({ index: 2, status: "scheduled", id: "r2" });
    const submissions = [{ roundId: "r1", teamId: "team-01", status: "accepted" }];
    const live = buildSeatsForRound({ teams: twentyTeams, round: r1, submissions, manifest: [] });
    const later = buildSeatsForRound({ teams: twentyTeams, round: r2, submissions, manifest: [] });
    expect(live[0]?.status).toBe("saved");
    expect(later.every((seat) => seat.status === "missing")).toBe(true);
  });
});

describe("lock manifest privacy and checksum recovery", () => {
  it("strips allocations and starts from a captured lock manifest", () => {
    const summary = publicManifest([
      {
        seat: 2,
        teamName: "Seat 02",
        disqualified: false,
        submissionId: "sub-1",
        allocations: { water: 40 },
        projectStarts: ["GRID"],
      },
      {
        seat: 1,
        teamName: "Seat 01",
        disqualified: false,
        submissionId: null,
        allocations: null,
        projectStarts: null,
      },
    ]);
    expect(summary).toEqual([
      { seat: 1, teamName: "Seat 01", disqualified: false, held: true },
      { seat: 2, teamName: "Seat 02", disqualified: false, held: false },
    ]);
    expect(assertNoPrivateRoomFields(summary)).toEqual([]);
  });

  it("points checksum failures at retrying process, not publishing", () => {
    expect(recoveryGuidance("checksum mismatch")).toMatch(/do not publish/i);
    expect(recoveryGuidance("predecessor not published")).toMatch(/restore the voided round/i);
    expect(recoveryGuidance("cannot restore")).toMatch(/unpublished voided round/i);
    expect(recoveryGuidance("unauthorized")).toBe("Not available.");
  });

  it("routes organiser actions through the existing round APIs", () => {
    expect(actionEndpoint("open", "abc")).toBe("/api/rounds/abc/open");
    expect(actionEndpoint("lock", "abc")).toBe("/api/rounds/abc/lock");
    expect(actionEndpoint("process", "abc")).toBe("/api/rounds/abc/process");
    expect(actionEndpoint("publish", "abc")).toBe("/api/rounds/abc/publish");
    expect(actionEndpoint("void", "abc")).toBe("/api/rounds/abc/void");
    expect(actionEndpoint("restore", "abc")).toBe("/api/rounds/abc/restore");
  });
});

describe("organiser authorization is a server concern", () => {
  it("does not treat an isOrganiser flag in a payload as sufficient", () => {
    const spoof = { isOrganiser: true, seats: [{ allocations: { water: 1 } }] };
    expect(assertNoPrivateRoomFields(spoof).length).toBeGreaterThan(0);
    expect(nextRoomAction({ round: null, rounds: [] })).toBe("none");
  });
});
