import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createInitialTown } from "@langlands/sim";
import {
  lockRound,
  processClaimedRound,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
  USER_B,
  USER_NONE,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  fixtureUsers,
  openRound as openRoundWindow,
} from "./harness.ts";

/**
 * The live hall error `clients may only insert accepted or late proposals`
 * happened on the second distinct save (autosave hashes a new idempotency key,
 * submit_decision UPDATEs the previous row to superseded while auth.uid() is set).
 */
describe("captain autosave supersede (isolated)", () => {
  let db: PGlite;
  let exec: Executor;
  let teamA: string;
  let round1: string;

  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    teamA = fx.teamA;
    round1 = fx.round1;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("replaces an accepted save without the 0006 trigger exception", async () => {
    await openRoundWindow(db, round1);
    const preTown = createInitialTown();
    const first = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
        idempotencyKey: "autosave-key-01",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(first.ok).toBe(true);

    const second = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 12 }, projectStarts: ["RIVER"] },
        idempotencyKey: "autosave-key-02",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(second.ok).toBe(true);
    expect(second.status).toBe("accepted");

    const rows = await db.query<{ status: string; idempotency_key: string }>(
      `select status, idempotency_key from public.submissions where team_id = $1 and round_id = $2 order by server_received_at`,
      [teamA, round1],
    );
    const byKey = Object.fromEntries(rows.rows.map((row) => [row.idempotency_key, row.status]));
    expect(byKey["autosave-key-01"]).toBe("superseded");
    expect(byKey["autosave-key-02"]).toBe("accepted");

    const townsAfterSave = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [round1],
    );
    const pubsAfterSave = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = $1`,
      [round1],
    );
    expect(townsAfterSave.rows[0].n).toBe(0);
    expect(pubsAfterSave.rows[0].n).toBe(0);
  });

  it("charges credits only when the round is processed, and a second process is a no-op", async () => {
    const trigger = await db.query<{ body: string }>(
      `select pg_get_functiondef('public.submissions_before_write'::regproc) as body`,
    );
    expect(trigger.rows[0].body).toMatch(/old\.status = 'accepted' and new\.status = 'superseded'/);

    await lockRound(exec, round1, USER_ORG);
    const townsBefore = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [round1],
    );
    expect(townsBefore.rows[0].n).toBe(0);

    const token = randomUUID();
    const processed = await processClaimedRound(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token,
    });
    expect(processed.noop).toBe(false);
    expect(processed.output?.townStates).toHaveLength(20);

    const seat1 = processed.output?.townStates.find((row) => row.teamId === teamA);
    expect(seat1?.applied.projectStarts).toEqual(["RIVER"]);
    expect(seat1?.state.reserve).toBeLessThan(createInitialTown().reserve + 934.06);
    expect((seat1?.applied.spent ?? 0) + (seat1?.applied.unspent ?? 0)).toBeCloseTo(
      seat1?.applied.available ?? 0,
      2,
    );

    const retry = await processClaimedRound(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(retry.noop).toBe(true);
    const afterProcess = await db.query<{ towns: number; pubs: number; runs: number }>(
      `select
         (select count(*)::int from public.town_states where round_id = $1) as towns,
         (select count(*)::int from public.published_results where round_id = $1) as pubs,
         (select count(*)::int from public.round_process_runs where round_id = $1 and ok is true) as runs`,
      [round1],
    );
    expect(afterProcess.rows[0]).toEqual({ towns: 0, pubs: 0, runs: 1 });
  });

  it("still refuses a captain UPDATE that forges rejected status", async () => {
    await asUser(db, USER_A, async () => {
      await expect(
        db.query(
          `update public.submissions set status = 'rejected' where team_id = $1 and status = 'accepted'`,
          [teamA],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("0013 identity, ownership, and unauthenticated save (isolated)", () => {
  let db: PGlite;
  let exec: Executor;
  let teamA: string;
  let teamB: string;
  let round1: string;

  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    teamA = fx.teamA;
    teamB = fx.teamB;
    round1 = fx.round1;
    await openRoundWindow(db, round1);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("rejects unauthenticated submit_decision and rival-team writes", async () => {
    const preTown = createInitialTown();
    await expect(
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
        idempotencyKey: "unauth-key-01",
        preTown,
        roundIndex: 1,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });

    await asUser(db, USER_NONE, async () => {
      await expect(
        submitDecision(exec, {
          roundId: round1,
          teamId: teamA,
          body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
          idempotencyKey: "none-key-01",
          preTown,
          roundIndex: 1,
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    await asUser(db, USER_B, async () => {
      await expect(
        submitDecision(exec, {
          roundId: round1,
          teamId: teamA,
          body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
          idempotencyKey: "rival-key-01",
          preTown,
          roundIndex: 1,
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });
  });

  it("lets each captain resave their own row without replacing the rival", async () => {
    const preTown = createInitialTown();
    const a1 = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
        idempotencyKey: "own-a-01",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(a1.ok).toBe(true);
    const b1 = await asUser(db, USER_B, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamB,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 8 }, projectStarts: [] },
        idempotencyKey: "own-b-01",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(b1.ok).toBe(true);

    const a2 = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: { ...EMPTY_ALLOCATIONS, restoration: 10 }, projectStarts: [] },
        idempotencyKey: "own-a-02",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(a2.ok).toBe(true);

    const rows = await db.query<{ team_id: string; status: string; idempotency_key: string }>(
      `select team_id, status, idempotency_key from public.submissions where round_id = $1 order by server_received_at`,
      [round1],
    );
    const accepted = rows.rows.filter((row) => row.status === "accepted");
    expect(accepted).toHaveLength(2);
    expect(accepted.find((row) => row.team_id === teamA)?.idempotency_key).toBe("own-a-02");
    expect(accepted.find((row) => row.team_id === teamB)?.idempotency_key).toBe("own-b-01");
    expect(rows.rows.find((row) => row.idempotency_key === "own-a-01")?.status).toBe("superseded");

    const towns = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [round1],
    );
    expect(towns.rows[0].n).toBe(0);
  });
});
