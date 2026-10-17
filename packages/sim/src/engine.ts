import { CATALOGUE } from "./catalogue.js";
import {
  DYS_ECOLOGY,
  DYS_ECONOMY,
  DYS_PREP_INFRA,
  DYS_WELFARE,
  ENGINE_VERSION,
  EVENT_SCALE,
  IDEAL_RESERVE,
  INDEX_FIELDS,
  MAX_STARTS,
  NEGLECT_SHARE,
  ROUNDS,
  SAT_MAGNITUDE,
  SAT_SCALE,
  SECTORS,
  STARTING_RESERVE,
  WEIGHTS,
  type Sector,
} from "./constants.js";
import { pythonRound } from "./pythonCompat.js";
import { stateHash } from "./hash.js";
import type {
  EventCode,
  PlayResult,
  RoundResult,
  Snapshot,
  Submission,
  Town,
  TownField,
} from "./types.js";

export { CATALOGUE } from "./catalogue.js";
export {
  ENGINE_VERSION,
  EQUAL,
  EVENT_SCALE,
  GREEN,
  GROW_EARLY,
  GROW_LATE,
  INDEX_FIELDS,
  PACK_A,
  RESTORE_EARLY,
  RESTORE_LATE,
  ROUNDS,
  SAT_MAGNITUDE,
  SAT_SCALE,
  SECTORS,
  WEIGHTS,
} from "./constants.js";
export type { PlayResult, RoundResult, Snapshot, Submission, Town } from "./types.js";

export function clamp(value: number, lo = 0.0, hi = 100.0): number {
  return Math.max(lo, Math.min(hi, value));
}

export function sat(spend: number, scale = SAT_SCALE, mag = SAT_MAGNITUDE): number {
  return mag * (1.0 - Math.exp(-Math.max(spend, 0.0) / scale));
}

export function reserveScore(reserve: number): number {
  return 100.0 * Math.exp(-((reserve - IDEAL_RESERVE) ** 2) / (2.0 * 160.0 ** 2));
}

export function createInitialTown(): Town {
  return {
    air: 32.0,
    water_q: 38.0,
    soil: 36.0,
    bio: 28.0,
    pollution: 68.0,
    health: 44.0,
    services: 48.0,
    jobs: 46.0,
    economy: 50.0,
    fiscal: 52.0,
    energy: 42.0,
    infra: 46.0,
    prep: 30.0,
    buffer: 26.0,
    reserve: STARTING_RESERVE,
    population: 50_000.0,
    dirty_energy: 1.0,
    green_energy: 0.0,
    intensive_ag: 0.4,
    regenerative_ag: 0.1,
    industrial_intensity: 0.45,
    delayed: {},
    pending: [],
    started: {},
    completed: {},
    shock_log: [],
    dropped_log: [],
  };
}

export function cloneTown(town: Town): Town {
  return structuredClone(town);
}

export function applyField(town: Town, key: string, delta: number): void {
  if (key === "dirty_energy") {
    town.dirty_energy = clamp(town.dirty_energy + delta, 0.0, 1.5);
  } else if (key === "green_energy") {
    town.green_energy = clamp(town.green_energy + delta, 0.0, 1.5);
  } else if (key === "intensive_ag") {
    town.intensive_ag = clamp(town.intensive_ag + delta, 0.0, 1.2);
  } else if (key === "regenerative_ag") {
    town.regenerative_ag = clamp(town.regenerative_ag + delta, 0.0, 1.2);
  } else if (key === "industrial_intensity") {
    town.industrial_intensity = clamp(town.industrial_intensity + delta, 0.1, 1.4);
  } else if ((INDEX_FIELDS as readonly string[]).includes(key)) {
    const field = key as TownField;
    town[field] = clamp(town[field] + delta);
  } else {
    throw new Error(`unknown town field ${key}`);
  }
}

export function applyDeltas(town: Town, deltas: Record<string, number>): void {
  for (const [key, delta] of Object.entries(deltas)) {
    applyField(town, key, delta);
  }
}

