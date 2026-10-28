import "server-only";
import {
  cloneTown,
  createInitialTown,
  PACK_A,
  stepRound,
  type Town,
} from "@langlands/sim";
import { parseTown, townBadges } from "@langlands/round-machine";
import { ashfenMapLabel, type IndicatorKey, type TownView } from "../ashfen";
import type { Budget, EventCode, GameContext, RoundInfo, RoundPhase } from "../game-types";
import { getPublicSupabaseConfig, hasServiceRole } from "../env";
import { publicPlayContext } from "../play-payload";
import { createServerSupabase } from "../supabase/server";
import { createServiceRoleClient } from "../supabase/admin";
import { ownTownRead } from "../own-town-source";
import {
  buildBoards,
  loadCompetitionRoster,
  loadPublishedResultRows,
  ownHistoryFrom,
  roundSummariesFrom,
} from "./published-board";

const INDICATOR_KEYS: IndicatorKey[] = [
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
];

function townToView(town: Town, label: string, round: number): TownView {
  const indicators = {} as Record<IndicatorKey, number>;
  for (const key of INDICATOR_KEYS) {
    indicators[key] = Number((town as unknown as Record<string, number>)[key] ?? 0);
  }
  return {
    label,
    round,
    indicators,
    reserve: town.reserve,
    population: town.population,
    badges: townBadges(town),
  };
}

/** Dry-run the frozen engine (empty submission) to read this round's budget. */
function computeBudget(preTown: Town, roundIndex: number): Budget {
  const probe = cloneTown(preTown);
  const result = stepRound(probe, { allocations: {}, projectStarts: [] }, roundIndex);
  return {
    available: result.available,
    income: result.income,
    maintenance: result.maintenance,
    reserve: preTown.reserve,
  };
}

function previewContext(args: {
  configured: boolean;
  signedIn: boolean;
  notice: string;
  isOrganiser?: boolean;
}): GameContext {
  const town = createInitialTown();
  return publicPlayContext({
    mode: "preview",
    configured: args.configured,
    signedIn: args.signedIn,
    email: null,
    isOrganiser: Boolean(args.isOrganiser),
    team: null,
    competition: null,
    round: {
      id: null,
      index: 1,
      status: "none",
      opensAt: null,
      closesAt: null,
      eventCode: (PACK_A[1] as EventCode | null) ?? null,
      serverNow: new Date().toISOString(),
    },
    town: townToView(town, "Ashfen", 0),
    budget: computeBudget(town, 1),
    startedCodes: [],
    completedCodes: [],
    submission: null,
    leaderboard: null,
    boardByRound: {},
    ownHistory: [],
    publishedRoundIndex: null,
    publishedRounds: [],
    roundSummaries: [],
    notice: args.notice,
  });
}

type RoundRow = {
  id: string;
  round_index: number;
  status: RoundPhase;
  opens_at: string | null;
  closes_at: string | null;
  event_code: EventCode | null;
};

function toRoundInfo(r: RoundRow, serverNow: string): RoundInfo {
  return {
    id: r.id,
    index: r.round_index,
    status: r.status,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    eventCode: r.event_code ?? (PACK_A[r.round_index] as EventCode | null) ?? null,
    serverNow,
  };
}

/**
 * Loads everything the signed-in player is allowed to act on. The service role
 * reads on the server only, always scoped to the caller's own team; rival and
 * unpublished state is never returned. Falls back to an honest, clearly-labelled
 * preview when there is no configuration, session, or seat.
 */
