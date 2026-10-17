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
} from "@langlands/sim/public";
import { EVENT_LABELS, SECTOR_LABELS, formatEffects } from "../../lib/format";

export const metadata = {
  title: "Rules — Langlands R3",
};

const ROUND_NOTES: Record<number, string> = {
  1: "Recovery grant in income. Time to start delayed projects before the first shock.",
  2: "Tests water, habitat, health, and energy reliability.",
  3: "Tests water/soil stores and the food economy.",
  4: "Tests infrastructure, buffer, and pollution runoff.",
  5: "Tests remaining pollution load and clinics.",
  6: "Final operating year. Delayed assets can still land; no last-second shock lottery.",
};

const MUTEX = [
  { group: "ENERGY_BASELOAD", members: "COAL, RENEWABLES", rule: "At most one owned." },
  { group: "AGRI_PUSH", members: "REGEN_AG, INTENSE_AG", rule: "At most one owned." },
];

export default function RulesPage() {
  const projects = Object.values(CATALOGUE);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <p className="font-sans text-xs uppercase tracking-[0.2em] text-bronze">
        Frozen rulebook · {ENGINE_VERSION}
      </p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight text-ink">How Ashfen is scored</h1>
      <p className="mt-4 max-w-2xl font-sans text-sm leading-7 text-ink-muted">
        This page restates the published specifications. Coefficients are game assumptions, not
        measured field results. There are no hidden modifiers.
      </p>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Competition format</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-ink-muted">
          <li>20 teams, seats 1–20, pre-created by the organiser. 2–5 members per team.</li>
          <li>Shared town: Ashfen. Currency: credits. Starting reserve: {STARTING_RESERVE} credits.</li>
          <li>{ROUNDS} rounds. Each round is one game-year.</li>
          <li>Real clock: 18 minutes to decide, then the server locks, processes all 20 towns, and publishes together.</li>
          <li>Recommended live session: 20 min briefing + 6 × 20 min + 20 min debrief.</li>
          <li>Auth is Team ID and password. No public sign-up. No 21st team.</li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Six rounds — pack A</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          The schedule is public before round 1. Every team receives the same event. Damage
          depends on that team’s state. Formulas live in the environmental-events specification.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left font-sans text-sm">
            <thead>
              <tr className="border-b border-paper-line text-xs uppercase tracking-[0.14em] text-bronze">
                <th className="py-2 pr-4 font-normal">Round</th>
                <th className="py-2 pr-4 font-normal">Event</th>
                <th className="py-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROUNDS }, (_, i) => i + 1).map((round) => {
                const code = PACK_A[round];
                return (
                  <tr key={round} className="border-b border-paper-line/80">
                    <td className="py-3 pr-4 font-serif text-base text-ink">{round}</td>
                    <td className="py-3 pr-4 text-ink">
                      {code ? (
                        <>
                          <span className="font-medium">{EVENT_LABELS[code]}</span>
                          <span className="ml-2 text-xs text-ink-muted">{code}</span>
                        </>
                      ) : (
                        "None"
                      )}
                    </td>
                    <td className="py-3 text-ink-muted">{ROUND_NOTES[round]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">What a team does each round</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          While the round status is <code className="text-ink">open</code>:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 font-sans text-sm leading-7 text-ink-muted">
          <li>Inspect the published state of their town (and, after round 1, published pillar scores of others).</li>
          <li>Split available credits across eight operating sectors.</li>
          <li>Optionally start up to {MAX_STARTS} interventions from the catalogue.</li>
          <li>Save as often as they like. The last accepted server write before closes_at counts.</li>
        </ol>
        <p className="mt-4 font-sans text-sm leading-7 text-ink-muted">
          Sectors: {SECTORS.map((s) => SECTOR_LABELS[s].toLowerCase()).join(", ")}.
        </p>
        <p className="mt-4 font-sans text-sm leading-7 text-ink-muted">
          Available credits are computed by the server:{" "}
          <code className="text-ink">available = max(0, reserve + income − intervention_maintenance)</code>.
          Client totals are ignored. Unspent credits become next round’s reserve. There is no interest.
        </p>
        <p className="mt-4 font-sans text-sm leading-7 text-ink-muted">
          Charge order (server): accepted intervention starts in listed order, then sector spend,
          then remainder to reserve. If starts do not fit, drop the last-listed start until they do.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Submission rules</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-ink-muted">
          <li>Unknown fields or codes → rejected; previous accepted row (if any) remains.</li>
          <li>Overspend → server scales sector spend down; excess project starts dropped by listed order until the budget fits.</li>
          <li>More than two starts → extras dropped in listed order.</li>
          <li>After closes_at → stored as late, ignored.</li>
          <li>If there is no accepted submission at lock: zero new interventions, zero sector spend, 100% of available held as reserve. Drift, events, and maintenance still run.</li>
          <li>Interventions cannot be cancelled after lock. Prerequisites and mutex groups are checked against pre-round state.</li>
          <li>Teams never see another team’s allocations or intervention queue during the event. After a round is published they see others’ pillar scores and public map tiles only.</li>
          <li>
            Posts use an Idempotency-Key. Same key and body return the same row; same key and a
            different body is rejected; a new key while open supersedes the previous accepted row.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Fifteen interventions</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          Only catalogue codes are legal. Maximum {MAX_STARTS} starts per round (12 starts
          maximum across {ROUNDS} rounds). Maintenance is paid every later round while the asset
          exists. Invalid starts are dropped, logged, and their cost is not charged.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left font-sans text-sm">
            <thead>
              <tr className="border-b border-paper-line text-xs uppercase tracking-[0.14em] text-bronze">
                <th className="py-2 pr-3 font-normal">Code</th>
                <th className="py-2 pr-3 font-normal">Name</th>
                <th className="py-2 pr-3 font-normal">Sector</th>
                <th className="py-2 pr-3 font-normal">Cost</th>
                <th className="py-2 pr-3 font-normal">Build</th>
                <th className="py-2 pr-3 font-normal">Maint</th>
                <th className="py-2 pr-3 font-normal">Prereq</th>
                <th className="py-2 font-normal">Effects</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.code} className="border-b border-paper-line/80 align-top">
                  <td className="py-3 pr-3 font-medium text-ink">{project.code}</td>
                  <td className="py-3 pr-3 text-ink">{project.name}</td>
                  <td className="py-3 pr-3 text-ink-muted">{SECTOR_LABELS[project.sector]}</td>
                  <td className="py-3 pr-3 tabular-nums text-ink">{project.cost}</td>
                  <td className="py-3 pr-3 tabular-nums text-ink">{project.buildRounds}</td>
                  <td className="py-3 pr-3 tabular-nums text-ink">{project.maintenance}</td>
                  <td className="py-3 pr-3 text-ink-muted">
                    {[
                      ...project.prerequisites,
                      project.mutexGroup ? `mutex ${project.mutexGroup}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="py-3 text-ink-muted">
                    {[
                      formatEffects(project.immediate) !== "—"
                        ? `immediate: ${formatEffects(project.immediate)}`
                        : null,
                      ...Object.entries(project.delayed).map(
                        ([lag, deltas]) => `T+${lag}: ${formatEffects(deltas)}`,
                      ),
                      formatEffects(project.ongoing) !== "—"
                        ? `ongoing: ${formatEffects(project.ongoing)}`
                        : null,
                      ...Object.entries(project.eventMult).map(
                        ([event, mult]) => `${event} ×${mult}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(". ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-8 font-serif text-xl text-ink">Mutex groups</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-sans text-sm leading-7 text-ink-muted">
          {MUTEX.map((row) => (
            <li key={row.group}>
              <span className="text-ink">{row.group}</span> — {row.members}. {row.rule}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Scoring pillars</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          Official score is out of 100 after round 6. Places 1–3 are the top three scores.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left font-sans text-sm">
            <thead>
              <tr className="border-b border-paper-line text-xs uppercase tracking-[0.14em] text-bronze">
                <th className="py-2 pr-4 font-normal">Category</th>
                <th className="py-2 pr-4 font-normal">Weight</th>
                <th className="py-2 font-normal">Index</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-paper-line/80">
                <td className="py-3 pr-4 text-ink">Ecological recovery</td>
                <td className="py-3 pr-4 tabular-nums">{Math.round(WEIGHTS.ecology * 100)}</td>
                <td className="py-3 text-ink-muted">
                  E = (air + water_q + soil + bio + (100 − pollution)) / 5
                </td>
              </tr>
              <tr className="border-b border-paper-line/80">
                <td className="py-3 pr-4 text-ink">Public welfare</td>
                <td className="py-3 pr-4 tabular-nums">{Math.round(WEIGHTS.welfare * 100)}</td>
                <td className="py-3 text-ink-muted">W = (health + services + jobs) / 3</td>
              </tr>
              <tr className="border-b border-paper-line/80">
                <td className="py-3 pr-4 text-ink">Economic stability</td>
                <td className="py-3 pr-4 tabular-nums">{Math.round(WEIGHTS.economy * 100)}</td>
                <td className="py-3 text-ink-muted">Y = (economy + fiscal + energy) / 3</td>
              </tr>
              <tr className="border-b border-paper-line/80">
                <td className="py-3 pr-4 text-ink">Crisis resilience</td>
                <td className="py-3 pr-4 tabular-nums">{Math.round(WEIGHTS.resilience * 100)}</td>
                <td className="py-3 text-ink-muted">
                  R = 0.5 × (0.5·prep + 0.5·infra) + 0.5 × shock
                </td>
              </tr>
              <tr className="border-b border-paper-line/80">
                <td className="py-3 pr-4 text-ink">Resource efficiency</td>
                <td className="py-3 pr-4 tabular-nums">{Math.round(WEIGHTS.efficiency * 100)}</td>
                <td className="py-3 text-ink-muted">
                  F = 0.40·discipline + 0.35·waste_score + 0.25·yield_score. Holding about{" "}
                  {IDEAL_RESERVE} credits is the published fiscal target.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 className="mt-8 font-serif text-xl text-ink">Dysfunction floors</h3>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          After the weighted sum: ecology below {DYS_ECOLOGY}, welfare below {DYS_WELFARE},
          economy below {DYS_ECONOMY}, or (0.5·prep + 0.5·infra) below {DYS_PREP_INFRA} add
          published penalties. Population below 47,000 adds 8. Starting E is about 33.2, so early
          snapshots carry a small ecology penalty until recovery begins.
        </p>
        <h3 className="mt-8 font-serif text-xl text-ink">Path score and ranking</h3>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          final_score = round(0.62 × snapshot_6 + 0.38 × mean(snapshot_1..6), 2). Banker’s
          rounding as in Python 3. Tie-break, in order: higher ecology category after round 6,
          lower mean event damage, lower seat number. Disqualification is a flag, not a rewritten
          formula. Nobody may override a numeric score.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl text-ink">Simultaneous resolution</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          Server order, every round, every team: drift / decay; delayed effects from previous
          rounds; income and available; apply the locked submission (or the default hold); round
          event; write reserve; snapshot score. Results publish only when all 20 writes succeed
          and a checksum matches a replay.
        </p>
      </section>

      <section className="mt-14 border-t border-paper-line pt-10">
        <h2 className="font-serif text-2xl text-ink">Trust boundary</h2>
        <p className="mt-3 font-sans text-sm leading-7 text-ink-muted">
          Everything the browser sends is a proposal. The server decides whether the round is
          open (database now() versus opens_at / closes_at), how many credits the town actually
          has, which catalogue codes exist, the new town state, and the score. Rejected as
          authoritative input: scores, remaining budget, timestamps, map-derived outcomes, and
          predicted damage.
        </p>
      </section>
    </main>
  );
}
