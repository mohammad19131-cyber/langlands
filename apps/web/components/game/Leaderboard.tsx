"use client";

import { useMemo, useState } from "react";
import type { BoardSeat, GameContext } from "../../lib/game-types";
import { hasPublishedStandings, selectPublishedRound, UNPUBLISHED_STANDINGS_COPY } from "../../lib/ranking";
import {
  formatScore,
  PILLAR_KEYS,
  PILLAR_SHORT,
  PILLAR_WEIGHT_PCT,
} from "../../lib/score-display";
import { ScoringWeightsNote } from "./ResultsPanel";

export function Leaderboard({
  ctx,
  compact = false,
}: {
  ctx: GameContext;
  compact?: boolean;
}) {
  const published = ctx.publishedRounds;
  const [selected, setSelected] = useState<number | null>(ctx.publishedRoundIndex);
  const roundIndex = selectPublishedRound(published, selected);
  const seats = roundIndex != null ? (ctx.boardByRound[roundIndex] ?? []) : [];

  const statusLine = useMemo(() => {
    const active = ctx.roundSummaries.find((row) => row.index === ctx.round?.index);
    if (ctx.round?.status === "processing" || ctx.round?.status === "locked") {
      return ctx.notice ?? `Round ${ctx.round.index} processing 20 towns.`;
    }
    if (ctx.round?.status === "void") {
      return ctx.notice ?? "This round was voided. It is not a board.";
    }
    if (active?.status === "open") {
      return "The open round is not on the board until it is published.";
    }
    return null;
  }, [ctx.notice, ctx.round, ctx.roundSummaries]);

  if (!hasPublishedStandings(published)) {
    return (
      <div className="space-y-3">
        {statusLine ? <p className="text-[0.8rem] leading-6 text-[#D7CFB8]">{statusLine}</p> : null}
        <p className="text-[0.84rem] leading-6 text-[#A9A491]">{UNPUBLISHED_STANDINGS_COPY}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">Published round</p>
        {published.map((index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelected(index)}
            className={`border px-2 py-1 text-[0.7rem] uppercase tracking-[0.08em] ${
              index === roundIndex
                ? "border-[#D9B15A] bg-[#D9B15A]/10 text-[#F2ECDC]"
                : "border-white/10 text-[#C9C2AD] hover:bg-white/5"
            }`}
          >
            R{index}
          </button>
        ))}
      </div>
      {statusLine ? <p className="text-[0.74rem] leading-5 text-[#D7CFB8]">{statusLine}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-[0.76rem]">
          <thead>
            <tr className="text-[0.58rem] uppercase tracking-[0.1em] text-[#8A8674]">
              <th className="py-1.5 pr-2 font-normal">#</th>
              <th className="py-1.5 pr-2 font-normal">Δ</th>
              <th className="py-1.5 pr-2 font-normal">Team</th>
              {PILLAR_KEYS.map((key) => (
                <th key={key} className="py-1.5 px-1 text-right font-normal">
                  {PILLAR_SHORT[key]} {PILLAR_WEIGHT_PCT[key]}
                </th>
              ))}
              <th className="py-1.5 pl-2 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((row) => (
              <BoardRow key={row.seat} row={row} compact={compact} />
            ))}
          </tbody>
        </table>
      </div>
      <ScoringWeightsNote />
    </div>
  );
}

function BoardRow({ row, compact }: { row: BoardSeat; compact?: boolean }) {
  const rankLabel = row.disqualified ? "DQ" : row.rank == null ? "—" : String(row.rank);
  const delta =
    row.rankDelta == null ? "—" : row.rankDelta > 0 ? `↑${row.rankDelta}` : row.rankDelta < 0 ? `↓${Math.abs(row.rankDelta)}` : "•";
  return (
    <tr className={`border-t border-white/6 ${row.isYou ? "bg-[#D9B15A]/8" : ""}`}>
      <td className="py-1.5 pr-2 tabular-nums text-[#8A8674]">{rankLabel}</td>
      <td className="py-1.5 pr-2 tabular-nums text-[#8A8674]">{delta}</td>
      <td className="py-1.5 pr-2 text-[#E3DCC8]">
        {row.name}
        {row.isYou ? <span className="ml-2 text-[0.62rem] text-[#D9B15A]">YOU</span> : null}
        {!row.published ? <span className="ml-2 text-[0.62rem] text-[#8A8674]">unpublished</span> : null}
      </td>
      {PILLAR_KEYS.map((key) => (
        <td key={key} className="py-1.5 px-1 text-right tabular-nums text-[#C9C2AD]">
          {formatScore(row.breakdown?.[key] ?? null, compact ? 0 : 1)}
        </td>
      ))}
      <td className="py-1.5 pl-2 text-right tabular-nums text-[#EDE8D9]">
        {formatScore(row.rankingScore)}
      </td>
    </tr>
  );
}
