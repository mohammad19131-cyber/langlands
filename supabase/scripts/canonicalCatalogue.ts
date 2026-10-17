import { createHash } from "node:crypto";
import { CATALOGUE } from "../../packages/sim/src/catalogue.ts";
import { dumpsPythonCanonical } from "../../packages/sim/src/pythonCompat.ts";
import type { Project } from "../../packages/sim/src/types.ts";

export type CanonicalProject = {
  build_rounds: number;
  code: string;
  cost: number;
  delayed_effects: Record<string, Record<string, number>>;
  event_multipliers: Record<string, number>;
  immediate_effects: Record<string, number>;
  maintenance_per_round: number;
  max_copies: number;
  mutex_group: string | null;
  name: string;
  ongoing_effects: Record<string, number>;
  prerequisites: string[];
  sector: string;
};

export function canonicalProject(project: Project): CanonicalProject {
  const delayed: Record<string, Record<string, number>> = {};
  for (const [lag, deltas] of Object.entries(project.delayed)) {
    delayed[String(lag)] = deltas;
  }
  return {
    build_rounds: project.buildRounds,
    code: project.code,
    cost: project.cost,
    delayed_effects: delayed,
    event_multipliers: { ...project.eventMult },
    immediate_effects: { ...project.immediate },
    maintenance_per_round: project.maintenance,
    max_copies: 1,
    mutex_group: project.mutexGroup,
    name: project.name,
    ongoing_effects: { ...project.ongoing },
    prerequisites: [...project.prerequisites],
    sector: project.sector,
  };
}

export function canonicalCatalogueRows(): CanonicalProject[] {
  return Object.keys(CATALOGUE)
    .sort()
    .map((code) => canonicalProject(CATALOGUE[code]));
}

export function canonicalCatalogueJson(): string {
  return dumpsPythonCanonical(canonicalCatalogueRows());
}

export function catalogueHash(): string {
  return createHash("sha256").update(canonicalCatalogueJson(), "utf8").digest("hex");
}