export function incomeFor(town: Town, roundNo: number): number {
  const grant = roundNo === 1 ? 180.0 : 0.0;
  return (
    180.0 +
    grant +
    8.6 * town.economy +
    3.2 * town.jobs +
    1.6 * town.fiscal -
    0.45 * town.pollution -
    0.4 * (100.0 - town.health) -
    0.3 * (100.0 - town.energy)
  );
}

export function maintenanceDue(town: Town, roundNo: number): number {
  let total = 0.0;
  for (const [code, startedRound] of Object.entries(town.started)) {
    if (startedRound < roundNo) total += CATALOGUE[code].maintenance;
  }
  return total;
}

export function applyDrift(town: Town): void {
  const pollutionPush =
    1.6 +
    0.035 * town.industrial_intensity * town.economy +
    1.1 * town.dirty_energy +
    0.8 * town.intensive_ag -
    0.9 * town.green_energy -
    0.4 * town.regenerative_ag;
  town.pollution = clamp(town.pollution + pollutionPush - 0.04 * town.buffer);
  town.air = clamp(town.air - 0.55 * town.dirty_energy - 0.012 * town.pollution + 0.08 * town.bio);
  town.water_q = clamp(town.water_q - 0.35 * town.intensive_ag - 0.01 * town.pollution);
  town.soil = clamp(town.soil - 0.4 * town.intensive_ag + 0.12 * town.regenerative_ag);
  town.bio = clamp(town.bio - 0.5 - 0.012 * town.pollution + 0.06 * town.buffer);
  town.infra = clamp(town.infra - 1.05);
  town.energy = clamp(town.energy - 0.95);
  town.services = clamp(town.services - 0.7);
  town.prep = clamp(town.prep - 0.75);
  town.buffer = clamp(town.buffer - 0.4);
  town.fiscal = clamp(town.fiscal - 0.55);
  town.economy = clamp(town.economy - 1.15 - 0.4 * town.dirty_energy);
  const env = (town.air + town.water_q) / 2.0;
  town.health = clamp(
    town.health +
      0.18 * (env - town.health) +
      (0.08 * (town.services - 50.0)) / 10.0 -
      (0.04 * (town.pollution - 50.0)) / 10.0,
  );
  town.jobs = clamp(town.jobs + 0.06 * (town.economy - town.jobs) - (town.health < 35 ? 0.8 : 0.0));
  if (town.health < 35) {
    town.population = Math.max(42_000.0, town.population * 0.992);
  } else if (town.jobs > 60 && town.services > 55) {
    town.population = Math.min(56_000.0, town.population * 1.004);
  }
}

export function applyOperatingDelayed(town: Town): void {
  const d = town.delayed;
  applyField(town, "bio", d.bio ?? 0.0);
  applyField(town, "soil", d.soil ?? 0.0);
  applyField(town, "buffer", d.buffer ?? 0.0);
  applyField(town, "air", d.air ?? 0.0);
  applyField(town, "economy", d.economy ?? 0.0);
  applyField(town, "prep", d.prep ?? 0.0);
  applyField(town, "green_energy", d.green_energy ?? 0.0);
  delete d.bio;
  delete d.soil;
  delete d.buffer;
  delete d.air;
  delete d.economy;
  delete d.prep;
  delete d.green_energy;
}

export function applyPendingProjects(town: Town, roundNo: number): void {
  const remaining = [];
  for (const item of town.pending) {
    if (item.landRound === roundNo) {
      applyDeltas(town, item.deltas);
      if (item.completeCode) town.completed[item.completeCode] = roundNo;
    } else {
      remaining.push(item);
    }
  }
  town.pending = remaining;
}

export function applyOngoing(town: Town, roundNo: number): void {
  for (const [code, completedRound] of Object.entries(town.completed)) {
    if (completedRound < roundNo) applyDeltas(town, CATALOGUE[code].ongoing);
  }
}

