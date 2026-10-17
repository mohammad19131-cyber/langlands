"use client";

import { PILLARS } from "../../lib/ashfen";
import {
  formatDelta,
  formatScore,
  isScoreAvailable,
  PILLAR_KEYS,
  PILLAR_LABELS,
  PILLAR_SHORT,
  PILLAR_WEIGHT_PCT,
  rankingScore,
  type PillarKey,
} from "../../lib/score-display";
import type { GameContext, OwnPublishedRound, RoundSummary } from "../../lib/game-types";

const PHASE_COPY: Record<string, string> = {
  scheduled: "Scheduled",
  open: "Open",
  locked: "Locked",
  processing: "Processing 20 towns",
  published: "Published",
  void: "Void",
  none: "Unscheduled",
};

export function ResultsPanel({ ctx }: { ctx: GameContext }) {
  const latest = ctx.ownHistory.at(-1) ?? null;
  const previous = ctx.ownHistory.length > 1 ? ctx.ownHistory.at(-2) ?? null : null;
  const latestIndex = latest?.roundIndex ?? ctx.publishedRoundIndex;

  if (!latest) {
    return (
      <div className="space-y-4 p-4">
        <RoundStatusList rounds={ctx.roundSummaries} current={ctx.round?.index ?? null} />
        <p className="text-[0.8rem] leading-6 text-[#A9A491]">
          No official results yet. Pillar scores appear only after the organiser publishes a round.
          Empty is not a zero.
        </p>
      </div>
    );
  }

  const pathScore = rankingScore({ snapshot: latest.snapshot, final: latest.final });

  return (
    <div className="space-y-5 p-4">
      <RoundStatusList rounds={ctx.roundSummaries} current={latestIndex} />
      <header>
        <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">
          Official · after round {latest.roundIndex}
        </p>
        <p className="mt-1 font-serif text-2xl tabular-nums text-[#EDE8D9]">{formatScore(pathScore)}</p>
        <p className="mt-1 text-[0.7rem] leading-5 text-[#8A8674]">
          Path score so far. Snapshot {formatScore(latest.snapshot)}
          {isScoreAvailable(latest.penalty) ? ` · penalty ${formatScore(latest.penalty)}` : ""}
          . Not computed in the browser.
        </p>
      </header>

      <PillarList current={latest} previous={previous} />
      <CompareBlock current={latest} previous={previous} />
      <SnapshotSparkline history={ctx.ownHistory} />
      <HistoryList history={ctx.ownHistory} />
    </div>
  );
}

