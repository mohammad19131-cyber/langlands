import { PACK_A, STARTING_RESERVE } from "@langlands/sim/public";
import { TOWN_T0 } from "./ashfen";
import type { EventCode, GameContext } from "./game-types";
import { publicPlayContext } from "./play-payload";

/**
 * Local UI fixture for inspecting the player HUD without a hosted team session.
 * Preview mode: persist is disabled. Not a live score or a competition row.
 */
export function fixtureGameContext(): GameContext {
  const serverNow = new Date().toISOString();
  const closes = new Date(Date.parse(serverNow) + 18 * 60 * 1000).toISOString();

  return publicPlayContext({
    mode: "preview",
    configured: true,
    signedIn: true,
    email: "Team 004",
    isOrganiser: false,
    team: { id: "fixture-team", name: "Ashfen Command", seat: 4, loginId: "004" },
    competition: { id: "fixture", title: "Langlands R3", roundCount: 6 },
    round: {
      id: "fixture-round",
      index: 2,
      status: "open",
      opensAt: serverNow,
      closesAt: closes,
      eventCode: (PACK_A[2] as EventCode | null) ?? "HEATWAVE",
      serverNow,
    },
    town: {
      ...TOWN_T0,
      label: "Ashfen · entering round 2",
      round: 1,
    },
    budget: {
      available: STARTING_RESERVE,
      income: 0,
      maintenance: 0,
      reserve: STARTING_RESERVE,
    },
    startedCodes: [],
    completedCodes: [],
    submission: null,
    leaderboard: null,
    boardByRound: {},
    ownHistory: [],
    publishedRoundIndex: null,
    publishedRounds: [],
    roundSummaries: [
      { index: 1, id: "fixture-r1", status: "published" },
      { index: 2, id: "fixture-round", status: "open" },
    ],
    notice:
      "Local UI fixture. Unofficial preview — decisions cannot be submitted from this screen.",
  });
}
