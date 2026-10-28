import {
  CATALOGUE,
  DYS_ECOLOGY,
  DYS_ECONOMY,
  DYS_PREP_INFRA,
  DYS_WELFARE,
  ENGINE_VERSION,
  IDEAL_RESERVE,
  MAX_STARTS,
  PACK_A,
  ROUNDS,
  SECTORS,
  STARTING_RESERVE,
  WEIGHTS,
  type Project,
} from "@langlands/sim/public";
import { PublicChrome } from "../../components/entry/PublicChrome";
import { EVENT_LABELS, SECTOR_LABELS, formatEffects } from "../../lib/format";

export const metadata = {
  title: "Rules — Langlands R3",
};

const ROUND_NOTES: Record<number, string> = {
  1: "Recovery grant in income. Time to start delayed projects before the first shock.",
  2: "Tests water, habitat, health, and energy reliability.",
  3: "Tests water and soil stores and the food economy.",
  4: "Tests infrastructure, buffer, and pollution runoff.",
  5: "Tests remaining pollution load and clinics.",
  6: "Final operating year. Delayed assets can still land; no last-second shock lottery.",
};

function projectName(code: string): string {
  return CATALOGUE[code as keyof typeof CATALOGUE]?.name ?? code;
}

function mutexGroups(): { names: string; rule: string }[] {
  const groups = new Map<string, string[]>();
  for (const project of Object.values(CATALOGUE)) {
    if (!project.mutexGroup) continue;
    const names = groups.get(project.mutexGroup) ?? [];
    names.push(project.name);
    groups.set(project.mutexGroup, names);
  }
  return [...groups.values()].map((names) => ({
    names: names.join(" · "),
    rule: "A town may own at most one of these.",
  }));
}

function mutexNote(project: Project): string | null {
  if (!project.mutexGroup) return null;
  const others = Object.values(CATALOGUE)
    .filter((row) => row.mutexGroup === project.mutexGroup && row.code !== project.code)
    .map((row) => row.name);
  if (others.length === 0) return null;
  return `cannot also own ${others.join(" or ")}`;
}

function effectSummary(project: Project): string {
  const parts = [
    formatEffects(project.immediate) !== "—" ? `Immediate: ${formatEffects(project.immediate)}` : null,
    ...Object.entries(project.delayed).map(([lag, deltas]) => {
      const rounds = Number(lag);
      const when = rounds === 1 ? "After 1 round" : `After ${lag} rounds`;
      return `${when}: ${formatEffects(deltas)}`;
    }),
    formatEffects(project.ongoing) !== "—" ? `Ongoing: ${formatEffects(project.ongoing)}` : null,
    ...Object.entries(project.eventMult).map(
      ([event, mult]) => `${EVENT_LABELS[event] ?? event} ×${mult}`,
    ),
  ].filter(Boolean);
  return parts.join(". ") || "—";
}

const th = "py-2 pr-4 font-normal";
const td = "py-3 pr-4";
const tableWrap = "-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0";
const tableClass =
  "w-full min-w-[32rem] border-collapse text-left font-sans text-sm text-parchment";
const headRow = "border-b border-gold/25 text-[0.68rem] uppercase tracking-[0.14em] text-gold";
const bodyRow = "border-b border-gold/15 align-top";

