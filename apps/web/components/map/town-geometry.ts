import type { IndicatorKey, TownView } from "../../lib/ashfen";

/** Linear interpolation between two hex colours. */
export function mixHex(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mixed = pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Deterministic tiny PRNG so generated blocks are varied but stable. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type DistrictId =
  | "hills"
  | "river"
  | "wetlands"
  | "farms"
  | "civic"
  | "neighbourhoods"
  | "industry"
  | "grid"
  | "harbour";

export type District = {
  id: DistrictId;
  name: string;
  /** Short name drawn on the map; falls back to `name`. */
  mapLabel?: string;
  /** Hotspot polygon (points string for <polygon>). */
  hotspot: string;
  label: { x: number; y: number };
  drivers: IndicatorKey[];
  blurb: string;
};

/** Planned town plates. GameMap draws from these so clicks and art stay aligned. */
export type Plate = { x: number; y: number; w: number; h: number };

export const PLATES: Record<Exclude<DistrictId, "river">, Plate> = {
  hills: { x: 40, y: 32, w: 960, h: 92 },
  farms: { x: 40, y: 140, w: 252, h: 268 },
  civic: { x: 428, y: 140, w: 212, h: 252 },
  industry: { x: 672, y: 140, w: 288, h: 196 },
  wetlands: { x: 292, y: 400, w: 128, h: 148 },
  neighbourhoods: { x: 436, y: 416, w: 284, h: 196 },
  grid: { x: 828, y: 352, w: 172, h: 168 },
  harbour: { x: 736, y: 536, w: 264, h: 152 },
};

function rectPoly({ x, y, w, h }: Plate): string {
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
}

export const DISTRICTS: District[] = [
  {
    id: "hills",
    name: "Beacon Hills",
    hotspot: rectPoly(PLATES.hills),
    label: { x: 56, y: 54 },
    drivers: ["air", "bio"],
    blurb: "Wooded ridgeline to the north. Its canopy holds the air and the headwaters.",
  },
  {
    id: "farms",
    name: "West Fields",
    hotspot: rectPoly(PLATES.farms),
    label: { x: 56, y: 162 },
    drivers: ["soil", "water_q"],
    blurb: "Terraced farmland. Yields follow the soil and the water that reaches it.",
  },
  {
    id: "wetlands",
    name: "Marrow Wetlands",
    mapLabel: "Wetlands",
    hotspot: rectPoly(PLATES.wetlands),
    label: { x: 304, y: 422 },
    drivers: ["buffer", "bio"],
    blurb: "Reed marsh along the river bend. The town's first line against flood and drought.",
  },
  {
    id: "civic",
    name: "Civic Quarter",
    hotspot: rectPoly(PLATES.civic),
    label: { x: 444, y: 162 },
    drivers: ["health", "services"],
    blurb: "The old core: town hall, the clinic, and the market square.",
  },
  {
    id: "neighbourhoods",
    name: "Southbank Terraces",
    mapLabel: "Southbank",
    hotspot: rectPoly(PLATES.neighbourhoods),
    label: { x: 452, y: 436 },
    drivers: ["jobs", "services"],
    blurb: "Where most of Ashfen's 50,000 residents live and work.",
  },
  {
    id: "industry",
    name: "Ironworks District",
    mapLabel: "Ironworks",
    hotspot: rectPoly(PLATES.industry),
    label: { x: 688, y: 162 },
    drivers: ["economy", "pollution"],
    blurb: "Foundries and mills by the water. The engine of the economy — and the smoke.",
  },
  {
    id: "grid",
    name: "The Grid",
    hotspot: rectPoly(PLATES.grid),
    label: { x: 844, y: 374 },
    drivers: ["energy", "pollution"],
    blurb: "Substation and pylons. Thermal-heavy supply strains in a heatwave.",
  },
  {
    id: "harbour",
    name: "Estuary Harbour",
    hotspot: rectPoly(PLATES.harbour),
    label: { x: 752, y: 558 },
    drivers: ["economy", "water_q"],
    blurb: "Tidal docks where the river meets the sea. Trade and flood risk both arrive here.",
  },
  {
    id: "river",
    name: "River Ashe",
    hotspot: "328,32 392,32 392,400 360,560 420,640 560,660 800,580 800,548 560,628 430,612 328,520",
    label: { x: 300, y: 250 },
    drivers: ["water_q", "pollution"],
    blurb: "The river that names the town. Its clarity is the clearest read on recovery.",
  },
];

export type DistrictSignal = { label: string; tone: "critical" | "strained" | "fair" | "strong" };

/** Short human read of a district from the indicators that drive it. */
export function districtSignal(district: District, town: TownView): DistrictSignal {
  const vals = district.drivers.map((k) => {
    const raw = town.indicators[k];
    // pollution is inverted to a health reading
    return k === "pollution" ? 100 - raw : raw;
  });
  const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const tone = avg < 35 ? "critical" : avg < 50 ? "strained" : avg < 68 ? "fair" : "strong";
  const label = tone === "critical" ? "Critical" : tone === "strained" ? "Strained" : tone === "fair" ? "Stabilising" : "Recovering";
  return { label, tone };
}
