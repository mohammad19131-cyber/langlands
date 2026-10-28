import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createInitialTown, type Town } from "@langlands/sim";
import {
  lockRound,
  openRound,
  parseTown,
  processClaimedRound,
  publishWithRecompute,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import {
  EMPTY_ALLOCATIONS,
  USER_ORG,
  asUser,
  createPglite,
  executor,
} from "./harness.ts";

function userIdForSeat(seat: number): string {
  return `c0000000-0000-4000-8000-${String(seat).padStart(12, "0")}`;
}

describe("hosted-shaped WATER_TREAT lifecycle (PGlite, not hosted)", () => {
  let db: PGlite;
  let exec: Executor;
  let competitionId: string;
  let seats: { id: string; seat: number; userId: string }[];
  let rounds: { id: string; round_index: number }[];

  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);

    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data) values
        ('${USER_ORG}', 'org@test.edu', '{"display_name":"Organiser","role":"organiser"}')
    `);
    for (let seat = 1; seat <= 20; seat++) {
      const id = userIdForSeat(seat);
      await db.exec(`
        insert into auth.users (id, email, raw_user_meta_data) values
          ('${id}', 'seat${String(seat).padStart(2, "0")}@test.edu', '{"display_name":"Seat ${seat}"}')
      `);
    }

    const competition = await db.query<{ id: string }>(
      "select id from public.competitions where slug = 'langlands-r3'",
    );
    competitionId = competition.rows[0].id;
    await db.exec(`
      update public.profiles set role = 'organiser' where id = '${USER_ORG}';
      insert into public.competition_staff (competition_id, user_id, staff_role)
        values ('${competitionId}', '${USER_ORG}', 'organiser');
    `);

    const teamRows = await db.query<{ id: string; seat: number }>(
      `select id, seat from public.teams where competition_id = $1 order by seat`,
      [competitionId],
    );
    expect(teamRows.rows).toHaveLength(20);
    seats = teamRows.rows.map((row) => ({
      id: row.id,
      seat: row.seat,
      userId: userIdForSeat(row.seat),
    }));
    for (const seat of seats) {
      await db.exec(`
        insert into public.team_members (team_id, user_id, member_role)
          values ('${seat.id}', '${seat.userId}', 'captain')
      `);
    }

    const roundRows = await db.query<{ id: string; round_index: number }>(
      `select id, round_index from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    rounds = roundRows.rows;
    expect(rounds).toHaveLength(6);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  async function processAndPublish(roundId: string) {
    const token = randomUUID();
    const processed = await processClaimedRound(exec, {
      roundId,
      actorId: USER_ORG,
      token,
    });
    if (!processed.noop && processed.output) {
      const retry = await processClaimedRound(exec, {
        roundId,
        actorId: USER_ORG,
        token: randomUUID(),
      });
      expect(retry.noop).toBe(true);
      await publishWithRecompute(exec, { roundId, actorId: USER_ORG, token });
      return processed;
    }
    const { rows } = await db.query<{ process_claim_token: string }>(
      `select process_claim_token::text from public.rounds where id = $1`,
      [roundId],
    );
    await publishWithRecompute(exec, {
      roundId,
      actorId: USER_ORG,
      token: rows[0].process_claim_token,
    });
    return processed;
  }

  async function townAfter(roundIndex: number, seat: number): Promise<Town> {
    const { rows } = await db.query<{ state: unknown }>(
      `select ts.state
         from public.town_states ts
         join public.rounds r on r.id = ts.round_id
         join public.teams t on t.id = ts.team_id
        where r.competition_id = $1 and r.round_index = $2 and t.seat = $3`,
      [competitionId, roundIndex, seat],
    );
    expect(rows[0]).toBeDefined();
    return parseTown(rows[0].state);
  }

  it("saves, resaves, processes and carries WATER_TREAT through drought and round 5", async () => {
    const round1 = rounds[0];
    await openRound(exec, round1.id, USER_ORG);
    const preTown = createInitialTown();

    const first = await asUser(db, seats[0].userId, () =>
      submitDecision(exec, {
        roundId: round1.id,
        teamId: seats[0].id,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["WATER_TREAT"] },
        idempotencyKey: "water-save-01",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(first.ok).toBe(true);
    expect(first.applied?.projectStarts).toEqual(["WATER_TREAT"]);
    expect(first.applied?.spent).toBe(200);

    const townsAfterSave = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [round1.id],
    );
    expect(townsAfterSave.rows[0].n).toBe(0);
    expect(preTown.reserve).toBe(220);

    const second = await asUser(db, seats[0].userId, () =>
      submitDecision(exec, {
        roundId: round1.id,
        teamId: seats[0].id,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 0 }, projectStarts: ["WATER_TREAT"] },
        idempotencyKey: "water-save-02",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(second.ok).toBe(true);
    expect(second.status).toBe("accepted");
    expect(second.applied?.projectStarts).toEqual(["WATER_TREAT"]);

    const rows = await db.query<{ status: string; project_starts: string[]; idempotency_key: string }>(
      `select status, project_starts, idempotency_key
         from public.submissions
        where team_id = $1 and round_id = $2
        order by server_received_at`,
      [seats[0].id, round1.id],
    );
    const byKey = Object.fromEntries(rows.rows.map((row) => [row.idempotency_key, row]));
    expect(byKey["water-save-01"].status).toBe("superseded");
    expect(byKey["water-save-02"].status).toBe("accepted");
    expect(byKey["water-save-02"].project_starts).toEqual(["WATER_TREAT"]);

    const coal = await asUser(db, seats[1].userId, () =>
      submitDecision(exec, {
        roundId: round1.id,
        teamId: seats[1].id,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["COAL"] },
        idempotencyKey: "control-coal-01",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(coal.ok).toBe(false);
    expect(coal.error).toBe("invalid");

    await lockRound(exec, round1.id, USER_ORG);
    const processed = await processAndPublish(round1.id);
    expect(processed.output?.townStates).toHaveLength(20);
    const treatedRow = processed.output?.townStates.find((row) => row.teamId === seats[0].id);
    const controlRow = processed.output?.townStates.find((row) => row.teamId === seats[1].id);
    expect(treatedRow?.applied.projectStarts).toEqual(["WATER_TREAT"]);
    expect(controlRow?.applied.projectStarts).toEqual([]);
    expect(treatedRow?.state.started.WATER_TREAT).toBe(1);
    expect(treatedRow?.state.completed.WATER_TREAT).toBe(1);
    expect(treatedRow?.state.water_q).toBeCloseTo((controlRow?.state.water_q ?? 0) + 6, 5);
    expect(treatedRow?.state.reserve).toBeCloseTo((controlRow?.state.reserve ?? 0) - 200, 5);

    for (const round of rounds.slice(1, 5)) {
      await openRound(exec, round.id, USER_ORG);
      await lockRound(exec, round.id, USER_ORG);
      await processAndPublish(round.id);
    }

    const r3Treated = await townAfter(3, 1);
    const r3Control = await townAfter(3, 2);
    expect(r3Treated.started.WATER_TREAT).toBe(1);
    expect(r3Treated.completed.WATER_TREAT).toBe(1);
    expect(r3Control.started.WATER_TREAT).toBeUndefined();
    expect(r3Treated.shock_log[2]).toBeGreaterThan(0);
    expect(r3Treated.shock_log[2]).toBeLessThan(r3Control.shock_log[2]);

    const r5Treated = await townAfter(5, 1);
    const r5Control = await townAfter(5, 2);
    expect(r5Treated.started.WATER_TREAT).toBe(1);
    expect(r5Treated.completed.WATER_TREAT).toBe(1);
    expect(r5Treated.water_q).toBeGreaterThan(r5Control.water_q);
    expect(r5Treated.shock_log).toHaveLength(5);
  }, 90_000);
});
