import { CATALOGUE, SECTORS, type Project, type Sector } from "@langlands/sim/public";
import { INDICATORS } from "../../lib/ashfen";
import { EVENT_LABELS } from "../../lib/format";

/**
 * Browser-safe helpers mirroring the engine's eligibility rules for responsive
 * UI feedback only. The server (via the frozen engine dry-run in the submissions
 * route) remains the single source of truth for what is actually accepted.
 */

export type Eligibility = { ok: boolean; reason: string | null };

export function projectsForSector(sector: Sector): Project[] {
  return Object.values(CATALOGUE).filter((p) => p.sector === sector);
}

export function startEligibility(
  code: string,
  startedCodes: string[],
  completedCodes: string[],
  staged: string[],
): Eligibility {
  const proj = CATALOGUE[code];
  if (!proj) return { ok: false, reason: "Unknown intervention" };
  if (startedCodes.includes(code)) return { ok: false, reason: "Already under way" };
  if (staged.includes(code)) return { ok: true, reason: null };

  const missing = proj.prerequisites.filter((p) => !completedCodes.includes(p));
  if (missing.length) {
    return {
      ok: false,
      reason: `Requires ${missing.map((m) => CATALOGUE[m]?.name ?? m).join(", ")}`,
    };
  }
  if (proj.mutexGroup) {
    const conflict = [...startedCodes, ...staged].some(
      (c) => c !== code && CATALOGUE[c]?.mutexGroup === proj.mutexGroup,
    );
    if (conflict) return { ok: false, reason: "Conflicts with another chosen option" };
  }
  return { ok: true, reason: null };
}

const MIX_LABELS: Record<string, string> = {
  dirty_energy: "Thermal share",
  green_energy: "Clean share",
  intensive_ag: "Intensive farming",
  regenerative_ag: "Regenerative farming",
  industrial_intensity: "Industrial intensity",
};

function fieldLabel(key: string): string {
  return INDICATORS.find((m) => m.key === key)?.label ?? MIX_LABELS[key] ?? key;
}

function signed(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r > 0 ? `+${r}` : `${r}`;
}

function describeDeltas(record: Record<string, number>): string[] {
  return Object.entries(record)
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([k, v]) => `${fieldLabel(k)} ${signed(v)}`);
}

export type ProjectEffect = { when: string; items: string[] };

/** Human-readable, honest summary of a project's known effects and timing. */
export function summariseEffects(project: Project): ProjectEffect[] {
  const out: ProjectEffect[] = [];
  const immediate = describeDeltas(project.immediate);
  if (immediate.length) out.push({ when: "Immediately", items: immediate });

  const delayKeys = Object.keys(project.delayed)
    .map(Number)
    .sort((a, b) => a - b);
  for (const d of delayKeys) {
    const items = describeDeltas(project.delayed[d]);
    if (items.length) {
      out.push({ when: d === 1 ? "After 1 round" : `After ${d} rounds`, items });
    }
  }

  const ongoing = describeDeltas(project.ongoing);
  if (ongoing.length) out.push({ when: "Each round after", items: ongoing });

  const mults = Object.entries(project.eventMult);
  if (mults.length) {
    out.push({
      when: "Crisis shield",
      items: mults.map(
        ([ev, m]) => `${EVENT_LABELS[ev] ?? ev}: damage ×${Math.round(m * 100) / 100}`,
      ),
    });
  }
  return out;
}

export function emptyAllocations(): Record<Sector, number> {
  const out = {} as Record<Sector, number>;
  for (const s of SECTORS) out[s] = 0;
  return out;
}

export function fullAllocations(partial: Partial<Record<Sector, number>>): Record<Sector, number> {
  const out = emptyAllocations();
  for (const s of SECTORS) out[s] = Math.max(0, Math.round(partial[s] ?? 0));
  return out;
}

export function sumAllocations(alloc: Record<Sector, number>): number {
  return SECTORS.reduce((acc, s) => acc + (alloc[s] ?? 0), 0);
}

export function projectCost(starts: string[]): number {
  return starts.reduce((acc, c) => acc + (CATALOGUE[c]?.cost ?? 0), 0);
}
