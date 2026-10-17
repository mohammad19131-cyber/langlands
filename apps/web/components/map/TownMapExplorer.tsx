"use client";

import { useState } from "react";
import {
  INDICATORS,
  TOWN_T0,
  healthBand,
  healthValue,
  type IndicatorKey,
  type TownView,
} from "../../lib/ashfen";
import { StatusChip, StatusDot } from "../ui/Status";
import { DISTRICTS, districtSignal, type DistrictId } from "./town-geometry";
import { TownMap } from "./TownMap";

const BADGE_COPY: Record<string, string> = {
  "thermal-heavy": "Thermal-heavy",
  mixed: "Mixed",
  "clean-leaning": "Clean-leaning",
  intensive: "Intensive",
  regenerative: "Regenerative",
  light: "Light",
  heavy: "Heavy",
};

const TONE_MAP = { critical: "danger", strained: "gold", fair: "gold", strong: "live" } as const;

function MiniMeter({ k, town }: { k: IndicatorKey; town: TownView }) {
  const meta = INDICATORS.find((m) => m.key === k)!;
  const raw = town.indicators[k];
  const health = healthValue(meta, raw);
  const band = healthBand(health);
  const color = { critical: "#9B3B2E", strained: "#9C5A3B", fair: "#B89A60", strong: "#5E7A48" }[band];
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-sans text-[0.82rem] text-ink-muted">{meta.label}</span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-[1px] bg-ivory-sunk">
          <span className="block h-full rounded-[1px]" style={{ width: `${Math.max(3, health)}%`, backgroundColor: color }} />
        </span>
        <span className="w-6 text-right font-sans text-[0.82rem] tabular-nums text-ink">{Math.round(raw)}</span>
      </span>
    </div>
  );
}

