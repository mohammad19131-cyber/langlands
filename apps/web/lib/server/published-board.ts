import "server-only";
import { playStandingsFrom, type BoardSeat, type TeamSeatInput } from "../ranking";
import { parseBreakdown } from "../score-display";
import type { OwnPublishedRound, RoundPhase, RoundSummary } from "../game-types";
import { createServiceRoleClient } from "../supabase/admin";

const PUBLIC_RESULT_COLUMNS = [
  "round_id",
  "round_index",
  "team_seat",
  "team_name",
  "air",
  "water_q",
  "soil",
  "bio",
  "pollution",
  "health",
  "services",
  "jobs",
  "economy",
  "fiscal",
  "energy",
  "infra",
  "prep",
  "buffer",
  "reserve",
  "population",
  "energy_mix",
  "agriculture",
  "industry",
  "score_breakdown",
  "snapshot_score",
  "final_score",
].join(", ");

export type PublishedRow = {
  round_id: string;
  round_index: number;
  team_seat: number;
  team_name: string;
  air: number;
  water_q: number;
  soil: number;
  bio: number;
  pollution: number;
  health: number;
  services: number;
  jobs: number;
  economy: number;
  fiscal: number;
  energy: number;
  infra: number;
  prep: number;
  buffer: number;
  reserve: number;
  population: number;
  energy_mix: OwnPublishedRound["badges"]["energyMix"];
  agriculture: OwnPublishedRound["badges"]["agriculture"];
  industry: OwnPublishedRound["badges"]["industry"];
  score_breakdown: unknown;
  snapshot_score: number;
  final_score: number | null;
};

export async function loadCompetitionRoster(
  admin: ReturnType<typeof createServiceRoleClient>,
  competitionId: string,
): Promise<TeamSeatInput[]> {
  const { data } = await admin
    .from("teams")
    .select("seat, name, disqualified")
    .eq("competition_id", competitionId)
    .order("seat");
  return ((data as TeamSeatInput[] | null) ?? []).filter(
    (row) => row.seat >= 1 && row.seat <= 20,
  );
}

export async function loadPublishedResultRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  publishedRoundIds: string[],
): Promise<PublishedRow[]> {
  if (publishedRoundIds.length === 0) return [];
  const { data } = await admin
    .from("published_results")
    .select(PUBLIC_RESULT_COLUMNS)
    .in("round_id", publishedRoundIds)
    .order("round_index")
    .order("team_seat");
  return (data as PublishedRow[] | null) ?? [];
}

export function buildBoards(args: {
  roundSummaries: RoundSummary[];
  teams: TeamSeatInput[];
  results: PublishedRow[];
  viewerSeat?: number | null;
}): {
  boardByRound: Record<number, BoardSeat[]>;
  publishedRounds: number[];
  publishedRoundIndex: number | null;
  leaderboard: BoardSeat[] | null;
} {
  return playStandingsFrom({
    roundSummaries: args.roundSummaries,
    teams: args.teams,
    viewerSeat: args.viewerSeat,
    results: args.results.map((row) => ({
      roundIndex: Number(row.round_index),
      seat: Number(row.team_seat),
      name: String(row.team_name),
      snapshot: Number(row.snapshot_score),
      final: row.final_score == null ? null : Number(row.final_score),
      breakdown: row.score_breakdown,
    })),
  });
}

export function ownHistoryFrom(rows: PublishedRow[], teamSeat: number): OwnPublishedRound[] {
  return rows
    .filter((row) => Number(row.team_seat) === teamSeat)
    .sort((a, b) => a.round_index - b.round_index)
    .map((row) => {
      const breakdown = parseBreakdown(row.score_breakdown);
      return {
        roundIndex: Number(row.round_index),
        snapshot: Number(row.snapshot_score),
        final: row.final_score == null ? null : Number(row.final_score),
        penalty: breakdown?.penalty ?? null,
        breakdown,
        ecology: breakdown?.ecology ?? null,
        reserve: Number(row.reserve),
        population: Number(row.population),
        air: Number(row.air),
        water_q: Number(row.water_q),
        soil: Number(row.soil),
        bio: Number(row.bio),
        pollution: Number(row.pollution),
        health: Number(row.health),
        services: Number(row.services),
        jobs: Number(row.jobs),
        economy: Number(row.economy),
        fiscal: Number(row.fiscal),
        energy: Number(row.energy),
        infra: Number(row.infra),
        prep: Number(row.prep),
        buffer: Number(row.buffer),
        badges: {
          energyMix: row.energy_mix,
          agriculture: row.agriculture,
          industry: row.industry,
        },
      };
    });
}

export function roundSummariesFrom(
  rounds: Array<{ id: string; round_index: number; status: RoundPhase }>,
): RoundSummary[] {
  return rounds.map((row) => ({
    index: row.round_index,
    id: row.id,
    status: row.status,
  }));
}

export async function resolveCompetitionAccess(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<
  | { ok: true; competitionId: string; viewerSeat: number | null; isOrganiser: boolean }
  | { ok: false }
> {
  const { data: membership } = await admin
    .from("team_members")
    .select("team_id, teams(seat, competition_id, disqualified)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const teamRaw = (membership as { teams?: unknown } | null)?.teams as
    | { seat: number; competition_id: string; disqualified: boolean }
    | { seat: number; competition_id: string; disqualified: boolean }[]
    | undefined;
  const team = Array.isArray(teamRaw) ? teamRaw[0] : teamRaw;
  if (team && !team.disqualified) {
    const staff = await admin
      .from("competition_staff")
      .select("staff_role")
      .eq("competition_id", team.competition_id)
      .eq("user_id", userId)
      .maybeSingle();
    return {
      ok: true,
      competitionId: team.competition_id,
      viewerSeat: team.seat,
      isOrganiser: (staff.data as { staff_role?: string } | null)?.staff_role === "organiser",
    };
  }

  const { data: staffRow } = await admin
    .from("competition_staff")
    .select("competition_id, staff_role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const staff = staffRow as { competition_id: string; staff_role: string } | null;
  if (!staff) return { ok: false };
  return {
    ok: true,
    competitionId: staff.competition_id,
    viewerSeat: null,
    isOrganiser: staff.staff_role === "organiser",
  };
}
