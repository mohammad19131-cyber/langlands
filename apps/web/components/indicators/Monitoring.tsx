import {
  INDICATORS,
  PILLARS,
  TOWN_T0,
  healthValue,
  type IndicatorKey,
  type IndicatorMeta,
  type TownView,
} from "../../lib/ashfen";
import { Meter } from "../ui/Meter";

const GROUPS: IndicatorMeta["group"][] = ["Environment", "People", "Economy", "Resilience"];

/**
 * The environmental monitoring panel. Indicators are grouped into systems and
 * rendered as calibrated meters — a coherent instrument, not a wall of cards.
 */
export function IndicatorPanel({ town = TOWN_T0 }: { town?: TownView }) {
  return (
    <div className="grid gap-px overflow-hidden border border-line bg-line shadow-panel md:grid-cols-2">
      {GROUPS.map((group) => {
        const rows = INDICATORS.filter((m) => m.group === group);
        return (
          <section key={group} className="bg-ivory-raised p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-lg text-ink">{group}</h3>
              <span className="eyebrow text-ink-faint">{rows.length} indicators</span>
            </div>
            <div className="mt-4 space-y-4">
              {rows.map((m) => (
                <Meter
                  key={m.key}
                  label={m.label}
                  value={town.indicators[m.key]}
                  health={healthValue(m, town.indicators[m.key])}
                  hint={m.higherIsBetter ? undefined : "load"}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function pillarIndex(members: IndicatorKey[], town: TownView): number | null {
  if (members.length === 0) return null;
  const vals = members.map((k) => healthValue(INDICATORS.find((m) => m.key === k)!, town.indicators[k]));
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * The five scored pillars. The weight is the headline — this is how the judges
 * read the town. A starting index is shown where the template fully defines it.
 */
export function PillarRail({ town = TOWN_T0 }: { town?: TownView }) {
  return (
    <div className="grid gap-px overflow-hidden border border-line bg-line shadow-panel sm:grid-cols-2 lg:grid-cols-5">
      {PILLARS.map((p) => {
        const idx = pillarIndex(p.members, town);
        return (
          <article key={p.key} className="flex flex-col bg-ivory-raised p-5">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow text-gold-deep">{p.name.split(" ")[0]}</span>
              <span className="font-serif text-2xl tabular-nums text-ink">
                {Math.round(p.weight * 100)}
                <span className="text-sm text-ink-faint">/100</span>
              </span>
            </div>
            <h3 className="mt-3 font-serif text-base leading-snug text-ink">{p.name}</h3>
            <p className="mt-2 flex-1 font-sans text-[0.82rem] leading-5 text-ink-muted">{p.blurb}</p>
            <p className="mt-3 border-t border-line pt-2 font-sans text-[0.72rem] leading-4 text-ink-faint">
              {p.formula}
            </p>
            <p className="mt-2 font-sans text-[0.72rem] text-ink-muted">
              {idx === null ? (
                <span className="text-ink-faint">Set during play</span>
              ) : (
                <>
                  Round 0 index <span className="tabular-nums text-ink">{idx}</span>
                </>
              )}
            </p>
          </article>
        );
      })}
    </div>
  );
}
