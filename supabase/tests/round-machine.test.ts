import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { play, ENGINE_VERSION } from "@langlands/sim";
import {
  lockRound,
  openRound,
  parseProposal,
  processClaimedRound,
  processRound,
  publicHasPrivateKeys,
  publishWithRecompute,
  restoreVoidedRound,
  submitDecision,
  supportRead,
  voidRound,
  type Executor,
  type LockEntry,
} from "@langlands/round-machine";
import {
  EMPTY_ALLOCATIONS,
  USER_A,
  USER_B,
  USER_JUDGE,
  USER_NONE,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  fixtureUsers,
  openRound as openRoundWindow,
} from "./harness.ts";

let db: PGlite;
let exec: Executor;
let competitionId: string;
let teamA: string;
let teamB: string;
let rounds: { id: string; round_index: number }[];

const alloc = EMPTY_ALLOCATIONS;

describe("Phase 3 round machine (PGlite, local — not hosted Supabase)", () => {
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

  it("rejects unauthenticated and uninvited submits", async () => {
    await expect(
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: alloc, projectStarts: [] },
        idempotencyKey: "unauth-key-1",
        preTown: (await import("@langlands/sim")).createInitialTown(),
        roundIndex: 1,
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });

    await asUser(db, USER_NONE, async () => {
      await expect(
        submitDecision(exec, {
          roundId: rounds[0].id,
          teamId: teamA,
          body: { allocations: alloc, projectStarts: [] },
          idempotencyKey: "none-key-12",
          preTown: (await import("@langlands/sim")).createInitialTown(),
          roundIndex: 1,
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });
  });

  it("members cannot open or lock rounds; organisers can", async () => {
    await asUser(db, USER_A, async () => {
      await expect(openRound(exec, rounds[0].id, USER_A)).rejects.toMatchObject({
        httpStatus: 403,
      });
    });
    const opened = await openRound(exec, rounds[0].id, USER_ORG);
    expect(opened.status).toBe("open");
    const openedAgain = await openRound(exec, rounds[0].id, USER_ORG);
    expect(openedAgain.idempotent).toBe(true);
    await asUser(db, USER_JUDGE, async () => {
      await expect(lockRound(exec, rounds[0].id, USER_JUDGE)).rejects.toMatchObject({
        httpStatus: 403,
      });
    });
  });

  it("cannot open round 2 before round 1 is published", async () => {
    await expect(openRound(exec, rounds[1].id, USER_ORG)).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("accepts identical idempotent retries and 409s conflicting keys", async () => {
    await openRoundWindow(db, rounds[0].id);
    const { createInitialTown } = await import("@langlands/sim");
    const preTown = createInitialTown();
    const body = { allocations: alloc, projectStarts: [] as string[] };
    const first = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body,
        idempotencyKey: "same-key-aa",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(first.ok).toBe(true);
    const retry = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body,
        idempotencyKey: "same-key-aa",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(retry.status).toBe("duplicate");
    await asUser(db, USER_A, async () => {
      await expect(
        submitDecision(exec, {
          roundId: rounds[0].id,
          teamId: teamA,
          body: { allocations: { ...alloc, water: 10 }, projectStarts: [] },
          idempotencyKey: "same-key-aa",
          preTown,
          roundIndex: 1,
        }),
      ).rejects.toMatchObject({ httpStatus: 409 });
    });
    await asUser(db, USER_A, async () => {
      await expect(
        submitDecision(exec, {
          roundId: rounds[0].id,
          teamId: teamB,
          body,
          idempotencyKey: "rival-write-01",
          preTown,
          roundIndex: 1,
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });
  });

  it("rejects late submits after the server deadline even with an early client clock", async () => {
    const { createInitialTown } = await import("@langlands/sim");
    await db.exec(
      `update public.rounds set status = 'open', opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute' where id = '${rounds[0].id}'`,
    );
    const result = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: alloc, projectStarts: [], clientClaimedAt: "2000-01-01T00:00:00Z" },
        idempotencyKey: "late-key-99",
        preTown: createInitialTown(),
        roundIndex: 1,
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("closed");
    const late = await db.query<{ status: string }>(
      `select status from public.submissions where idempotency_key = 'late-key-99'`,
    );
    expect(late.rows[0].status).toBe("late");
  });

  it("rejects GRID+COAL without prereq completion and mutex pairs", async () => {
    await openRoundWindow(db, rounds[0].id);
    const { createInitialTown } = await import("@langlands/sim");
    const preTown = createInitialTown();
    const bad = await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: rounds[0].id,
        teamId: teamA,
        body: { allocations: alloc, projectStarts: ["COAL"] },
        idempotencyKey: "coal-only-1",
        preTown,
        roundIndex: 1,
      }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid");
  });

  it("locks 20 teams, holds missing submissions, processes, publishes public rows only", async () => {
    await openRoundWindow(db, rounds[0].id);
    const locked = await lockRound(exec, rounds[0].id, USER_ORG);
    expect(locked.status).toBe("locked");
    const lockedAgain = await lockRound(exec, rounds[0].id, USER_ORG);
    expect(lockedAgain.idempotent).toBe(true);
    const manifest = locked.lock_manifest as LockEntry[];
    expect(manifest).toHaveLength(20);
    const held = manifest.filter((m) => m.submissionId === null);
    expect(held.length).toBeGreaterThanOrEqual(18);

    const token = randomUUID();
    const processed = await processClaimedRound(exec, {
      roundId: rounds[0].id,
      actorId: USER_ORG,
      token,
    });
    expect(processed.noop).toBe(false);
    expect(processed.output?.townStates).toHaveLength(20);
    expect(processed.output?.publicRows).toHaveLength(20);
    for (const row of processed.output?.publicRows ?? []) {
      expect(publicHasPrivateKeys(row)).toEqual([]);
    }

    const second = await processClaimedRound(exec, {
      roundId: rounds[0].id,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(second.noop).toBe(true);

    await db.exec(`update public.rounds set process_checksum = 'deadbeef' where id = '${rounds[0].id}'`);
    await expect(
      publishWithRecompute(exec, { roundId: rounds[0].id, actorId: USER_ORG, token }),
    ).rejects.toMatchObject({ code: "checksum" });
    const pubsBefore = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = '${rounds[0].id}'`,
    );
    expect(pubsBefore.rows[0].n).toBe(0);
    await db.exec(
      `update public.rounds set process_checksum = '${processed.output?.checksum}' where id = '${rounds[0].id}'`,
    );

    const published = await publishWithRecompute(exec, {
      roundId: rounds[0].id,
      actorId: USER_ORG,
      token,
    });
    expect(published.status).toBe("published");

    const states = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states ts join public.rounds r on r.id = ts.round_id where r.id = '${rounds[0].id}'`,
    );
    const pubs = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = '${rounds[0].id}'`,
    );
    expect(states.rows[0].n).toBe(20);
    expect(pubs.rows[0].n).toBe(20);

    const leaked = await asUser(db, USER_A, () =>
      db.query<{ n: number }>(
        `select count(*)::int as n from public.town_states where team_id = '${teamB}'`,
      ),
    );
    expect(leaked.rows[0].n).toBe(0);
  });

  it("audits organiser support reads of private rows", async () => {
    await supportRead(exec, {
      actorId: USER_ORG,
      competitionId,
      teamId: teamA,
      action: "support_read",
    });
    const logs = await db.query<{ action: string; team_id: string }>(
      `select action, team_id::text from public.audit_logs where action = 'support_read' and actor_id = '${USER_ORG}'`,
    );
    expect(logs.rows.length).toBeGreaterThan(0);
    expect(logs.rows[0].team_id).toBe(teamA);
  });

  it("failed process leaves the round locked with no partial publication", async () => {
    const round2 = rounds[1].id;
    await openRound(exec, round2, USER_ORG);
    await lockRound(exec, round2, USER_ORG);
    await db.exec(
      `update public.round_lock_private
          set payload = payload - (jsonb_array_length(payload) - 1)
        where round_id = '${round2}'`,
    );
    const token = randomUUID();
    await expect(
      processClaimedRound(exec, { roundId: round2, actorId: USER_ORG, token }),
    ).rejects.toMatchObject({ httpStatus: 409, code: "count" });
    const status = await db.query<{ status: string }>(
      `select status from public.rounds where id = '${round2}'`,
    );
    expect(status.rows[0].status).toBe("locked");
    const partial = await db.query<{ n: number }>(
      `select count(*)::int as n from public.town_states where round_id = '${round2}'`,
    );
    expect(partial.rows[0].n).toBe(0);
    await db.exec(`
      delete from public.round_lock_private where round_id = '${round2}';
      update public.rounds set lock_manifest = null, status = 'open' where id = '${round2}';
    `);
  });

  it("reclaims an interrupted process without applying the round twice", async () => {
    const roundId = rounds[1].id;
    await lockRound(exec, roundId, USER_ORG);
    const tokenA = randomUUID();
    const claimed = await db.query<{ claim_process: { noop: boolean; status: string } }>(
      `select public.claim_process($1::uuid, $2::uuid, $3::uuid) as claim_process`,
      [roundId, USER_ORG, tokenA],
    );
    expect(claimed.rows[0].claim_process.noop).toBe(false);
    const mid = await db.query<{ status: string; n: number }>(
      `select status, (select count(*)::int from public.town_states where round_id = '${roundId}') as n
         from public.rounds where id = '${roundId}'`,
    );
    expect(mid.rows[0].status).toBe("processing");
    expect(mid.rows[0].n).toBe(0);

    const recovered = await processClaimedRound(exec, {
      roundId,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(recovered.noop).toBe(false);
    expect(recovered.output?.townStates).toHaveLength(20);

    const again = await processClaimedRound(exec, {
      roundId,
      actorId: USER_ORG,
      token: randomUUID(),
    });
    expect(again.noop).toBe(true);
    const unpublished = await db.query<{ n: number }>(
      `select count(*)::int as n from public.published_results where round_id = '${roundId}'`,
    );
    expect(unpublished.rows[0].n).toBe(0);
  });

  it("rejects client-supplied scores and budgets as proposal fields", () => {
    expect(() =>
      parseProposal(
        { allocations: alloc, projectStarts: [], remainingBudget: 999, score: 100 },
        "score-key-01",
      ),
    ).toThrow(/unknown field/);
  });

  it("processes remaining pack A rounds with default holds and matches silent play parity", async () => {
    const silent = play();
    expect(silent.engine_version).toBe(ENGINE_VERSION);

    for (const round of rounds) {
      const status = await db.query<{ status: string }>(
        `select status from public.rounds where id = '${round.id}'`,
      );
      if (status.rows[0].status === "published") continue;
      if (status.rows[0].status === "scheduled") {
        await openRound(exec, round.id, USER_ORG);
      }
      if (status.rows[0].status !== "locked" && status.rows[0].status !== "processing") {
        await lockRound(exec, round.id, USER_ORG);
      }
      const token = randomUUID();
      const processed = await processClaimedRound(exec, {
        roundId: round.id,
        actorId: USER_ORG,
        token,
      });
      if (!processed.noop && processed.output) {
        expect(processed.output.townStates).toHaveLength(20);
        await publishWithRecompute(exec, {
          roundId: round.id,
          actorId: USER_ORG,
          token,
        });
      } else if (processed.status === "processing") {
        const { rows } = await db.query<{ process_claim_token: string }>(
          `select process_claim_token::text from public.rounds where id = '${round.id}'`,
        );
        await publishWithRecompute(exec, {
          roundId: round.id,
          actorId: USER_ORG,
          token: rows[0].process_claim_token,
        });
      }
    }

    const finals = await db.query<{ final_score: string; seat: number }>(`
      select pr.final_score::text, t.seat
        from public.published_results pr
        join public.teams t on t.id = pr.team_id
        join public.rounds r on r.id = pr.round_id
       where r.round_index = 6
       order by t.seat
    `);
    expect(finals.rows).toHaveLength(20);
    for (const row of finals.rows) {
      expect(Number(row.final_score)).toBe(silent.score);
    }

    const events = await db.query<{ round_index: number; event_code: string | null }>(
      `select round_index, event_code from public.rounds where competition_id = '${competitionId}' order by round_index`,
    );
    expect(events.rows.map((e) => e.event_code)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);
  });

  it("void is organiser-only and cannot void a published round", async () => {
    await asUser(db, USER_A, async () => {
      await expect(voidRound(exec, rounds[5].id, USER_A)).rejects.toMatchObject({
        httpStatus: 403,
      });
    });
    await expect(voidRound(exec, rounds[5].id, USER_ORG)).rejects.toThrow(/published/i);
  });

  it("pure processRound refuses counts other than 20", () => {
    expect(() =>
      processRound({
        roundIndex: 1,
        catalogueHash: "x",
        teams: [],
      }),
    ).toThrow(/exactly 20/);
  });
});

describe("unpublished void restore (PGlite, not hosted)", () => {
  let restoreDb: PGlite;
  let restoreExec: Executor;
  let restoreRounds: { id: string; round_index: number; event_code: string | null }[];

  beforeAll(async () => {
    restoreDb = await createPglite();
    restoreExec = executor(restoreDb);
    await fixtureUsers(restoreDb);
    const { rows } = await restoreDb.query<{ id: string; round_index: number; event_code: string | null }>(
      `select id, round_index, event_code from public.rounds order by round_index`,
    );
    restoreRounds = rows;
  }, 60_000);

  afterAll(async () => {
    await restoreDb?.close();
  });

  it("returns a voided round to scheduled without skipping the Pack A event or counting as published", async () => {
    const r1 = restoreRounds[0].id;
    const r2 = restoreRounds[1].id;
    await openRound(restoreExec, r1, USER_ORG);
    await lockRound(restoreExec, r1, USER_ORG);
    const token = randomUUID();
    await processClaimedRound(restoreExec, { roundId: r1, actorId: USER_ORG, token });
    await publishWithRecompute(restoreExec, { roundId: r1, actorId: USER_ORG, token });

    await openRound(restoreExec, r2, USER_ORG);
    const voided = await voidRound(restoreExec, r2, USER_ORG);
    expect(voided.status).toBe("void");
    const privateAfterVoid = await restoreDb.query<{ n: number }>(
      `select count(*)::int as n from public.round_lock_private where round_id = '${r2}'`,
    );
    expect(privateAfterVoid.rows[0].n).toBe(0);

    await expect(openRound(restoreExec, restoreRounds[2].id, USER_ORG)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(openRound(restoreExec, r2, USER_ORG)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await asUser(restoreDb, USER_A, async () => {
      await expect(restoreVoidedRound(restoreExec, r2, USER_A)).rejects.toMatchObject({
        httpStatus: 403,
      });
    });

    const restored = await restoreVoidedRound(restoreExec, r2, USER_ORG);
    expect(restored.status).toBe("scheduled");
    expect(restored.idempotent).toBe(false);
    const again = await restoreVoidedRound(restoreExec, r2, USER_ORG);
    expect(again.idempotent).toBe(true);
    const event = await restoreDb.query<{ event_code: string | null; status: string }>(
      `select event_code, status from public.rounds where id = '${r2}'`,
    );
    expect(event.rows[0].status).toBe("scheduled");
    expect(event.rows[0].event_code).toBe("HEATWAVE");

    const reopened = await openRound(restoreExec, r2, USER_ORG);
    expect(reopened.status).toBe("open");
    await expect(restoreVoidedRound(restoreExec, r2, USER_ORG)).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
});
