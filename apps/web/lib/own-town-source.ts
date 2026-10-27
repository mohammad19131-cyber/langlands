export type TownRoundRef = {
  id: string;
  round_index: number;
  status: string;
};

export type OwnTownRead =
  | { kind: "none" }
  | { kind: "template" }
  | { kind: "state"; roundId: string };

/**
 * Which stored town the play screen should read. Uses already-loaded rounds
 * so the request does not re-query the previous round.
 */
export function ownTownRead(args: {
  activeRound: TownRoundRef | null;
  rounds: TownRoundRef[];
}): OwnTownRead {
  const active = args.activeRound;
  if (!active) return { kind: "none" };
  if (active.status === "published") return { kind: "state", roundId: active.id };
  if (active.round_index <= 1) return { kind: "template" };
  const previous = args.rounds.find(
    (row) => row.round_index === active.round_index - 1 && row.status === "published",
  );
  if (!previous) return { kind: "none" };
  return { kind: "state", roundId: previous.id };
}
