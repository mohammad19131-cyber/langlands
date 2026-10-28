import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  USER_A,
  USER_B,
  USER_JUDGE,
  USER_NONE,
  USER_ORG,
  asAnon,
  asServiceRole,
  asUser,
  createPglite,
  fixtureUsers,
} from "./harness.ts";

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

const PRIVATE_COLUMNS = ["state", "owned_projects", "allocations", "project_starts", "pending"];

function insertResultSql(args: {
  teamId: string;
  roundId: string;
  seat: number;
  name: string;
}): string {
  return `
    insert into public.published_results (
      team_id, round_id, round_index, team_seat, team_name,
      air, water_q, soil, bio, pollution, health, services, jobs, economy, fiscal, energy, infra, prep, buffer,
      reserve, population, energy_mix, agriculture, industry,
      score_breakdown, snapshot_score, final_score, engine_version
    ) values (
      '${args.teamId}', '${args.roundId}', 1, ${args.seat}, '${args.name}',
      32, 38, 36, 28, 68, 44, 48, 46, 50, 52, 42, 46, 30, 26,
      220, 50000, 'thermal-heavy', 'mixed', 'light',
      '{"ecology":33.2,"welfare":46,"economy":48,"resilience":38,"efficiency":40,"penalty":1,"snapshot":40}'::jsonb,
      40.00, 40.00, 'py-ref-1.1.0'
    )
  `;
}

async function countPublished(
  db: PGlite,
  userId: string,
  where = "",
): Promise<number> {
  const q = await asUser(db, userId, () =>
    db.query<{ n: number }>(`select count(*)::int as n from public.published_results ${where}`),
  );
  return q.rows[0].n;
}

let db: PGlite;
let teamA: string;
let teamB: string;
let round1: string;
let round2: string;

describe("published_results privacy (PGlite RLS; hosted PostgREST NOT VERIFIED)", () => {
  beforeAll(async () => {
    db = await createPglite();
    const fx = await fixtureUsers(db);
    teamA = fx.teamA;
    teamB = fx.teamB;
    round1 = fx.round1;
    const r2 = await db.query<{ id: string }>(
      `select id from public.rounds where competition_id = $1 and round_index = 2`,
      [fx.competitionId],
    );
    round2 = r2.rows[0].id;

    await db.exec(insertResultSql({ teamId: teamA, roundId: round1, seat: 1, name: "Seat 01" }));
    await db.exec(insertResultSql({ teamId: teamB, roundId: round1, seat: 2, name: "Seat 02" }));
    await db.exec(insertResultSql({ teamId: teamA, roundId: round2, seat: 1, name: "Seat 01" }));
    await db.exec(insertResultSql({ teamId: teamB, roundId: round2, seat: 2, name: "Seat 02" }));
    await db.exec(`update public.rounds set status = 'published', published_at = now() where id = '${round1}'`);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("table exposes TownPublic columns only", async () => {
    const cols = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'published_results'
    `);
    const names = cols.rows.map((r) => r.column_name);
    for (const col of PRIVATE_COLUMNS) {
      expect(names).not.toContain(col);
    }
    for (const col of PUBLIC_RESULT_COLUMNS) {
      expect(names).toContain(col);
    }
  });

  it("unpublished rows stay hidden from captains, organisers, and judges", async () => {
    expect(await countPublished(db, USER_A, `where round_id = '${round2}'`)).toBe(0);
    expect(await countPublished(db, USER_B, `where round_id = '${round2}'`)).toBe(0);
    expect(await countPublished(db, USER_ORG, `where round_id = '${round2}'`)).toBe(0);
    expect(await countPublished(db, USER_JUDGE, `where round_id = '${round2}'`)).toBe(0);
  });

  it("captain A reads own published row and cannot read captain B", async () => {
    const own = await asUser(db, USER_A, () =>
      db.query<{ team_id: string; team_seat: number; final_score: string }>(
        `select team_id, team_seat, final_score from public.published_results where round_id = '${round1}'`,
      ),
    );
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].team_id).toBe(teamA);
    expect(own.rows[0].team_seat).toBe(1);
    expect(Number(own.rows[0].final_score)).toBe(40);

    expect(await countPublished(db, USER_A, `where team_id = '${teamB}'`)).toBe(0);
    expect(await countPublished(db, USER_B, `where team_id = '${teamA}'`)).toBe(0);
    expect(await countPublished(db, USER_B, `where round_id = '${round1}'`)).toBe(1);
  });

  it("uninvited authenticated user cannot read published results", async () => {
    expect(await countPublished(db, USER_NONE)).toBe(0);
  });

  it("organiser and judge of that competition read published TownPublic rows", async () => {
    expect(await countPublished(db, USER_ORG, `where round_id = '${round1}'`)).toBe(2);
    expect(await countPublished(db, USER_JUDGE, `where round_id = '${round1}'`)).toBe(2);
  });

  it("service role (Next.js authorised path) still loads every published row", async () => {
    const rows = await asServiceRole(db, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.published_results where round_id = '${round1}'`,
      ),
    );
    expect(rows.rows[0].n).toBe(2);
  });

  it("captain cannot read rival submissions, town_states, or lock payloads", async () => {
    expect(
      (
        await asUser(db, USER_A, () =>
          db.query<{ n: number }>(`select count(*)::int as n from public.submissions where team_id = '${teamB}'`),
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await asUser(db, USER_A, () =>
          db.query<{ n: number }>(`select count(*)::int as n from public.town_states where team_id = '${teamB}'`),
        )
      ).rows[0].n,
    ).toBe(0);
    await asUser(db, USER_A, async () => {
      await expect(db.query("select payload from public.round_lock_private")).rejects.toThrow();
    });
  });

  it("authenticated cannot insert published_results", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.exec(insertResultSql({ teamId: teamA, roundId: round1, seat: 1, name: "Seat 01" })),
      ),
    ).rejects.toThrow();
  });

  it("anon cannot read published_results", async () => {
    // Hosted GRANT/JWT is NOT VERIFIED. Locally: either privilege denied or 0 rows.
    let denied = false;
    let n = -1;
    try {
      const q = await asAnon(db, () =>
        db.query<{ n: number }>("select count(*)::int as n from public.published_results"),
      );
      n = q.rows[0].n;
    } catch {
      denied = true;
    }
    expect(denied || n === 0).toBe(true);
  });

  it("publication gating still opens own rows after the round is published", async () => {
    await db.exec(
      `update public.rounds set status = 'published', published_at = now() where id = '${round2}'`,
    );
    const own = await asUser(db, USER_A, () =>
      db.query<{ round_id: string; team_id: string }>(
        `select round_id, team_id from public.published_results order by round_index`,
      ),
    );
    expect(own.rows).toHaveLength(2);
    expect(own.rows.every((row) => row.team_id === teamA)).toBe(true);
    expect(await countPublished(db, USER_A, `where team_id = '${teamB}'`)).toBe(0);
    expect(await countPublished(db, USER_ORG)).toBe(4);
  });
});
