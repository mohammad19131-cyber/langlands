import type { Project } from "@langlands/sim/public";
import { SECTOR_LABELS } from "../../lib/format";

const FIELD_LABELS: Record<string, string> = {
  air: "Air",
  water_q: "Water",
  soil: "Soil",
  bio: "Biodiversity",
  pollution: "Pollution",
  health: "Health",
  services: "Services",
  jobs: "Jobs",
  economy: "Economy",
  fiscal: "Fiscal",
  energy: "Energy",
  infra: "Infrastructure",
  prep: "Preparedness",
  buffer: "Buffer",
  dirty_energy: "Thermal energy",
  green_energy: "Clean energy",
  intensive_ag: "Intensive farming",
  regenerative_ag: "Regen. farming",
  industrial_intensity: "Industrial load",
};

const LOWER_IS_BETTER = new Set(["pollution", "dirty_energy", "intensive_ag", "industrial_intensity"]);

function effectTone(field: string, delta: number): string {
  if (delta === 0) return "#55635A";
  const improves = LOWER_IS_BETTER.has(field) ? delta < 0 : delta > 0;
  return improves ? "#4E6B3E" : "#9C5A3B";
}

function EffectChip({ field, delta }: { field: string; delta: number }) {
  const color = effectTone(field, delta);
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="inline-flex items-center gap-1 border border-line bg-ivory px-1.5 py-0.5 font-sans text-[0.72rem] text-ink">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {FIELD_LABELS[field] ?? field}
      <span className="tabular-nums" style={{ color }}>
        {sign}
        {delta}
      </span>
    </span>
  );
}

function EffectRow({ label, record }: { label: string; record: Record<string, number> }) {
  const entries = Object.entries(record);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[4.5rem] shrink-0 font-sans text-[0.68rem] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      {entries.map(([field, delta]) => (
        <EffectChip key={field} field={field} delta={delta} />
      ))}
    </div>
  );
}

export function ProjectTile({ project }: { project: Project }) {
  const delayedKeys = Object.keys(project.delayed)
    .map(Number)
    .sort((a, b) => a - b);
  const eventMult = Object.entries(project.eventMult);

  return (
    <article className="group flex flex-col border border-line bg-ivory-raised shadow-panel transition-shadow duration-200 ease-editorial hover:shadow-raised">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
        <div>
          <span className="eyebrow text-gold-deep">{SECTOR_LABELS[project.sector]}</span>
          <h3 className="mt-1.5 font-serif text-lg leading-tight text-ink">{project.name}</h3>
        </div>
        <span className="shrink-0 border border-line px-1.5 py-0.5 font-sans text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint">
          {project.code}
        </span>
      </header>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <Spec label="Cost" value={`${project.cost}`} unit="cr" />
        <Spec label="Build" value={project.buildRounds === 0 ? "Now" : `T+${project.buildRounds}`} />
        <Spec label="Upkeep" value={project.maintenance === 0 ? "—" : `${project.maintenance}`} unit={project.maintenance ? "cr/rd" : ""} />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-5 py-4">
        <EffectRow label="Now" record={project.immediate} />
        {delayedKeys.map((lag) => (
          <EffectRow key={lag} label={`T+${lag}`} record={project.delayed[lag]} />
        ))}
        <EffectRow label="Ongoing" record={project.ongoing} />
        {eventMult.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[4.5rem] shrink-0 font-sans text-[0.68rem] uppercase tracking-[0.1em] text-ink-faint">
              Shields
            </span>
            {eventMult.map(([event, mult]) => (
              <span key={event} className="inline-flex items-center gap-1 border border-state-water/40 bg-state-water/10 px-1.5 py-0.5 font-sans text-[0.72rem] text-state-water">
                {event} ×{mult}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {(project.prerequisites.length > 0 || project.mutexGroup) ? (
        <footer className="border-t border-line px-5 py-2.5 font-sans text-[0.74rem] text-ink-muted">
          {project.prerequisites.length > 0 ? (
            <span>Requires {project.prerequisites.join(", ")}. </span>
          ) : null}
          {project.mutexGroup ? <span>Mutex · {project.mutexGroup}.</span> : null}
        </footer>
      ) : null}
    </article>
  );
}

function Spec({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="font-sans text-[0.66rem] uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="mt-0.5 font-serif text-base tabular-nums text-ink">
        {value}
        {unit ? <span className="ml-0.5 text-[0.7rem] text-ink-faint">{unit}</span> : null}
      </p>
    </div>
  );
}