export async function loadGameContext(): Promise<GameContext> {
  const configured = getPublicSupabaseConfig().configured;
  if (!configured || !hasServiceRole()) {
    return previewContext({
      configured,
      signedIn: false,
      notice:
        "Preview mode — the competition backend is not configured in this environment. You can inspect Ashfen and stage decisions, but nothing can be submitted.",
    });
  }

  const supabase = await createServerSupabase();
  const auth = supabase ? await supabase.auth.getUser() : null;
  const userId = auth?.data.user?.id ?? null;
  if (!userId) {
    return previewContext({
      configured,
      signedIn: false,
      notice: "Sign in with your invited team account to take command of Ashfen.",
    });
  }

  const admin = createServiceRoleClient();

  const [{ data: membership }, { data: allRoundRows }] = await Promise.all([
    admin
      .from("team_members")
      .select("team_id, teams(id, name, seat, competition_id, login_id, disqualified)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("rounds")
      .select("id, round_index, status, opens_at, closes_at, event_code, competition_id")
      .order("round_index"),
  ]);

  const teamRaw = (membership as { teams?: unknown } | null)?.teams as
    | {
        id: string;
        name: string;
        seat: number;
        competition_id: string;
        login_id: string | null;
        disqualified: boolean;
      }
    | {
        id: string;
        name: string;
        seat: number;
        competition_id: string;
        login_id: string | null;
        disqualified: boolean;
      }[]
    | undefined;
  const team = Array.isArray(teamRaw) ? teamRaw[0] : teamRaw;

  if (!team) {
    const { data: staffRow } = await admin
      .from("competition_staff")
      .select("staff_role, competition_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const staff = staffRow as { staff_role?: string; competition_id?: string } | null;
    const isOrganiser = staff?.staff_role === "organiser";
    if (staff?.competition_id) {
      return loadStaffPlayContext(admin, {
        configured,
        competitionId: staff.competition_id,
        isOrganiser,
      });
    }
    return previewContext({
      configured,
      signedIn: true,
      isOrganiser,
      notice: isOrganiser
        ? "Staff accounts are not seated on a team. Open the control room to run the competition."
        : "Your account is signed in but not seated on a team yet. Once your team is assigned, reload.",
    });
  }

  if (team.disqualified) {
    return previewContext({
      configured,
      signedIn: true,
      notice: "This team has been disqualified and cannot take further decisions.",
    });
  }

  const competitionId = team.competition_id;
  const rounds = (
    (allRoundRows as Array<RoundRow & { competition_id: string }> | null) ?? []
  ).filter((row) => row.competition_id === competitionId);

  // The round the player is acting on: open first, then in-flight, then the next
  // scheduled, otherwise the final published round (game complete).
  const openRound = rounds.find((r) => r.status === "open");
  const inFlight = rounds.find((r) => r.status === "locked" || r.status === "processing");
  const scheduled = rounds.find((r) => r.status === "scheduled");
  const publishedRounds = rounds.filter((r) => r.status === "published");
  const lastPublished = publishedRounds[publishedRounds.length - 1];

  const activeRound = openRound ?? inFlight ?? scheduled ?? lastPublished ?? null;
  const roundSummaries = roundSummariesFrom(rounds);
  const publishedIds = publishedRounds.map((row) => row.id);
  const townSource = ownTownRead({ activeRound, rounds });
  const townQuery =
    townSource.kind === "template"
      ? admin
          .from("town_templates")
          .select("initial_state")
          .eq("competition_id", competitionId)
          .maybeSingle()
      : townSource.kind === "state"
        ? admin
            .from("town_states")
            .select("state, round_index")
            .eq("team_id", team.id)
            .eq("round_id", townSource.roundId)
            .maybeSingle()
        : Promise.resolve({ data: null });
  const submissionQuery = openRound
    ? admin
        .from("submissions")
        .select("allocations, project_starts, status")
        .eq("round_id", openRound.id)
        .eq("team_id", team.id)
        .eq("status", "accepted")
        .maybeSingle()
    : Promise.resolve({ data: null });

  const [{ data: competitionRow }, staffLookup, roster, publishedRows, townRow, subRow] =
    await Promise.all([
      admin
        .from("competitions")
        .select("id, title, round_count, status")
        .eq("id", competitionId)
        .maybeSingle(),
      admin
        .from("competition_staff")
        .select("staff_role")
        .eq("competition_id", competitionId)
        .eq("user_id", userId)
        .maybeSingle(),
      loadCompetitionRoster(admin, competitionId),
      loadPublishedResultRows(admin, publishedIds),
      townQuery,
      submissionQuery,
    ]);

  const isOrganiser = (staffLookup.data as { staff_role?: string } | null)?.staff_role === "organiser";
  const competition = competitionRow
    ? {
        id: (competitionRow as { id: string }).id,
        title: (competitionRow as { title: string }).title,
        roundCount: (competitionRow as { round_count: number }).round_count,
      }
    : { id: competitionId, title: "Langlands R3", roundCount: 6 };
  const publishedIndexes = publishedRounds.map((row) => row.round_index);
  const publishedRoundIndex = lastPublished?.round_index ?? null;
  const { boardByRound, leaderboard } = isOrganiser
    ? buildBoards({
        roundSummaries,
        teams: roster,
        results: publishedRows,
        viewerSeat: team.seat,
      })
    : { boardByRound: {}, leaderboard: null };

  // Resolve the town the player is looking at + the budget for the decision round.
  let town: Town;
  let townLabel: string;
  let displayRound: number;
  let budget: Budget;
  let notice: string | null = null;
  const loadedTown =
    townSource.kind === "template" && townRow?.data
      ? parseTown((townRow.data as { initial_state: unknown }).initial_state)
      : townSource.kind === "state" && townRow?.data
        ? parseTown((townRow.data as { state: unknown }).state)
        : null;

  if (activeRound && activeRound.status === "published") {
    town = loadedTown ?? createInitialTown();
    displayRound = activeRound.round_index;
    townLabel = ashfenMapLabel({
      roundIndex: activeRound.round_index,
      published: true,
      entering: false,
    });
    budget = computeBudget(town, activeRound.round_index + 1);
    notice = "This round is published. Review the outcome.";
  } else if (activeRound && loadedTown) {
    town = loadedTown;
    displayRound = activeRound.round_index - 1;
    townLabel = ashfenMapLabel({
      roundIndex: activeRound.round_index,
      published: false,
      entering: activeRound.round_index > 1,
    });
    budget = computeBudget(town, activeRound.round_index);
    if (activeRound.status === "scheduled") {
      notice = "The next round has not opened yet. Plan ahead; you can submit once it opens.";
    } else if (activeRound.status === "locked" || activeRound.status === "processing") {
      notice = "Decisions are locked. Results are being processed.";
    }
  } else if (activeRound) {
    town = createInitialTown();
    displayRound = 0;
    townLabel = "Ashfen";
    budget = computeBudget(town, 1);
    notice = "The previous round is not published yet, so the live town isn't available.";
  } else {
    town = createInitialTown();
    displayRound = 0;
    townLabel = "Ashfen";
    budget = computeBudget(town, 1);
    notice = "No rounds have been scheduled yet.";
  }

  let submission: GameContext["submission"] = null;
  if (subRow?.data) {
    const s = subRow.data as {
      allocations: Record<string, number>;
      project_starts: string[];
      status: string;
    };
    submission = {
      allocations: s.allocations ?? {},
      projectStarts: s.project_starts ?? [],
      status: s.status,
    };
  }

  const ownHistory = ownHistoryFrom(publishedRows, team.seat);

  const serverNow = new Date().toISOString();

  return publicPlayContext({
    mode: "live",
    configured,
    signedIn: true,
    email: null,
    isOrganiser,
    team: { id: team.id, name: team.name, seat: team.seat, loginId: team.login_id },
    competition,
    round: activeRound ? toRoundInfo(activeRound, serverNow) : null,
    town: townToView(town, townLabel, displayRound),
    budget,
    startedCodes: Object.keys(town.started ?? {}),
    completedCodes: Object.keys(town.completed ?? {}),
    submission,
    leaderboard,
    boardByRound,
    ownHistory,
    publishedRoundIndex,
    publishedRounds: publishedIndexes,
    roundSummaries,
    notice,
  });
}

/**
 * Unseated staff (organiser) still receive published TownPublic boards.
 * They do not receive a team seat, private town_states, or submissions.
 */
async function loadStaffPlayContext(
  admin: ReturnType<typeof createServiceRoleClient>,
  args: { configured: boolean; competitionId: string; isOrganiser: boolean },
): Promise<GameContext> {
  const [{ data: competitionRow }, { data: roundRows }] = await Promise.all([
    admin
      .from("competitions")
      .select("id, title, round_count")
      .eq("id", args.competitionId)
      .maybeSingle(),
    admin
      .from("rounds")
      .select("id, round_index, status, opens_at, closes_at, event_code")
      .eq("competition_id", args.competitionId)
      .order("round_index"),
  ]);

  const rounds = ((roundRows as RoundRow[] | null) ?? []).slice();
  const roundSummaries = roundSummariesFrom(rounds);
  const publishedIds = rounds.filter((row) => row.status === "published").map((row) => row.id);
  const [roster, publishedRows] = await Promise.all([
    loadCompetitionRoster(admin, args.competitionId),
    loadPublishedResultRows(admin, publishedIds),
  ]);
  const { boardByRound, publishedRounds, publishedRoundIndex, leaderboard } = args.isOrganiser
    ? buildBoards({
        roundSummaries,
        teams: roster,
        results: publishedRows,
        viewerSeat: null,
      })
    : {
        boardByRound: {},
        publishedRounds: roundSummaries.filter((row) => row.status === "published").map((row) => row.index),
        publishedRoundIndex:
          roundSummaries.filter((row) => row.status === "published").map((row) => row.index).at(-1) ?? null,
        leaderboard: null,
      };

  const openRound = rounds.find((r) => r.status === "open");
  const inFlight = rounds.find((r) => r.status === "locked" || r.status === "processing");
  const scheduled = rounds.find((r) => r.status === "scheduled");
  const lastPublished = rounds.filter((r) => r.status === "published").at(-1) ?? null;
  const activeRound = openRound ?? inFlight ?? scheduled ?? lastPublished ?? null;

  const town = createInitialTown();
  const serverNow = new Date().toISOString();
  const notice = args.isOrganiser
    ? publishedRounds.length > 0
      ? "Staff accounts are not seated on a team. Official standings use published scores. Open the control room to run the competition."
      : "Staff accounts are not seated on a team. Open the control room to run the competition. No round has been published yet."
    : "Your account is signed in but not seated on a team yet. Once your team is assigned, reload.";

  return publicPlayContext({
    mode: "preview",
    configured: args.configured,
    signedIn: true,
    email: null,
    isOrganiser: args.isOrganiser,
    team: null,
    competition: competitionRow
      ? {
          id: (competitionRow as { id: string }).id,
          title: (competitionRow as { title: string }).title,
          roundCount: (competitionRow as { round_count: number }).round_count,
        }
      : { id: args.competitionId, title: "Langlands R3", roundCount: 6 },
    round: activeRound
      ? toRoundInfo(activeRound, serverNow)
      : {
          id: null,
          index: 1,
          status: "none",
          opensAt: null,
          closesAt: null,
          eventCode: (PACK_A[1] as EventCode | null) ?? null,
          serverNow,
        },
    town: townToView(town, "Ashfen", 0),
    budget: computeBudget(town, 1),
    startedCodes: [],
    completedCodes: [],
    submission: null,
    leaderboard,
    boardByRound,
    ownHistory: [],
    publishedRoundIndex,
    publishedRounds,
    roundSummaries,
    notice,
  });
}
