import "server-only";
import {
  cloneTown,
  createInitialTown,
  PACK_A,
  stepRound,
  type Town,
} from "@langlands/sim";
import { parseTown, townBadges } from "@langlands/round-machine";
import type { IndicatorKey, TownView } from "../ashfen";
import type { Budget, EventCode, GameContext, RoundInfo, RoundPhase } from "../game-types";
import { isSystemAuthEmail, publicPlayerLabel } from "../display-identity";
import { getPublicSupabaseConfig, hasServiceRole } from "../env";
import { createServerSupabase } from "../supabase/server";
import { createServiceRoleClient } from "../supabase/admin";
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
  email: string | null;
  notice: string;
  isOrganiser?: boolean;
}): GameContext {
  const town = createInitialTown();
  return {
    mode: "preview",
    configured: args.configured,
    signedIn: args.signedIn,
    email: args.email,
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
    town: townToView(town, "Ashfen · shared starting template", 0),
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
  };
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
      email: null,
      notice:
        "Preview mode — the competition backend is not configured in this environment. You can inspect Ashfen and stage decisions, but nothing can be submitted.",
    });
  }

  const supabase = await createServerSupabase();
  const auth = supabase ? await supabase.auth.getUser() : null;
  const user = auth?.data.user ?? null;
  if (!user) {
    return previewContext({
      configured,
      signedIn: false,
      email: null,
      notice: "Sign in with your invited team account to take command of Ashfen.",
    });
  }

  const admin = createServiceRoleClient();

  const { data: membership } = await admin
    .from("team_members")
    .select("team_id, teams(id, name, seat, competition_id, login_id, disqualified)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

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
      .select("staff_role")
      .eq("user_id", user.id)
      .eq("staff_role", "organiser")
      .limit(1)
      .maybeSingle();
    const isOrganiser = (staffRow as { staff_role?: string } | null)?.staff_role === "organiser";
    return previewContext({
      configured,
      signedIn: true,
      email: isSystemAuthEmail(user.email) ? null : (user.email ?? null),
      isOrganiser,
      notice: isOrganiser
        ? "Organiser accounts are not seated on a team. Open the control room to run the competition."
        : "Your account is signed in but not seated on a team yet. Ask the organiser to add you to a team, then reload.",
    });
  }

  if (team.disqualified) {
    return previewContext({
      configured,
      signedIn: true,
      email: null,
      notice: "This team has been disqualified and cannot take further decisions.",
    });
  }

  const competitionId = team.competition_id;

  const [{ data: competitionRow }, staffLookup, { data: roundRows }] = await Promise.all([
    admin
      .from("competitions")
      .select("id, title, round_count, status")
      .eq("id", competitionId)
      .maybeSingle(),
    admin
      .from("competition_staff")
      .select("staff_role")
      .eq("competition_id", competitionId)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("rounds")
      .select("id, round_index, status, opens_at, closes_at, event_code")
      .eq("competition_id", competitionId)
      .order("round_index"),
  ]);

  const isOrganiser = (staffLookup.data as { staff_role?: string } | null)?.staff_role === "organiser";
  const competition = competitionRow
    ? {
        id: (competitionRow as { id: string }).id,
        title: (competitionRow as { title: string }).title,
        roundCount: (competitionRow as { round_count: number }).round_count,
      }
    : { id: competitionId, title: "Langlands R3", roundCount: 6 };

  const rounds = ((roundRows as RoundRow[] | null) ?? []).slice();

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
  const [roster, publishedRows] = await Promise.all([
    loadCompetitionRoster(admin, competitionId),
    loadPublishedResultRows(admin, publishedIds),
  ]);
  const { boardByRound, publishedRounds: publishedIndexes } = buildBoards({
    roundSummaries,
    teams: roster,
    results: publishedRows,
    viewerSeat: team.seat,
  });
  const publishedRoundIndex = lastPublished?.round_index ?? null;
  const leaderboard =
    publishedRoundIndex != null ? (boardByRound[publishedRoundIndex] ?? null) : null;

  // Resolve the town the player is looking at + the budget for the decision round.
  let town: Town;
  let townLabel: string;
  let displayRound: number;
  let budget: Budget;
  let notice: string | null = null;

  if (activeRound && activeRound.status === "published") {
    // All playable rounds resolved — show the player's own final town state.
    const { data: ownState } = await admin
      .from("town_states")
      .select("state, round_index")
      .eq("team_id", team.id)
      .eq("round_id", activeRound.id)
      .maybeSingle();
    town = ownState
      ? parseTown((ownState as { state: unknown }).state)
      : createInitialTown();
    displayRound = activeRound.round_index;
    townLabel = `Ashfen · after round ${activeRound.round_index}`;
    budget = computeBudget(town, activeRound.round_index + 1);
    notice = "This round is published. Review the outcome and the standings.";
  } else if (activeRound) {
    const loaded = await loadPreTown(admin, competitionId, team.id, activeRound.round_index);
    if (loaded) {
      town = loaded;
      displayRound = activeRound.round_index - 1;
      townLabel =
        activeRound.round_index === 1
          ? "Ashfen · shared starting template"
          : `Ashfen · entering round ${activeRound.round_index}`;
      budget = computeBudget(town, activeRound.round_index);
      if (activeRound.status === "scheduled") {
        notice = "The next round has not opened yet. Plan ahead; you can submit once it opens.";
      } else if (activeRound.status === "locked" || activeRound.status === "processing") {
        notice = "Decisions are locked. Results are being processed.";
      }
    } else {
      town = createInitialTown();
      displayRound = 0;
      townLabel = "Ashfen · shared starting template";
      budget = computeBudget(town, 1);
      notice = "The previous round is not published yet, so the live town isn't available.";
    }
  } else {
    town = createInitialTown();
    displayRound = 0;
    townLabel = "Ashfen · shared starting template";
    budget = computeBudget(town, 1);
    notice = "No rounds have been scheduled yet.";
  }

  // Own accepted submission for the open round (so staged choices persist on reload).
  let submission: GameContext["submission"] = null;
  if (openRound) {
    const { data: sub } = await admin
      .from("submissions")
      .select("allocations, project_starts, status")
      .eq("round_id", openRound.id)
      .eq("team_id", team.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (sub) {
      const s = sub as { allocations: Record<string, number>; project_starts: string[]; status: string };
      submission = {
        allocations: s.allocations ?? {},
        projectStarts: s.project_starts ?? [],
        status: s.status,
      };
    }
  }

  const ownHistory = ownHistoryFrom(publishedRows, team.seat);

  const serverNow = new Date().toISOString();

  return {
    mode: "live",
    configured,
    signedIn: true,
    // Never expose Auth system emails to the client; show Team ID / seat label.
    email: publicPlayerLabel({
      loginId: team.login_id,
      teamName: team.name,
      seat: team.seat,
    }),
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
  };
}

/** Pre-round town for a team: the template for round 1, else the last published state. */
async function loadPreTown(
  admin: ReturnType<typeof createServiceRoleClient>,
  competitionId: string,
  teamId: string,
  roundIndex: number,
): Promise<Town | null> {
  if (roundIndex <= 1) {
    const { data } = await admin
      .from("town_templates")
      .select("initial_state")
      .eq("competition_id", competitionId)
      .maybeSingle();
    if (!data) return null;
    return parseTown((data as { initial_state: unknown }).initial_state);
  }

  const { data: prevRound } = await admin
    .from("rounds")
    .select("id, status")
    .eq("competition_id", competitionId)
    .eq("round_index", roundIndex - 1)
    .maybeSingle();
  if (!prevRound || (prevRound as { status: string }).status !== "published") return null;

  const { data: prevState } = await admin
    .from("town_states")
    .select("state")
    .eq("team_id", teamId)
    .eq("round_id", (prevRound as { id: string }).id)
    .maybeSingle();
  if (!prevState) return null;
  return parseTown((prevState as { state: unknown }).state);
}