export function applyAllocations(town: Town, spend: Record<string, number>): void {
  const r = sat(spend.restoration);
  const p = sat(spend.pollution_control);
  const w = sat(spend.water);
  const e = sat(spend.energy);
  const a = sat(spend.agriculture);
  const i = sat(spend.industry);
  const n = sat(spend.infrastructure);
  const s = sat(spend.public_services);

  const rEff = r * (1.0 + 0.05 * p);
  const iEff = i * (0.72 + 0.014 * town.energy + 0.012 * town.infra);
  const aEff = a * (0.68 + 0.007 * town.water_q);
  const sEff = s * (0.78 + 0.005 * town.fiscal);
  const cleanShift = spend.energy >= spend.industry ? 1.0 : 0.35;

  town.air = clamp(town.air + 0.72 * rEff + 0.58 * p - 0.32 * iEff - 0.14 * e * town.dirty_energy);
  town.water_q = clamp(
    town.water_q + 0.92 * w + 0.4 * rEff + 0.38 * p - 0.24 * aEff * town.intensive_ag,
  );
  town.soil = clamp(town.soil + 0.42 * rEff + 0.5 * aEff * (0.35 + town.regenerative_ag) - 0.2 * iEff);
  town.bio = clamp(town.bio + 0.48 * rEff + 0.22 * w - 0.26 * iEff - 0.12 * aEff * town.intensive_ag);
  town.pollution = clamp(
    town.pollution -
      0.95 * p -
      0.28 * rEff -
      0.28 * w +
      0.48 * iEff +
      0.2 * e * town.dirty_energy -
      0.22 * e * town.green_energy,
  );

  town.delayed.bio = (town.delayed.bio ?? 0.0) + 0.55 * rEff;
  town.delayed.soil = (town.delayed.soil ?? 0.0) + 0.38 * rEff;
  town.delayed.buffer = (town.delayed.buffer ?? 0.0) + 0.42 * rEff + 0.18 * w;
  town.delayed.air = (town.delayed.air ?? 0.0) + 0.22 * rEff;
  town.delayed.economy = (town.delayed.economy ?? 0.0) + 0.22 * iEff + 0.1 * n;
  town.delayed.prep = (town.delayed.prep ?? 0.0) + 0.28 * n;
  town.delayed.green_energy = (town.delayed.green_energy ?? 0.0) + 0.04 * e * cleanShift;

  town.health = clamp(town.health + 0.62 * sEff + 0.34 * w + 0.2 * p + 0.12 * aEff - 0.1 * iEff);
  town.services = clamp(town.services + 0.78 * sEff + 0.46 * n + 0.14 * w);
  town.jobs = clamp(town.jobs + 0.48 * iEff + 0.4 * aEff + 0.34 * sEff + 0.2 * n - 0.08 * rEff);
  town.economy = clamp(town.economy + 0.72 * iEff + 0.36 * aEff + 0.3 * e + 0.22 * n - 0.16 * p - 0.12 * rEff);
  town.fiscal = clamp(town.fiscal + 0.24 * iEff + (0.1 * town.economy) / 18.0 - 0.1 * sEff - 0.05 * rEff);
  town.energy = clamp(town.energy + 0.9 * e + 0.22 * n - 0.1 * iEff);
  town.infra = clamp(town.infra + 0.98 * n + 0.2 * e + 0.12 * w);
  town.prep = clamp(town.prep + 0.58 * n + 0.48 * sEff + 0.26 * w + 0.14 * e);
  town.buffer = clamp(town.buffer + 0.38 * rEff + 0.34 * w + 0.22 * n - 0.16 * iEff);

  town.dirty_energy = clamp(town.dirty_energy - 0.035 * e * cleanShift + 0.016 * i, 0.0, 1.5);
  town.green_energy = clamp(town.green_energy + 0.03 * e * cleanShift, 0.0, 1.5);
  town.intensive_ag = clamp(
    town.intensive_ag + 0.025 * (spend.agriculture > spend.restoration ? a : -0.6 * a),
    0.0,
    1.2,
  );
  town.regenerative_ag = clamp(
    town.regenerative_ag + 0.025 * r + 0.012 * a * (spend.restoration > 80 ? 1 : 0),
    0.0,
    1.2,
  );
  town.industrial_intensity = clamp(town.industrial_intensity + 0.03 * i - 0.014 * p, 0.1, 1.4);

  const spent = Math.max(spend._spent ?? 0.0, 1.0);
  const prodShare = (spend.industry + spend.energy + spend.agriculture) / spent;
  const envShare = (spend.restoration + spend.pollution_control + spend.water) / spent;
  if (prodShare < NEGLECT_SHARE) {
    town.economy = clamp(town.economy - 3.4);
    town.jobs = clamp(town.jobs - 2.0);
    town.fiscal = clamp(town.fiscal - 1.6);
  }
  if (envShare < NEGLECT_SHARE) {
    town.pollution = clamp(town.pollution + 3.2);
    town.bio = clamp(town.bio - 2.2);
    town.air = clamp(town.air - 1.6);
  }
}

