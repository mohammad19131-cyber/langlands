-- Phase 2 deterministic event seed. Idempotent.
-- Generated from packages/sim (engine py-ref-1.1.0, catalogue A-CAT-1.1).
-- Do not hand-edit catalogue rows; regenerate with:
--   npx vite-node --config packages/sim/vitest.config.ts supabase/scripts/generate-seed.ts
--
-- catalogue_hash (SHA-256 of canonical JSON) = 012772b8c972eef53d514180aecb6cf8e593eb8a6c933b726a0fc80b6642361f
-- town template checksum (stateHash of createInitialTown) = e0cfd3ee36b2edbeb965c9d4a4afa8f500c9cd0a92260964d4d23f28ccae2eba
-- starting reserve = 220
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
    'py-ref-1.1.0',
    20,
    6,
    0,
    '012772b8c972eef53d514180aecb6cf8e593eb8a6c933b726a0fc80b6642361f',
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
    '{"air":32,"water_q":38,"soil":36,"bio":28,"pollution":68,"health":44,"services":48,"jobs":46,"economy":50,"fiscal":52,"energy":42,"infra":46,"prep":30,"buffer":26,"reserve":220,"population":50000,"dirty_energy":1,"green_energy":0,"intensive_ag":0.4,"regenerative_ag":0.1,"industrial_intensity":0.45,"delayed":{},"pending":[],"started":{},"completed":{},"shock_log":[],"dropped_log":[]}'::jsonb,
    true,
    'e0cfd3ee36b2edbeb965c9d4a4afa8f500c9cd0a92260964d4d23f28ccae2eba'
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
    (
      'CLINICS',
      'Clinics and emergency services',
      'public_services'::public.sector,
      240,
      0,
      12,
      1,
      null,
      '[]'::jsonb,
      '{"health":6,"prep":3}'::jsonb,
      '{}'::jsonb,
      '{"health":0.4}'::jsonb,
      '{"CONTAMINATION":0.85}'::jsonb
    ),
    (
      'COAL',
      'Emergency thermal restart',
      'energy'::public.sector,
      280,
      0,
      18,
      1,
      'ENERGY_BASELOAD',
      '["GRID"]'::jsonb,
      '{"energy":8,"economy":4,"pollution":7,"air":-4,"dirty_energy":0.25}'::jsonb,
      '{}'::jsonb,
      '{"dirty_energy":0.05,"pollution":0.8}'::jsonb,
      '{}'::jsonb
    ),
    (
      'EMISSIONS',
      'Industrial emissions control',
      'pollution_control'::public.sector,
      260,
      1,
      10,
      1,
      null,
      '[]'::jsonb,
      '{}'::jsonb,
      '{"1":{"pollution":-8,"air":4}}'::jsonb,
      '{"pollution":-0.9,"economy":-0.2}'::jsonb,
      '{}'::jsonb
    ),
    (
      'FACTORIES',
      'Repair factories',
      'industry'::public.sector,
      240,
      1,
      12,
      1,
      null,
      '["GRID"]'::jsonb,
      '{}'::jsonb,
      '{"1":{"economy":5,"jobs":4,"pollution":2,"industrial_intensity":0.2}}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'FLOOD_WALL',
      'Flood defences',
      'infrastructure'::public.sector,
      300,
      1,
      8,
      1,
      null,
      '[]'::jsonb,
      '{"infra":5,"prep":6}'::jsonb,
      '{"1":{"buffer":7}}'::jsonb,
      '{}'::jsonb,
      '{"FLOOD":0.75}'::jsonb
    ),
    (
      'GREEN_MFG',
      'Green manufacturing conversion',
      'industry'::public.sector,
      280,
      1,
      10,
      1,
      null,
      '["EMISSIONS","FACTORIES"]'::jsonb,
      '{}'::jsonb,
      '{"1":{"economy":6,"pollution":-10,"jobs":4,"air":4,"industrial_intensity":-0.15}}'::jsonb,
      '{"pollution":-0.7,"economy":0.3}'::jsonb,
      '{"CONTAMINATION":0.9}'::jsonb
    ),
    (
      'GRID',
      'Grid repairs',
      'energy'::public.sector,
      200,
      0,
      8,
      1,
      null,
      '[]'::jsonb,
      '{"energy":6,"infra":2}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'INTENSE_AG',
      'Intensive yield push',
      'agriculture'::public.sector,
      240,
      0,
      11,
      1,
      'AGRI_PUSH',
      '[]'::jsonb,
      '{"economy":5,"jobs":4,"soil":-3,"water_q":-3,"pollution":3,"intensive_ag":0.3}'::jsonb,
      '{}'::jsonb,
      '{"intensive_ag":0.05}'::jsonb,
      '{}'::jsonb
    ),
    (
      'REFOREST',
      'Reforestation',
      'restoration'::public.sector,
      280,
      2,
      6,
      1,
      null,
      '[]'::jsonb,
      '{}'::jsonb,
      '{"1":{"air":5},"2":{"bio":11,"soil":6,"buffer":6}}'::jsonb,
      '{"air":0.25,"bio":0.25,"soil":0.15}'::jsonb,
      '{}'::jsonb
    ),
    (
      'REGEN_AG',
      'Regenerative farming',
      'agriculture'::public.sector,
      260,
      1,
      9,
      1,
      'AGRI_PUSH',
      '[]'::jsonb,
      '{"regenerative_ag":0.3}'::jsonb,
      '{"1":{"soil":5,"bio":3,"economy":2}}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'RENEWABLES',
      'Wind and solar park',
      'energy'::public.sector,
      360,
      2,
      10,
      1,
      'ENERGY_BASELOAD',
      '["GRID"]'::jsonb,
      '{}'::jsonb,
      '{"2":{"energy":7,"pollution":-3,"buffer":2,"green_energy":0.4}}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      'RIVER',
      'River cleanup',
      'restoration'::public.sector,
      240,
      0,
      6,
      1,
      null,
      '[]'::jsonb,
      '{"water_q":5,"pollution":-4}'::jsonb,
      '{}'::jsonb,
      '{"pollution":-0.55}'::jsonb,
      '{}'::jsonb
    ),
    (
      'WASTEWATER',
      'Wastewater upgrade',
      'pollution_control'::public.sector,
      300,
      1,
      8,
      1,
      null,
      '[]'::jsonb,
      '{}'::jsonb,
      '{"1":{"water_q":7,"pollution":-7,"health":5}}'::jsonb,
      '{}'::jsonb,
      '{"CONTAMINATION":0.9}'::jsonb
    ),
    (
      'WATER_TREAT',
      'Emergency water treatment',
      'water'::public.sector,
      200,
      0,
      10,
      1,
      null,
      '[]'::jsonb,
      '{"water_q":6,"health":2}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{"DROUGHT":0.9}'::jsonb
    ),
    (
      'WETLAND',
      'Wetland restoration',
      'restoration'::public.sector,
      280,
      1,
      6,
      1,
      null,
      '[]'::jsonb,
      '{}'::jsonb,
      '{"1":{"water_q":7,"bio":10,"soil":3,"buffer":8}}'::jsonb,
      '{"water_q":0.35,"bio":0.3,"buffer":0.2}'::jsonb,
      '{"FLOOD":0.85}'::jsonb
    )
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
    (
      competition,
      1,
      'scheduled'::public.round_status,
      timeline + ((1 - 1) * interval '20 minutes'),
      timeline + ((1 - 1) * interval '20 minutes') + interval '18 minutes',
      null
    ),
    (
      competition,
      2,
      'scheduled'::public.round_status,
      timeline + ((2 - 1) * interval '20 minutes'),
      timeline + ((2 - 1) * interval '20 minutes') + interval '18 minutes',
      'HEATWAVE'
    ),
    (
      competition,
      3,
      'scheduled'::public.round_status,
      timeline + ((3 - 1) * interval '20 minutes'),
      timeline + ((3 - 1) * interval '20 minutes') + interval '18 minutes',
      'DROUGHT'
    ),
    (
      competition,
      4,
      'scheduled'::public.round_status,
      timeline + ((4 - 1) * interval '20 minutes'),
      timeline + ((4 - 1) * interval '20 minutes') + interval '18 minutes',
      'FLOOD'
    ),
    (
      competition,
      5,
      'scheduled'::public.round_status,
      timeline + ((5 - 1) * interval '20 minutes'),
      timeline + ((5 - 1) * interval '20 minutes') + interval '18 minutes',
      'CONTAMINATION'
    ),
    (
      competition,
      6,
      'scheduled'::public.round_status,
      timeline + ((6 - 1) * interval '20 minutes'),
      timeline + ((6 - 1) * interval '20 minutes') + interval '18 minutes',
      null
    )
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
