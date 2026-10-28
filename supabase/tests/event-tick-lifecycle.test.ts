import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { ENGINE_VERSION, PACK_A, createInitialTown, play } from "@langlands/sim";
import {
  lockRound,
  openRound,
  processClaimedRound,
  publishWithRecompute,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import { planEventStart } from "../../apps/web/lib/event-start.ts";
import { planEventTick, type TickPlan, type TickRound } from "../../apps/web/lib/event-tick-plan.ts";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
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
let rounds: Array<{ id: string; round_index: number }>;

async function loadTickState(): Promise<{ status: string; rounds: TickRound[] }> {
  const competition = await db.query<{ status: string }>(
    `select status from public.competitions where id = $1`,
    [competitionId],
  );
  const rows = await db.query<TickRound>(
    `select id, round_index, status, closes_at::text, process_checksum
       from public.rounds where competition_id = $1 order by round_index`,
    [competitionId],
  );
  return { status: competition.rows[0].status, rounds: rows.rows };
}

async function applyPlan(plan: TickPlan): Promise<unknown> {
  if ((plan.step === "lock" || plan.step === "process" || plan.step === "publish" || plan.step === "open") && !plan.roundId) {
    throw new Error(`plan ${plan.step} missing roundId`);
  }
  if (plan.step === "idle" || plan.step === "blocked") return plan;
  if (plan.step === "lock") return lockRound(exec, plan.roundId!, USER_ORG);
  if (plan.step === "process") {
    return processClaimedRound(exec, {
      roundId: plan.roundId!,
      actorId: USER_ORG,
      token: randomUUID(),
    });
  }
  if (plan.step === "publish") {
    const token = await db.query<{ process_claim_token: string }>(
      `select process_claim_token::text from public.rounds where id = $1`,
      [plan.roundId],
    );
    return publishWithRecompute(exec, {
      roundId: plan.roundId!,
      actorId: USER_ORG,
      token: token.rows[0].process_claim_token,
    });
  }
  if (plan.step === "open") return openRound(exec, plan.roundId!, USER_ORG);
  if (plan.step === "complete") {
    await db.exec(
      `update public.competitions set status = 'closed' where id = '${competitionId}' and status = 'live'`,
    );
    return { status: "closed" };
  }
  return plan;
}

async function tick(nowMs: number): Promise<TickPlan> {
  const state = await loadTickState();
  const plan = planEventTick({
    competitionStatus: state.status,
    nowMs,
    rounds: state.rounds,
  });
  await applyPlan(plan);
  return plan;
}

describe("six-round scheduler lifecycle (PGlite; hosted automation NOT VERIFIED)", () => {
  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    competitionId = fx.competitionId;
    teamA = fx.teamA;
    const roundRows = await db.query<{ id: string; round_index: number }>(
      `select id, round_index from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    rounds = roundRows.rows;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("starts once without restamping the clock, then walks Pack A via durable ticks", async () => {
    expect(ENGINE_VERSION).toBe("py-ref-1.1.0");
    expect(PACK_A[5]).toBe("CONTAMINATION");
    expect(rounds).toHaveLength(6);

    const before = await loadTickState();
    expect(planEventStart({ competitionStatus: before.status, round1Status: before.rounds[0].status })).toMatchObject({
      openRound1: true,
    });
    await db.exec(`update public.competitions set status = 'live' where id = '${competitionId}'`);
    const opened = await openRound(exec, rounds[0].id, USER_ORG);
    expect(opened.status).toBe("open");
    const firstWindow = await db.query<{ opens_at: string; closes_at: string }>(
      `select opens_at::text, closes_at::text from public.rounds where id = $1`,
      [rounds[0].id],
    );

    const secondStart = planEventStart({ competitionStatus: "live", round1Status: "open" });
    expect(secondStart).toMatchObject({ ok: true, openRound1: false });
    const openedAgain = await openRound(exec, rounds[0].id, USER_ORG);
    expect(openedAgain.idempotent).toBe(true);
    const sameWindow = await db.query<{ opens_at: string; closes_at: string }>(
      `select opens_at::text, closes_at::text from public.rounds where id = $1`,
      [rounds[0].id],
    );
    expect(sameWindow.rows[0]).toEqual(firstWindow.rows[0]);

    const beforeClose = Date.parse(firstWindow.rows[0].closes_at) - 1_000;
    expect((await tick(beforeClose)).step).toBe("idle");

    const saved = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
        idempotencyKey: "sched-a-r1-1",
        preTown: createInitialTown(),
        roundIndex: 1,
      }),
    );
    expect(saved.ok).toBe(true);
    const townsAfterSave = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [rounds[0].id],
    );
    expect(townsAfterSave.rows[0].n).toBe(0);

    await asUser(db, USER_A, async () => {
      await expect(openRound(exec, rounds[0].id, USER_A)).rejects.toMatchObject({ httpStatus: 403 });
    });

    const afterClose = Date.parse(firstWindow.rows[0].closes_at) + 1;
    expect((await tick(afterClose)).step).toBe("lock");

    const late = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["RIVER"] },
        idempotencyKey: "sched-late-r1",
        preTown: createInitialTown(),
        roundIndex: 1,
      }),
    );
    expect(late.ok).toBe(false);
    expect(late.error).toBe("closed");

    await db.exec(`update public.competitions set status = 'paused' where id = '${competitionId}'`);
    expect((await tick(afterClose)).step).toBe("process");
    await db.exec(`update public.competitions set status = 'live' where id = '${competitionId}'`);

    const firstProcess = await processClaimedRound(exec, {
      roundId: rounds[0].id,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(firstProcess.noop).toBe(true);

    const pubsBefore = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = $1`,
      [rounds[0].id],
    );
    expect(pubsBefore.rows[0].n).toBe(0);
    expect((await tick(afterClose)).step).toBe("publish");

    const r2Before = await db.query<{ status: string }>(
      `select status from public.rounds where id = $1`,
      [rounds[1].id],
    );
    expect(r2Before.rows[0].status).toBe("scheduled");
    expect(
      planEventTick({
        competitionStatus: "live",
        nowMs: afterClose,
        rounds: [
          {
            id: rounds[0].id,
            round_index: 1,
            status: "void",
            closes_at: firstWindow.rows[0].closes_at,
            process_checksum: null,
          },
          {
            id: rounds[1].id,
            round_index: 2,
            status: "scheduled",
            closes_at: null,
            process_checksum: null,
          },
        ],
      }).step,
    ).toBe("blocked");

    expect((await tick(afterClose)).step).toBe("open");

    const silent = play();
    for (let i = 1; i < 6; i += 1) {
      const current = await db.query<{ id: string; closes_at: string; status: string }>(
        `select id, closes_at::text, status from public.rounds where id = $1`,
        [rounds[i].id],
      );
      expect(current.rows[0].status).toBe("open");
      const close = Date.parse(current.rows[0].closes_at) + 1;
      expect((await tick(close)).step).toBe("lock");
      const twiceLock = await lockRound(exec, rounds[i].id, USER_ORG);
      expect(twiceLock.idempotent).toBe(true);
      const a = await tick(close);
      expect(a.step).toBe("process");
      const b = await processClaimedRound(exec, {
        roundId: rounds[i].id,
        actorId: USER_ORG,
        token: randomUUID(),
      });
      expect(b.noop).toBe(true);
      const pubs = await db.query<{ n: number }>(
        `select count(*)::int as n from public.published_results where round_id = $1`,
        [rounds[i].id],
      );
      expect(pubs.rows[0].n).toBe(0);
      expect((await tick(close)).step).toBe("publish");
      if (i < 5) expect((await tick(close)).step).toBe("open");
    }

    expect((await tick(Date.now())).step).toBe("complete");
    const done = await loadTickState();
    expect(done.status).toBe("closed");
    expect(done.rounds.every((row) => row.status === "published")).toBe(true);
    const finals = await db.query<{ n: number; score: string }>(
      `select count(*)::int as n, min(final_score)::text as score
         from public.published_results pr
         join public.rounds r on r.id = pr.round_id
        where r.round_index = 6`,
    );
    expect(finals.rows[0].n).toBe(20);
    expect(Number(finals.rows[0].score)).toBe(silent.score);
  });

  it("does not publish a failed process and can retry the same round", async () => {
    // Uses a leftover would-be-next round only if the previous test closed the event.
    const extra = await createPglite();
    const extraExec = executor(extra);
    const fx = await fixtureUsers(extra);
    await extra.exec(`update public.competitions set status = 'live' where id = '${fx.competitionId}'`);
    await openRound(extraExec, fx.round1, USER_ORG);
    await lockRound(extraExec, fx.round1, USER_ORG);
    await extra.exec(`
      update public.round_lock_private
         set payload = payload - (jsonb_array_length(payload) - 1)
       where round_id = '${fx.round1}'
    `);
    await expect(
      processClaimedRound(extraExec, {
        roundId: fx.round1,
        actorId: USER_ORG,
        token: randomUUID(),
      }),
    ).rejects.toMatchObject({ httpStatus: 409, code: "count" });
    const pubs = await extra.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = $1`,
      [fx.round1],
    );
    expect(pubs.rows[0].n).toBe(0);
    const status = await extra.query<{ status: string }>(
      `select status from public.rounds where id = $1`,
      [fx.round1],
    );
    expect(status.rows[0].status).toBe("locked");
    await extra.close();
  });
});
