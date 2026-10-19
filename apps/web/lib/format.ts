import type { Sector } from "@langlands/sim/public";
import { INDICATORS } from "./ashfen";

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

const MIX_LABELS: Record<string, string> = {
  dirty_energy: "Thermal share",
  green_energy: "Clean share",
  intensive_ag: "Intensive farming",
  regenerative_ag: "Regenerative farming",
  industrial_intensity: "Industrial intensity",
};

const INDICATOR_LABELS: Record<string, string> = Object.fromEntries(
  INDICATORS.map((meta) => [meta.key, meta.label]),
);

/** Human-readable label for an indicator, mix, or event key already published in the UI. */
export function effectFieldLabel(key: string): string {
  return INDICATOR_LABELS[key] ?? MIX_LABELS[key] ?? EVENT_LABELS[key] ?? key;
}

export function formatEffects(record: Record<string, number> | undefined): string {
  if (!record || Object.keys(record).length === 0) return "—";
  return Object.entries(record)
    .map(([key, value]) => `${effectFieldLabel(key)} ${value > 0 ? "+" : ""}${value}`)
    .join(", ");
}