export function eventMultiplier(town: Town, eventCode: string): number {
  let mult = 1.0;
  for (const code of Object.keys(town.completed)) {
    mult *= CATALOGUE[code].eventMult[eventCode] ?? 1.0;
  }
  return mult;
}

export function applyEventPackA(town: Town, roundNo: number): { code: EventCode | null; damage: number } {
  let code: EventCode | null = null;
  let damage = 0.0;
  if (roundNo === 2) {
    code = "HEATWAVE";
    damage =
      10.0 +
      0.2 * (100.0 - town.water_q) +
      0.16 * (100.0 - town.bio) +
      0.18 * (100.0 - town.prep) -
      0.1 * town.buffer;
    damage = Math.max(0.0, damage) * eventMultiplier(town, code) * EVENT_SCALE;
    town.water_q = clamp(town.water_q - 0.16 * damage);
    town.health = clamp(town.health - 0.14 * damage);
    town.energy = clamp(town.energy - 0.08 * damage);
    town.buffer = clamp(town.buffer - 0.06 * damage);
  } else if (roundNo === 3) {
    code = "DROUGHT";
    damage =
      11.0 +
      0.24 * (100.0 - town.water_q) +
      0.16 * (100.0 - town.soil) +
      0.12 * (100.0 - town.prep) -
      0.08 * town.buffer;
    damage = Math.max(0.0, damage) * eventMultiplier(town, code) * EVENT_SCALE;
    town.water_q = clamp(town.water_q - 0.2 * damage);
    town.soil = clamp(town.soil - 0.12 * damage);
    town.economy = clamp(town.economy - 0.1 * damage);
    town.bio = clamp(town.bio - 0.08 * damage);
    town.jobs = clamp(town.jobs - 0.06 * damage);
  } else if (roundNo === 4) {
    code = "FLOOD";
    damage =
      12.0 +
      0.2 * (100.0 - town.infra) +
      0.18 * (100.0 - town.buffer) +
      0.12 * (100.0 - town.soil) +
      0.1 * (town.pollution - 40.0) -
      0.1 * town.prep;
    damage = Math.max(0.0, damage) * eventMultiplier(town, code) * EVENT_SCALE;
    town.infra = clamp(town.infra - 0.16 * damage);
    town.soil = clamp(town.soil - 0.1 * damage);
    town.water_q = clamp(town.water_q - 0.14 * damage);
    town.services = clamp(town.services - 0.08 * damage);
    town.economy = clamp(town.economy - 0.07 * damage);
  } else if (roundNo === 5) {
    code = "CONTAMINATION";
    damage =
      9.0 +
      0.24 * (town.pollution - 35.0) +
      0.16 * (100.0 - town.water_q) +
      0.12 * (100.0 - town.health) -
      0.1 * town.prep;
    damage = Math.max(0.0, damage) * eventMultiplier(town, code) * EVENT_SCALE;
    town.health = clamp(town.health - 0.18 * damage);
    town.jobs = clamp(town.jobs - 0.08 * damage);
    town.fiscal = clamp(town.fiscal - 0.06 * damage);
    town.air = clamp(town.air - 0.05 * damage);
  }
  town.shock_log.push(damage);
  return { code, damage };
}

