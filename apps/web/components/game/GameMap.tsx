"use client";

import { useId } from "react";
import type { TownView } from "../../lib/ashfen";
import {
  DISTRICTS,
  PLATES,
  clamp01,
  districtSignal,
  mixHex,
  type DistrictId,
  type Plate,
} from "../map/town-geometry";

const SIGNAL_STROKE: Record<string, string> = {
  critical: "#C0533E",
  strained: "#C07A43",
  fair: "#C7A954",
  strong: "#7BA157",
};

const MARKET_Y = 268;
const HIGH_X = 530;
const RIVER =
  "M 360,32 C 360,160 360,280 360,400 C 360,500 360,580 430,620 C 560,655 720,630 820,568";

/**
 * Ashfen as a planned river town. Districts sit on a shared street grid so
 * the map reads as one place. Terrain colour still follows public indicators;
 * clicks use the same plates drawn here.
 */
export function GameMap({
  town,
  hovered,
  onHover,
  selected,
  onSelect,
  targets = [],
}: {
  town: TownView;
  hovered: DistrictId | null;
  onHover: (id: DistrictId | null) => void;
  selected: DistrictId | null;
  onSelect: (id: DistrictId) => void;
  targets?: DistrictId[];
}) {
  const uid = useId().replace(/:/g, "");
  const i = town.indicators;

  const haze = clamp01((i.pollution / 100) * 0.28 + ((100 - i.air) / 100) * 0.12);
  const riverColor = mixHex("#1D3C47", "#2F7E8A", i.water_q / 100);
  const riverLight = mixHex(riverColor, "#CDEAEF", 0.22);
  const riverBank = mixHex("#16303A", "#215058", i.water_q / 100);
  const seaColor = mixHex("#122834", "#215862", i.water_q / 100);
  const wet = clamp01((i.buffer + i.bio) / 200);
  const canopy = mixHex("#3F4428", "#2E5231", i.bio / 100);
  const farmA = mixHex("#5A4F2E", "#728141", i.soil / 100);
  const farmB = mixHex("#50472A", "#637235", i.soil / 100);
  const plume = clamp01((i.pollution / 100) * 0.7 + i.economy / 320);
  const clinic = clamp01(i.health / 100);
  const litWindow = clamp01((i.energy + i.services) / 200);
  const breach = clamp01(1 - (i.prep + i.infra) / 200);
  const dry = clamp01((100 - i.soil) / 110);
  const gridGlow = mixHex("#B24A38", "#7BA157", i.energy / 100);

  const hills = PLATES.hills;
  const farms = PLATES.farms;
  const civic = PLATES.civic;
  const industry = PLATES.industry;
  const wetlands = PLATES.wetlands;
  const homes = PLATES.neighbourhoods;
  const grid = PLATES.grid;
  const harbour = PLATES.harbour;

  const trees = staggeredTrees(hills, canopy);
  const plots = farmPlots(farms, farmA, farmB);
  const houses = terraceHouses(homes, litWindow);
  const reeds = wetlandReeds(wetlands, wet);

  return (
    <svg
      viewBox="0 0 1040 720"
      className="h-full w-full select-none"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`Strategic map of Ashfen — ${town.label}`}
    >
      <defs>
        <radialGradient id={`${uid}-void`} cx="50%" cy="40%" r="78%">
          <stop offset="0%" stopColor="#15241C" />
          <stop offset="70%" stopColor="#0C1512" />
          <stop offset="100%" stopColor="#070A09" />
        </radialGradient>
        <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3024" />
          <stop offset="100%" stopColor="#15241B" />
        </linearGradient>
        <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={mixHex(seaColor, "#000000", 0.08)} />
          <stop offset="100%" stopColor={mixHex(seaColor, "#000000", 0.35)} />
        </linearGradient>
        <linearGradient id={`${uid}-river`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={riverLight} />
          <stop offset="100%" stopColor={riverColor} />
        </linearGradient>
        <radialGradient id={`${uid}-haze`} cx="78%" cy="28%" r="55%">
          <stop offset="0%" stopColor="#7A6238" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#5A5340" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#4A4738" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="0" y="0" width="1040" height="720" fill={`url(#${uid}-void)`} />

      {/* Sea, south-east */}
      <path
        d="M700,720 L1040,720 L1040,500 C940,530 840,560 736,600 C720,640 710,690 700,720 Z"
        fill={`url(#${uid}-sea)`}
      />
      {[0, 1, 2, 3, 4].map((k) => (
        <path
          key={`wave${k}`}
          d={`M${760 + (k % 2) * 24},${540 + k * 22} q20,-5 40,0 t40,0`}
          fill="none"
          stroke="#CDEAEF"
          strokeOpacity={0.06 + (i.water_q / 100) * 0.06}
          strokeWidth="1.4"
        />
      ))}

      {/* Landmass — follows the planned plates */}
      <path
        d="M32,48 H1008 V520 C930,548 840,580 736,612 V688 H40 V124 Z"
        fill={`url(#${uid}-ground)`}
        stroke="#070C09"
        strokeWidth="2"
      />

      {/* Beacon Hills */}
      <PlateFill plate={hills} fill={mixHex("#1C2A20", canopy, 0.45)} />
      {trees.map((t) => (
        <g key={t.key} transform={`translate(${t.x} ${t.y})`}>
          <ellipse cx="0" cy="11" rx="6" ry="2" fill="#070C09" opacity="0.35" />
          <path d="M-6,10 L0,-12 L6,10 Z" fill={t.tone} />
          <path d="M-4,4 L0,-12 L4,4 Z" fill={mixHex(t.tone, "#C5D8B0", 0.2)} opacity="0.55" />
          <rect x="-1" y="10" width="2" height="5" fill="#2C2214" />
        </g>
      ))}

      {/* West Fields */}
      <PlateFill plate={farms} fill="#24301C" />
      {plots.map((p) => (
        <g key={p.key}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.c} stroke="#0B140E" strokeOpacity="0.35" />
          {Array.from({ length: Math.floor(p.h / 10) }, (_, r) => (
            <line
              key={r}
              x1={p.x + 6}
              y1={p.y + 8 + r * 10}
              x2={p.x + p.w - 6}
              y2={p.y + 8 + r * 10}
              stroke={mixHex(p.c, "#0B140E", 0.4)}
              strokeWidth="1.2"
            />
          ))}
        </g>
      ))}
      <g transform={`translate(${farms.x + 14} ${farms.y + 14})`}>
        <rect x="0" y="8" width="36" height="20" fill="#5A3A2C" stroke="#0B140E" strokeOpacity="0.45" />
        <path d="M0,8 L18,-2 L36,8 Z" fill="#6E4636" />
        <rect x="42" y="2" width="12" height="26" rx="6" fill="#7A7158" />
      </g>
      {dry > 0.45
        ? plots.slice(0, 3).map((p) => (
            <ellipse
              key={`dry${p.key}`}
              cx={p.x + p.w / 2}
              cy={p.y + p.h / 2}
              rx="22"
              ry="10"
              fill="#6E5330"
              opacity={0.28 + dry * 0.3}
            />
          ))
        : null}

      {/* Civic Quarter */}
      <PlateFill plate={civic} fill="#2C3128" />
      <rect x={civic.x + 8} y={MARKET_Y - 5} width={civic.w - 16} height="10" fill="#3A3E34" />
      <rect x={HIGH_X - 5} y={civic.y + 8} width="10" height={civic.h - 16} fill="#3A3E34" />
      <circle cx={HIGH_X} cy={MARKET_Y} r="28" fill="#3A3D30" stroke="#0B140E" strokeOpacity="0.4" />
      <circle cx={HIGH_X} cy={MARKET_Y} r="3.5" fill="#B99A54" />
      {/* town hall */}
      <g transform={`translate(${civic.x + 36} ${civic.y + 36})`}>
        <rect x="0" y="18" width="64" height="40" fill="#49432F" stroke="#0B140E" strokeOpacity="0.45" />
        <path d="M0,18 L32,2 L64,18 Z" fill="#5E5538" />
        <rect x="26" y="0" width="12" height="20" fill="#554D33" />
        <circle cx="32" cy="8" r="3" fill="#D9B15A" />
      </g>
      {/* school */}
      <g transform={`translate(${civic.x + 118} ${civic.y + 48})`}>
        <rect x="0" y="0" width="72" height="28" fill="#3E4433" stroke="#0B140E" strokeOpacity="0.45" />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={8 + k * 15} y="8" width="8" height="10" fill={clinic > 0.4 ? "#C9B46A" : "#22261C"} />
        ))}
      </g>
      {/* clinic */}
      <g transform={`translate(${civic.x + 126} ${civic.y + 168})`}>
        <rect x="0" y="0" width="52" height="48" fill="#3E3A2C" stroke="#0B140E" strokeOpacity="0.45" />
        <rect x="22" y="10" width="8" height="28" fill={mixHex("#B24A38", "#7BA157", clinic)} />
        <rect x="12" y="20" width="28" height="8" fill={mixHex("#B24A38", "#7BA157", clinic)} />
        <circle
          cx="26"
          cy="24"
          r="28"
          fill={mixHex("#B24A38", "#7BA157", clinic)}
          opacity={0.08 + clinic * 0.14}
          filter={`url(#${uid}-soft)`}
        />
      </g>
      {[0, 1, 2, 3].map((k) => (
        <circle
          key={`ct${k}`}
          cx={civic.x + 22 + (k % 2) * (civic.w - 44)}
          cy={civic.y + 88 + Math.floor(k / 2) * 90}
          r="6"
          fill={canopy}
        />
      ))}

      {/* Ironworks */}
      <PlateFill plate={industry} fill="#1F1F1C" />
      {[0, 1, 2].map((k) => {
        const x = industry.x + 18 + k * 90;
        const y = industry.y + 44;
        return (
          <g key={`shed${k}`}>
            <rect x={x} y={y} width="78" height="88" fill="#17171A" stroke="#070C09" strokeOpacity="0.5" />
            {[0, 1, 2, 3].map((r) => (
              <path key={r} d={`M${x + r * 19},${y} l9.5,-7 l9.5,7`} fill="none" stroke="#2E2E30" strokeWidth="2" />
            ))}
            <rect x={x + 34} y={industry.y + 22} width="10" height={y - industry.y - 22} fill="#15151A" />
            <rect x={x + 34} y={industry.y + 22} width="10" height="5" fill="#B24A38" opacity="0.75" />
            <path
              d={`M${x + 39},${industry.y + 22} C${x + 18},${industry.y + 2} ${x + 58},${industry.y - 14} ${x + 36},${industry.y - 32}`}
              fill="none"
              stroke="#8A7E64"
              strokeWidth={8 - k}
              strokeLinecap="round"
              opacity={plume * (1 - k * 0.18)}
              filter={`url(#${uid}-soft)`}
            />
          </g>
        );
      })}
      {[0, 1, 2].map((k) => (
        <g key={`tank${k}`} transform={`translate(${industry.x + 18 + k * 28} ${industry.y + 36})`}>
          <ellipse cx="10" cy="3" rx="10" ry="3" fill="#3A3A36" />
          <rect x="0" y="3" width="20" height="22" fill="#2C2C2A" stroke="#070C09" strokeOpacity="0.4" />
        </g>
      ))}

      {/* Southbank Terraces */}
      <PlateFill plate={homes} fill="#262A30" />
      <rect
        x={homes.x + 12}
        y={homes.y + homes.h - 52}
        width="72"
        height="36"
        rx="2"
        fill={mixHex("#2A3A2B", "#35582F", i.bio / 100)}
      />
      {houses.map((h) => (
        <g key={h.key}>
          <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="#343A44" stroke="#0B140E" strokeOpacity="0.4" />
          <rect x={h.x} y={h.y - 4} width={h.w} height="5" fill="#2A3228" />
          <rect x={h.x + 6} y={h.y + 7} width="5" height="5" fill={h.lit ? "#E6C06A" : "#1A1E22"} />
          <rect x={h.x + h.w - 11} y={h.y + 7} width="5" height="5" fill={h.lit ? "#E6C06A" : "#1A1E22"} />
        </g>
      ))}

      {/* Marrow Wetlands */}
      <PlateFill plate={wetlands} fill={mixHex("#2E3A24", "#345E3B", wet)} />
      {reeds.map((r) => (
        <g key={r.key}>
          <line x1={r.x} y1={r.y} x2={r.x} y2={r.y - r.h} stroke={mixHex("#4A5330", "#3F5A30", wet)} strokeWidth="1.7" />
          <circle cx={r.x} cy={r.y - r.h} r="1.4" fill="#C9C06A" opacity="0.7" />
        </g>
      ))}
      {[0, 1].map((k) => (
        <ellipse
          key={`pool${k}`}
          cx={wetlands.x + 40 + k * 48}
          cy={wetlands.y + 70 + k * 18}
          rx="18"
          ry="8"
          fill={riverColor}
          opacity="0.65"
        />
      ))}

      {/* The Grid */}
      <PlateFill plate={grid} fill="#1C2228" />
      <rect x={grid.x + 16} y={grid.y + 56} width="44" height="44" fill="#14171C" stroke="#070C09" strokeOpacity="0.5" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect
          key={`sol${k}`}
          x={grid.x + 72 + (k % 3) * 22}
          y={grid.y + 92 + Math.floor(k / 3) * 16}
          width="18"
          height="12"
          fill={mixHex("#1B2A3A", "#3E6EA0", i.energy / 100)}
          stroke="#0B140E"
          strokeOpacity="0.4"
        />
      ))}
      {[0, 1, 2].map((k) => {
        const x = grid.x + 78 + k * 18;
        return (
          <g key={`py${k}`} stroke={gridGlow} strokeWidth="2" fill="none">
            <path d={`M${x},${grid.y + 78} L${x - 7},${grid.y + 44} L${x + 7},${grid.y + 44} Z`} />
            <line x1={x} y1={grid.y + 44} x2={x} y2={grid.y + 78} />
          </g>
        );
      })}
      {[grid.x + 28, grid.x + grid.w - 22].map((x, k) => (
        <g key={`wt${k}`} transform={`translate(${x} ${grid.y + 28})`}>
          <line x1="0" y1="0" x2="0" y2="28" stroke="#C7C6BE" strokeWidth="2.2" />
          <g stroke="#D7D6CE" strokeWidth="1.8" fill="none">
            <line x1="0" y1="0" x2="0" y2="-12" />
            <line x1="0" y1="0" x2="11" y2="6" />
            <line x1="0" y1="0" x2="-11" y2="6" />
          </g>
          <circle cx="0" cy="0" r="2" fill="#E7E6DE" />
        </g>
      ))}

      {/* Estuary Harbour */}
      <PlateFill plate={harbour} fill={mixHex("#163038", "#2A6670", i.water_q / 100)} />
      <rect x={harbour.x} y={harbour.y} width={harbour.w} height="12" fill="#3A3528" />
      {[0, 1, 2, 3].map((k) => (
        <rect key={`pier${k}`} x={harbour.x + 28 + k * 58} y={harbour.y + 12} width="12" height="52" fill="#2C2719" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect
          key={`box${k}`}
          x={harbour.x + 16 + (k % 3) * 24}
          y={harbour.y + 18 + Math.floor(k / 3) * 13}
          width="20"
          height="11"
          fill={["#6E4636", "#3E5A4A", "#5A5230"][k % 3]}
        />
      ))}
      <g stroke="#B24A38" strokeOpacity="0.85" strokeWidth="3" fill="none">
        <line x1={harbour.x + 200} y1={harbour.y + 72} x2={harbour.x + 200} y2={harbour.y + 18} />
        <line x1={harbour.x + 200} y1={harbour.y + 22} x2={harbour.x + 244} y2={harbour.y + 30} />
      </g>
      <path
        d={`M${harbour.x + 80},${harbour.y + 72} l34,0 l-6,12 l-22,0 z`}
        fill="#303A30"
      />
      <path
        d={`M${harbour.x + 150},${harbour.y + 84} l28,0 l-5,10 l-18,0 z`}
        fill="#3A3528"
      />

      {/* River Ashe */}
      <path d={RIVER} fill="none" stroke={riverBank} strokeWidth="44" strokeLinecap="round" />
      <path d={RIVER} fill="none" stroke={`url(#${uid}-river)`} strokeWidth="28" strokeLinecap="round" />
      {i.pollution > 52 ? (
        <path
          d="M 360,250 C 360,320 380,380 430,430"
          fill="none"
          stroke="#5A4A28"
          strokeWidth="22"
          strokeLinecap="round"
          opacity={clamp01((i.pollution - 40) / 95)}
        />
      ) : null}

      {/* Roads — Market Street, High Street, Quay Road */}
      <g stroke="#4A4E44" strokeWidth="9" fill="none" strokeLinecap="square">
        <path d={`M ${farms.x} ${MARKET_Y} H ${industry.x + industry.w}`} />
        <path d={`M ${HIGH_X} ${civic.y} V ${homes.y + homes.h}`} />
        <path d={`M ${HIGH_X} ${homes.y + homes.h} V 630 H ${harbour.x}`} />
        <path d={`M ${industry.x + industry.w / 2} ${industry.y + industry.h} V ${grid.y}`} />
      </g>
      <g stroke="#8E9070" strokeWidth="1.3" fill="none" strokeDasharray="3 8" strokeLinecap="square">
        <path d={`M ${farms.x} ${MARKET_Y} H ${industry.x + industry.w}`} />
        <path d={`M ${HIGH_X} ${civic.y} V ${homes.y + homes.h}`} />
      </g>

      {/* Bridges where Market Street and the south road cross the river */}
      <rect x="336" y={MARKET_Y - 8} width="48" height="16" fill="#6B6450" stroke="#0B140E" strokeOpacity="0.4" />
      <rect x="400" y="612" width="48" height="16" fill="#6B6450" stroke="#0B140E" strokeOpacity="0.4" />

      {breach > 0.34 ? (
        <g>
          <path
            d="M 424,620 l-10,-14 l12,-6 l-8,-12"
            fill="none"
            stroke="#C0533E"
            strokeWidth={2 + breach * 3}
            strokeLinecap="round"
          />
          <circle cx="422" cy="614" r={8 + breach * 8} fill="#C0533E" opacity={0.1 + breach * 0.12} filter={`url(#${uid}-soft)`} />
        </g>
      ) : null}

      <rect x="0" y="0" width="1040" height="720" fill={`url(#${uid}-haze)`} opacity={haze} pointerEvents="none" />

      {/* Labels */}
      <g fontFamily="var(--font-sans), system-ui" pointerEvents="none">
        {DISTRICTS.filter((d) => d.id !== "river").map((d) => {
          const on = hovered === d.id || selected === d.id;
          return (
            <text
              key={d.id}
              x={d.label.x}
              y={d.label.y}
              fontSize="11.5"
              letterSpacing="1.5"
              fill={on ? "#F4EEDE" : "#C9C3B0"}
              fillOpacity={on ? 1 : 0.82}
              style={{
                textTransform: "uppercase",
                fontWeight: on ? 600 : 500,
                paintOrder: "stroke",
                stroke: "#070C09",
                strokeWidth: 3.4,
                strokeLinejoin: "round",
              }}
            >
              {d.mapLabel ?? d.name}
            </text>
          );
        })}
        <text
          x="318"
          y="210"
          fontSize="11"
          letterSpacing="2.2"
          fill="#8FC9D0"
          transform="rotate(90 318 210)"
          style={{ textTransform: "uppercase", paintOrder: "stroke", stroke: "#070C09", strokeWidth: 3.2 }}
        >
          River Ashe
        </text>
      </g>

      {/* Hotspots */}
      <g>
        {[...DISTRICTS.filter((d) => d.id === "river"), ...DISTRICTS.filter((d) => d.id !== "river")].map((d) => {
          const sig = districtSignal(d, town);
          const isHover = hovered === d.id;
          const isSelected = selected === d.id;
          const isTarget = targets.includes(d.id);
          const emphasised = isHover || isSelected;
          const stroke = isSelected ? "#E6BD62" : isTarget ? "#C7A954" : SIGNAL_STROKE[sig.tone];
          const fillOpacity = isSelected ? 0.18 : isHover ? 0.1 : isTarget ? 0.07 : 0;
          const strokeWidth = isSelected ? 3 : emphasised ? 2.2 : isTarget ? 1.8 : 0;
          return (
            <polygon
              key={d.id}
              points={d.hotspot}
              className={isTarget && !isSelected ? "map-target" : undefined}
              fill={isSelected ? "#E6BD62" : isTarget ? "#C7A954" : "#F2ECDC"}
              fillOpacity={fillOpacity}
              stroke={strokeWidth > 0 ? stroke : "transparent"}
              strokeWidth={strokeWidth}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${d.name}: ${sig.label}. ${d.blurb}`}
              style={{ cursor: "pointer", outline: "none" }}
              onMouseEnter={() => onHover(d.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(d.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(d.id);
                }
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}

function PlateFill({ plate, fill }: { plate: Plate; fill: string }) {
  return (
    <rect
      x={plate.x}
      y={plate.y}
      width={plate.w}
      height={plate.h}
      rx="3"
      fill={fill}
      stroke="#070C09"
      strokeOpacity="0.45"
    />
  );
}

function staggeredTrees(hills: Plate, canopy: string) {
  const out: { key: string; x: number; y: number; tone: string }[] = [];
  const rows = 3;
  const cols = 18;
  const padX = 28;
  const padY = 22;
  const gapX = (hills.w - padX * 2) / (cols - 1);
  const gapY = (hills.h - padY * 2) / (rows - 1);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === 0 && (col < 1 || col > cols - 2)) continue;
      out.push({
        key: `t${row}-${col}`,
        x: hills.x + padX + col * gapX + (row % 2 === 1 ? gapX / 2 : 0),
        y: hills.y + padY + row * gapY,
        tone: row === 1 ? mixHex(canopy, "#1A2818", 0.2) : canopy,
      });
    }
  }
  return out;
}

function farmPlots(farms: Plate, a: string, b: string) {
  const cols = 2;
  const rows = 3;
  const lane = 10;
  const inset = 12;
  const road = 20;
  const usable = farms.h - inset * 2 - 36 - lane * (rows - 1) - road;
  const plotW = (farms.w - inset * 2 - lane * (cols - 1)) / cols;
  const plotH = usable / rows;
  const originY = farms.y + inset + 36;
  const plots: { key: string; x: number; y: number; w: number; h: number; c: string }[] = [];
  for (let r = 0; r < rows; r++) {
    const roadSkip = r >= 1 ? road : 0;
    for (let c = 0; c < cols; c++) {
      plots.push({
        key: `p${r}-${c}`,
        x: farms.x + inset + c * (plotW + lane),
        y: originY + r * (plotH + lane) + roadSkip,
        w: plotW,
        h: plotH,
        c: (r + c) % 2 === 0 ? a : b,
      });
    }
  }
  return plots;
}

function terraceHouses(homes: Plate, litWindow: number) {
  const houseW = 32;
  const houseH = 22;
  const gapX = 10;
  const street = 16;
  const pad = 18;
  const cols = 6;
  const rows = 4;
  const houses: { key: string; x: number; y: number; w: number; h: number; lit: boolean }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === rows - 1 && c < 2) continue;
      houses.push({
        key: `h${r}-${c}`,
        x: homes.x + pad + c * (houseW + gapX),
        y: homes.y + 28 + r * (houseH + street),
        w: houseW,
        h: houseH,
        lit: (r + c) % 3 !== 0 && litWindow > 0.35,
      });
    }
  }
  return houses;
}

function wetlandReeds(wetlands: Plate, wet: number) {
  const cols = 5;
  const rows = 4;
  const reeds: { key: string; x: number; y: number; h: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      reeds.push({
        key: `rd${r}-${c}`,
        x: wetlands.x + 18 + c * 22 + (r % 2) * 8,
        y: wetlands.y + 36 + r * 24,
        h: 8 + ((r + c) % 3) * 3 + Math.round(wet * 4),
      });
    }
  }
  return reeds;
}
