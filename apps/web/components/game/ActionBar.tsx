"use client";

import { CATALOGUE, type Sector } from "@langlands/sim/public";
import { emptyStartsCopy, saveButtonLabel } from "../../lib/decision";
import { CATEGORIES, type GameContext } from "../../lib/game-types";
import { projectCost, sumAllocations } from "./game-logic";

export const SECTOR_ACCENT: Record<Sector, string> = {
  restoration: "#6E9450",
  pollution_control: "#B0703F",
  water: "#3E7E8A",
  energy: "#C7A954",
  agriculture: "#8A8A3E",
  industry: "#8A7E64",
  public_services: "#9FB0A0",
  infrastructure: "#5B86A6",
};

export function ActionBar({
  ctx,
  locked,
  canSubmit,
  saving,
  saveLabel,
  dirty,
  serverAccepted,
  submitMessage,
  submitTone,
  holdNotice,
  openCategory,
  onToggleCategory,
  stagedStarts,
  onToggleStart,
  allocations,
  onToggleBudget,
  onSave,
  onReview,
}: {
  ctx: GameContext;
  locked: boolean;
  canSubmit: boolean;
  saving: boolean;
  saveLabel: string;
  dirty: boolean;
  serverAccepted: boolean;
  submitMessage: string | null;
  submitTone: "idle" | "success" | "error" | "closed";
  holdNotice: string | null;
  openCategory: Sector | null;
  onToggleCategory: (sector: Sector) => void;
  stagedStarts: string[];
  onToggleStart: (code: string) => void;
  allocations: Record<Sector, number>;
  onToggleBudget: () => void;
  onSave: () => void;
  onReview: () => void;
}) {
  const cost = projectCost(stagedStarts);
  const remaining = ctx.budget.available - cost;
  const allocated = sumAllocations(allocations);
  const free = remaining - allocated;
  const projectsOver = cost > ctx.budget.available + 0.5;
  const overBudget = projectsOver || free < -0.5;
  const roundOpen = ctx.round?.status === "open";
  const buttonLabel = saveButtonLabel({
    saving,
    live: ctx.mode === "live",
    roundOpen,
    dirty,
    serverAccepted,
  });
  const canPrimarySave =
    canSubmit && !projectsOver && !saving && (dirty || !serverAccepted);
  const saveIsConfirmed = !saving && !dirty && serverAccepted;

  return (
    <div className="relative z-30 shrink-0 border-t border-[#B89A60]/20 bg-[#0E1512]/95 backdrop-blur">
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = openCategory === cat.sector;
            const count = stagedStarts.filter((c) => CATALOGUE[c]?.sector === cat.sector).length;
            return (
              <button
                key={cat.sector}
                type="button"
                onClick={() => onToggleCategory(cat.sector)}
                aria-pressed={active}
                aria-label={cat.label}
                className={`relative flex items-center gap-1.5 border px-2.5 py-1.5 text-[0.7rem] transition-colors ${
                  active
                    ? "border-[#D9B15A] bg-[#D9B15A]/10 text-[#F2ECDC]"
                    : "border-white/10 text-[#B7B19D] hover:border-[#B89A60]/40 hover:bg-white/5"
                }`}
              >
                <span className="h-2.5 w-2.5" style={{ backgroundColor: SECTOR_ACCENT[cat.sector] }} />
                {cat.short}
                {count > 0 ? (
                  <span className="ml-0.5 grid h-4 w-4 place-items-center bg-[#D9B15A] text-[0.6rem] font-bold text-[#15110A]">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {stagedStarts.length === 0 ? (
              <span className="text-[0.72rem] text-[#9A947F]">
                {emptyStartsCopy(ctx.round?.status ?? "none")}
              </span>
            ) : (
              stagedStarts.map((code) => (
                <span
                  key={code}
                  className="flex items-center gap-1.5 border border-[#D9B15A]/40 bg-[#D9B15A]/8 px-2 py-1 text-[0.7rem] text-[#E3DCC8]"
                >
                  {CATALOGUE[code]?.name ?? code}
                  <span className="text-[#C9C2AD]">{CATALOGUE[code]?.cost} cr</span>
                  <button
                    type="button"
                    onClick={() => onToggleStart(code)}
                    disabled={locked}
                    className="text-[#8A8674] transition-colors hover:text-[#C0533E] disabled:opacity-40"
                    aria-label={`Remove ${CATALOGUE[code]?.name ?? code}`}
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex flex-col items-end leading-none">
            <span className="text-[0.58rem] uppercase tracking-[0.12em] text-[#8A8674]">
              {stagedStarts.length} of 2 projects · {Math.round(cost)} cr · sectors{" "}
              {Math.round(allocated)} cr
            </span>
            <span
              className={`mt-1 text-[0.8rem] tabular-nums ${overBudget ? "text-[#C0533E]" : "text-[#EDE8D9]"}`}
            >
              {overBudget
                ? "Over available credits"
                : `${Math.round(ctx.budget.available)} available · ${Math.round(Math.max(0, free))} to reserve`}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleBudget}
            className="border border-[#B89A60]/30 px-3 py-2 text-[0.72rem] uppercase tracking-[0.08em] text-[#D7CFB8] transition-colors hover:bg-white/5"
          >
            Budget
          </button>
          <button
            type="button"
            onClick={onReview}
            disabled={projectsOver || saving}
            className="border border-[#B89A60]/40 px-3 py-2 text-[0.72rem] uppercase tracking-[0.08em] text-[#D7CFB8] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:text-[#5F5B4D]"
          >
            Review
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canPrimarySave}
            aria-live="polite"
            className="border border-[#7BA157]/60 bg-[#2A4C39] px-4 py-2 text-[0.74rem] uppercase tracking-[0.08em] text-[#E7F0DE] transition-colors hover:bg-[#335c44] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-[#5F5B4D]"
          >
            {buttonLabel}
          </button>
        </div>

        <p className="text-[0.66rem] leading-4 text-[#9A947F]">
            {ctx.mode === "live" && roundOpen
            ? dirty
              ? "Unsaved changes. They save after a short pause, or press Save now."
              : saveIsConfirmed
                ? "This plan is saved on the server."
                : "Choose up to two projects and split remaining credits across sectors, then save."
            : saveLabel}
        </p>
        {holdNotice && !submitMessage ? (
          <p role="status" className="text-[0.72rem] leading-5 text-[#D9B15A]">
            {holdNotice}
          </p>
        ) : null}
        {submitMessage ? (
          <p
            role="alert"
            className={`text-[0.72rem] ${
              submitTone === "error" || submitTone === "closed" ? "text-[#C0533E]" : "text-[#9FC27E]"
            }`}
          >
            {submitMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
