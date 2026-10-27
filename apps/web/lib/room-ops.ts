import type { RoundPhase } from "./game-types";

export const SEAT_STATUSES = ["missing", "saved", "accepted", "late", "dq"] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export type RoomAction =
  | "open"
  | "lock"
  | "process"
  | "publish"
  | "void"
  | "reopen"
  | "extend"
  | "restore"
  | "none";

export type ManifestSeat = {
  seat: number;
  teamName: string;
  disqualified: boolean;
  held: boolean;
};

export type ProcessRunView = {
  attempt: number;
  ok: boolean | null;
  checksum: string | null;
  error: string | null;
  engineVersion: string | null;
  finishedAt: string | null;
};

export type RoomRound = {
  id: string;
  index: number;
  status: RoundPhase;
  opensAt: string | null;
  closesAt: string | null;
  eventCode: string | null;
  processChecksum: string | null;
  processedAt: string | null;
  publishedAt: string | null;
  lockedAt: string | null;
  manifest: ManifestSeat[];
  lastRun: ProcessRunView | null;
};

export type RoomTeam = {
  seat: number;
  teamId: string;
  name: string;
  loginId: string | null;
  disqualified: boolean;
};

export type RoomSeat = RoomTeam & {
  status: SeatStatus;
  held: boolean;
};

export type RoomSubmissionRef = {
  roundId: string;
  teamId: string;
  status: string;
};

const PRIVATE_FIELD =
  /allocations|projectStarts|project_starts|password|password_hash|idempotency|ownedProjects|shock_log|unspent|available\b/i;

export function predecessorPublished(rounds: RoomRound[], index: number): boolean {
  if (index <= 1) return true;
  return rounds.some((row) => row.index === index - 1 && row.status === "published");
}

export function nextRoomAction(args: {
  round: RoomRound | null;
  rounds: RoomRound[];
  competitionPaused?: boolean;
  lastRun?: ProcessRunView | null;
}): RoomAction {
  const round = args.round;
  if (!round) return "none";
  if (round.status === "published" || round.status === "void") return "none";
  if (round.status === "scheduled") {
    if (args.competitionPaused) return "none";
    return predecessorPublished(args.rounds, round.index) ? "open" : "none";
  }
  if (round.status === "open") return "lock";
  if (round.status === "locked") return "process";
  if (round.status === "processing") {
    const run = args.lastRun ?? round.lastRun;
    if (round.processChecksum && run?.ok) return "publish";
    return "process";
  }
  return "none";
}

export function canVoid(status: RoundPhase): boolean {
  return status === "open" || status === "locked" || status === "processing";
}

/** Runbook: unpublished lock may return to open before process writes town states. */
export function canReopen(round: RoomRound | null): boolean {
  if (!round) return false;
  return round.status === "locked" && !round.processChecksum && !round.processedAt;
}

export function canExtend(status: RoundPhase): boolean {
  return status === "open";
}

/** Unpublished void returns to scheduled. Does not skip the Pack A event. */
export function canRestore(status: RoundPhase): boolean {
  return status === "void";
}

export function publicationReady(round: RoomRound | null, lastRun?: ProcessRunView | null): boolean {
  if (!round) return false;
  const run = lastRun ?? round.lastRun;
  return round.status === "processing" && Boolean(round.processChecksum) && run?.ok === true;
}

export function deriveSeatStatus(args: {
  disqualified: boolean;
  roundStatus: RoundPhase;
  submissionStatus: string | null;
  lockedWithSubmission: boolean | null;
}): SeatStatus {
  if (args.disqualified) return "dq";
  if (args.submissionStatus === "late") return "late";
  if (args.roundStatus === "locked" || args.roundStatus === "processing" || args.roundStatus === "published") {
    if (args.lockedWithSubmission) return "accepted";
    return "missing";
  }
  if (args.submissionStatus === "accepted") return "saved";
  return "missing";
}

