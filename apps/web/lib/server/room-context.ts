import "server-only";
import { ENGINE_VERSION } from "@langlands/sim/public";
import { getPublicSupabaseConfig, hasServiceRole } from "../env";
import type { RoundPhase } from "../game-types";
import {
  buildSeatsForRound,
  currentRoomRound,
  publicManifest,
  type ProcessRunView,
  type RoomRound,
  type RoomMember,
  type RoomSeat,
  type RoomSubmissionRef,
  type RoomTeam,
} from "../room-ops";
import { officialCredits, STARTING_RESERVE_FALLBACK } from "../admin-ops";
import { createServerSupabase } from "../supabase/server";
import { createServiceRoleClient } from "../supabase/admin";

export type RoomContext =
  | { ok: false; status: 401 | 403 | 503; error: string }
  | {
      ok: true;
      serverNow: string;
      competition: {
        id: string;
        title: string;
        status: string;
        catalogueHash: string;
        engineVersion: string;
        paused: boolean;
      };
      rounds: RoomRound[];
      teams: RoomTeam[];
      seats: RoomSeat[];
      submissions: RoomSubmissionRef[];
      currentRoundId: string | null;
    };

type RoundRow = {
  id: string;
  round_index: number;
  status: RoundPhase;
  opens_at: string | null;
  closes_at: string | null;
  event_code: string | null;
  process_checksum: string | null;
  processed_at: string | null;
  published_at: string | null;
  locked_at: string | null;
  lock_manifest: unknown;
};

