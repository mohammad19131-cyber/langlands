import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createInitialTown, ENGINE_VERSION, play } from "@langlands/sim";
import {
  lockRound,
  openRound,
  processClaimedRound,
  publishWithRecompute,
  reopenRound,
  setRoundWindow,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
  USER_B,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  fixtureUsers,
} from "./harness.ts";

let db: PGlite;
let exec: Executor;
let competitionId: string;
let teamA: string;
let teamB: string;
let rounds: { id: string; round_index: number }[];

function windowMs(opens: string | Date, closes: string | Date): number {
  return new Date(closes).getTime() - new Date(opens).getTime();
}

async function processAndPublish(roundId: string) {
  const token = randomUUID();
  const processed = await processClaimedRound(exec, {
    roundId,
    actorId: USER_ORG,
    token,
  });
  if (!processed.noop && processed.output) {
    expect(processed.output.townStates).toHaveLength(20);
    await publishWithRecompute(exec, { roundId, actorId: USER_ORG, token });
    return;
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
}

describe("isolated 20-team six-round rehearsal (PGlite, not hosted)", () => {
  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    competitionId = fx.competitionId;
    teamA = fx.teamA;
    teamB = fx.teamB;
    const { rows } = await db.query<{ id: string; round_index: number }>(
      `select id, round_index from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    rounds = rows;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("opens round 1 with an 18-minute window, extends, reopens an unpublished lock, then processes 20 towns", async () => {
    const opened = await openRound(exec, rounds[0].id, USER_ORG);
    expect(opened.status).toBe("open");
    const stamped = await db.query<{ opens_at: string; closes_at: string }>(
      `select opens_at, closes_at from public.rounds where id = $1`,
      [rounds[0].id],
    );
    expect(windowMs(stamped.rows[0].opens_at, stamped.rows[0].closes_at)).toBe(18 * 60 * 1000);

    const extendedClose = new Date(
      new Date(stamped.rows[0].closes_at).getTime() + 5 * 60 * 1000,
    ).toISOString();
    const extended = await setRoundWindow(exec, rounds[0].id, extendedClose, USER_ORG);
    expect(extended.ok).toBe(true);
    const afterExtend = await db.query<{ closes_at: string }>(
      `select closes_at from public.rounds where id = $1`,
      [rounds[0].id],
    );
    expect(windowMs(stamped.rows[0].opens_at, afterExtend.rows[0].closes_at)).toBe(23 * 60 * 1000);

    const preTown = createInitialTown();
    const spend = { ...EMPTY_ALLOCATIONS, restoration: 20 };
    const saved = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: spend, projectStarts: [] },
        idempotencyKey: "rehearsal-a-r1",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(saved.ok).toBe(true);

    await lockRound(exec, rounds[0].id, USER_ORG);
    const reopened = await reopenRound(exec, rounds[0].id, USER_ORG);
    expect(reopened.status).toBe("open");

    const savedB = await asUser(db, USER_B, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamB,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 15 }, projectStarts: [] },
        idempotencyKey: "rehearsal-b-r1",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(savedB.ok).toBe(true);

    await lockRound(exec, rounds[0].id, USER_ORG);
    await processAndPublish(rounds[0].id);

    const published = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results pr
       join public.rounds r on r.id = pr.round_id
       where r.id = $1`,
      [rounds[0].id],
    );
    expect(published.rows[0].n).toBe(20);
  });

  it("walks rounds 2–6 open → lock → process → publish with 20/20 checksums", async () => {
    for (const round of rounds.slice(1)) {
      await openRound(exec, round.id, USER_ORG);
      const stamped = await db.query<{ opens_at: string; closes_at: string; status: string }>(
        `select opens_at, closes_at, status from public.rounds where id = $1`,
        [round.id],
      );
      expect(stamped.rows[0].status).toBe("open");
      expect(windowMs(stamped.rows[0].opens_at, stamped.rows[0].closes_at)).toBe(18 * 60 * 1000);
      await lockRound(exec, round.id, USER_ORG);
      await processAndPublish(round.id);
    }

    const byRound = await db.query<{ round_index: number; n: number }>(`
      select r.round_index, count(*)::int as n
        from public.published_results pr
        join public.rounds r on r.id = pr.round_id
       where r.competition_id = '${competitionId}'
       group by r.round_index
       order by r.round_index
    `);
    expect(byRound.rows.map((row) => [row.round_index, row.n])).toEqual([
      [1, 20],
      [2, 20],
      [3, 20],
      [4, 20],
      [5, 20],
      [6, 20],
    ]);

    const engines = await db.query<{ engine_version: string }>(
      `select distinct engine_version from public.published_results`,
    );
    expect(engines.rows.map((row) => row.engine_version)).toEqual([ENGINE_VERSION]);
  });

  it("hold seats still match silent play; spending seats do not", async () => {
    const silent = play();
    const finals = await db.query<{ seat: number; final_score: string }>(`
      select t.seat, pr.final_score::text
        from public.published_results pr
        join public.teams t on t.id = pr.team_id
        join public.rounds r on r.id = pr.round_id
       where r.competition_id = '${competitionId}' and r.round_index = 6
       order by t.seat
    `);
    expect(finals.rows).toHaveLength(20);
    const holdSeats = finals.rows.filter((row) => row.seat !== 1 && row.seat !== 2);
    for (const row of holdSeats) {
      expect(Number(row.final_score)).toBe(silent.score);
    }
    const seat1 = Number(finals.rows.find((row) => row.seat === 1)?.final_score);
    expect(seat1).not.toBe(silent.score);
  });

  it("refuses to reopen after process and refuses player window changes", async () => {
    await expect(reopenRound(exec, rounds[0].id, USER_ORG)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await expect(setRoundWindow(exec, rounds[5].id, future, USER_A)).rejects.toMatchObject({
      httpStatus: 403,
    });
  });
});
