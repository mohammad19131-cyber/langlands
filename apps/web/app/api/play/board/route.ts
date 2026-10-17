import { requireConfigured, requireUser } from "../../../../lib/server/authz";
import { jsonError } from "../../../../lib/server/json";
import {
  buildBoards,
  loadCompetitionRoster,
  loadPublishedResultRows,
  resolveCompetitionAccess,
  roundSummariesFrom,
} from "../../../../lib/server/published-board";
import { publicBoardPayload } from "../../../../lib/ranking";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";
import type { RoundPhase } from "../../../../lib/game-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Published TownPublic board. 409 until the requested round is published.
 * Does not return allocations, starts, credentials, or private town state.
 */
export async function GET(request: Request) {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  const admin = createServiceRoleClient();
  const access = await resolveCompetitionAccess(admin, authed.user.userId);
  if (!access.ok) return jsonError(403, "unauthorized");

  const { data: roundRows } = await admin
    .from("rounds")
    .select("id, round_index, status")
    .eq("competition_id", access.competitionId)
    .order("round_index");

  const rounds = ((roundRows as Array<{ id: string; round_index: number; status: RoundPhase }> | null) ??
    []).slice();
  const summaries = roundSummariesFrom(rounds);
  const published = summaries.filter((row) => row.status === "published");
  const requested = new URL(request.url).searchParams.get("round");
  const publishedIndexes = published.map((row) => row.index);
  const requestedIndex = requested ? Number(requested) : (publishedIndexes.at(-1) ?? null);

  if (requestedIndex == null) {
    return jsonError(409, "unpublished", "No round has been published yet.");
  }
  if (!publishedIndexes.includes(requestedIndex)) {
    return jsonError(409, "unpublished", "Official standings appear after this round is published.");
  }

  const publishedIds = published.map((row) => row.id).filter((id): id is string => Boolean(id));
  const [roster, results] = await Promise.all([
    loadCompetitionRoster(admin, access.competitionId),
    loadPublishedResultRows(admin, publishedIds),
  ]);
  const { boardByRound } = buildBoards({
    roundSummaries: summaries,
    teams: roster,
    results,
    viewerSeat: access.viewerSeat,
  });
  const seats = boardByRound[requestedIndex];
  if (!seats) return jsonError(409, "unpublished", "Official standings appear after this round is published.");

  return Response.json({
    ok: true,
    roundIndex: requestedIndex,
    status: "published",
    publishedRounds: published.map((row) => row.index),
    seats: publicBoardPayload(seats),
  });
}