function RoundStatusList({
  rounds,
  current,
}: {
  rounds: RoundSummary[];
  current: number | null;
}) {
  if (rounds.length === 0) {
    return (
      <p className="text-[0.7rem] leading-5 text-[#8A8674]">
        No rounds have been scheduled yet. The board stays empty until a round is published.
      </p>
    );
  }
  return (
    <ol className="grid grid-cols-6 gap-1">
      {rounds.map((row) => {
        const active = row.index === current;
        const published = row.status === "published";
        return (
          <li
            key={row.index}
            className={`border px-1 py-1.5 text-center ${
              published
                ? "border-[#7BA157]/40 text-[#9FC27E]"
                : "border-white/10 text-[#8A8674]"
            } ${active ? "bg-white/[0.04]" : ""}`}
          >
            <span className="block text-[0.58rem] uppercase tracking-[0.08em]">R{row.index}</span>
            <span className="mt-0.5 block text-[0.58rem] leading-4">
              {PHASE_COPY[row.status] ?? row.status}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PillarList({
  current,
  previous,
}: {
  current: OwnPublishedRound;
  previous: OwnPublishedRound | null;
}) {
  return (
    <div className="space-y-2">
      {PILLAR_KEYS.map((key) => {
        const value = current.breakdown?.[key] ?? null;
        const prior = previous?.breakdown?.[key] ?? null;
        const width = isScoreAvailable(value) ? Math.max(2, Math.min(100, value)) : 0;
        return (
          <div key={key} className="border border-white/8 bg-white/[0.02] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.78rem] text-[#E3DCC8]">{PILLAR_LABELS[key]}</span>
              <span className="text-[0.66rem] tabular-nums text-[#D9B15A]">{PILLAR_WEIGHT_PCT[key]}%</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden bg-white/10">
                <span className="block h-full bg-[#7BA157]" style={{ width: `${width}%` }} />
              </span>
              <span className="w-14 text-right text-[0.72rem] tabular-nums text-[#EDE8D9]">
                {formatScore(value, 1)}
              </span>
            </div>
            <p className="mt-1 text-[0.62rem] text-[#8A8674]">
              vs last published {formatDelta(value, prior)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CompareBlock({
  current,
  previous,
}: {
  current: OwnPublishedRound;
  previous: OwnPublishedRound | null;
}) {
  if (!previous) {
    return (
      <p className="text-[0.7rem] leading-5 text-[#8A8674]">
        No previous published round to compare. Rank and town deltas appear after a second official
        result.
      </p>
    );
  }
  const stats: Array<{ label: string; key: keyof OwnPublishedRound }> = [
    { label: "Snapshot", key: "snapshot" },
    { label: "Population", key: "population" },
    { label: "Air", key: "air" },
    { label: "Water", key: "water_q" },
    { label: "Soil", key: "soil" },
    { label: "Habitat", key: "bio" },
    { label: "Pollution", key: "pollution" },
    { label: "Health", key: "health" },
    { label: "Reserve", key: "reserve" },
  ];
  return (
    <div>
      <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
        Town change · R{previous.roundIndex} → R{current.roundIndex}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.72rem] text-[#C9C2AD]">
        {stats.map((stat) => {
          const now = Number(current[stat.key]);
          const then = Number(previous[stat.key]);
          return (
            <div key={stat.label} className="flex justify-between gap-2">
              <dt className="text-[#8A8674]">{stat.label}</dt>
              <dd className="tabular-nums">
                {Number.isFinite(now) ? Math.round(now) : "—"}{" "}
                <span className="text-[#8A8674]">{formatDelta(now, then)}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function SnapshotSparkline({ history }: { history: OwnPublishedRound[] }) {
  const points = history
    .map((row) => rankingScore({ snapshot: row.snapshot, final: row.final }))
    .filter(isScoreAvailable);
  if (points.length === 0) return null;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 100);
  const span = Math.max(1, max - min);
  const w = 220;
  const h = 48;
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? w / 2 : (index / (points.length - 1)) * w;
    const y = h - ((value - min) / span) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div>
      <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
        Official path score by published round
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-12 w-full" role="img" aria-label="Official score history">
        <polyline
          fill="none"
          stroke="#D9B15A"
          strokeWidth="1.5"
          points={coords.join(" ")}
        />
        {points.map((value, index) => {
          const [x, y] = coords[index]!.split(",");
          return <circle key={history[index]!.roundIndex} cx={x} cy={y} r="2.2" fill="#EDE8D9" />;
        })}
      </svg>
      <p className="mt-1 text-[0.62rem] text-[#8A8674]">
        {history.map((row) => `R${row.roundIndex} ${formatScore(row.snapshot, 1)}`).join(" · ")}
      </p>
    </div>
  );
}

function HistoryList({ history }: { history: OwnPublishedRound[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">Your published rounds</p>
      {history.map((row) => (
        <article key={row.roundIndex} className="border border-white/8 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[0.74rem] uppercase tracking-[0.1em] text-[#E3DCC8]">
              Round {row.roundIndex}
            </h3>
            <p className="font-serif tabular-nums text-[#EDE8D9]">
              {formatScore(rankingScore({ snapshot: row.snapshot, final: row.final }))}
            </p>
          </div>
          <p className="mt-1 text-[0.66rem] tabular-nums text-[#8A8674]">
            {PILLAR_KEYS.map((key) => `${PILLAR_SHORT[key]} ${formatScore(row.breakdown?.[key] ?? null, 1)}`).join(
              " · ",
            )}
          </p>
        </article>
      ))}
    </div>
  );
}

export function ScoringWeightsNote() {
  return (
    <p className="text-[0.7rem] leading-5 text-[#8A8674]">
      {PILLARS.map((pillar) => `${pillar.name} ${Math.round(pillar.weight * 100)}%`).join(" · ")}.
      Ties after the official score: higher ecology, then lower mean event damage, then lower seat.
      Mean event damage is not public, so this board applies ecology then seat.
    </p>
  );
}

export type { PillarKey };