export function publicManifest(raw: unknown): ManifestSeat[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const seat = Number(row.seat);
      if (!Number.isInteger(seat) || seat < 1 || seat > 20) return null;
      return {
        seat,
        teamName: String(row.teamName ?? `Seat ${String(seat).padStart(2, "0")}`),
        disqualified: Boolean(row.disqualified),
        held: row.submissionId == null,
      };
    })
    .filter((row): row is ManifestSeat => row != null)
    .sort((a, b) => a.seat - b.seat);
}

export function missingCount(seats: Array<{ status: SeatStatus; disqualified: boolean }>): number {
  return seats.filter((seat) => seat.status === "missing" && !seat.disqualified).length;
}

export function buildSeatsForRound(args: {
  teams: RoomTeam[];
  round: RoomRound | null;
  submissions: RoomSubmissionRef[];
  manifest: ManifestSeat[];
}): RoomSeat[] {
  const lockedBySeat = new Map(args.manifest.map((row) => [row.seat, !row.held]));
  const byTeam = new Map<string, string>();
  for (const row of args.submissions) {
    if (!args.round || row.roundId !== args.round.id) continue;
    const prior = byTeam.get(row.teamId);
    if (prior === "accepted" && row.status === "late") continue;
    byTeam.set(row.teamId, row.status);
  }
  const roundStatus = args.round?.status ?? "none";
  return args.teams.map((team) => {
    const lockedWithSubmission = lockedBySeat.has(team.seat) ? Boolean(lockedBySeat.get(team.seat)) : null;
    return {
      ...team,
      held: lockedBySeat.has(team.seat) ? !lockedBySeat.get(team.seat) : byTeam.get(team.teamId) == null,
      status: deriveSeatStatus({
        disqualified: team.disqualified,
        roundStatus,
        submissionStatus: byTeam.get(team.teamId) ?? null,
        lockedWithSubmission,
      }),
    };
  });
}

export function recoveryGuidance(error: string | null | undefined): string | null {
  if (!error) return null;
  const text = error.toLowerCase();
  if (text.includes("checksum")) {
    return "Stay locked. Dump both replays. Retry process — do not publish or hand-edit JSON.";
  }
  if (text.includes("cannot reopen")) {
    return "Reopen is only for an unpublished lock before process writes town states. After process, stay locked or void.";
  }
  if (text.includes("predecessor")) {
    return "Publish the previous round before opening this one. Round n cannot open until n−1 is published. Void does not count as published — restore the voided round instead of skipping it.";
  }
  if (text.includes("cannot restore")) {
    return "Restore is only for an unpublished voided round with no later round already started. It returns that same round to scheduled.";
  }
  if (text.includes("paused")) {
    return "The competition is paused. Open is blocked until it resumes.";
  }
  if (text.includes("invalid transition")) {
    return "That step is not valid from the current round status. Refresh and take the next allowed action only.";
  }
  if (text.includes("exactly 20") || text.includes("20 teams")) {
    return "Lock and process require all 20 seats. Do not publish a partial field.";
  }
  if (text.includes("previous town unpublished")) {
    return "The previous town is not published, so this round cannot process. Publish or restore the predecessor first.";
  }
  if (text.includes("stale process claim")) {
    return "A process claim is already in flight. Wait, then retry process to reclaim if no successful run exists.";
  }
  if (text.includes("unauthorized")) {
    return "Not available.";
  }
  return "The server refused the step. The round machine was not bypassed. Refresh and retry the same action if the runbook allows it.";
}

export function actionEndpoint(action: Exclude<RoomAction, "none">, roundId: string): string {
  if (action === "extend") return `/api/rounds/${roundId}/window`;
  return `/api/rounds/${roundId}/${action}`;
}

export function assertNoPrivateRoomFields(payload: unknown): string[] {
  return JSON.stringify(payload).match(PRIVATE_FIELD) ?? [];
}

export function currentRoomRound(rounds: RoomRound[]): RoomRound | null {
  return (
    rounds.find((row) => row.status === "open") ??
    rounds.find((row) => row.status === "locked" || row.status === "processing") ??
    rounds.find((row) => row.status === "void") ??
    rounds.find((row) => row.status === "scheduled") ??
    rounds.filter((row) => row.status === "published").at(-1) ??
    rounds[0] ??
    null
  );
}