export default function RulesPage() {
  const projects = Object.values(CATALOGUE);

  return (
    <PublicChrome current="rules">
      <main className="mx-auto max-w-5xl px-6 py-12 text-parchment sm:py-14">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-gold">
          Official rules · {ENGINE_VERSION}
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-parchment-paper">
          Rules / Field guide
        </h1>
        <p className="mt-4 max-w-2xl font-sans text-sm leading-7 text-mist-bright">
          How Ashfen is scored and what a team may do each round. Coefficients are game assumptions,
          not measured field results. There are no hidden modifiers.
        </p>
        <p className="mt-3 font-sans text-sm leading-7 text-mist">
          Need a Team ID? Return to{" "}
          <a href="/sign-in#sign-in" className="text-gold underline-offset-4 hover:underline">
            sign in
          </a>. Credentials are issued with your invite.
        </p>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Competition format</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-mist-bright">
            <li>20 teams, seats 1–20, created before the event. 2–5 members per team.</li>
            <li>
              Shared town: Ashfen. Currency: credits. Starting reserve: {STARTING_RESERVE} credits.
            </li>
            <li>{ROUNDS} rounds. Each round is one game-year.</li>
            <li>
              Real clock: 18 minutes to decide, then the server locks, processes all 20 towns, and
              publishes together.
            </li>
            <li>Recommended live session: 20 min briefing + 6 × 20 min + 20 min debrief.</li>
            <li>Auth is Team ID and password. No public sign-up. No 21st team.</li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Six rounds — pack A</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            The schedule is public before round 1. Every team receives the same event. Damage
            depends on that team’s state.
          </p>
          <div className={`mt-6 ${tableWrap}`}>
            <table className={tableClass}>
              <thead>
                <tr className={headRow}>
                  <th className={th}>Round</th>
                  <th className={th}>Event</th>
                  <th className="py-2 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: ROUNDS }, (_, i) => i + 1).map((round) => {
                  const code = PACK_A[round];
                  return (
                    <tr key={round} className={bodyRow}>
                      <td className={`${td} font-serif text-base text-parchment-paper`}>{round}</td>
                      <td className={`${td} text-parchment-paper`}>
                        {code ? EVENT_LABELS[code] : "None"}
                      </td>
                      <td className="py-3 text-mist-bright">{ROUND_NOTES[round]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">What a team does each round</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            While the round is open:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-sans text-sm leading-7 text-mist-bright">
            <li>
              Inspect the published state of their own town. The 20-town board is organiser-only.
            </li>
            <li>Split available credits across eight operating sectors.</li>
            <li>Optionally start up to {MAX_STARTS} interventions from the catalogue.</li>
            <li>
              Save as often as they like. The last accepted server write before the deadline counts.
            </li>
          </ol>
          <p className="mt-4 font-sans text-sm leading-7 text-mist-bright">
            Sectors: {SECTORS.map((s) => SECTOR_LABELS[s].toLowerCase()).join(", ")}.
          </p>
          <p className="mt-4 font-sans text-sm leading-7 text-mist-bright">
            Available credits are calculated by the server: reserve plus income, minus maintenance
            on projects already underway, never below zero. Totals shown in the browser are not
            official. Unspent credits become next round’s reserve. There is no interest.
          </p>
          <p className="mt-4 font-sans text-sm leading-7 text-mist-bright">
            Charge order on the server: accepted project starts in listed order, then sector spend,
            then remainder to reserve. If starts do not fit the budget, the last-listed start is
            dropped until they do.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Submission rules</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-mist-bright">
            <li>Unknown fields or codes are rejected; the previous accepted plan (if any) remains.</li>
            <li>
              Overspend: the server scales sector spend down; excess project starts are dropped in
              listed order until the budget fits.
            </li>
            <li>More than two starts: extras dropped in listed order.</li>
            <li>After the deadline: stored as late, ignored.</li>
            <li>
              If there is no accepted submission at lock: zero new interventions, zero sector spend,
              100% of available held as reserve. Drift, events, and maintenance still run.
            </li>
            <li>
              Interventions cannot be cancelled after lock. Prerequisites and exclusive pairs are
              checked against the town as it stood at the start of the round.
            </li>
            <li>
              Teams never see another team’s allocations, intervention queue, unpublished scores, or
              the 20-town board. After a round is published they see their own official pillar scores
              and own town. Official standings are organiser-only.
            </li>
            <li>
              Saving the same plan twice is safe. Changing a saved plan while the round is still
              open replaces the last accepted plan.
            </li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Fifteen interventions</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            Only catalogue projects are legal. Maximum {MAX_STARTS} starts per round (12 starts
            maximum across {ROUNDS} rounds). Maintenance is paid every later round while the asset
            exists. Invalid starts are dropped, logged, and their cost is not charged.
          </p>
          <p className="mt-3 font-sans text-xs text-mist md:hidden">
            Catalogue table scrolls sideways on smaller screens.
          </p>
          <div className={`mt-6 ${tableWrap}`}>
            <table className={`${tableClass} min-w-[52rem]`}>
              <caption className="sr-only">
                Intervention catalogue: cost, build time, maintenance, prerequisites, and effects
              </caption>
              <thead>
                <tr className={headRow}>
                  <th className={`${th} pr-3`}>Code</th>
                  <th className={`${th} pr-3`}>Name</th>
                  <th className={`${th} pr-3`}>Sector</th>
                  <th className={`${th} pr-3`}>Cost</th>
                  <th className={`${th} pr-3`}>Build</th>
                  <th className={`${th} pr-3`}>Maint</th>
                  <th className={`${th} pr-3`}>Requires</th>
                  <th className="py-2 font-normal">Effects</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.code} className={bodyRow}>
                    <td className={`${td} pr-3 font-medium text-parchment-paper`}>{project.code}</td>
                    <td className={`${td} pr-3 text-parchment-paper`}>{project.name}</td>
                    <td className={`${td} pr-3 text-mist-bright`}>
                      {SECTOR_LABELS[project.sector]}
                    </td>
                    <td className={`${td} pr-3 tabular-nums`}>{project.cost}</td>
                    <td className={`${td} pr-3 tabular-nums`}>{project.buildRounds}</td>
                    <td className={`${td} pr-3 tabular-nums`}>{project.maintenance}</td>
                    <td className={`${td} pr-3 text-mist-bright`}>
                      {[
                        ...project.prerequisites.map(projectName),
                        mutexNote(project),
                      ]
                        .filter(Boolean)
                        .join("; ") || "—"}
                    </td>
                    <td className="py-3 text-mist-bright">{effectSummary(project)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-8 font-serif text-xl text-parchment-paper">Exclusive pairs</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-mist-bright">
            {mutexGroups().map((row) => (
              <li key={row.names}>
                <span className="text-parchment-paper">{row.names}</span> — {row.rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Scoring pillars</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            Official score is out of 100 after round 6. Places 1–3 are the top three scores.
          </p>
          <div className={`mt-6 ${tableWrap}`}>
            <table className={tableClass}>
              <thead>
                <tr className={headRow}>
                  <th className={th}>Category</th>
                  <th className={th}>Weight</th>
                  <th className="py-2 font-normal">Index</th>
                </tr>
              </thead>
              <tbody>
                <tr className={bodyRow}>
                  <td className={`${td} text-parchment-paper`}>Ecological recovery</td>
                  <td className={`${td} tabular-nums`}>{Math.round(WEIGHTS.ecology * 100)}</td>
                  <td className="py-3 text-mist-bright">
                    Average of air quality, water quality, soil health, biodiversity, and (100 −
                    pollution load).
                  </td>
                </tr>
                <tr className={bodyRow}>
                  <td className={`${td} text-parchment-paper`}>Public welfare</td>
                  <td className={`${td} tabular-nums`}>{Math.round(WEIGHTS.welfare * 100)}</td>
                  <td className="py-3 text-mist-bright">
                    Average of public health, civic services, and employment.
                  </td>
                </tr>
                <tr className={bodyRow}>
                  <td className={`${td} text-parchment-paper`}>Economic stability</td>
                  <td className={`${td} tabular-nums`}>{Math.round(WEIGHTS.economy * 100)}</td>
                  <td className="py-3 text-mist-bright">
                    Average of economic output, fiscal position, and energy reliability.
                  </td>
                </tr>
                <tr className={bodyRow}>
                  <td className={`${td} text-parchment-paper`}>Crisis resilience</td>
                  <td className={`${td} tabular-nums`}>{Math.round(WEIGHTS.resilience * 100)}</td>
                  <td className="py-3 text-mist-bright">
                    Half from preparedness and infrastructure, half from how little event damage has
                    already landed.
                  </td>
                </tr>
                <tr className={bodyRow}>
                  <td className={`${td} text-parchment-paper`}>Resource efficiency</td>
                  <td className={`${td} tabular-nums`}>{Math.round(WEIGHTS.efficiency * 100)}</td>
                  <td className="py-3 text-mist-bright">
                    40% reserve discipline, 35% avoiding wasted overspend, 25% keeping spend on the
                    useful slope. Holding about {IDEAL_RESERVE} credits is the published fiscal
                    target.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3 className="mt-8 font-serif text-xl text-parchment-paper">Dysfunction floors</h3>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            After the weighted sum: ecology below {DYS_ECOLOGY}, welfare below {DYS_WELFARE},
            economy below {DYS_ECONOMY}, or the average of preparedness and infrastructure below{" "}
            {DYS_PREP_INFRA} add published penalties. Population below 47,000 adds 8. Starting
            ecology is about 33.2, so early snapshots carry a small ecology penalty until recovery
            begins.
          </p>
          <h3 className="mt-8 font-serif text-xl text-parchment-paper">Path score and ranking</h3>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            After round 6, the official score is 62% the last snapshot plus 38% the average of all
            six snapshots, rounded to two decimal places (banker’s rounding as in Python 3).
            Tie-break, in order: higher ecology category after round 6, lower mean event damage,
            lower seat number. Disqualification is a flag, not a rewritten formula. Nobody may
            override a numeric score.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="font-serif text-2xl text-parchment-paper">Simultaneous resolution</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            Server order, every round, every team: drift and decay; delayed effects from previous
            rounds; income and available credits; apply the locked submission (or the default hold);
            round event; write reserve; snapshot score. Results publish only when all 20 writes
            succeed and a checksum matches a replay.
          </p>
        </section>

        <section className="mt-14 border-t border-gold/25 pt-10">
          <h2 className="font-serif text-2xl text-parchment-paper">What the server decides</h2>
          <p className="mt-3 font-sans text-sm leading-7 text-mist-bright">
            Everything the browser sends is a proposal. The server decides whether the round is
            still open (using its own clock, not your device), how many credits the town actually
            has, which catalogue projects exist, the new town state, and the score. Rejected as
            authoritative input: scores, remaining budget, timestamps, map-derived outcomes, and
            predicted damage.
          </p>
        </section>
      </main>
    </PublicChrome>
  );
}
