import { describe, expect, it } from "vitest";
import {
  asServiceRole,
  asUser,
  createPglite,
  fixtureUsers,
  openRound,
  USER_A,
} from "./harness";

describe("0007 team credentials", () => {
  it("adds login_id and password_hash on teams", async () => {
    const db = await createPglite();
    const { teamA } = await fixtureUsers(db);

    await db.query(
      `update public.teams
       set login_id = '004', password_hash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'
       where id = $1`,
      [teamA],
    );

    const row = await db.query<{ login_id: string; password_hash: string }>(
      `select login_id, password_hash from public.teams where id = $1`,
      [teamA],
    );
    expect(row.rows[0]?.login_id).toBe("004");
    expect(row.rows[0]?.password_hash).toMatch(/^\$2a\$/);

    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'teams'
         and column_name in ('login_id', 'password_hash')
       order by column_name`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(["login_id", "password_hash"]);
  });

  it("rejects malformed login_id values", async () => {
    const db = await createPglite();
    const { teamA } = await fixtureUsers(db);
    await expect(
      db.query(`update public.teams set login_id = 'ASHFEN' where id = $1`, [teamA]),
    ).rejects.toThrow();
  });

  it("enforces unique login_id per competition", async () => {
    const db = await createPglite();
    const { teamA, teamB } = await fixtureUsers(db);
    await db.query(`update public.teams set login_id = '004' where id = $1`, [teamA]);
    await expect(
      db.query(`update public.teams set login_id = '004' where id = $1`, [teamB]),
    ).rejects.toThrow();
  });

  it("submit_decision rejects disqualified teams", async () => {
    const db = await createPglite();
    const { teamA, round1 } = await fixtureUsers(db);
    await openRound(db, round1);
    await db.query(`update public.teams set disqualified = true where id = $1`, [teamA]);

    await expect(
      asUser(db, USER_A, () =>
        db.query(
          `select public.submit_decision($1, $2, $3::jsonb, $4::text[], $5, $6)`,
          [
            round1,
            teamA,
            JSON.stringify({
              restoration: 20,
              pollution_control: 20,
              water: 20,
              energy: 20,
              food: 20,
              health_services: 20,
              industry: 20,
              resilience: 20,
            }),
            [],
            "dq-test-key-01",
            "py-ref-1.1.0",
          ],
        ),
      ),
    ).rejects.toThrow(/unauthorized/i);
  });
});

describe("0012 teams password_hash grants", () => {
  async function privilege(
    db: Awaited<ReturnType<typeof createPglite>>,
    role: string,
    column: string,
  ) {
    const result = await db.query<{ allowed: boolean }>(
      `select has_column_privilege($1, 'public.teams'::regclass, $2, 'SELECT') as allowed`,
      [role, column],
    );
    return result.rows[0]?.allowed ?? false;
  }

  it("denies anon and authenticated SELECT on password_hash and keeps public team columns", async () => {
    const db = await createPglite();

    expect(await privilege(db, "anon", "password_hash")).toBe(false);
    expect(await privilege(db, "anon", "name")).toBe(false);
    expect(await privilege(db, "authenticated", "password_hash")).toBe(false);
    expect(await privilege(db, "authenticated", "id")).toBe(true);
    expect(await privilege(db, "authenticated", "competition_id")).toBe(true);
    expect(await privilege(db, "authenticated", "seat")).toBe(true);
    expect(await privilege(db, "authenticated", "name")).toBe(true);
    expect(await privilege(db, "authenticated", "slug")).toBe(true);
    expect(await privilege(db, "authenticated", "disqualified")).toBe(true);
    expect(await privilege(db, "authenticated", "login_id")).toBe(true);
    expect(await privilege(db, "service_role", "password_hash")).toBe(true);
  });

  it("authenticated can read public team fields but not the hash; service_role still can", async () => {
    const db = await createPglite();
    const { teamA } = await fixtureUsers(db);
    await db.query(
      `update public.teams
       set login_id = '004', password_hash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'
       where id = $1`,
      [teamA],
    );

    await expect(
      asUser(db, USER_A, () =>
        db.query(`select password_hash from public.teams where id = $1`, [teamA]),
      ),
    ).rejects.toThrow();

    const publicCols = await asUser(db, USER_A, () =>
      db.query<{ id: string; name: string; seat: number; login_id: string }>(
        `select id, name, seat, login_id, disqualified from public.teams where id = $1`,
        [teamA],
      ),
    );
    expect(publicCols.rows[0]?.login_id).toBe("004");
    expect(publicCols.rows[0]?.seat).toBe(1);

    const asAdmin = await asServiceRole(db, () =>
      db.query<{ password_hash: string }>(
        `select password_hash from public.teams where id = $1`,
        [teamA],
      ),
    );
    expect(asAdmin.rows[0]?.password_hash).toMatch(/^\$2a\$/);
  });
});
