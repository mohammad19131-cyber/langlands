"use client";

import { useId } from "react";
import type { TownView } from "../../lib/ashfen";
import {
  DISTRICTS,
  clamp01,
  districtSignal,
  mixHex,
  seeded,
  type DistrictId,
} from "./town-geometry";

const SIGNAL_STROKE: Record<string, string> = {
  critical: "#9B3B2E",
  strained: "#9C5A3B",
  fair: "#B89A60",
  strong: "#5E7A48",
};

export function TownMap({
  town,
  active,
  onActivate,
  selected = null,
  onSelect,
  targets = [],
}: {
  town: TownView;
  active: DistrictId | null;
  onActivate: (id: DistrictId | null) => void;
  selected?: DistrictId | null;
  onSelect?: (id: DistrictId) => void;
  targets?: DistrictId[];
}) {
  const uid = useId().replace(/:/g, "");
  const i = town.indicators;

  // --- State-driven derivations (pure functions of public fields) ----------
  const haze = clamp01((i.pollution / 100) * 0.34 + ((100 - i.air) / 100) * 0.16);
  const riverColor = mixHex("#8A7446", "#3E6E6A", i.water_q / 100);
  const riverBank = mixHex("#6E5E3A", "#2C534F", i.water_q / 100);
  const wet = clamp01((i.buffer + i.bio) / 200);
  const farmColor = mixHex("#BBA869", "#6E7F3E", i.soil / 100);
  const canopy = mixHex("#7C7A4A", "#3C5A33", i.bio / 100);
  const plume = clamp01((i.pollution / 100) * 0.62 + i.economy / 280);
  const clinic = clamp01(i.health / 100);
  const breach = clamp01(1 - (i.prep + i.infra) / 200);

  const rng = seeded(1987);

  // Reeds in the wetland, denser when the buffer is healthy
  const reedCount = 4 + Math.round(wet * 9);
  const reeds = Array.from({ length: reedCount }, () => ({
    x: 320 + rng() * 210,
    y: 380 + rng() * 150,
    h: 10 + rng() * 16,
  }));

  // Housing blocks — varied, never identical icons
  const houses = Array.from({ length: 24 }, (_, idx) => {
    const w = 20 + rng() * 22;
    const h = 16 + rng() * 16;
    return {
      x: 384 + (idx % 6) * 54 + rng() * 10,
      y: 460 + Math.floor(idx / 6) * 44 + rng() * 8,
      w,
      h,
      roof: rng() > 0.5 ? "#2A3129" : "#3A4035",
      lit: rng() < clinic * 0.9,
    };
  });

  // Farm furrows
  const furrows = Array.from({ length: 7 }, (_, idx) => 190 + idx * 34);

  return (
    <svg
      viewBox="0 0 1040 720"
      className="h-auto w-full select-none"
      role="group"
      aria-label={`Illustrated map of Ashfen — ${town.label}`}
    >
      <defs>
        <radialGradient id={`${uid}-haze`} cx="78%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#5E4E31" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#7C7257" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8A8470" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ECE7D7" />
          <stop offset="100%" stopColor="#E3DDC9" />
        </linearGradient>
        <linearGradient id={`${uid}-river`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={mixHex(riverColor, "#ffffff", 0.12)} />
          <stop offset="100%" stopColor={riverColor} />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* Base ground */}
      <rect x="0" y="0" width="1040" height="720" fill={`url(#${uid}-ground)`} />

      {/* Faint cartographic graticule */}
      <g stroke="#14251D" strokeOpacity="0.04" strokeWidth="1">
        {Array.from({ length: 12 }, (_, k) => (
          <line key={`v${k}`} x1={(k + 1) * 80} y1="0" x2={(k + 1) * 80} y2="720" />
        ))}
        {Array.from({ length: 8 }, (_, k) => (
          <line key={`h${k}`} x1="0" y1={(k + 1) * 80} x2="1040" y2={(k + 1) * 80} />
        ))}
      </g>

      {/* Hills with contour arcs + conifers */}
      <g>
        <path
          d="M0,0 H1040 V120 C860,150 720,96 560,120 C400,144 220,96 0,128 Z"
          fill={mixHex("#D9D7BE", canopy, 0.25)}
          stroke="#14251D"
          strokeOpacity="0.1"
        />
        {[40, 72, 104].map((y, idx) => (
          <path
            key={y}
            d={`M${20 + idx * 10},${y} C260,${y + 22} 540,${y - 14} 1020,${y + 16}`}
            fill="none"
            stroke="#14251D"
            strokeOpacity="0.09"
          />
        ))}
        {Array.from({ length: 11 }, (_, k) => {
          const x = 70 + k * 85;
          const y = 58 + (k % 3) * 16;
          return (
            <g key={k} transform={`translate(${x} ${y})`}>
              <path d="M0,10 L7,-12 L14,10 Z" fill={canopy} stroke="#14251D" strokeOpacity="0.2" />
              <rect x="6" y="10" width="2" height="6" fill="#5B4A30" />
            </g>
          );
        })}
      </g>

      {/* West fields */}
      <g>
        <path d="M44,152 L298,162 L318,428 L52,438 Z" fill={farmColor} stroke="#14251D" strokeOpacity="0.12" />
        {furrows.map((y) => (
          <line key={y} x1="56" y1={y} x2="306" y2={y + 6} stroke="#14251D" strokeOpacity="0.14" />
        ))}
        {i.soil < 45
          ? [0, 1, 2].map((k) => (
              <ellipse key={k} cx={110 + k * 70} cy={230 + k * 60} rx="26" ry="14" fill="#C9B277" opacity="0.6" />
            ))
          : null}
      </g>

      {/* River Ashe — clarity follows water quality */}
      <g>
        <path
          d="M186,36 C210,120 300,180 360,250 C430,330 520,360 560,440 C580,480 548,520 470,520"
          fill="none"
          stroke={riverBank}
          strokeWidth="42"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M186,36 C210,120 300,180 360,250 C430,330 520,360 560,440 C580,480 548,520 470,520"
          fill="none"
          stroke={`url(#${uid}-river)`}
          strokeWidth="28"
          strokeLinecap="round"
        />
        {/* ripples */}
        {[0.25, 0.5, 0.75].map((t) => (
          <circle key={t} cx={200 + t * 330} cy={60 + t * 420} r="2.2" fill="#ffffff" opacity={0.18 + (i.water_q / 100) * 0.3} />
        ))}
        {/* pollution film near the ironworks when the load is high */}
        {i.pollution > 55 ? (
          <path
            d="M360,250 C430,330 520,360 560,440"
            fill="none"
            stroke="#6E5A33"
            strokeWidth="24"
            strokeLinecap="round"
            opacity={clamp01((i.pollution - 40) / 90)}
          />
        ) : null}
      </g>

      {/* Marrow wetlands */}
      <g opacity={0.45 + wet * 0.5}>
        <path
          d="M306,366 C360,348 470,344 520,360 C560,392 556,470 520,512 C470,548 360,552 326,520 C300,480 292,410 306,366 Z"
          fill={mixHex("#8A8A54", "#4C6B3C", wet)}
          stroke="#14251D"
          strokeOpacity="0.14"
        />
        {reeds.map((r, k) => (
          <line key={k} x1={r.x} y1={r.y} x2={r.x} y2={r.y - r.h} stroke={mixHex("#8F8A4E", "#3F5A30", wet)} strokeWidth="2" />
        ))}
      </g>

      {/* Ironworks district */}
      <g>
        <path d="M664,156 L938,156 L938,342 L672,352 Z" fill="#CFC7AE" stroke="#14251D" strokeOpacity="0.12" />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={690 + k * 78} y={232 + (k % 2) * 18} width="60" height="90" fill="#3A3A32" stroke="#14251D" strokeOpacity="0.2" />
        ))}
        {/* chimneys + smoke plumes */}
        {[0, 1, 2].map((k) => {
          const cx = 712 + k * 78;
          return (
            <g key={k}>
              <rect x={cx} y="176" width="12" height="60" fill="#2A2A24" />
              <path
                d={`M${cx + 6},176 C${cx - 18},150 ${cx + 26},130 ${cx + 2},100 C${cx - 16},80 ${cx + 20},62 ${cx + 6},44`}
                fill="none"
                stroke="#6E6655"
                strokeWidth={8 - k}
                strokeLinecap="round"
                opacity={plume * (1 - k * 0.18)}
                filter={`url(#${uid}-soft)`}
              />
            </g>
          );
        })}
      </g>

      {/* The grid — substation + pylons */}
      <g>
        <path d="M824,366 L994,366 L994,512 L840,512 Z" fill="#D5CDB4" stroke="#14251D" strokeOpacity="0.12" />
        <rect x="858" y="420" width="46" height="46" fill="#3A4035" stroke="#14251D" strokeOpacity="0.25" />
        {[0, 1, 2].map((k) => {
          const x = 920 + k * 24;
          return (
            <g key={k} stroke={mixHex("#9B3B2E", "#5E7A48", i.energy / 100)} strokeWidth="2" fill="none">
              <path d={`M${x},470 L${x - 8},436 L${x + 8},436 Z`} />
              <line x1={x} y1="436" x2={x} y2="470" />
            </g>
          );
        })}
      </g>

      {/* Civic quarter */}
      <g>
        <path d="M444,214 L644,218 L644,400 L444,400 Z" fill="#D7D0B9" stroke="#14251D" strokeOpacity="0.12" />
        {/* plaza */}
        <circle cx="544" cy="310" r="30" fill="#CBC3A6" stroke="#14251D" strokeOpacity="0.18" />
        <circle cx="544" cy="310" r="4" fill="#937840" />
        {/* town hall */}
        <rect x="470" y="248" width="56" height="40" fill="#C3BA9C" stroke="#14251D" strokeOpacity="0.25" />
        <path d="M470,248 L498,230 L526,248 Z" fill="#9A8A64" stroke="#14251D" strokeOpacity="0.25" />
        {/* clinic — glows with public health */}
        <g>
          <rect x="582" y="336" width="46" height="44" fill="#C9C1A4" stroke="#14251D" strokeOpacity="0.25" />
          <rect x="601" y="346" width="8" height="24" fill={mixHex("#9B3B2E", "#5E7A48", clinic)} />
          <rect x="593" y="354" width="24" height="8" fill={mixHex("#9B3B2E", "#5E7A48", clinic)} />
          <circle cx="605" cy="358" r="30" fill={mixHex("#9B3B2E", "#5E7A48", clinic)} opacity={0.12 + clinic * 0.14} filter={`url(#${uid}-soft)`} />
        </g>
      </g>

      {/* Southbank terraces */}
      <g>
        <path d="M366,446 L706,436 L718,642 L378,654 Z" fill="#D2CBB2" stroke="#14251D" strokeOpacity="0.1" />
        {houses.map((h, k) => (
          <g key={k}>
            <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="#C6BD9E" stroke="#14251D" strokeOpacity="0.2" />
            <rect x={h.x} y={h.y - 4} width={h.w} height={5} fill={h.roof} />
            {h.lit ? <rect x={h.x + h.w / 2 - 2} y={h.y + h.h / 2 - 2} width="4" height="4" fill="#B89A60" /> : null}
          </g>
        ))}
      </g>

      {/* Estuary harbour */}
      <g>
        <path d="M728,544 L1000,544 L1000,696 L742,696 Z" fill={mixHex("#8A7446", "#355E59", i.water_q / 100)} stroke="#14251D" strokeOpacity="0.12" opacity="0.92" />
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={760 + k * 58} y="560" width="10" height="56" fill="#5B4A30" />
        ))}
        {/* two moored boats, varied */}
        <path d="M812,596 l34,0 l-6,14 l-22,0 z" fill="#3A4035" />
        <path d="M900,616 l28,0 l-5,12 l-18,0 z" fill="#2A3129" />
        <line x1="820" y1="596" x2="820" y2="578" stroke="#2A3129" strokeWidth="2" />
      </g>

      {/* Roads — arterials from the civic core */}
      <g stroke="#B7AD8E" strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M544,344 L544,470" />
        <path d="M604,300 C690,300 700,250 760,240" />
        <path d="M544,344 C520,420 560,520 760,600" />
        <path d="M470,320 C320,320 200,320 120,320" />
      </g>
      <g stroke="#ECE7D7" strokeWidth="1.5" fill="none" strokeDasharray="2 8" strokeLinecap="round">
        <path d="M544,344 L544,470" />
        <path d="M604,300 C690,300 700,250 760,240" />
      </g>

      {/* Damaged infrastructure — bridge crack + levee breach */}
      <g>
        {/* bridge over the river near civic */}
        <rect x="420" y="300" width="60" height="16" fill="#B7AD8E" stroke="#14251D" strokeOpacity="0.25" transform="rotate(32 450 308)" />
        {breach > 0.35 ? (
          <g>
            <path
              d="M470,520 l-10,-16 l14,-6 l-8,-14"
              fill="none"
              stroke="#9B3B2E"
              strokeWidth={2 + breach * 3}
              strokeLinecap="round"
            />
            <circle cx="476" cy="510" r={10 + breach * 10} fill="#9B3B2E" opacity={0.1 + breach * 0.12} filter={`url(#${uid}-soft)`} />
          </g>
        ) : null}
      </g>

      {/* Haze — heaviest over the ironworks, scales with pollution & poor air */}
      <rect x="0" y="0" width="1040" height="720" fill={`url(#${uid}-haze)`} opacity={haze} pointerEvents="none" />

      {/* District labels */}
      <g fontFamily="var(--font-sans), system-ui" pointerEvents="none">
        {DISTRICTS.filter((d) => d.id !== "river").map((d) => (
          <text
            key={d.id}
            x={d.label.x}
            y={d.label.y}
            fontSize="12.5"
            letterSpacing="2"
            fill="#14251D"
            fillOpacity={active === d.id ? 0.95 : 0.6}
            style={{ textTransform: "uppercase", fontWeight: active === d.id ? 600 : 500 }}
          >
            {d.name}
          </text>
        ))}
        <text x="300" y="150" fontSize="11" letterSpacing="3" fill="#2C534F" fillOpacity="0.75" transform="rotate(34 300 150)" style={{ textTransform: "uppercase" }}>
          River Ashe
        </text>
      </g>

      {/* Interactive hotspots */}
      <g>
        {DISTRICTS.map((d) => {
          const sig = districtSignal(d, town);
          const isHover = active === d.id;
          const isSelected = selected === d.id;
          const isTarget = targets.includes(d.id);
          const emphasised = isHover || isSelected;
          const stroke = isSelected ? "#937840" : isTarget ? "#B89A60" : SIGNAL_STROKE[sig.tone];
          const fillOpacity = isSelected ? 0.16 : isHover ? 0.08 : isTarget ? 0.06 : 0;
          const strokeWidth = isSelected ? 3.5 : emphasised ? 2.5 : isTarget ? 2 : 0;
          return (
            <polygon
              key={d.id}
              points={d.hotspot}
              className={isTarget && !isSelected ? "map-target" : undefined}
              fill={emphasised ? "#937840" : isTarget ? "#B89A60" : "#000000"}
              fillOpacity={fillOpacity}
              stroke={strokeWidth > 0 ? stroke : "transparent"}
              strokeWidth={strokeWidth}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${d.name}: ${sig.label}. ${d.blurb}`}
              style={{ cursor: "pointer", outline: "none", transition: "fill-opacity 0.2s, stroke-width 0.15s" }}
              onMouseEnter={() => onActivate(d.id)}
              onMouseLeave={() => onActivate(null)}
              onFocus={() => onActivate(d.id)}
              onBlur={() => onActivate(null)}
              onClick={() => onSelect?.(d.id)}
              onKeyDown={(e) => {
                if (onSelect && (e.key === "Enter" || e.key === " ")) {
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
