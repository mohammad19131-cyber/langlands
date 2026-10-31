import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createInitialTown } from "@langlands/sim";
import {
  lockRound,
  processClaimedRound,
  publishWithRecompute,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  fixtureUsers,
  openRound as openRoundWindow,
} from "./harness.ts";

describe("round record backups after publish (PGlite; hosted NOT VERIFIED)", () => {
  let db: PGlite;
  let exec: Executor;
  let competitionId: string;
  let teamA: string;
  let round1: string;

  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    competitionId = fx.competitionId;
    teamA = fx.teamA;
    round1 = fx.round1;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("stores all team scores and round records on publish and keeps them after reset", async () => {
    await db.exec(`update public.competitions set status = 'live' where id = '${competitionId}'`);
    await openRoundWindow(db, round1);
    const preTown = createInitialTown();
    await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 12 }, projectStarts: [] },
        idempotencyKey: "backup-r1-a",
        preTown,
        roundIndex: 1,
      }),
    );
    await lockRound(exec, round1, USER_ORG);
    const processed = await processClaimedRound(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(processed.noop).toBe(false);
    const token = await db.query<{ process_claim_token: string }>(
      `select process_claim_token::text from public.rounds where id = $1`,
      [round1],
    );
    const published = await publishWithRecompute(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: token.rows[0].process_claim_token,
    });
    expect(published.ok).toBe(true);

    const countBefore = await db.query<{ n: number }>(
      `select count(*)::int as n from public.round_record_backups where round_id = $1`,
      [round1],
    );
    expect(countBefore.rows[0].n).toBe(1);

    const backup = await db.query<{
      scores: unknown[];
      towns: unknown[];
      subs: unknown[];
      round_index: number;
      payload: string;
    }>(
      `select scores, town_states as towns, submissions as subs, round_index, scores::text as payload
         from public.round_record_backups
        where round_id = $1
        order by id desc
        limit 1`,
      [round1],
    );

    expect(backup.rows[0].round_index).toBe(1);
    expect(Array.isArray(backup.rows[0].scores)).toBe(true);
    expect(backup.rows[0].scores).toHaveLength(20);
    expect(backup.rows[0].towns).toHaveLength(20);
    expect(backup.rows[0].subs.length).toBeGreaterThanOrEqual(1);
    expect(backup.rows[0].payload).toMatch(/final_score|snapshot_score/);
    expect(backup.rows[0].payload).not.toMatch(/password_hash/);

    const scoreRow = backup.rows[0].scores[0] as { team_seat?: number; snapshot_score?: number };
    expect(scoreRow.team_seat).toBeGreaterThanOrEqual(1);
    expect(Number(scoreRow.snapshot_score)).toBeGreaterThan(0);

    await db.query(`select public.reset_competition_play($1::uuid, $2::uuid)`, [
      competitionId,
      USER_ORG,
    ]);

    const liveScores = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results pr
         join public.rounds r on r.id = pr.round_id
        where r.competition_id = $1`,
      [competitionId],
    );
    expect(liveScores.rows[0].n).toBe(0);

    const kept = await db.query<{ n: number; scores: unknown[] }>(
      `select scores
         from public.round_record_backups
        where competition_id = $1
        order by id desc
        limit 1`,
      [competitionId],
    );
    const all = await db.query<{ n: number }>(
      `select count(*)::int as n from public.round_record_backups where competition_id = $1`,
      [competitionId],
    );
    expect(all.rows[0].n).toBe(1);
    expect(kept.rows[0].scores).toHaveLength(20);
  });

  it("denies authenticated clients table access to backups", async () => {
    await asUser(db, USER_A, async () => {
      await expect(
        db.query(`select count(*)::int as n from public.round_record_backups`),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
