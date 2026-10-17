import { loadRoomContext } from "../../../lib/server/room-context";
import { assertNoPrivateRoomFields } from "../../../lib/room-ops";
import { jsonError } from "../../../lib/server/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Organiser-only operational snapshot. Submission bodies are not included.
 */
export async function GET() {
  const ctx = await loadRoomContext();
  if (!ctx.ok) {
    const message = ctx.status === 403 || ctx.status === 401 ? "not available" : ctx.error;
    return jsonError(ctx.status, ctx.status === 503 ? "unconfigured" : "unauthorized", message);
  }
  const leaks = assertNoPrivateRoomFields({
    rounds: ctx.rounds,
    teams: ctx.teams,
    seats: ctx.seats,
    submissions: ctx.submissions,
  });
  if (leaks.length) return jsonError(500, "error", "not available");
  return Response.json(ctx);
}
