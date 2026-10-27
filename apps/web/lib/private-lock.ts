import type { LockEntry } from "@langlands/round-machine";
import { publicManifest } from "./room-ops";

/** True only when the payload is the private 20-seat lock (teamId + allocations). */
export function asPrivateLockEntries(payload: unknown): LockEntry[] | null {
  if (!Array.isArray(payload) || payload.length !== 20) return null;
  const entries: LockEntry[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const teamId = typeof row.teamId === "string" ? row.teamId : null;
    const seat = Number(row.seat);
    if (!teamId || !Number.isInteger(seat) || seat < 1 || seat > 20) return null;
    entries.push({
      teamId,
      seat,
      teamName: String(row.teamName ?? `Seat ${String(seat).padStart(2, "0")}`),
      disqualified: Boolean(row.disqualified),
      submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
      allocations: (row.allocations as LockEntry["allocations"]) ?? null,
      projectStarts: Array.isArray(row.projectStarts) ? (row.projectStarts as string[]) : null,
    });
  }
  return entries;
}

/** Organiser lock HTTP must not echo allocations into the browser. */
export function organiserLockHttpBody(rpc: Record<string, unknown>): {
  ok: unknown;
  status: unknown;
  idempotent: unknown;
  lock_manifest: ReturnType<typeof publicManifest>;
} {
  return {
    ok: rpc.ok ?? true,
    status: rpc.status,
    idempotent: rpc.idempotent,
    lock_manifest: publicManifest(rpc.lock_manifest),
  };
}