export function ecologyIndex(town: Town): number {
  return (town.air + town.water_q + town.soil + town.bio + (100.0 - town.pollution)) / 5.0;
}

export function welfareIndex(town: Town): number {
  return (town.health + town.services + town.jobs) / 3.0;
}

export function economyIndex(town: Town): number {
  return (town.economy + town.fiscal + town.energy) / 3.0;
}

export function prepInfraIndex(town: Town): number {
  return 0.5 * town.prep + 0.5 * town.infra;
}

export function shockAbsorption(town: Town): number {
  const events = town.shock_log.filter((d) => d > 0);
  if (events.length === 0) return prepInfraIndex(town);
  return clamp(100.0 - events.reduce((a, b) => a + b, 0) / events.length);
}

export function resilienceIndex(town: Town): number {
  return 0.5 * prepInfraIndex(town) + 0.5 * shockAbsorption(town);
}

export function saturationWaste(spend: Record<string, number>): number {
  const spent = Math.max(spend._spent ?? 0.0, 1.0);
  let waste = 0.0;
  for (const k of SECTORS) waste += Math.max(0.0, (spend[k] ?? 0.0) - 520.0);
  return waste / spent;
}

export function efficiencyIndex(town: Town, spend: Record<string, number>): number {
  const discipline = reserveScore(town.reserve);
  const wasteScore = 100.0 * (1.0 - saturationWaste(spend));
  let useful = 0.0;
  let mass = 0.0;
  for (const k of SECTORS) {
    const s = spend[k] ?? 0.0;
    if (s <= 0) continue;
    useful += s * Math.exp(-s / SAT_SCALE);
    mass += s;
  }
  const yieldScore = mass ? (100.0 * useful) / mass : 50.0;
  return clamp(0.4 * discipline + 0.35 * wasteScore + 0.25 * yieldScore);
}

export function dysfunctionPenalty(town: Town): number {
  const e = ecologyIndex(town);
  const w = welfareIndex(town);
  const y = economyIndex(town);
  const r = prepInfraIndex(town);
  let penalty = 0.0;
  if (e < DYS_ECOLOGY) penalty += 0.62 * (DYS_ECOLOGY - e);
  if (w < DYS_WELFARE) penalty += 0.5 * (DYS_WELFARE - w);
  if (y < DYS_ECONOMY) penalty += 0.7 * (DYS_ECONOMY - y);
  if (r < DYS_PREP_INFRA) penalty += 0.35 * (DYS_PREP_INFRA - r);
  if (town.population < 47_000) penalty += 8.0;
  return penalty;
}

export function snapshot(town: Town, spend: Record<string, number>): Snapshot {
  const cats: Snapshot = {
    ecology: ecologyIndex(town),
    welfare: welfareIndex(town),
    economy: economyIndex(town),
    resilience: resilienceIndex(town),
    efficiency: efficiencyIndex(town, spend),
    penalty: 0,
    snapshot: 0,
  };
  const raw =
    WEIGHTS.ecology * cats.ecology +
    WEIGHTS.welfare * cats.welfare +
    WEIGHTS.economy * cats.economy +
    WEIGHTS.resilience * cats.resilience +
    WEIGHTS.efficiency * cats.efficiency;
  const penalty = dysfunctionPenalty(town);
  cats.penalty = penalty;
  cats.snapshot = clamp(raw - penalty);
  return cats;
}

export function finalScore(snapshots: number[]): number {
  if (snapshots.length === 0) return 0.0;
  const last = snapshots[snapshots.length - 1];
  const mean = snapshots.reduce((a, b) => a + b, 0) / snapshots.length;
  return pythonRound(clamp(0.62 * last + 0.38 * mean), 2);
}

export function meanEventDamage(town: Town): number {
  const events = town.shock_log.filter((d) => d > 0);
  if (events.length === 0) return 0.0;
  return events.reduce((a, b) => a + b, 0) / events.length;
}

