export type TickStep = "idle" | "lock" | "process" | "publish" | "open" | "complete" | "blocked";

export type TickPlan = {
  step: TickStep;
  roundId: string | null;
  reason: string;
};

export type TickRound = {
  id: string;
  round_index: number;
  status: string;
  closes_at: string | null;
  process_checksum: string | null;
};

export function planEventTick(args: {
  competitionStatus: string;
  nowMs: number;
  rounds: TickRound[];
}): TickPlan {
  const status = args.competitionStatus;
  if (status === "closed" || status === "archived") {
    return { step: "complete", roundId: null, reason: "The event is finished." };
  }

  const ordered = [...args.rounds].sort((a, b) => a.round_index - b.round_index);

  // Finish in-flight scoring even if the organiser paused. Pause must not
  // strand a locked/processing round or skip ahead.
  const locked = ordered.find((row) => row.status === "locked");
  if (locked) {
    return { step: "process", roundId: locked.id, reason: "Submissions are closed. Scoring the 20 towns." };
  }

  const processing = ordered.find((row) => row.status === "processing");
  if (processing) {
    if (processing.process_checksum) {
      return { step: "publish", roundId: processing.id, reason: "Scoring finished. Publishing official results." };
    }
    return { step: "process", roundId: processing.id, reason: "Scoring did not finish. Retrying process once." };
  }

  if (status === "paused") {
    return { step: "idle", roundId: null, reason: "Automatic progress is paused. Resume, or use the manual buttons." };
  }
  if (status !== "live") {
    return {
      step: "idle",
      roundId: null,
      reason: "Automatic progress is off. Start the event, or run each step from the control room.",
    };
  }

  const open = ordered.find((row) => row.status === "open");
  if (open) {
    const closes = open.closes_at ? Date.parse(open.closes_at) : NaN;
    if (!Number.isFinite(closes)) {
      return { step: "blocked", roundId: open.id, reason: "This round has no closing time. Set the window, then retry." };
    }
    if (args.nowMs < closes) {
      return { step: "idle", roundId: open.id, reason: "The round is still open. Teams can save until the deadline." };
    }
    return { step: "lock", roundId: open.id, reason: "The deadline has passed. Closing submissions." };
  }

  const published = ordered.filter((row) => row.status === "published");
  if (published.length === ordered.length && ordered.length > 0) {
    return { step: "complete", roundId: null, reason: "All six rounds are published." };
  }

  const nextIndex = published.reduce((max, row) => Math.max(max, row.round_index), 0) + 1;
  const next = ordered.find((row) => row.round_index === nextIndex && row.status === "scheduled");
  if (next) {
    const pred = ordered.find((row) => row.round_index === next.round_index - 1);
    if (next.round_index > 1 && pred?.status !== "published") {
      return {
        step: "blocked",
        roundId: next.id,
        reason: `Round ${next.round_index} cannot open until round ${next.round_index - 1} is published.`,
      };
    }
    return { step: "open", roundId: next.id, reason: `Opening round ${next.round_index}.` };
  }

  return { step: "blocked", roundId: null, reason: "No safe next step. Use the manual controls." };
}

/** Scheduler HTTP bodies must not include lock payloads, towns, or allocations. */
export function publicTickResult(value: unknown): {
  noop?: unknown;
  status?: unknown;
  checksum?: unknown;
  idempotent?: unknown;
} | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const out: {
    noop?: unknown;
    status?: unknown;
    checksum?: unknown;
    idempotent?: unknown;
  } = {};
  if ("noop" in row) out.noop = row.noop;
  if ("status" in row) out.status = row.status;
  if ("checksum" in row) out.checksum = row.checksum;
  if ("idempotent" in row) out.idempotent = row.idempotent;
  return out;
}
