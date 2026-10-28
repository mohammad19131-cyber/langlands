"use client";

import type { ReactNode } from "react";
import { CATALOGUE, SECTORS, type Sector } from "@langlands/sim/public";
import { EVENT_SCHEDULE } from "../../lib/ashfen";
import { EVENT_LABELS, effectFieldLabel } from "../../lib/format";
import { playerSector, type GameContext } from "../../lib/game-types";
import { formatScore, PILLAR_KEYS, PILLAR_LABELS, PILLAR_WEIGHT_PCT } from "../../lib/score-display";
import { projectCost, sumAllocations } from "./game-logic";
import { SECTOR_ACCENT } from "./ActionBar";
import { Leaderboard } from "./Leaderboard";
import { ScoringWeightsNote } from "./ResultsPanel";

export type SubmitState = {
  status: "idle" | "submitting" | "success" | "error" | "closed";
  message: string | null;
};

export function WaitOverlay({ title, body }: { title: string; body: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/50 backdrop-blur-[1px]">
      <div className="max-w-md border border-[#B89A60]/30 bg-[#0F1613]/95 px-6 py-5 text-center shadow-2xl">
        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#D9B15A]">{title}</p>
        <p className="mt-2 text-[0.88rem] leading-6 text-[#E3DCC8]">{body}</p>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} max-h-[85vh] overflow-hidden border border-[#B89A60]/30 bg-[#0F1613] shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[#B89A60]/20 px-5 py-3">
          <h2 className="font-serif text-lg text-[#EDE8D9]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#8A8674] transition-colors hover:text-[#E3DCC8]"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[calc(85vh-3.5rem)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function StandingsOverlay({ ctx, onClose }: { ctx: GameContext; onClose: () => void }) {
  return (
    <Modal title="Official standings" onClose={onClose} width="max-w-4xl">
      <Leaderboard ctx={ctx} />
    </Modal>
  );
}

export function ScoringOverlay({ ctx, onClose }: { ctx: GameContext; onClose: () => void }) {
  const latest = ctx.ownHistory.at(-1) ?? null;
  return (
    <Modal title="Official scoring" onClose={onClose} width="max-w-lg">
      <p className="mb-4 text-[0.8rem] leading-6 text-[#A9A491]">
        Five weighted pillars, frozen at Ecology 40, Welfare 25, Economy 15, Resilience 10,
        Efficiency 10. Numbers below are stored official results. Live town readings are not a score.
      </p>
      {!latest?.breakdown ? (
        <p className="mb-4 text-[0.84rem] leading-6 text-[#C9C2AD]">
          {ctx.publishedRounds.length > 0 && !ctx.team
            ? "Staff accounts are not seated. Official 20-town scores are on the organiser board."
            : "Official pillar scores are unavailable until a round is published. That is not a zero."}
        </p>
      ) : (
        <p className="mb-4 text-[0.74rem] text-[#8A8674]">
          After round {latest.roundIndex} · snapshot {formatScore(latest.snapshot)} · path{" "}
          {formatScore(latest.final ?? latest.snapshot)}
          {latest.penalty != null ? ` · penalty ${formatScore(latest.penalty)}` : ""}
        </p>
      )}
      <div className="space-y-2">
        {PILLAR_KEYS.map((key) => {
          const value = latest?.breakdown?.[key] ?? null;
          const width = value == null ? 0 : Math.max(2, Math.min(100, value));
          return (
            <div key={key} className="border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.86rem] text-[#E3DCC8]">{PILLAR_LABELS[key]}</span>
                <span className="text-[0.72rem] tabular-nums text-[#D9B15A]">{PILLAR_WEIGHT_PCT[key]}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden bg-white/10">
                  <span className="block h-full bg-[#7BA157]" style={{ width: `${width}%` }} />
                </span>
                <span className="w-16 text-right text-[0.72rem] tabular-nums text-[#B7B19D]">
                  {formatScore(value, 1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4">
        <ScoringWeightsNote />
      </div>
    </Modal>
  );
}

export function EventOverlay({ ctx, onClose }: { ctx: GameContext; onClose: () => void }) {
  const round = ctx.round?.index ?? 1;
  const brief = EVENT_SCHEDULE.find((b) => b.round === round) ?? EVENT_SCHEDULE[0];
  return (
    <Modal title={`Round ${brief.round} — ${brief.name}`} onClose={onClose} width="max-w-lg">
      {brief.code ? (
        <p className="mb-3 inline-block border border-[#C0533E]/40 px-2 py-0.5 text-[0.66rem] uppercase tracking-[0.12em] text-[#C0533E]">
          {EVENT_LABELS[brief.code] ?? brief.code}
        </p>
      ) : (
        <p className="mb-3 inline-block border border-[#7BA157]/40 px-2 py-0.5 text-[0.66rem] uppercase tracking-[0.12em] text-[#9FC27E]">
          No environmental shock
        </p>
      )}
      <p className="text-[0.86rem] leading-6 text-[#D7CFB8]">{brief.tagline}</p>

      {brief.threatens.length ? (
        <div className="mt-4">
          <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">Under pressure</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brief.threatens.map((k) => (
              <span key={k} className="border border-white/10 px-2 py-0.5 text-[0.72rem] text-[#B7B19D]">
                {effectFieldLabel(k)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">What helps</p>
        <ul className="mt-2 space-y-1">
          {brief.mitigations.map((m) => (
            <li key={m} className="flex gap-2 text-[0.8rem] leading-5 text-[#D7CFB8]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#7BA157]" />
              {m}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 border-t border-white/8 pt-3 text-[0.72rem] italic leading-5 text-[#8A8674]">
        {brief.note} The schedule is fixed and identical for all 20 teams.
      </p>
    </Modal>
  );
}

export function ReviewModal({
  ctx,
  stagedStarts,
  allocations,
  submit,
  onConfirm,
  onClose,
}: {
  ctx: GameContext;
  stagedStarts: string[];
  allocations: Record<Sector, number>;
  submit: SubmitState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cost = projectCost(stagedStarts);
  const allocated = sumAllocations(allocations);
  const committed = cost + allocated;
  const free = ctx.budget.available - committed;
  const activeSectors = SECTORS.filter((s) => (allocations[s] ?? 0) > 0);

  return (
    <Modal title="Review decision" onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
            Interventions ({stagedStarts.length}/2)
          </p>
          {stagedStarts.length === 0 ? (
            <p className="mt-1 text-[0.8rem] text-[#6F6B5B]">None — you can submit allocations only.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {stagedStarts.map((code) => (
                <li key={code} className="flex justify-between text-[0.82rem] text-[#E3DCC8]">
                  <span>{CATALOGUE[code]?.name ?? code}</span>
                  <span className="tabular-nums text-[#8A8674]">{CATALOGUE[code]?.cost} cr</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">Sector allocations</p>
          {activeSectors.length === 0 ? (
            <p className="mt-1 text-[0.8rem] text-[#6F6B5B]">Nothing allocated — the remainder stays in reserve.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {activeSectors.map((s) => (
                <li key={s} className="flex items-center justify-between text-[0.82rem] text-[#E3DCC8]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2" style={{ backgroundColor: SECTOR_ACCENT[s] }} />
                    {playerSector(s).short}
                  </span>
                  <span className="tabular-nums text-[#8A8674]">{allocations[s]} cr</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1 border-t border-white/8 pt-3 text-[0.82rem]">
          <div className="flex justify-between text-[#A9A491]">
            <span>Available this round</span>
            <span className="tabular-nums">{Math.round(ctx.budget.available)} cr</span>
          </div>
          <div className="flex justify-between text-[#A9A491]">
            <span>Committed</span>
            <span className="tabular-nums">{Math.round(committed)} cr</span>
          </div>
          <div className="flex justify-between text-[#E3DCC8]">
            <span>Held in reserve</span>
            <span className="tabular-nums">{Math.round(free)} cr</span>
          </div>
        </div>

        <p className="text-[0.68rem] leading-4 text-[#6F6B5B]">
          Saving sends this plan to the server. The clock, budget, and results stay on the server.
        </p>

        {submit.message ? (
          <p
            className={`text-[0.8rem] ${
              submit.status === "error" || submit.status === "closed"
                ? "text-[#C0533E]"
                : "text-[#9FC27E]"
            }`}
          >
            {submit.message}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-white/10 px-3 py-2 text-[0.76rem] text-[#C9C2AD] transition-colors hover:bg-white/5"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submit.status === "submitting" || submit.status === "closed"}
            className="flex-1 border border-[#7BA157]/60 bg-[#2A4C39] px-3 py-2 text-[0.76rem] uppercase tracking-[0.06em] text-[#E7F0DE] transition-colors hover:bg-[#335c44] disabled:opacity-50"
          >
            {submit.status === "submitting"
              ? "Saving…"
              : submit.status === "success"
                ? "Saved on server"
                : submit.status === "closed"
                  ? /not open/i.test(submit.message ?? "")
                    ? "Not open yet"
                    : "Deadline passed"
                  : "Confirm & save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