export function TownMapExplorer({
  town = TOWN_T0,
  caption,
}: {
  town?: TownView;
  caption?: string;
}) {
  const [active, setActive] = useState<DistrictId | null>(null);
  const [showTable, setShowTable] = useState(false);
  const activeDistrict = DISTRICTS.find((d) => d.id === active) ?? null;

  return (
    <div className="panel overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.65fr_1fr]">
        {/* Map plate */}
        <div className="relative border-b border-line bg-ivory-sunk/40 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
            <p className="eyebrow">Ashfen · municipal survey</p>
            <StatusChip tone="wait">{town.label}</StatusChip>
          </div>
          <div className="p-4 md:p-6">
            <TownMap town={town} active={active} onActivate={setActive} />
          </div>
          <MapLegend />
        </div>

        {/* Readout */}
        <div className="flex flex-col">
          <div className="flex-1 p-5 md:p-6">
            {activeDistrict ? (
              <ActiveReadout districtId={activeDistrict.id} town={town} />
            ) : (
              <DefaultReadout town={town} />
            )}
          </div>

          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              className="flex w-full items-center justify-between px-5 py-3 font-sans text-sm text-ink-muted transition-colors hover:bg-ivory-sunk"
            >
              <span>Indicator table {showTable ? "—" : "+"}</span>
              <span className="text-[0.7rem] uppercase tracking-[0.14em] text-ink-faint">accessible view</span>
            </button>
            {showTable ? <IndicatorTable town={town} /> : null}
          </div>
        </div>
      </div>
      {caption ? (
        <p className="border-t border-line bg-ivory-sunk/50 px-5 py-2.5 font-sans text-[0.78rem] text-ink-muted">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function DefaultReadout({ town }: { town: TownView }) {
  return (
    <div className="animate-fade-rise">
      <p className="eyebrow">The subject</p>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-ink">Ashfen, a town in recovery</h3>
      <p className="mt-3 font-sans text-sm leading-6 text-ink-muted">
        A former industrial river town, left polluted and under-prepared after the disaster. Hover
        or focus a district to read how its condition is drawn from the public indicators.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-line py-4">
        <div>
          <dt className="eyebrow text-ink-faint">Population</dt>
          <dd className="mt-1 font-serif text-xl tabular-nums text-ink">{town.population.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="eyebrow text-ink-faint">Reserve</dt>
          <dd className="mt-1 font-serif text-xl tabular-nums text-ink">{town.reserve} cr</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        <p className="eyebrow text-ink-faint">Character</p>
        <div className="flex flex-wrap gap-2">
          <span className="tag">Energy · {BADGE_COPY[town.badges.energyMix]}</span>
          <span className="tag">Farming · {BADGE_COPY[town.badges.agriculture]}</span>
          <span className="tag">Industry · {BADGE_COPY[town.badges.industry]}</span>
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <p className="eyebrow text-ink-faint">District conditions</p>
        {DISTRICTS.filter((d) => d.id !== "river").map((d) => {
          const sig = districtSignal(d, town);
          return (
            <div key={d.id} className="flex items-center justify-between py-0.5">
              <span className="font-sans text-[0.82rem] text-ink-muted">{d.name}</span>
              <span className="flex items-center gap-2 font-sans text-[0.78rem] text-ink">
                <StatusDot tone={TONE_MAP[sig.tone]} />
                {sig.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveReadout({ districtId, town }: { districtId: DistrictId; town: TownView }) {
  const district = DISTRICTS.find((d) => d.id === districtId)!;
  const sig = districtSignal(district, town);
  return (
    <div className="animate-fade-rise">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">District</p>
        <StatusChip tone={TONE_MAP[sig.tone]}>{sig.label}</StatusChip>
      </div>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-ink">{district.name}</h3>
      <p className="mt-3 font-sans text-sm leading-6 text-ink-muted">{district.blurb}</p>
      <div className="mt-5 border-t border-line pt-4">
        <p className="eyebrow text-ink-faint">Driven by</p>
        <div className="mt-2 divide-y divide-line/60">
          {district.drivers.map((k) => (
            <MiniMeter key={k} k={k} town={town} />
          ))}
        </div>
      </div>
      <p className="mt-5 font-sans text-[0.78rem] leading-5 text-ink-faint">
        The map is a reading of public fields only. It never spends credits and never runs the
        simulation.
      </p>
    </div>
  );
}

function IndicatorTable({ town }: { town: TownView }) {
  return (
    <div className="max-h-72 overflow-y-auto border-t border-line">
      <table className="w-full border-collapse text-left font-sans text-[0.8rem]">
        <caption className="sr-only">Ashfen indicators, {town.label}</caption>
        <thead>
          <tr className="sticky top-0 bg-ivory-raised text-[0.68rem] uppercase tracking-[0.12em] text-gold-deep">
            <th scope="col" className="px-5 py-2 font-normal">Indicator</th>
            <th scope="col" className="px-2 py-2 text-right font-normal">Value</th>
            <th scope="col" className="px-5 py-2 text-right font-normal">Reading</th>
          </tr>
        </thead>
        <tbody>
          {INDICATORS.map((m) => {
            const raw = town.indicators[m.key];
            const band = healthBand(healthValue(m, raw));
            return (
              <tr key={m.key} className="border-t border-line/60">
                <td className="px-5 py-1.5 text-ink-muted">{m.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink">{Math.round(raw)}</td>
                <td className="px-5 py-1.5 text-right capitalize text-ink-muted">{band}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MapLegend() {
  const items = [
    { c: "#9C5A3B", label: "Haze · pollution & air" },
    { c: "#3E6E6A", label: "River · water quality" },
    { c: "#5E7A48", label: "Wetland · buffer & habitat" },
    { c: "#9B3B2E", label: "Breach · infra & prep" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/70 px-5 py-3">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-2 font-sans text-[0.72rem] text-ink-muted">
          <span className="h-2.5 w-2.5 rounded-[1px]" style={{ backgroundColor: it.c }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