export async function loadRoomContext(): Promise<RoomContext> {
  if (!getPublicSupabaseConfig().configured || !hasServiceRole()) {
    return { ok: false, status: 503, error: "Supabase is not configured on the server." };
  }
  const supabase = await createServerSupabase();
  const auth = supabase ? await supabase.auth.getUser() : null;
  const userId = auth?.data.user?.id ?? null;
  if (!userId) return { ok: false, status: 401, error: "unauthorized" };

  const admin = createServiceRoleClient();
  const { data: staffRow } = await admin
    .from("competition_staff")
    .select("competition_id, staff_role")
    .eq("user_id", userId)
    .eq("staff_role", "organiser")
    .limit(1)
    .maybeSingle();
  const staff = staffRow as { competition_id: string; staff_role: string } | null;
  if (!staff) return { ok: false, status: 403, error: "unauthorized" };

  const competitionId = staff.competition_id;
  const [{ data: competitionRow }, { data: roundRows }, { data: teamRows }] = await Promise.all([
    admin
      .from("competitions")
      .select("id, title, status, catalogue_hash, engine_version")
      .eq("id", competitionId)
      .maybeSingle(),
    admin
      .from("rounds")
      .select(
        "id, round_index, status, opens_at, closes_at, event_code, process_checksum, processed_at, published_at, locked_at, lock_manifest",
      )
      .eq("competition_id", competitionId)
      .order("round_index"),
    admin
      .from("teams")
      .select("id, seat, name, login_id, disqualified")
      .eq("competition_id", competitionId)
      .order("seat"),
  ]);

  const competition = competitionRow as {
    id: string;
    title: string;
    status: string;
    catalogue_hash: string;
    engine_version: string;
  } | null;
  const rawRounds = (roundRows as RoundRow[] | null) ?? [];
  const roundIds = rawRounds.map((row) => row.id);
  const publishedRoundIds = rawRounds.filter((row) => row.status === "published").map((row) => row.id);
  const teamIds = ((teamRows as Array<{ id: string }> | null) ?? []).map((row) => row.id);
  const [{ data: submissionRows }, { data: runRows }, { data: templateRow }, { data: resultRows }, { data: memberRows }] =
    await Promise.all([
      roundIds.length
        ? admin
            .from("submissions")
            .select("round_id, team_id, status")
            .in("round_id", roundIds)
            .in("status", ["accepted", "late"])
        : Promise.resolve({ data: [] as Array<{ round_id: string; team_id: string; status: string }> }),
      roundIds.length
        ? admin
            .from("round_process_runs")
            .select("round_id, attempt, ok, checksum, error, engine_version, finished_at")
            .in("round_id", roundIds)
            .order("attempt", { ascending: false })
        : Promise.resolve({ data: [] }),
      admin
        .from("town_templates")
        .select("initial_state")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      publishedRoundIds.length
        ? admin
            .from("published_results")
            .select("team_id, round_index, reserve")
            .in("round_id", publishedRoundIds)
        : Promise.resolve({ data: [] as Array<{ team_id: string; round_index: number; reserve: number }> }),
      teamIds.length
        ? admin.from("team_members").select("team_id, user_id, member_role").in("team_id", teamIds)
        : Promise.resolve({ data: [] as Array<{ team_id: string; user_id: string; member_role: "captain" | "member" }> }),
    ]);

  const lastRunByRound = new Map<string, ProcessRunView>();
  for (const row of (runRows as Array<{
    round_id: string;
    attempt: number;
    ok: boolean | null;
    checksum: string | null;
    error: string | null;
    engine_version: string | null;
    finished_at: string | null;
  }> | null) ?? []) {
    if (lastRunByRound.has(row.round_id)) continue;
    lastRunByRound.set(row.round_id, {
      attempt: Number(row.attempt),
      ok: row.ok,
      checksum: row.checksum,
      error: row.error,
      engineVersion: row.engine_version,
      finishedAt: row.finished_at,
    });
  }

  const rounds: RoomRound[] = rawRounds.map((row) => ({
    id: row.id,
    index: row.round_index,
    status: row.status,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    eventCode: row.event_code,
    processChecksum: row.process_checksum,
    processedAt: row.processed_at,
    publishedAt: row.published_at,
    lockedAt: row.locked_at,
    manifest: publicManifest(row.lock_manifest),
    lastRun: lastRunByRound.get(row.id) ?? null,
  }));
  const current = currentRoomRound(rounds);

  const submissions: RoomSubmissionRef[] = (
    (submissionRows as Array<{ round_id: string; team_id: string; status: string }> | null) ?? []
  ).map((row) => ({
    roundId: row.round_id,
    teamId: row.team_id,
    status: row.status,
  }));

  const startingReserve = Number(
    (templateRow as { initial_state?: { reserve?: number } } | null)?.initial_state?.reserve,
  );
  const reserveByTeam = new Map<string, { roundIndex: number; reserve: number }>();
  for (const row of (resultRows as Array<{
    team_id: string;
    round_index: number;
    reserve: number | string;
  }> | null) ?? []) {
    const current = reserveByTeam.get(row.team_id);
    if (!current || Number(row.round_index) > current.roundIndex) {
      reserveByTeam.set(row.team_id, {
        roundIndex: Number(row.round_index),
        reserve: Number(row.reserve),
      });
    }
  }

  const rawMembers = (memberRows as Array<{
    team_id: string;
    user_id: string;
    member_role: "captain" | "member";
  }> | null) ?? [];
  const memberUserIds = [...new Set(rawMembers.map((row) => row.user_id))];
  const { data: profileRows } = memberUserIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", memberUserIds)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const nameByUser = new Map(
    ((profileRows as Array<{ id: string; display_name: string }> | null) ?? []).map((row) => [
      row.id,
      row.display_name,
    ]),
  );
  const membersByTeam = new Map<string, RoomMember[]>();
  for (const row of rawMembers) {
    const list = membersByTeam.get(row.team_id) ?? [];
    list.push({
      userId: row.user_id,
      displayName: nameByUser.get(row.user_id) ?? "Member",
      memberRole: row.member_role,
    });
    membersByTeam.set(row.team_id, list);
  }

  const teams: RoomTeam[] = (
    (teamRows as Array<{
      id: string;
      seat: number;
      name: string;
      login_id: string | null;
      disqualified: boolean;
    }> | null) ?? []
  ).map((team) => {
    const money = officialCredits({
      startingReserve: Number.isFinite(startingReserve) ? startingReserve : STARTING_RESERVE_FALLBACK,
      publishedReserve: reserveByTeam.get(team.id)?.reserve ?? null,
    });
    return {
      seat: team.seat,
      teamId: team.id,
      name: team.name,
      loginId: team.login_id,
      disqualified: team.disqualified,
      credits: money.credits,
      creditsSource: money.source,
      members: membersByTeam.get(team.id) ?? [],
    };
  });

  const seats = buildSeatsForRound({
    teams,
    round: current,
    submissions,
    manifest: current?.manifest ?? [],
  });

  return {
    ok: true,
    serverNow: new Date().toISOString(),
    competition: {
      id: competition?.id ?? competitionId,
      title: competition?.title ?? "Langlands R3",
      status: competition?.status ?? "scheduled",
      catalogueHash: competition?.catalogue_hash ?? "",
      engineVersion: competition?.engine_version || ENGINE_VERSION,
      paused: competition?.status === "paused",
    },
    rounds,
    teams,
    seats,
    submissions,
    currentRoundId: current?.id ?? null,
  };
}
