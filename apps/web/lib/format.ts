import type { Sector } from "@langlands/sim/public";

export const SECTOR_LABELS: Record<Sector, string> = {
  restoration: "Restoration",
  pollution_control: "Pollution control",
  water: "Water",
  energy: "Energy",
  agriculture: "Agriculture",
  industry: "Industry",
  infrastructure: "Infrastructure",
  public_services: "Public services",
};

export const EVENT_LABELS: Record<string, string> = {
  HEATWAVE: "Heatwave",
  DROUGHT: "Drought",
  FLOOD: "Flood",
  CONTAMINATION: "Pollution incident",
};

export function formatEffects(record: Record<string, number> | undefined): string {
  if (!record || Object.keys(record).length === 0) return "—";
  return Object.entries(record)
    .map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`)
    .join(", ");
}
