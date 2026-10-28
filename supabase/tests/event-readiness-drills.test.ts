import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createInitialTown } from "@langlands/sim";
import {
  lockRound,
  openRound,
  processClaimedRound,
  publishWithRecompute,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import { planEventStart } from "../../apps/web/lib/event-start.ts";
import { planEventTick, type TickRound } from "../../apps/web/lib/event-tick-plan.ts";
import { EMPTY_ALLOCATIONS, asUser, createPglite, executor } from "./harness.ts";

function userIdForSeat(seat: number): string {
  return `c0000000-0000-4000-8000-${String(seat).padStart(12, "0")}`;
}

const USER_ORG = "cccccccc-cccc-cccc-cccc-ccccccccccc3";

let db: PGlite;
let exec: Executor;
let competitionId: string;
let round1: string;
let round2: string;
let seats: Array<{ id: string; seat: number; userId: string }>;

async function tickRounds(): Promise<TickRound[]> {
  const rows = await db.query<TickRound>(
    `select id, round_index, status, closes_at::text, process_checksum
       from public.rounds where competition_id = $1 order by round_index`,
    [competitionId],
  );
  return rows.rows;
}

describe("event readiness drills (PGlite; 20 dummy captains; not hosted)", () => {
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
          ('${id}', 'seat${String(seat).padStart(2, "0")}@drill.edu', '{"display_name":"Seat ${seat}"}')
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
      await db.exec(
        `insert into public.team_members (team_id, user_id, member_role) values ('${seat.id}', '${seat.userId}', 'captain')`,
      );
    }
    const rounds = await db.query<{ id: string; round_index: number }>(
      `select id, round_index from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    round1 = rounds.rows[0].id;
    round2 = rounds.rows[1].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("starts once, keeps the window after a simulated worker restart, and saves all 20 dummy captains", async () => {
    await db.exec(`update public.competitions set status = 'live' where id = '${competitionId}'`);
    const opened = await openRound(exec, round1, USER_ORG);
    expect(opened.status).toBe("open");
    const window = await db.query<{ opens_at: string; closes_at: string }>(
      `select opens_at::text, closes_at::text from public.rounds where id = $1`,
      [round1],
    );
    const restart = planEventTick({
      competitionStatus: "live",
      nowMs: Date.parse(window.rows[0].closes_at) - 60_000,
      rounds: await tickRounds(),
    });
    expect(restart.step).toBe("idle");
    expect(planEventStart({ competitionStatus: "live", round1Status: "open" }).openRound1).toBe(false);
    const same = await openRound(exec, round1, USER_ORG);
    expect(same.idempotent).toBe(true);
    const after = await db.query<{ opens_at: string; closes_at: string }>(
      `select opens_at::text, closes_at::text from public.rounds where id = $1`,
      [round1],
    );
    expect(after.rows[0]).toEqual(window.rows[0]);

    const preTown = createInitialTown();
    for (const seat of seats) {
      const first = await asUser(db, seat.userId, () =>
        submitDecision(exec, {
          roundId: round1,
          teamId: seat.id,
          body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
          idempotencyKey: `drill-s${seat.seat}-r1-a`,
          preTown,
          roundIndex: 1,
        }),
      );
      expect(first.ok).toBe(true);
      const retry = await asUser(db, seat.userId, () =>
        submitDecision(exec, {
          roundId: round1,
          teamId: seat.id,
          body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
          idempotencyKey: `drill-s${seat.seat}-r1-a`,
          preTown,
          roundIndex: 1,
        }),
      );
      expect(retry.status).toBe("duplicate");
    }

    const accepted = await db.query<{ n: number }>(
      `select count(*)::int as n from public.submissions where round_id = $1 and status = 'accepted'`,
      [round1],
    );
    expect(accepted.rows[0].n).toBe(20);
    const towns = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = $1`,
      [round1],
    );
    expect(towns.rows[0].n).toBe(0);
  });

  it("reclaims a stolen process claim once, then no-ops extra ticks and blocks a bad checksum publish", async () => {
    await lockRound(exec, round1, USER_ORG);
    const tokenA = randomUUID();
    const tokenB = randomUUID();
    const firstClaim = await db.query<{ claim_process: { noop: boolean; status: string } }>(
      `select public.claim_process($1::uuid, $2::uuid, $3::uuid) as claim_process`,
      [round1, USER_ORG, tokenA],
    );
    expect(firstClaim.rows[0].claim_process.noop).toBe(false);
    const steal = await db.query<{ claim_process: { noop: boolean; status: string } }>(
      `select public.claim_process($1::uuid, $2::uuid, $3::uuid) as claim_process`,
      [round1, USER_ORG, tokenB],
    );
    expect(steal.rows[0].claim_process.noop).toBe(false);

    await expect(
      db.query(
        `select public.save_process_run($1::uuid, $2::uuid, $3::uuid, true, 'x', 'x', 'x', 'py-ref-1.1.0', '{}'::jsonb, null)`,
        [round1, USER_ORG, tokenA],
      ),
    ).rejects.toThrow(/stale process claim/i);

    const processed = await processClaimedRound(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(processed.noop).toBe(false);
    expect(processed.output?.townStates).toHaveLength(20);

    const [retryA, retryB] = await Promise.all([
      processClaimedRound(exec, { roundId: round1, actorId: USER_ORG, token: randomUUID() }),
      processClaimedRound(exec, { roundId: round1, actorId: USER_ORG, token: randomUUID() }),
    ]);
    expect(retryA.noop).toBe(true);
    expect(retryB.noop).toBe(true);

    const pubsBefore = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = $1`,
      [round1],
    );
    expect(pubsBefore.rows[0].n).toBe(0);

    const token = await db.query<{ process_claim_token: string; process_checksum: string }>(
      `select process_claim_token::text, process_checksum from public.rounds where id = $1`,
      [round1],
    );
    await db.exec(`update public.rounds set process_checksum = 'deadbeef' where id = '${round1}'`);
    await expect(
      publishWithRecompute(exec, {
        roundId: round1,
        actorId: USER_ORG,
        token: token.rows[0].process_claim_token,
      }),
    ).rejects.toMatchObject({ code: "checksum" });
    const still = await db.query<{ n: number; status: string }>(
      `select
         (select count(*)::int from public.published_results where round_id = $1) as n,
         status
       from public.rounds where id = $1`,
      [round1],
    );
    expect(still.rows[0].n).toBe(0);
    expect(still.rows[0].status).not.toBe("published");

    await db.exec(
      `update public.rounds set process_checksum = '${token.rows[0].process_checksum}' where id = '${round1}'`,
    );
    const published = await publishWithRecompute(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: token.rows[0].process_claim_token,
    });
    expect(published.status).toBe("published");
  });

  it("blocks captains from round-machine RPCs and does not reopen after the event is closed", async () => {
    await asUser(db, seats[0].userId, async () => {
      await expect(openRound(exec, round2, seats[0].userId)).rejects.toMatchObject({ httpStatus: 403 });
      await expect(lockRound(exec, round1, seats[0].userId)).rejects.toMatchObject({ httpStatus: 403 });
    });

    const opened = await openRound(exec, round2, USER_ORG);
    expect(opened.status).toBe("open");
    await lockRound(exec, round2, USER_ORG);
    const processed = await processClaimedRound(exec, {
      roundId: round2,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(processed.noop).toBe(false);
    const token = await db.query<{ process_claim_token: string }>(
      `select process_claim_token::text from public.rounds where id = $1`,
      [round2],
    );
    await publishWithRecompute(exec, {
      roundId: round2,
      actorId: USER_ORG,
      token: token.rows[0].process_claim_token,
    });

    await db.exec(
      `update public.rounds set status = 'published', published_at = coalesce(published_at, now())
        where competition_id = '${competitionId}'`,
    );
    await db.exec(`update public.competitions set status = 'closed' where id = '${competitionId}'`);
    const after = planEventTick({
      competitionStatus: "closed",
      nowMs: Date.now(),
      rounds: await tickRounds(),
    });
    expect(after.step).toBe("complete");
    expect(planEventStart({ competitionStatus: "closed", round1Status: "published" }).ok).toBe(false);
  });
});
