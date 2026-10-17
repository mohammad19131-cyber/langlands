import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

export const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
export const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
export const USER_ORG = "cccccccc-cccc-cccc-cccc-ccccccccccc3";
export const USER_JUDGE = "dddddddd-dddd-dddd-dddd-ddddddddddd4";
export const USER_NONE = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5";

const BOOTSTRAP = `
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin nosuperuser noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin nosuperuser noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin nosuperuser noinherit bypassrls;
  end if;
end$$;

grant authenticated to postgres;
grant anon to postgres;
grant service_role to postgres;
grant usage on schema public to authenticated, anon, service_role;
grant usage on schema auth to authenticated, anon, service_role;
`;

function migrationFiles(): string[] {
  return [
    "0001_schema.sql",
    "0002_official_score_deltas.sql",
    "0003_profile_on_signup.sql",
    "0004_phase2_hardening.sql",
    "0005_seed_event.sql",
    "0006_round_machine.sql",
  ].map((name) => resolve(repoRoot, "supabase/migrations", name));
}

export async function applyMigrations(db: PGlite): Promise<void> {
  await db.exec(BOOTSTRAP);
  for (const file of migrationFiles()) {
    let sql = readFileSync(file, "utf8");
    if (file.endsWith("0001_schema.sql")) {
      sql = sql.replace(/create extension if not exists "pgcrypto";/, "-- pgcrypto loaded in harness");
    }
    await db.exec(sql);
  }
}

export async function createPglite(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await applyMigrations(db);
  return db;
}

export async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: userId })}', false)`);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claims', '', false)");
  }
}

export async function asServiceRole<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("select set_config('request.jwt.claims', '', false)");
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

export const EMPTY_ALLOCATIONS = {
  restoration: 0,
  pollution_control: 0,
  water: 0,
  energy: 0,
  agriculture: 0,
  industry: 0,
  infrastructure: 0,
  public_services: 0,
};

export async function fixtureUsers(db: PGlite): Promise<{
  competitionId: string;
  teamA: string;
  teamB: string;
  round1: string;
}> {
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${USER_A}', 'a@test.edu', '{"display_name":"Alpha"}'),
      ('${USER_B}', 'b@test.edu', '{"display_name":"Beta"}'),
      ('${USER_ORG}', 'org@test.edu', '{"display_name":"Organiser","role":"organiser"}'),
      ('${USER_JUDGE}', 'judge@test.edu', '{"display_name":"Judge","role":"judge"}'),
      ('${USER_NONE}', 'none@test.edu', '{"display_name":"Uninvited"}');
  `);

  const competition = await db.query<{ id: string }>(
    "select id from public.competitions where slug = 'langlands-r3'",
  );
  const competitionId = competition.rows[0].id;

  const teams = await db.query<{ id: string; seat: number }>(
    "select id, seat from public.teams where competition_id = $1 and seat in (1, 2) order by seat",
    [competitionId],
  );
  const teamA = teams.rows[0].id;
  const teamB = teams.rows[1].id;

  await db.exec(`
    insert into public.team_members (team_id, user_id, member_role) values
      ('${teamA}', '${USER_A}', 'member'),
      ('${teamB}', '${USER_B}', 'member');
    update public.profiles set role = 'organiser' where id = '${USER_ORG}';
    update public.profiles set role = 'judge' where id = '${USER_JUDGE}';
    insert into public.competition_staff (competition_id, user_id, staff_role) values
      ('${competitionId}', '${USER_ORG}', 'organiser'),
      ('${competitionId}', '${USER_JUDGE}', 'judge');
  `);

  const round = await db.query<{ id: string }>(
    "select id from public.rounds where competition_id = $1 and round_index = 1",
    [competitionId],
  );

  return { competitionId, teamA, teamB, round1: round.rows[0].id };
}

export async function openRound(db: PGlite, roundId: string): Promise<void> {
  await db.query(
    `update public.rounds
     set status = 'open',
         opens_at = now() - interval '1 minute',
         closes_at = now() + interval '1 hour'
     where id = $1`,
    [roundId],
  );
}

export function executor(db: PGlite) {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const result = await db.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

export async function supersedeAccepted(db: PGlite, teamId: string): Promise<void> {
  await db.query(
    `update public.submissions set status = 'superseded' where team_id = $1 and status = 'accepted'`,
    [teamId],
  );
}