export function tieBreakTuple(
  town: Town,
  snapshots: number[],
  seat: number,
): [number, number, number, number] {
  return [-finalScore(snapshots), -ecologyIndex(town), meanEventDamage(town), seat];
}

export function normalizeSpend(raw: Partial<Record<Sector, number>>, available: number): Record<string, number> {
  const values: Record<string, number> = {};
  for (const k of SECTORS) values[k] = Math.max(0.0, raw[k] ?? 0.0);
  let total = SECTORS.reduce((a, k) => a + values[k], 0);
  if (available <= 0 || total <= 0) {
    const out: Record<string, number> = {};
    for (const k of SECTORS) out[k] = 0.0;
    out._unspent_ratio = 1.0;
    out._spent = 0.0;
    out._unspent = Math.max(0.0, available);
    return out;
  }
  if (total > available) {
    const scale = available / total;
    for (const k of SECTORS) values[k] *= scale;
    total = available;
  }
  const unspent = Math.max(0.0, available - total);
  values._unspent_ratio = unspent / available;
  values._spent = total;
  values._unspent = unspent;
  return values;
}

export function mutexTaken(town: Town, group: string, extra: Iterable<string> = []): boolean {
  const owned = new Set([...Object.keys(town.started), ...extra]);
  for (const code of owned) {
    if (CATALOGUE[code]?.mutexGroup === group) return true;
  }
  return false;
}

export function resolveStarts(
  town: Town,
  starts: string[],
  available: number,
): { accepted: string[]; dropped: { code: string; reason: string }[]; remaining: number } {
  const dropped: { code: string; reason: string }[] = [];
  const accepted: string[] = [];
  let remaining = available;
  const seen = new Set<string>();
  for (const code of starts) {
    if (accepted.length >= MAX_STARTS) {
      dropped.push({ code, reason: "max_starts" });
      continue;
    }
    if (seen.has(code)) {
      dropped.push({ code, reason: "duplicate" });
      continue;
    }
    seen.add(code);
    const proj = CATALOGUE[code];
    if (!proj) {
      dropped.push({ code, reason: "unknown" });
      continue;
    }
    if (code in town.started) {
      dropped.push({ code, reason: "already_started" });
      continue;
    }
    const missing = proj.prerequisites.filter((p) => !(p in town.completed));
    if (missing.length) {
      dropped.push({ code, reason: "prereq:" + missing.join(",") });
      continue;
    }
    if (proj.mutexGroup && mutexTaken(town, proj.mutexGroup, accepted)) {
      dropped.push({ code, reason: "mutex" });
      continue;
    }
    if (proj.cost > remaining + 1e-9) {
      dropped.push({ code, reason: "budget" });
      continue;
    }
    remaining -= proj.cost;
    accepted.push(code);
  }
  return { accepted, dropped, remaining };
}

export function startProjects(town: Town, codes: string[], roundNo: number): number {
  let cost = 0.0;
  for (const code of codes) {
    const proj = CATALOGUE[code];
    cost += proj.cost;
    town.started[code] = roundNo;
    applyDeltas(town, proj.immediate);
    if (proj.buildRounds === 0) town.completed[code] = roundNo;
    const delayKeys = Object.keys(proj.delayed).map(Number);
    const maxDelay = delayKeys.length ? Math.max(...delayKeys) : proj.buildRounds;
    if (proj.buildRounds > 0 && delayKeys.length === 0) {
      town.pending.push({ landRound: roundNo + proj.buildRounds, deltas: {}, completeCode: code });
    }
    for (const delay of delayKeys.sort((a, b) => a - b)) {
      const complete = delay === maxDelay && delay === proj.buildRounds;
      town.pending.push({
        landRound: roundNo + delay,
        deltas: { ...proj.delayed[delay] },
        completeCode: complete ? code : null,
      });
    }
    if (proj.buildRounds > 0 && !(proj.buildRounds in proj.delayed)) {
      town.pending.push({ landRound: roundNo + proj.buildRounds, deltas: {}, completeCode: code });
    }
  }
  return cost;
}

