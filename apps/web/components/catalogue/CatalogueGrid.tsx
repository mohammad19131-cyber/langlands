import { CATALOGUE, type Project } from "@langlands/sim/public";
import { SECTOR_ORDER } from "../../lib/ashfen";
import { SECTOR_LABELS } from "../../lib/format";
import { ProjectTile } from "./ProjectTile";

export function CatalogueGrid() {
  const bySector = new Map<string, Project[]>();
  for (const project of Object.values(CATALOGUE)) {
    const list = bySector.get(project.sector) ?? [];
    list.push(project);
    bySector.set(project.sector, list);
  }

  const sectors = SECTOR_ORDER.filter((s) => bySector.has(s));

  return (
    <div className="space-y-12">
      {sectors.map((sector) => {
        const projects = bySector.get(sector) ?? [];
        return (
          <section key={sector}>
            <div className="mb-5 flex items-baseline gap-3">
              <h3 className="font-serif text-xl text-ink">{SECTOR_LABELS[sector]}</h3>
              <span className="h-px flex-1 bg-line" />
              <span className="eyebrow text-ink-faint">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectTile key={project.code} project={project} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
