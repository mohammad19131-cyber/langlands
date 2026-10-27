"use client";

import type { Sector } from "@langlands/sim/public";
import type { TownView, IndicatorKey } from "../../lib/ashfen";
import { INDICATORS, healthBand, healthValue } from "../../lib/ashfen";
import { DISTRICTS, districtSignal, type DistrictId } from "../map/town-geometry";
import { sectorsForDistrict } from "./sectors";
import { playerSector } from "../../lib/game-types";

const BAND_COLOR: Record<string, string> = {
  critical: "#C0533E",
  strained: "#C07A43",
  fair: "#C7A954",
  strong: "#7BA157",
};

function Driver({ k, town }: { k: IndicatorKey; town: TownView }) {
  const meta = INDICATORS.find((m) => m.key === k)!;
  const raw = town.indicators[k];
  const health = healthValue(meta, raw);
  const color = BAND_COLOR[healthBand(health)];
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[0.76rem] text-[#A9A491]">{meta.label}</span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-20 overflow-hidden bg-white/10">
          <span className="block h-full" style={{ width: `${Math.max(3, health)}%`, backgroundColor: color }} />
        </span>
        <span className="w-6 text-right text-[0.76rem] tabular-nums text-[#E3DCC8]">{Math.round(raw)}</span>
      </span>
    </div>
  );
}

export function DistrictPanel({
  districtId,
  town,
  onClose,
  onPickSector,
}: {
  districtId: DistrictId;
  town: TownView;
  onClose: () => void;
  onPickSector: (sector: Sector) => void;
}) {
  const district = DISTRICTS.find((d) => d.id === districtId)!;
  const sig = districtSignal(district, town);
  const sectors = sectorsForDistrict(districtId);

  return (
    <div className="pointer-events-auto absolute left-4 top-4 w-72 border border-[#B89A60]/25 bg-[#0F1613]/95 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-[#B89A60]/15 px-4 py-3">
        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.16em] text-[#8A8674]">District</p>
          <h2 className="mt-1 font-serif text-lg leading-tight text-[#EDE8D9]">{district.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close district panel"
          className="text-[#8A8674] transition-colors hover:text-[#E3DCC8]"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em]"
          style={{ borderColor: `${BAND_COLOR[sig.tone]}55`, color: BAND_COLOR[sig.tone] }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BAND_COLOR[sig.tone] }} />
          {sig.label}
        </span>
        <p className="mt-3 text-[0.78rem] leading-5 text-[#A9A491]">{district.blurb}</p>

        <div className="mt-3 border-t border-[#B89A60]/12 pt-3">
          <p className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Local conditions</p>
          <div className="mt-1 divide-y divide-white/5">
            {district.drivers.map((k) => (
              <Driver key={k} k={k} town={town} />
            ))}
          </div>
        </div>

        {sectors.length ? (
          <div className="mt-3 border-t border-[#B89A60]/12 pt-3">
            <p className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Work concentrated here</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sectors.map((s) => {
                const cat = playerSector(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onPickSector(s)}
                    aria-label={cat.label}
                    className="border border-[#B89A60]/30 px-2 py-1 text-[0.7rem] text-[#D7CFB8] transition-colors hover:border-[#D9B15A] hover:bg-[#D9B15A]/10"
                  >
                    {cat.short}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-[0.64rem] leading-4 text-[#6F6B5B]">
          Interventions apply town-wide. Districts show where that effort lands and how each area is
          currently reading.
        </p>
      </div>
    </div>
  );
}
