"use client";

import { CATALOGUE, SECTORS, type Sector } from "@langlands/sim/public";
import { INDICATORS, healthBand, healthValue } from "../../lib/ashfen";
import { budgetCheck, sumAllocations } from "../../lib/decision";
import { SECTOR_LABELS } from "../../lib/format";
import { CATEGORIES, MAX_STARTS_PER_ROUND, type GameContext } from "../../lib/game-types";
import { projectsForSector, startEligibility, summariseEffects } from "./game-logic";
import { SECTOR_ACCENT } from "./ActionBar";
import { ResultsPanel } from "./ResultsPanel";

export type DeskTab = "decide" | "catalogue" | "town" | "results" | "history";

const BAND_COLOR: Record<string, string> = {
  critical: "#C0533E",
  strained: "#C07A43",
  fair: "#C7A954",
  strong: "#7BA157",
};

export function CommandDesk({
  ctx,
  tab,
  onTab,
  locked,
  stagedStarts,
  allocations,
  onToggleStart,
  onAllocate,
  onSpread,
  onClear,
  onClose,
}: {
  ctx: GameContext;
  tab: DeskTab;
  onTab: (tab: DeskTab) => void;
  locked: boolean;
  stagedStarts: string[];
  allocations: Record<Sector, number>;
  onToggleStart: (code: string) => void;
  onAllocate: (sector: Sector, value: number) => void;
  onSpread: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const check = budgetCheck(
    { allocations, projectStarts: stagedStarts },
    ctx.budget.available,
  );

  return (
    <aside className="pointer-events-auto relative z-20 flex h-full w-[26.5rem] shrink-0 flex-col border-l border-[#B89A60]/25 bg-[#0F1613]/97 backdrop-blur">
      <div className="flex items-center justify-between border-b border-[#B89A60]/15 px-4 py-2.5">
        <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#E3DCC8]">Command desk</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close command desk"
          className="text-[#8A8674] transition-colors hover:text-[#E3DCC8]"
        >
          ✕
        </button>
      </div>

      <nav className="flex border-b border-[#B89A60]/15" aria-label="Decision panels">
        {(
          [
            ["decide", "Budget"],
            ["catalogue", "Catalogue"],
            ["town", "Town"],
            ["results", "Results"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={`flex-1 px-2 py-2 text-[0.66rem] uppercase tracking-[0.1em] transition-colors ${
              tab === id || (id === "results" && tab === "history")
                ? "border-b-2 border-[#D9B15A] text-[#F2ECDC]"
                : "text-[#8A8674] hover:text-[#D7CFB8]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "decide" ? (
          <BudgetTab
            ctx={ctx}
            locked={locked}
            allocations={allocations}
            stagedStarts={stagedStarts}
            onAllocate={onAllocate}
            onSpread={onSpread}
            onClear={onClear}
            remainder={check.remainder}
            projectSpend={check.projectSpend}
            sectorSpend={check.sectorSpend}
            willScale={check.sectorsWillScale}
            projectsOver={check.projectsExceedAvailable}
          />
        ) : null}
        {tab === "catalogue" ? (
          <CatalogueTab
            ctx={ctx}
            locked={locked}
            stagedStarts={stagedStarts}
            onToggleStart={onToggleStart}
          />
        ) : null}
        {tab === "town" ? <TownTab ctx={ctx} /> : null}
        {tab === "results" || tab === "history" ? <ResultsPanel ctx={ctx} /> : null}
      </div>
    </aside>
  );
}

function BudgetTab({
  ctx,
  locked,
  allocations,
  stagedStarts,
  onAllocate,
  onSpread,
  onClear,
  remainder,
  projectSpend,
  sectorSpend,
  willScale,
  projectsOver,
}: {
  ctx: GameContext;
  locked: boolean;
  allocations: Record<Sector, number>;
  stagedStarts: string[];
  onAllocate: (sector: Sector, value: number) => void;
  onSpread: () => void;
  onClear: () => void;
  remainder: number;
  projectSpend: number;
  sectorSpend: number;
  willScale: boolean;
  projectsOver: boolean;
}) {
  const allocated = sumAllocations(allocations);
  return (
    <div className="space-y-4 p-4">
      <p className="text-[0.68rem] leading-5 text-[#8A8674]">
        Available credits are computed on the server from reserve, income and maintenance. Your
        totals are a proposal, not cash on hand.
      </p>
      <dl className="grid grid-cols-2 gap-2 text-[0.78rem]">
        <Ledger label="Available" value={`${Math.round(ctx.budget.available)} cr`} accent="#D9B15A" />
        <Ledger label="Reserve in" value={`${Math.round(ctx.budget.reserve)} cr`} />
        <Ledger label="Income" value={`${Math.round(ctx.budget.income)} cr`} />
        <Ledger label="Maintenance" value={`${Math.round(ctx.budget.maintenance)} cr`} />
      </dl>
      <div className="border border-[#B89A60]/15 px-3 py-2 text-[0.74rem] text-[#C9C2AD]">
        <div className="flex justify-between">
          <span>Interventions</span>
          <span className="tabular-nums">{Math.round(projectSpend)} cr</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span>Sector spend</span>
          <span className="tabular-nums">{Math.round(sectorSpend)} cr</span>
        </div>
        <div className="mt-1 flex justify-between text-[#E3DCC8]">
          <span>Held if accepted</span>
          <span className={`tabular-nums ${remainder < -0.5 ? "text-[#C0533E]" : "text-[#9FC27E]"}`}>
            {Math.round(remainder)} cr
          </span>
        </div>
      </div>
      {projectsOver ? (
        <p className="text-[0.7rem] text-[#C0533E]">
          Project costs exceed server available. Drop a start before saving — the server will reject
          the extra starts.
        </p>
      ) : willScale ? (
        <p className="text-[0.7rem] text-[#C7A954]">
          Sector spend is over the remainder. The server will scale operating allocations down.
        </p>
      ) : null}

      <div className="space-y-1.5">
        {SECTORS.map((sector) => {
          const value = allocations[sector] ?? 0;
          return (
            <div key={sector} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: SECTOR_ACCENT[sector] }} />
              <label className="w-[7.5rem] shrink-0 text-[0.72rem] text-[#B7B19D]" htmlFor={`alloc-${sector}`}>
                {SECTOR_LABELS[sector]}
              </label>
              <button
                type="button"
                disabled={locked || value <= 0}
                onClick={() => onAllocate(sector, Math.max(0, value - 20))}
                className="grid h-6 w-6 place-items-center border border-white/10 text-[#C9C2AD] hover:bg-white/5 disabled:opacity-30"
              >
                −
              </button>
              <input
                id={`alloc-${sector}`}
                type="number"
                min={0}
                value={value}
                disabled={locked}
                aria-label={`${SECTOR_LABELS[sector]} allocation`}
                onChange={(event) =>
                  onAllocate(sector, Math.max(0, Math.round(Number(event.target.value) || 0)))
                }
                className="h-6 w-16 border border-white/10 bg-black/30 px-1.5 text-right text-[0.72rem] tabular-nums text-[#E3DCC8] focus:border-[#D9B15A] focus:outline-none"
              />
              <button
                type="button"
                disabled={locked}
                onClick={() => onAllocate(sector, value + 20)}
                className="grid h-6 w-6 place-items-center border border-white/10 text-[#C9C2AD] hover:bg-white/5 disabled:opacity-30"
              >
                +
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSpread}
          disabled={locked || ctx.budget.available - projectSpend <= 0}
          className="flex-1 border border-[#B89A60]/30 px-2 py-1.5 text-[0.7rem] text-[#D7CFB8] hover:bg-white/5 disabled:opacity-40"
        >
          Spread remaining
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={locked || allocated <= 0}
          className="border border-white/10 px-2 py-1.5 text-[0.7rem] text-[#C9C2AD] hover:bg-white/5 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      {stagedStarts.length ? (
        <p className="text-[0.68rem] text-[#8A8674]">
          Starts: {stagedStarts.map((code) => CATALOGUE[code]?.name ?? code).join(" · ")}
        </p>
      ) : (
        <p className="text-[0.68rem] text-[#6F6B5B]">No interventions chosen — remainder stays in reserve.</p>
      )}
    </div>
  );
}

function CatalogueTab({
  ctx,
  locked,
  stagedStarts,
  onToggleStart,
}: {
  ctx: GameContext;
  locked: boolean;
  stagedStarts: string[];
  onToggleStart: (code: string) => void;
}) {
  const full = stagedStarts.length >= MAX_STARTS_PER_ROUND;
  return (
    <div className="space-y-4 p-4">
      <p className="text-[0.68rem] leading-5 text-[#8A8674]">
        Fifteen catalogue interventions. At most {MAX_STARTS_PER_ROUND} starts this round.
        Prerequisites and mutexes are checked against your published town; the server confirms.
      </p>
      <p className="text-[0.7rem] text-[#D7CFB8]">
        {stagedStarts.length}/{MAX_STARTS_PER_ROUND} starts selected
      </p>
      {CATEGORIES.map((category) => {
        const projects = projectsForSector(category.sector);
        return (
          <section key={category.sector}>
            <h3 className="mb-2 flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.12em] text-[#E3DCC8]">
              <span className="h-2.5 w-2.5" style={{ backgroundColor: SECTOR_ACCENT[category.sector] }} />
              {category.label}
            </h3>
            <div className="space-y-2">
              {projects.map((project) => {
                const staged = stagedStarts.includes(project.code);
                const elig = startEligibility(
                  project.code,
                  ctx.startedCodes,
                  ctx.completedCodes,
                  stagedStarts,
                );
                const disabled = locked || (!staged && (!elig.ok || full));
                const effects = summariseEffects(project);
                return (
                  <article
                    key={project.code}
                    className={`border px-3 py-2.5 ${
                      staged ? "border-[#D9B15A]/60 bg-[#D9B15A]/8" : "border-white/8 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-[0.92rem] leading-tight text-[#EDE8D9]">
                          {project.name}
                        </p>
                        <p className="mt-0.5 text-[0.64rem] uppercase tracking-[0.1em] text-[#8A8674]">
                          {project.code} · {project.cost} cr ·{" "}
                          {project.buildRounds === 0 ? "instant" : `${project.buildRounds}-round build`}{" "}
                          · upkeep {project.maintenance}
                          {project.mutexGroup ? ` · mutex ${project.mutexGroup}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleStart(project.code)}
                        disabled={disabled}
                        className={`shrink-0 border px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.08em] ${
                          staged
                            ? "border-[#D9B15A] bg-[#D9B15A] text-[#15110A]"
                            : disabled
                              ? "cursor-not-allowed border-white/10 text-[#5F5B4D]"
                              : "border-[#B89A60]/40 text-[#D7CFB8] hover:bg-[#D9B15A]/10"
                        }`}
                      >
                        {staged ? "Chosen" : "Start"}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1">
                      {effects.map((effect) => (
                        <div key={effect.when} className="flex gap-2 text-[0.7rem] leading-4">
                          <span className="w-[5.5rem] shrink-0 text-[#8A8674]">{effect.when}</span>
                          <span className="text-[#B7B19D]">{effect.items.join(", ")}</span>
                        </div>
                      ))}
                    </div>
                    {!elig.ok && elig.reason ? (
                      <p className="mt-2 text-[0.66rem] text-[#C0533E]">{elig.reason}</p>
                    ) : project.prerequisites.length ? (
                      <p className="mt-2 text-[0.66rem] text-[#6F6B5B]">
                        Prerequisite:{" "}
                        {project.prerequisites.map((code) => CATALOGUE[code]?.name ?? code).join(", ")}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TownTab({ ctx }: { ctx: GameContext }) {
  const groups = ["Environment", "People", "Economy", "Resilience"] as const;
  const underway = ctx.startedCodes.filter((code) => !ctx.completedCodes.includes(code));
  return (
    <div className="p-4">
      <p className="text-[0.68rem] leading-5 text-[#8A8674]">
        Your town only. These readings are the pre-round state the server will simulate against —
        not a live score.
      </p>
      <p className="mt-2 text-[0.72rem] text-[#C9C2AD]">{ctx.town.label}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.74rem]">
        <Ledger label="Population" value={ctx.town.population.toLocaleString()} />
        <Ledger label="Reserve" value={`${Math.round(ctx.town.reserve)} cr`} />
        <Ledger label="Energy mix" value={ctx.town.badges.energyMix} />
        <Ledger label="Agriculture" value={ctx.town.badges.agriculture} />
      </dl>
      <div className="mt-3 text-[0.72rem] leading-5 text-[#B7B19D]">
        <p>
          Completed:{" "}
          {ctx.completedCodes.length
            ? ctx.completedCodes.map((code) => CATALOGUE[code]?.name ?? code).join(" · ")
            : "none yet"}
        </p>
        <p className="mt-1">
          Under way:{" "}
          {underway.length
            ? underway.map((code) => CATALOGUE[code]?.name ?? code).join(" · ")
            : "none"}
        </p>
      </div>
      <table className="mt-4 w-full border-collapse text-left text-[0.74rem]">
        <caption className="sr-only">Town indicators</caption>
        <thead>
          <tr className="text-[0.58rem] uppercase tracking-[0.1em] text-[#8A8674]">
            <th className="py-1 font-normal">Indicator</th>
            <th className="py-1 text-right font-normal">Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            INDICATORS.filter((meta) => meta.group === group).map((meta) => {
              const raw = ctx.town.indicators[meta.key];
              const health = healthValue(meta, raw);
              return (
                <tr key={meta.key} className="border-t border-white/6">
                  <td className="py-1.5 text-[#C9C2AD]">{meta.label}</td>
                  <td
                    className="py-1.5 text-right tabular-nums"
                    style={{ color: BAND_COLOR[healthBand(health)] }}
                  >
                    {Math.round(raw)}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Ledger({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border border-white/8 bg-white/[0.02] px-2.5 py-2">
      <dt className="text-[0.58rem] uppercase tracking-[0.12em] text-[#8A8674]">{label}</dt>
      <dd className="mt-1 font-serif tabular-nums text-[#EDE8D9]" style={{ color: accent }}>
        {value}
      </dd>
    </div>
  );
}
