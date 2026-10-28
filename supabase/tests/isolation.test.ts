import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { catalogueHash } from "../scripts/canonicalCatalogue.ts";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
  USER_B,
  USER_JUDGE,
  USER_NONE,
  USER_ORG,
  asServiceRole,
  asUser,
  createPglite,
  fixtureUsers,
  openRound,
  supersedeAccepted,
} from "./harness.ts";

const T0_HASH = "e0cfd3ee36b2edbeb965c9d4a4afa8f500c9cd0a92260964d4d23f28ccae2eba";
const PUBLIC_RESULT_COLUMNS = [
  "team_seat",
  "team_name",
  "air",
  "water_q",
  "soil",
  "bio",
  "pollution",
  "health",
  "services",
  "jobs",
  "economy",
  "fiscal",
  "energy",
  "infra",
  "prep",
  "buffer",
  "reserve",
  "population",
  "energy_mix",
  "agriculture",
  "industry",
  "score_breakdown",
  "snapshot_score",
  "final_score",
];

let db: PGlite;
let competitionId: string;
let teamA: string;
let teamB: string;
let round1: string;

const allocJson = JSON.stringify(EMPTY_ALLOCATIONS);

describe("Phase 2 isolation (PGlite + stub auth)", () => {
  beforeAll(async () => {
    db = await createPglite();
    const fx = await fixtureUsers(db);
    competitionId = fx.competitionId;
    teamA = fx.teamA;
    teamB = fx.teamB;
    round1 = fx.round1;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("seeds 20 identical towns, 15 interventions, 6 pack A rounds, frozen hashes", async () => {
    const summary = await db.query<{
      teams: number;
      projects: number;
      rounds: number;
      catalogue_hash: string;
      checksum: string;
      reserve: number;
      members: number;
      results: number;
      states: number;
    }>(`
      select
        (select count(*) from public.teams where competition_id = '${competitionId}')::int as teams,
        (select count(*) from public.catalogue_projects where competition_id = '${competitionId}')::int as projects,
        (select count(*) from public.rounds where competition_id = '${competitionId}')::int as rounds,
        (select catalogue_hash from public.competitions where id = '${competitionId}') as catalogue_hash,
        (select checksum from public.town_templates where competition_id = '${competitionId}') as checksum,
        (select (initial_state->>'reserve')::numeric from public.town_templates where competition_id = '${competitionId}') as reserve,
        (select count(*) from public.team_members m join public.teams t on t.id = m.team_id where t.competition_id = '${competitionId}')::int as members,
        (select count(*) from public.published_results)::int as results,
        (select count(*) from public.town_states)::int as states
    `);
    expect(summary.rows[0].teams).toBe(20);
    expect(summary.rows[0].projects).toBe(15);
    expect(summary.rows[0].rounds).toBe(6);
    expect(summary.rows[0].catalogue_hash).toBe(catalogueHash());
    expect(summary.rows[0].checksum).toBe(T0_HASH);
    expect(Number(summary.rows[0].reserve)).toBe(220);
    expect(summary.rows[0].members).toBe(2);
    expect(summary.rows[0].results).toBe(0);
    expect(summary.rows[0].states).toBe(0);

    const events = await db.query<{ round_index: number; event_code: string | null }>(
      `select round_index, event_code from public.rounds
       where competition_id = '${competitionId}' order by round_index`,
    );
    expect(events.rows.map((r) => r.event_code)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);
  });

  it("reruns the seed without duplicating teams, rounds, or catalogue rows", async () => {
    const first = await db.query<{ id: string }>(
      "select public.seed_langlands_r3() as id",
    );
    const second = await db.query<{ id: string }>(
      "select public.seed_langlands_r3() as id",
    );
    expect(first.rows[0].id).toBe(competitionId);
    expect(second.rows[0].id).toBe(competitionId);
    const counts = await db.query<{ teams: number; rounds: number; projects: number }>(`
      select
        (select count(*) from public.teams where competition_id = '${competitionId}')::int as teams,
        (select count(*) from public.rounds where competition_id = '${competitionId}')::int as rounds,
        (select count(*) from public.catalogue_projects where competition_id = '${competitionId}')::int as projects
    `);
    expect(counts.rows[0]).toEqual({ teams: 20, rounds: 6, projects: 15 });
  });

  it("rejects a seventh round and a round_count other than 6", async () => {
    await expect(
      db.exec(`
        insert into public.rounds (competition_id, round_index, status, opens_at, closes_at)
        values ('${competitionId}', 7, 'scheduled', now(), now() + interval '18 minutes')
      `),
    ).rejects.toThrow();
    await expect(
      db.exec(`update public.competitions set round_count = 8 where id = '${competitionId}'`),
    ).rejects.toThrow();
  });

  it("Team A cannot read or modify Team B submissions", async () => {
    await openRound(db, round1);
    await asUser(db, USER_A, async () => {
      await db.exec(`
        insert into public.submissions (
          round_id, team_id, allocations, project_starts, idempotency_key, schema_version
        ) values (
          '${round1}', '${teamA}', '${allocJson}'::jsonb, '{}', 'key-a-1', '1'
        )
      `);
    });
    await asUser(db, USER_B, async () => {
      await db.exec(`
        insert into public.submissions (
          round_id, team_id, allocations, project_starts, idempotency_key, schema_version
        ) values (
          '${round1}', '${teamB}', '${allocJson}'::jsonb, '{}', 'key-b-1', '1'
        )
      `);
    });

    const seen = await asUser(db, USER_A, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.submissions where team_id = '${teamB}'`,
      ),
    );
    expect(seen.rows[0].n).toBe(0);

    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamB}', '${allocJson}'::jsonb, '{}', 'spoof', '1'
          )
        `),
      ),
    ).rejects.toThrow();
  });

  it("a member cannot assign organiser or judge to themselves", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`update public.profiles set role = 'organiser' where id = '${USER_A}'`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.competition_staff (competition_id, user_id, staff_role)
          values ('${competitionId}', '${USER_A}', 'organiser')
        `),
      ),
    ).rejects.toThrow();
    const role = await asUser(db, USER_A, () =>
      db.query<{ role: string }>(`select role from public.profiles where id = '${USER_A}'`),
    );
    expect(role.rows[0].role).toBe("member");
  });

  it("signup metadata cannot create a privileged profile", async () => {
    const spoofId = "ffffffff-ffff-ffff-ffff-fffffffffff6";
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ('${spoofId}', 'spoof@test.edu', '{"display_name":"Spoof","role":"organiser"}')
    `);
    const spoof = await db.query<{ role: string }>(
      `select role from public.profiles where id = '${spoofId}'`,
    );
    expect(spoof.rows[0].role).toBe("member");
    const none = await db.query<{ role: string }>(
      `select role from public.profiles where id = '${USER_NONE}'`,
    );
    expect(none.rows[0].role).toBe("member");
  });

  it("teams cannot modify official scores, budgets, timers, or simulation state", async () => {
    await db.exec(`
      insert into public.town_states (
        team_id, round_id, round_index, state, score_breakdown, snapshot_score, final_score, engine_version
      ) values (
        '${teamB}', '${round1}', 1,
        '{"reserve": 9999}'::jsonb,
        '{"ecology":1,"welfare":1,"economy":1,"resilience":1,"efficiency":1,"penalty":0,"snapshot":1}'::jsonb,
        12.34, 12.34, 'py-ref-1.1.0'
      )
    `);

    await expect(
      asUser(db, USER_A, () =>
        db.exec(`update public.rounds set closes_at = now() + interval '2 days' where id = '${round1}'`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`insert into public.town_states (
          team_id, round_id, round_index, state, score_breakdown, snapshot_score, engine_version
        ) values (
          '${teamA}', '${round1}', 1, '{}'::jsonb,
          '{"ecology":0,"welfare":0,"economy":0,"resilience":0,"efficiency":0,"penalty":0,"snapshot":0}'::jsonb,
          99, 'py-ref-1.1.0'
        )`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`update public.town_states set final_score = 100 where team_id = '${teamB}'`),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`update public.competitions set current_round_index = 6 where id = '${competitionId}'`),
      ),
    ).rejects.toThrow();

    const leaked = await asUser(db, USER_A, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.town_states where team_id = '${teamB}'`,
      ),
    );
    expect(leaked.rows[0].n).toBe(0);
  });

  it("uninvited users and judges cannot submit decisions", async () => {
    await expect(
      asUser(db, USER_NONE, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{}', 'none', '1'
          )
        `),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, USER_JUDGE, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{}', 'judge', '1'
          )
        `),
      ),
    ).rejects.toThrow();
  });

  it("repeated idempotency keys cannot duplicate submissions", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{}', 'key-a-1', '1'
          )
        `),
      ),
    ).rejects.toThrow();
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from public.submissions where team_id = '${teamA}' and idempotency_key = 'key-a-1'`,
    );
    expect(n.rows[0].n).toBe(1);
  });

  it("rejects unknown interventions, mutex pairs, and a third start", async () => {
    await openRound(db, round1);
    await supersedeAccepted(db, teamA);
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{NOPE}', 'bad-code', '1'
          )
        `),
      ),
    ).rejects.toThrow(/unknown intervention/);
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{COAL,RENEWABLES}', 'mutex', '1'
          )
        `),
      ),
    ).rejects.toThrow(/ENERGY_BASELOAD/);
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{GRID,RIVER,CLINICS}', 'three', '1'
          )
        `),
      ),
    ).rejects.toThrow();
  });

  it("published result rows contain only TownPublic fields and hide rival teams", async () => {
    const cols = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'published_results'
      order by ordinal_position
    `);
    const names = cols.rows.map((r) => r.column_name);
    for (const col of ["state", "owned_projects", "allocations", "project_starts", "pending"]) {
      expect(names).not.toContain(col);
    }
    for (const col of PUBLIC_RESULT_COLUMNS) {
      expect(names).toContain(col);
    }

    await db.exec(`
      update public.rounds set status = 'published', published_at = now() where id = '${round1}';
      insert into public.published_results (
        team_id, round_id, round_index, team_seat, team_name,
        air, water_q, soil, bio, pollution, health, services, jobs, economy, fiscal, energy, infra, prep, buffer,
        reserve, population, energy_mix, agriculture, industry,
        score_breakdown, snapshot_score, final_score, engine_version
      ) values (
        '${teamB}', '${round1}', 1, 2, 'Seat 02',
        32, 38, 36, 28, 68, 44, 48, 46, 50, 52, 42, 46, 30, 26,
        220, 50000, 'thermal-heavy', 'mixed', 'light',
        '{"ecology":33.2,"welfare":46,"economy":48,"resilience":38,"efficiency":40,"penalty":1,"snapshot":40}'::jsonb,
        40.00, 40.00, 'py-ref-1.1.0'
      );
    `);

    const rivalRow = await asUser(db, USER_A, () =>
      db.query<Record<string, unknown>>(
        `select * from public.published_results where team_id = '${teamB}'`,
      ),
    );
    expect(rivalRow.rows.length).toBe(0);

    const privateRow = await asUser(db, USER_A, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.town_states where team_id = '${teamB}'`,
      ),
    );
    expect(privateRow.rows[0].n).toBe(0);
  });

  it("judges cannot read live submissions; organisers can", async () => {
    const judgeView = await asUser(db, USER_JUDGE, () =>
      db.query<{ n: number }>("select count(*)::int as n from public.submissions"),
    );
    expect(judgeView.rows[0].n).toBe(0);

    const orgView = await asUser(db, USER_ORG, () =>
      db.query<{ n: number }>("select count(*)::int as n from public.submissions"),
    );
    expect(orgView.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it("participants cannot read private lock allocations", async () => {
    await openRound(db, round1);
    await db.query(`select public.lock_round($1::uuid, $2::uuid)`, [round1, USER_ORG]);
    await asUser(db, USER_A, async () => {
      await expect(db.query("select payload from public.round_lock_private")).rejects.toThrow();
      await expect(db.query("select public.lock_round($1::uuid, $2::uuid)", [round1, USER_A])).rejects.toThrow();
      await expect(db.query("select public.lock_round($1::uuid, $2::uuid)", [round1, USER_ORG])).rejects.toThrow();
      const publicCols = await db.query<{ lock_manifest: unknown }>(
        `select lock_manifest from public.rounds where id = '${round1}'`,
      );
      const blob = JSON.stringify(publicCols.rows[0]?.lock_manifest ?? {});
      expect(blob).not.toMatch(/allocations/i);
      expect(blob).not.toMatch(/projectStarts/i);
      expect(blob).not.toMatch(/teamId/i);
      expect(blob).toMatch(/"seat"/);
      const star = await db.query<Record<string, unknown>>(
        `select * from public.rounds where id = '${round1}'`,
      );
      expect(JSON.stringify(star.rows[0] ?? {})).not.toMatch(/allocations/i);
    });
    const privateRow = await db.query<{ payload: unknown }>(
      `select payload from public.round_lock_private where round_id = '${round1}'`,
    );
    const privateBlob = JSON.stringify(privateRow.rows[0]?.payload ?? {});
    expect(privateBlob).toMatch(/teamId/);
    expect(privateBlob).toMatch(/allocations/);
  });

  it("rewound client clocks cannot insert after closes_at", async () => {
    await supersedeAccepted(db, teamA);
    await db.exec(
      `update public.rounds set status = 'open', opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute' where id = '${round1}'`,
    );
    await expect(
      asUser(db, USER_A, () =>
        db.exec(`
          insert into public.submissions (
            round_id, team_id, allocations, project_starts, idempotency_key, schema_version, client_claimed_at
          ) values (
            '${round1}', '${teamA}', '${allocJson}'::jsonb, '{}', 'late-clock', '1', now() - interval '3 hours'
          )
        `),
      ),
    ).rejects.toThrow();
  });

  it("service role is required for official writes; authenticated cannot use the seed function", async () => {
    await expect(
      asUser(db, USER_A, () => db.exec("select public.seed_langlands_r3()")),
    ).rejects.toThrow();
    await asServiceRole(db, async () => {
      const rows = await db.query<{ n: number }>(
        "select count(*)::int as n from public.published_results",
      );
      expect(rows.rows[0].n).toBe(1);
    });
  });
});
