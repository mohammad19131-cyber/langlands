import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGUE } from "../../packages/sim/src/catalogue.ts";
import { ENGINE_VERSION, PACK_A, STARTING_RESERVE } from "../../packages/sim/src/constants.ts";
import { createInitialTown, stateHash } from "../../packages/sim/src/index.ts";
import { canonicalCatalogueRows, catalogueHash } from "./canonicalCatalogue.ts";

const here = dirname(fileURLToPath(import.meta.url));
const hash = catalogueHash();
const town = createInitialTown();
const townHash = stateHash(town);
const projects = canonicalCatalogueRows();

function sqlStr(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown): string {
  return sqlStr(JSON.stringify(value));
}

const projectValues = projects
  .map((project) => {
    const src = CATALOGUE[project.code];
    return `    (
      ${sqlStr(src.code)},
      ${sqlStr(src.name)},
      ${sqlStr(src.sector)}::public.sector,
      ${src.cost},
      ${src.buildRounds},
      ${src.maintenance},
      1,
      ${src.mutexGroup === null ? "null" : sqlStr(src.mutexGroup)},
      ${sqlJson(src.prerequisites)}::jsonb,
      ${sqlJson(src.immediate)}::jsonb,
      ${sqlJson(src.delayed)}::jsonb,
      ${sqlJson(src.ongoing)}::jsonb,
      ${sqlJson(src.eventMult)}::jsonb
    )`;
  })
  .join(",\n");

const eventSql = [1, 2, 3, 4, 5, 6]
  .map((round) => {
    const code = PACK_A[round];
    const event = code === null ? "null" : sqlStr(code);
    return `    (
      competition,
      ${round},
      'scheduled'::public.round_status,
      timeline + ((${round} - 1) * interval '20 minutes'),
      timeline + ((${round} - 1) * interval '20 minutes') + interval '18 minutes',
      ${event}
    )`;
  })
  .join(",\n");

const sql = `-- Phase 2 deterministic event seed. Idempotent.
-- Generated from packages/sim (engine ${ENGINE_VERSION}, catalogue A-CAT-1.1).
-- Do not hand-edit catalogue rows; regenerate with:
--   npx vite-node --config packages/sim/vitest.config.ts supabase/scripts/generate-seed.ts
--
-- catalogue_hash (SHA-256 of canonical JSON) = ${hash}
-- town template checksum (stateHash of createInitialTown) = ${townHash}
-- starting reserve = ${STARTING_RESERVE}
-- Does not create users, scores, submissions, or town_states.

create or replace function public.seed_langlands_r3()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  competition uuid;
  timeline timestamptz := timestamptz '2099-06-01 09:00:00+00';
  seat_no integer;
begin
  insert into public.competitions (
    slug,
    title,
    status,
    rules_version,
    scenario_pack,
    engine_version,
    team_count,
    round_count,
    current_round_index,
    catalogue_hash,
    created_by
  ) values (
    'langlands-r3',
    'Langlands R3 Environmental Strategy Challenge',
    'ready',
    'A-CAT-1.1',
    'A',
    ${sqlStr(ENGINE_VERSION)},
    20,
    6,
    0,
    ${sqlStr(hash)},
    null
  )
  on conflict (slug) do update set
    title = excluded.title,
    rules_version = excluded.rules_version,
    scenario_pack = excluded.scenario_pack,
    engine_version = excluded.engine_version,
    team_count = 20,
    round_count = 6,
    catalogue_hash = excluded.catalogue_hash
  where public.competitions.status in ('draft', 'ready')
  returning id into competition;

  if competition is null then
    select id into competition from public.competitions where slug = 'langlands-r3';
  end if;

  insert into public.town_templates (competition_id, initial_state, published, checksum)
  values (
    competition,
    ${sqlJson(town)}::jsonb,
    true,
    ${sqlStr(townHash)}
  )
  on conflict (competition_id) do update set
    initial_state = excluded.initial_state,
    published = true,
    checksum = excluded.checksum;

  insert into public.catalogue_projects (
    competition_id,
    code,
    name,
    sector,
    cost,
    build_rounds,
    maintenance_per_round,
    max_copies,
    mutex_group,
    prerequisites,
    immediate_effects,
    delayed_effects,
    ongoing_effects,
    event_multipliers
  )
  select
    competition,
    v.code,
    v.name,
    v.sector,
    v.cost,
    v.build_rounds,
    v.maintenance_per_round,
    v.max_copies,
    v.mutex_group,
    v.prerequisites,
    v.immediate_effects,
    v.delayed_effects,
    v.ongoing_effects,
    v.event_multipliers
  from (
    values
${projectValues}
  ) as v(
    code,
    name,
    sector,
    cost,
    build_rounds,
    maintenance_per_round,
    max_copies,
    mutex_group,
    prerequisites,
    immediate_effects,
    delayed_effects,
    ongoing_effects,
    event_multipliers
  )
  on conflict (competition_id, code) do update set
    name = excluded.name,
    sector = excluded.sector,
    cost = excluded.cost,
    build_rounds = excluded.build_rounds,
    maintenance_per_round = excluded.maintenance_per_round,
    max_copies = excluded.max_copies,
    mutex_group = excluded.mutex_group,
    prerequisites = excluded.prerequisites,
    immediate_effects = excluded.immediate_effects,
    delayed_effects = excluded.delayed_effects,
    ongoing_effects = excluded.ongoing_effects,
    event_multipliers = excluded.event_multipliers;

  insert into public.rounds (
    competition_id,
    round_index,
    status,
    opens_at,
    closes_at,
    event_code
  )
  values
${eventSql}
  on conflict (competition_id, round_index) do update set
    event_code = excluded.event_code
  where public.rounds.status = 'scheduled';

  for seat_no in 1..20 loop
    insert into public.teams (competition_id, seat, name, slug, disqualified)
    values (
      competition,
      seat_no,
      'Seat ' || lpad(seat_no::text, 2, '0'),
      'seat-' || lpad(seat_no::text, 2, '0'),
      false
    )
    on conflict (competition_id, seat) do nothing;
  end loop;

  if (select count(*) from public.teams where competition_id = competition) <> 20 then
    raise exception 'seed requires exactly 20 teams';
  end if;
  if (select count(*) from public.catalogue_projects where competition_id = competition) <> 15 then
    raise exception 'seed requires exactly 15 catalogue projects';
  end if;
  if (select count(*) from public.rounds where competition_id = competition) <> 6 then
    raise exception 'seed requires exactly 6 rounds';
  end if;

  return competition;
end;
$$;

revoke all on function public.seed_langlands_r3() from public, anon, authenticated;
grant execute on function public.seed_langlands_r3() to service_role;

select public.seed_langlands_r3();
`;

writeFileSync(resolve(here, "../migrations/0005_seed_event.sql"), sql);
process.stdout.write(`wrote 0005_seed_event.sql\ncatalogue_hash=${hash}\ntown_hash=${townHash}\n`);