export function emptySubmission(): Submission {
  return { allocations: {}, projectStarts: [] };
}

/** Architecture export: stepRound(town, submission, roundIndex). roundIndex is 1-based. */
export function stepRound(
  town: Town,
  submission: Submission | null | undefined,
  roundIndex: number,
): RoundResult {
  return stepRoundPy(town, roundIndex, submission);
}

/** Python argument order: step_round(town, round_no, submission). */
export function stepRoundPy(
  town: Town,
  roundNo: number,
  submission: Submission | null | undefined,
): RoundResult {
  const sub = submission ?? emptySubmission();
  applyDrift(town);
  applyPendingProjects(town, roundNo);
  applyOperatingDelayed(town);
  applyOngoing(town, roundNo);

  const income = incomeFor(town, roundNo);
  const maint = maintenanceDue(town, roundNo);
  const available = Math.max(0.0, town.reserve + income - maint);

  const { accepted, dropped, remaining: afterProjects } = resolveStarts(
    town,
    sub.projectStarts ?? [],
    available,
  );
  const spend = normalizeSpend(sub.allocations ?? {}, afterProjects);
  applyAllocations(town, spend);
  const projectCost = startProjects(town, accepted, roundNo);
  town.dropped_log.push(...dropped);

  const { code: eventCode, damage } = applyEventPackA(town, roundNo);
  town.reserve = spend._unspent;
  const snap = snapshot(town, spend);
  return {
    roundIndex: roundNo,
    income,
    maintenance: maint,
    available,
    projectCost,
    acceptedStarts: [...accepted],
    dropped,
    sectorSpend: spend,
    unspent: spend._unspent,
    eventCode,
    damage,
    snapshot: snap,
  };
}

function finishPlay(town: Town, rounds: RoundResult[]): PlayResult {
  const snaps = rounds.map((r) => r.snapshot.snapshot);
  const last = rounds[rounds.length - 1].snapshot;
  return {
    engine_version: ENGINE_VERSION,
    score: finalScore(snaps),
    snaps: snaps.map((s) => pythonRound(s, 6)),
    categories: last,
    ecology: ecologyIndex(town),
    mean_damage: meanEventDamage(town),
    reserve: town.reserve,
    population: town.population,
    started: { ...town.started },
    completed: { ...town.completed },
    dropped: [...town.dropped_log],
    shock_log: [...town.shock_log],
    hash: stateHash(town),
    rounds,
    town,
  };
}

export function play(submissions: Array<Submission | null | undefined> = []): PlayResult {
  const town = createInitialTown();
  const rounds: RoundResult[] = [];
  const planned = [...submissions];
  while (planned.length < ROUNDS) planned.push(null);
  for (let roundNo = 1; roundNo <= ROUNDS; roundNo++) {
    rounds.push(stepRoundPy(town, roundNo, planned[roundNo - 1]));
  }
  return finishPlay(town, rounds);
}

export function playInteractive(
  choose: (roundNo: number, town: Town, available: number) => Submission,
): PlayResult {
  const town = createInitialTown();
  const rounds: RoundResult[] = [];
  for (let roundNo = 1; roundNo <= ROUNDS; roundNo++) {
    const probe = cloneTown(town);
    applyDrift(probe);
    applyPendingProjects(probe, roundNo);
    applyOperatingDelayed(probe);
    applyOngoing(probe, roundNo);
    const income = incomeFor(probe, roundNo);
    const maint = maintenanceDue(probe, roundNo);
    const available = Math.max(0.0, probe.reserve + income - maint);
    const sub = choose(roundNo, probe, available);
    rounds.push(stepRoundPy(town, roundNo, sub));
  }
  return finishPlay(town, rounds);
}

export function splitAll(available: number, weights: Record<string, number>): Record<Sector, number> {
  const out = {} as Record<Sector, number>;
  for (const k of SECTORS) out[k] = available * (weights[k] ?? 0.0);
  return out;
}
