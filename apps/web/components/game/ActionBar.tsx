"use client";

import { CATALOGUE, SECTORS, type Project, type Sector } from "@langlands/sim/public";
import { SECTOR_LABELS } from "../../lib/format";
import { CATEGORIES, type GameContext } from "../../lib/game-types";
import {
  projectCost,
  projectsForSector,
  startEligibility,
  summariseEffects,
  sumAllocations,
} from "./game-logic";

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

function CatalogueItem({
  project,
  staged,
  eligible,
  reason,
  locked,
  full,
  onToggle,
}: {
  project: Project;
  staged: boolean;
  eligible: boolean;
  reason: string | null;
  locked: boolean;
  full: boolean;
  onToggle: () => void;
}) {
  const effects = summariseEffects(project);
  const disabled = locked || (!staged && (!eligible || full));
  return (
    <div
      className={`border px-3 py-2.5 transition-colors ${
        staged ? "border-[#D9B15A]/60 bg-[#D9B15A]/8" : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-[0.92rem] leading-tight text-[#EDE8D9]">{project.name}</p>
          <p className="mt-0.5 text-[0.64rem] uppercase tracking-[0.1em] text-[#8A8674]">
            {SECTOR_LABELS[project.sector]} · {project.cost} cr ·{" "}
            {project.buildRounds === 0 ? "instant" : `${project.buildRounds}-round build`} · upkeep{" "}
            {project.maintenance}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={`shrink-0 border px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.08em] transition-colors ${
            staged
              ? "border-[#D9B15A] bg-[#D9B15A] text-[#15110A] hover:bg-[#c99f45]"
              : disabled
                ? "cursor-not-allowed border-white/10 text-[#5F5B4D]"
                : "border-[#B89A60]/40 text-[#D7CFB8] hover:border-[#D9B15A] hover:bg-[#D9B15A]/10"
          }`}
        >
          {staged ? "Chosen" : "Start"}
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {effects.map((e) => (
          <div key={e.when} className="flex gap-2 text-[0.7rem] leading-4">
            <span className="w-[5.5rem] shrink-0 text-[#8A8674]">{e.when}</span>
            <span className="text-[#B7B19D]">{e.items.join(", ")}</span>
          </div>
        ))}
      </div>

      {!eligible && reason ? (
        <p className="mt-2 text-[0.66rem] text-[#C0533E]">{reason}</p>
      ) : project.prerequisites.length ? (
        <p className="mt-2 text-[0.66rem] text-[#6F6B5B]">
          Prerequisite: {project.prerequisites.map((p) => CATALOGUE[p]?.name ?? p).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function CataloguePopover({
  sector,
  ctx,
  stagedStarts,
  locked,
  onToggleStart,
  onClose,
}: {
  sector: Sector;
  ctx: GameContext;
  stagedStarts: string[];
  locked: boolean;
  onToggleStart: (code: string) => void;
  onClose: () => void;
}) {
  const projects: Project[] = projectsForSector(sector);
  const full = stagedStarts.length >= 2;
  return (
    <div className="pointer-events-auto absolute bottom-full left-0 mb-2 w-[22rem] border border-[#B89A60]/25 bg-[#0F1613]/97 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#B89A60]/15 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5" style={{ backgroundColor: SECTOR_ACCENT[sector] }} />
          <p className="text-[0.74rem] uppercase tracking-[0.12em] text-[#E3DCC8]">
            {CATEGORIES.find((c) => c.sector === sector)?.label ?? SECTOR_LABELS[sector]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close catalogue"
          className="text-[#8A8674] transition-colors hover:text-[#E3DCC8]"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[52vh] space-y-2 overflow-y-auto p-3">
        {projects.map((project) => {
          const staged = stagedStarts.includes(project.code);
          const elig = startEligibility(
            project.code,
            ctx.startedCodes,
            ctx.completedCodes,
            stagedStarts,
          );
          return (
            <CatalogueItem
              key={project.code}
              project={project}
              staged={staged}
              eligible={elig.ok}
              reason={elig.reason}
              locked={locked}
              full={full}
              onToggle={() => onToggleStart(project.code)}
            />
          );
        })}
      </div>
    </div>
  );
}

function BudgetPanel({
  allocations,
  remaining,
  disabled,
  onAllocate,
  onSpread,
  onClear,
  onClose,
}: {
  allocations: Record<Sector, number>;
  remaining: number;
  disabled: boolean;
  onAllocate: (sector: Sector, value: number) => void;
  onSpread: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const allocated = sumAllocations(allocations);
  const left = remaining - allocated;
  return (
    <div className="pointer-events-auto absolute bottom-full right-0 mb-2 w-[24rem] border border-[#B89A60]/25 bg-[#0F1613]/97 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#B89A60]/15 px-3 py-2">
        <p className="text-[0.74rem] uppercase tracking-[0.12em] text-[#E3DCC8]">Allocate budget</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close budget panel"
          className="text-[#8A8674] transition-colors hover:text-[#E3DCC8]"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-[#B89A60]/10 px-3 py-2 text-[0.72rem]">
        <span className="text-[#8A8674]">
          Spendable after projects: <span className="text-[#E3DCC8]">{Math.round(remaining)} cr</span>
        </span>
        <span className={left < -0.5 ? "text-[#C0533E]" : "text-[#9FC27E]"}>
          {left < -0.5 ? `Over by ${Math.round(-left)}` : `${Math.round(left)} cr free`}
        </span>
      </div>
      <div className="space-y-1.5 p-3">
        {SECTORS.map((s) => {
          const value = allocations[s] ?? 0;
          const step = 20;
          return (
            <div key={s} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: SECTOR_ACCENT[s] }} />
              <span className="w-28 shrink-0 text-[0.72rem] text-[#B7B19D]">{SECTOR_LABELS[s]}</span>
              <button
                type="button"
                disabled={disabled || value <= 0}
                onClick={() => onAllocate(s, Math.max(0, value - step))}
                className="grid h-6 w-6 place-items-center border border-white/10 text-[#C9C2AD] transition-colors hover:bg-white/5 disabled:opacity-30"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={value}
                disabled={disabled}
                onChange={(e) => onAllocate(s, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="h-6 w-16 border border-white/10 bg-black/30 px-1.5 text-right text-[0.72rem] tabular-nums text-[#E3DCC8] focus:border-[#D9B15A] focus:outline-none"
              />
              <button
                type="button"
                disabled={disabled || left < step}
                onClick={() => onAllocate(s, value + step)}
                className="grid h-6 w-6 place-items-center border border-white/10 text-[#C9C2AD] transition-colors hover:bg-white/5 disabled:opacity-30"
              >
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 border-t border-[#B89A60]/10 p-3">
        <button
          type="button"
          onClick={onSpread}
          disabled={disabled || remaining <= 0}
          className="flex-1 border border-[#B89A60]/30 px-2 py-1.5 text-[0.7rem] text-[#D7CFB8] transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          Spread remaining evenly
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || allocated <= 0}
          className="border border-white/10 px-2 py-1.5 text-[0.7rem] text-[#C9C2AD] transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function ActionBar({
  ctx,
  locked,
  canSubmit,
  openCategory,
  onToggleCategory,
  stagedStarts,
  onToggleStart,
  allocations,
  onAllocate,
  onSpread,
  onClear,
  budgetOpen,
  onToggleBudget,
  onReview,
}: {
  ctx: GameContext;
  locked: boolean;
  canSubmit: boolean;
  openCategory: Sector | null;
  onToggleCategory: (sector: Sector) => void;
  stagedStarts: string[];
  onToggleStart: (code: string) => void;
  allocations: Record<Sector, number>;
  onAllocate: (sector: Sector, value: number) => void;
  onSpread: () => void;
  onClear: () => void;
  budgetOpen: boolean;
  onToggleBudget: () => void;
  onReview: () => void;
}) {
  const cost = projectCost(stagedStarts);
  const remaining = ctx.budget.available - cost;
  const allocated = sumAllocations(allocations);
  const free = remaining - allocated;
  const overBudget = cost > ctx.budget.available + 0.5 || free < -0.5;
  const canReview = canSubmit && !overBudget;

  return (
    <div className="relative z-30 shrink-0 border-t border-[#B89A60]/20 bg-[#0E1512]/95 backdrop-blur">
      <div className="relative flex items-stretch gap-3 px-4 py-2.5">
        {/* Category selector */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = openCategory === cat.sector;
            const count = stagedStarts.filter((c) => CATALOGUE[c]?.sector === cat.sector).length;
            return (
              <button
                key={cat.sector}
                type="button"
                onClick={() => onToggleCategory(cat.sector)}
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
          {openCategory ? (
            <CataloguePopover
              sector={openCategory}
              ctx={ctx}
              stagedStarts={stagedStarts}
              locked={locked}
              onToggleStart={onToggleStart}
              onClose={() => onToggleCategory(openCategory)}
            />
          ) : null}
        </div>

        {/* Decision tray */}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            {stagedStarts.length === 0 ? (
              <span className="text-[0.72rem] text-[#6F6B5B]">No interventions chosen</span>
            ) : (
              stagedStarts.map((code) => (
                <span
                  key={code}
                  className="flex items-center gap-1.5 border border-[#D9B15A]/40 bg-[#D9B15A]/8 px-2 py-1 text-[0.7rem] text-[#E3DCC8]"
                >
                  {CATALOGUE[code]?.name ?? code}
                  <span className="text-[#8A8674]">{CATALOGUE[code]?.cost}cr</span>
                  <button
                    type="button"
                    onClick={() => onToggleStart(code)}
                    disabled={locked}
                    className="text-[#8A8674] transition-colors hover:text-[#C0533E] disabled:opacity-40"
                    aria-label={`Remove ${code}`}
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex flex-col items-end leading-none">
            <span className="text-[0.58rem] uppercase tracking-[0.12em] text-[#8A8674]">
              {stagedStarts.length}/2 starts · {Math.round(cost + allocated)} committed
            </span>
            <span
              className={`mt-1 text-[0.8rem] tabular-nums ${overBudget ? "text-[#C0533E]" : "text-[#9FC27E]"}`}
            >
              {overBudget ? "Over budget" : `${Math.round(free)} cr free`}
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={onToggleBudget}
              className={`border px-3 py-2 text-[0.72rem] uppercase tracking-[0.08em] transition-colors ${
                budgetOpen
                  ? "border-[#D9B15A] bg-[#D9B15A]/10 text-[#F2ECDC]"
                  : "border-[#B89A60]/30 text-[#D7CFB8] hover:bg-white/5"
              }`}
            >
              Budget
            </button>
            {budgetOpen ? (
              <BudgetPanel
                allocations={allocations}
                remaining={remaining}
                disabled={locked}
                onAllocate={onAllocate}
                onSpread={onSpread}
                onClear={onClear}
                onClose={onToggleBudget}
              />
            ) : null}
          </div>

          <button
            type="button"
            onClick={onReview}
            disabled={!canReview}
            className="border border-[#7BA157]/60 bg-[#2A4C39] px-4 py-2 text-[0.74rem] uppercase tracking-[0.08em] text-[#E7F0DE] transition-colors hover:bg-[#335c44] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-[#5F5B4D]"
          >
            Review &amp; submit
          </button>
        </div>
      </div>
    </div>
  );
}
