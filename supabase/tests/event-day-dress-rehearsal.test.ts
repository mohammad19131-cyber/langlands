import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  ENGINE_VERSION,
  EQUAL,
  GREEN,
  PACK_A,
  RESTORE_EARLY,
  WEIGHTS,
  createInitialTown,
  playInteractive,
  pythonRound,
  splitAll,
  stateHash,
  type Submission,
  type Town,
} from "@langlands/sim";
import {
  lockRound,
  openRound,
  processClaimedRound,
  publicHasPrivateKeys,
  publishWithRecompute,
  submitDecision,
  type Executor,
} from "@langlands/round-machine";
import { mayReadOfficialBoard } from "../../apps/web/lib/board-access.ts";
import {
  boardForRound,
  compareOfficial,
  playStandingsFrom,
} from "../../apps/web/lib/ranking.ts";
import {
  EMPTY_ALLOCATIONS,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  supersedeAccepted,
} from "./harness.ts";

/** Five independent captains in seats 1–5. Remaining seats are official holds. */
export const TEAM_A_TO_E = [
  { label: "A", seat: 1 },
  { label: "B", seat: 2 },
  { label: "C", seat: 3 },
  { label: "D", seat: 4 },
  { label: "E", seat: 5 },
] as const;
const ACTIVE_SEATS = TEAM_A_TO_E.map((row) => row.seat);
const WATER_HEAVY = {
  restoration: 0.08,
  pollution_control: 0.1,
  water: 0.34,
  energy: 0.08,
  agriculture: 0.08,
  industry: 0.06,
  infrastructure: 0.14,
  public_services: 0.12,
} as const;

type SeatRow = { id: string; seat: number; userId: string };

let db: PGlite;
let exec: Executor;
let competitionId: string;
let seats: SeatRow[];
let rounds: { id: string; round_index: number; event_code: string | null }[];
const planned: Record<number, Submission[]> = {};
const timeline: Array<{
  round: number;
  event: string | null;
  opensAt: string;
  closesAt: string;
  windowMs: number;
  acceptedSeats: number[];
  holds: number;
  checksum: string;
  processRunsOk: number;
}> = [];

function userIdForSeat(seat: number): string {
  return `b0000000-0000-4000-8000-${String(seat).padStart(12, "0")}`;
}

function windowMs(opens: string | Date, closes: string | Date): number {
  return new Date(closes).getTime() - new Date(opens).getTime();
}

function decisionFor(seat: number, roundNo: number, available: number): Submission {
  if (seat === 1) {
    return {
      allocations: splitAll(available, RESTORE_EARLY),
      projectStarts: roundNo === 1 ? ["RIVER"] : roundNo === 4 ? ["FLOOD_WALL"] : [],
    };
  }
  if (seat === 2) {
    return {
      allocations: splitAll(available, EQUAL),
      projectStarts: roundNo === 1 ? ["CLINICS"] : roundNo === 3 ? ["WATER_TREAT"] : [],
    };
  }
  if (seat === 3) {
    const allocations = splitAll(available, Object.fromEntries(Object.keys(EQUAL).map((k) => [k, 0])));
    allocations.industry = available;
    return { allocations, projectStarts: roundNo === 1 ? ["INTENSE_AG"] : [] };
  }
  if (seat === 4) {
    return {
      allocations: splitAll(available, WATER_HEAVY),
      projectStarts: roundNo === 1 ? ["WASTEWATER"] : roundNo === 3 ? ["WATER_TREAT"] : [],
    };
  }
  if (seat === 5) {
    return {
      allocations: splitAll(available, GREEN),
      projectStarts: roundNo === 1 ? ["GRID"] : roundNo === 2 ? ["RENEWABLES"] : [],
    };
  }
  return { allocations: {}, projectStarts: [] };
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
    expect(processed.output.publicRows).toHaveLength(20);
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

describe("event-day dress rehearsal (PGlite isolated, not hosted)", () => {
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

    const roundRows = await db.query<{
      id: string;
      round_index: number;
      event_code: string | null;
    }>(
      `select id, round_index, event_code from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    rounds = roundRows.rows;
    expect(rounds).toHaveLength(6);

    for (const seat of ACTIVE_SEATS) {
      const recorded: Submission[] = [];
      playInteractive((roundNo, _town, available) => {
        const body = decisionFor(seat, roundNo, available);
        recorded[roundNo - 1] = body;
        return body;
      });
      planned[seat] = recorded;
    }
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("keeps Pack A, weights, and 20 seated captains before round 1", async () => {
    expect(WEIGHTS).toEqual({
      ecology: 0.4,
      welfare: 0.25,
      economy: 0.15,
      resilience: 0.1,
      efficiency: 0.1,
    });
    expect(PACK_A).toEqual({
      1: null,
      2: "HEATWAVE",
      3: "DROUGHT",
      4: "FLOOD",
      5: "CONTAMINATION",
      6: null,
    });
    expect(rounds.map((row) => row.event_code)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);
    const members = await db.query<{ n: number }>(
      `select count(*)::int as n from public.team_members tm
       join public.teams t on t.id = tm.team_id
       where t.competition_id = $1`,
      [competitionId],
    );
    expect(members.rows[0].n).toBe(20);
  });

  it("walks all six rounds with five distinct authenticated strategies", async () => {
    const silent = playInteractive(() => ({ allocations: {}, projectStarts: [] }));

    for (const round of rounds) {
      if (round.round_index > 1) {
        const predecessor = rounds[round.round_index - 2];
        const pred = await db.query<{ status: string }>(
          `select status from public.rounds where id = $1`,
          [predecessor.id],
        );
        expect(pred.rows[0].status).toBe("published");
      }

      const opened = await openRound(exec, round.id, USER_ORG);
      expect(opened.status).toBe("open");
      const stamped = await db.query<{
        status: string;
        opens_at: string;
        closes_at: string;
        event_code: string | null;
      }>(`select status, opens_at, closes_at, event_code from public.rounds where id = $1`, [round.id]);
      expect(stamped.rows[0].status).toBe("open");
      expect(windowMs(stamped.rows[0].opens_at, stamped.rows[0].closes_at)).toBe(18 * 60 * 1000);
      expect(stamped.rows[0].event_code).toBe(PACK_A[round.round_index as 1 | 2 | 3 | 4 | 5 | 6]);

      if (round.round_index < 6) {
        await expect(openRound(exec, rounds[round.round_index].id, USER_ORG)).rejects.toMatchObject({
          code: "invalid_transition",
        });
      }

      await asUser(db, seats[0].userId, async () => {
        await expect(openRound(exec, round.id, seats[0].userId)).rejects.toMatchObject({
          httpStatus: 403,
        });
      });

      if (round.round_index === 1) {
        const preTown = createInitialTown();
        const spoof = await asUser(db, seats[0].userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seats[1].id,
            body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
            idempotencyKey: "spoof-team-01",
            preTown,
            roundIndex: 1,
          }).catch((error: { httpStatus?: number }) => error),
        );
        expect(spoof).toMatchObject({ httpStatus: 403 });

        const overspend = await asUser(db, seats[0].userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seats[0].id,
            body: {
              allocations: { ...EMPTY_ALLOCATIONS, industry: 50_000 },
              projectStarts: [],
            },
            idempotencyKey: "overspend-r1-01",
            preTown,
            roundIndex: 1,
          }),
        );
        expect(overspend.ok).toBe(true);
        expect(overspend.applied?.spent).toBeLessThanOrEqual((overspend.applied?.available ?? 0) + 1e-6);

        const threeStarts = await asUser(db, seats[0].userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seats[0].id,
            body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["RIVER", "CLINICS", "GRID"] },
            idempotencyKey: "three-starts-01",
            preTown,
            roundIndex: 1,
          }),
        );
        expect(threeStarts.ok).toBe(false);
        expect(threeStarts.error).toBe("invalid");

        const unknown = await asUser(db, seats[0].userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seats[0].id,
            body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["NOT_A_PROJECT"] },
            idempotencyKey: "unknown-code-01",
            preTown,
            roundIndex: 1,
          }),
        );
        expect(unknown.ok).toBe(false);

        const coal = await asUser(db, seats[0].userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seats[0].id,
            body: { allocations: EMPTY_ALLOCATIONS, projectStarts: ["COAL"] },
            idempotencyKey: "coal-noprereq-01",
            preTown,
            roundIndex: 1,
          }),
        );
        expect(coal.ok).toBe(false);
        await supersedeAccepted(db, seats[0].id);
      }

      const active = seats.filter((row) => ACTIVE_SEATS.includes(row.seat as (typeof ACTIVE_SEATS)[number]));
      const saved = [];
      for (const seat of active) {
        const loaded = await exec.query<{ state?: unknown }>(
          `select ts.state
             from public.town_states ts
             join public.rounds r on r.id = ts.round_id
            where ts.team_id = $1 and r.competition_id = $2 and r.round_index = $3
              and r.status = 'published'`,
          [seat.id, competitionId, round.round_index - 1],
        );
        const preTown =
          round.round_index === 1
            ? createInitialTown()
            : ((loaded.rows[0] as { state: Town }).state as Town);
        const body = planned[seat.seat][round.round_index - 1];
        const result = await asUser(db, seat.userId, () =>
          submitDecision(exec, {
            roundId: round.id,
            teamId: seat.id,
            body,
            idempotencyKey: `dress-s${seat.seat}-r${round.round_index}`,
            preTown,
            roundIndex: round.round_index,
          }),
        );
        expect(result.ok, `seat ${seat.seat} round ${round.round_index}`).toBe(true);
        saved.push({ seat: seat.seat, id: result.id, starts: result.applied?.projectStarts });

        const reloaded = await asUser(db, seat.userId, () =>
          db.query<{ allocations: Submission["allocations"]; project_starts: string[]; status: string }>(
            `select allocations, project_starts, status from public.submissions
              where id = $1 and team_id = $2`,
            [result.id, seat.id],
          ),
        );
        expect(reloaded.rows).toHaveLength(1);
        expect(reloaded.rows[0].status).toBe("accepted");
        expect(reloaded.rows[0].project_starts).toEqual(body.projectStarts);
      }
      expect(new Set(saved.map((row) => row.id)).size).toBe(5);

      const unpublishedBoard = boardForRound({
        roundStatus: stamped.rows[0].status,
        teams: seats.map((row) => ({ seat: row.seat, name: `Seat ${row.seat}`, disqualified: false })),
        results: [],
      });
      expect(unpublishedBoard).toEqual({ ok: false, error: "unpublished" });

      const pubsBefore = await db.query<{ n: number }>(
        `select count(*)::int as n from public.published_results where round_id = $1`,
        [round.id],
      );
      expect(pubsBefore.rows[0].n).toBe(0);

      const retry = await asUser(db, seats[0].userId, () =>
        submitDecision(exec, {
          roundId: round.id,
          teamId: seats[0].id,
          body: planned[1][round.round_index - 1],
          idempotencyKey: `dress-s1-r${round.round_index}`,
          preTown: createInitialTown(),
          roundIndex: round.round_index,
        }),
      );
      expect(retry.status).toBe("duplicate");

      const locked = await lockRound(exec, round.id, USER_ORG);
      expect(locked.status).toBe("locked");
      const lockedAgain = await lockRound(exec, round.id, USER_ORG);
      expect(lockedAgain.idempotent).toBe(true);

      const afterLock = await asUser(db, seats[0].userId, () =>
        submitDecision(exec, {
          roundId: round.id,
          teamId: seats[0].id,
          body: { allocations: EMPTY_ALLOCATIONS, projectStarts: [] },
          idempotencyKey: `after-lock-r${round.round_index}`,
          preTown: createInitialTown(),
          roundIndex: round.round_index,
        }),
      );
      expect(afterLock.ok).toBe(false);
      expect(afterLock.error).toBe("closed");

      const accepted = await db.query<{ seat: number; n: number }>(`
        select t.seat, count(*)::int as n
          from public.submissions s
          join public.teams t on t.id = s.team_id
         where s.round_id = $1 and s.status = 'accepted'
         group by t.seat
         order by t.seat
      `, [round.id]);
      expect(accepted.rows.map((row) => row.seat)).toEqual([...ACTIVE_SEATS]);

      const manifest = locked.lock_manifest as Array<{ seat: number; submissionId: string | null }>;
      expect(manifest).toHaveLength(20);
      const held = manifest.filter((row) => row.submissionId === null);
      expect(held).toHaveLength(15);

      const firstProcess = await processAndPublish(round.id);
      expect(firstProcess.noop).toBe(false);
      const checksum = String(firstProcess.output?.checksum ?? "");
      expect(checksum.length).toBeGreaterThan(16);
      for (const row of firstProcess.output?.publicRows ?? []) {
        expect(publicHasPrivateKeys(row)).toEqual([]);
      }

      const secondProcess = await processClaimedRound(exec, {
        roundId: round.id,
        actorId: USER_ORG,
        token: randomUUID(),
      });
      expect(secondProcess.noop).toBe(true);

      const published = await db.query<{ status: string }>(
        `select status from public.rounds where id = $1`,
        [round.id],
      );
      expect(published.rows[0].status).toBe("published");

      const counts = await db.query<{ towns: number; pubs: number; runs: number }>(`
        select
          (select count(*)::int from public.town_states where round_id = $1) as towns,
          (select count(*)::int from public.published_results where round_id = $1) as pubs,
          (select count(*)::int from public.round_process_runs where round_id = $1 and ok is true) as runs
      `, [round.id]);
      expect(counts.rows[0]).toEqual({ towns: 20, pubs: 20, runs: 1 });

      const engines = await db.query<{ engine_version: string }>(
        `select distinct engine_version from public.published_results where round_id = $1`,
        [round.id],
      );
      expect(engines.rows.map((row) => row.engine_version)).toEqual([ENGINE_VERSION]);

      const leaked = await asUser(db, seats[0].userId, () =>
        db.query<{ n: number }>(
          `select count(*)::int as n from public.town_states where team_id = $1`,
          [seats[1].id],
        ),
      );
      expect(leaked.rows[0].n).toBe(0);

      const rivalSub = await asUser(db, seats[0].userId, () =>
        db.query<{ n: number }>(
          `select count(*)::int as n from public.submissions where team_id = $1`,
          [seats[1].id],
        ),
      );
      expect(rivalSub.rows[0].n).toBe(0);

      const storedChecksum = await db.query<{ process_checksum: string }>(
        `select process_checksum from public.rounds where id = $1`,
        [round.id],
      );
      expect(storedChecksum.rows[0].process_checksum).toBe(checksum);

      const publishedRows = await db.query<{
        team_seat: number;
        final_score: string | null;
        snapshot_score: string;
        score_breakdown: Record<string, number>;
        team_name: string;
      }>(
        `select team_seat, final_score::text, snapshot_score::text, score_breakdown, team_name
           from public.published_results where round_id = $1 order by team_seat`,
        [round.id],
      );
      const board = boardForRound({
        roundStatus: "published",
        teams: seats.map((row) => ({ seat: row.seat, name: `Seat ${String(row.seat).padStart(2, "0")}`, disqualified: false })),
        results: publishedRows.rows.map((row) => ({
          seat: row.team_seat,
          name: row.team_name,
          snapshot: Number(row.snapshot_score),
          final: row.final_score == null ? null : Number(row.final_score),
          breakdown: row.score_breakdown,
        })),
        viewerSeat: 1,
      });
      expect(board.ok).toBe(true);
      if (board.ok) {
        expect(board.seats).toHaveLength(20);
        expect(board.seats.find((row) => row.seat === 1)?.isYou).toBe(true);
        expect(board.seats.find((row) => row.seat === 2)?.isYou).toBe(false);
        expect(publishedRows.rows.every((row) => Number.isFinite(Number(row.score_breakdown.meanDamage)))).toBe(
          true,
        );
        const ranked = board.seats
          .filter((row) => row.rank != null)
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        expect(ranked).toHaveLength(20);
        for (let i = 1; i < ranked.length; i++) {
          expect(
            compareOfficial(
              {
                seat: ranked[i - 1].seat,
                rankingScore: ranked[i - 1].rankingScore as number,
                ecology: ranked[i - 1].breakdown?.ecology ?? 0,
                meanDamage: ranked[i - 1].meanDamage,
              },
              {
                seat: ranked[i].seat,
                rankingScore: ranked[i].rankingScore as number,
                ecology: ranked[i].breakdown?.ecology ?? 0,
                meanDamage: ranked[i].meanDamage,
              },
            ),
          ).toBeLessThanOrEqual(0);
        }
      }

      const standings = playStandingsFrom({
        roundSummaries: (await db.query<{ round_index: number; status: string }>(
          `select round_index, status from public.rounds where competition_id = $1 order by round_index`,
          [competitionId],
        )).rows.map((row) => ({ index: row.round_index, status: row.status })),
        teams: seats.map((row) => ({
          seat: row.seat,
          name: `Seat ${String(row.seat).padStart(2, "0")}`,
          disqualified: false,
        })),
        results: (
          await db.query<{
            round_index: number;
            team_seat: number;
            team_name: string;
            snapshot_score: string;
            final_score: string | null;
            score_breakdown: unknown;
          }>(
            `select r.round_index, pr.team_seat, pr.team_name, pr.snapshot_score::text,
                    pr.final_score::text, pr.score_breakdown
               from public.published_results pr
               join public.rounds r on r.id = pr.round_id
              where r.competition_id = $1`,
            [competitionId],
          )
        ).rows.map((row) => ({
          roundIndex: row.round_index,
          seat: row.team_seat,
          name: row.team_name,
          snapshot: Number(row.snapshot_score),
          final: row.final_score == null ? null : Number(row.final_score),
          breakdown: row.score_breakdown,
        })),
        viewerSeat: 1,
      });
      expect(standings.publishedRounds).toEqual(
        Array.from({ length: round.round_index }, (_, i) => i + 1),
      );
      expect(standings.publishedRounds.includes(round.round_index + 1)).toBe(false);

      timeline.push({
        round: round.round_index,
        event: stamped.rows[0].event_code,
        opensAt: stamped.rows[0].opens_at,
        closesAt: stamped.rows[0].closes_at,
        windowMs: windowMs(stamped.rows[0].opens_at, stamped.rows[0].closes_at),
        acceptedSeats: saved.map((row) => row.seat),
        holds: held.length,
        checksum,
        processRunsOk: counts.rows[0].runs,
      });
    }

    const finals = await db.query<{
      seat: number;
      final_score: string;
      snapshot_score: string;
      town_final: string;
      state: Town;
      air: string;
    }>(`
      select t.seat, pr.final_score::text, pr.snapshot_score::text,
             ts.final_score::text as town_final, ts.state, pr.air::text
        from public.published_results pr
        join public.town_states ts on ts.team_id = pr.team_id and ts.round_id = pr.round_id
        join public.teams t on t.id = pr.team_id
        join public.rounds r on r.id = pr.round_id
       where r.competition_id = $1 and r.round_index = 6
       order by t.seat
    `, [competitionId]);
    expect(finals.rows).toHaveLength(20);

    for (const row of finals.rows) {
      const replay = playInteractive((roundNo) =>
        ACTIVE_SEATS.includes(row.seat as (typeof ACTIVE_SEATS)[number])
          ? planned[row.seat][roundNo - 1]
          : { allocations: {}, projectStarts: [] },
      );
      expect(stateHash(row.state), `seat ${row.seat} hash`).toBe(replay.hash);
      expect(Number(row.snapshot_score), `seat ${row.seat} snapshot`).toBe(
        pythonRound(replay.rounds[5].snapshot.snapshot, 2),
      );
      expect(row.final_score, `seat ${row.seat} town/public`).toBe(row.town_final);
      expect(
        Math.abs(Number(row.final_score) - pythonRound(replay.score, 2)),
        `seat ${row.seat} official vs full-precision replay`,
      ).toBeLessThanOrEqual(0.01);
      if (!ACTIVE_SEATS.includes(row.seat as (typeof ACTIVE_SEATS)[number])) {
        expect(Number(row.final_score)).toBe(silent.score);
        expect(stateHash(row.state)).toBe(silent.hash);
      }
    }

    const activeScores = finals.rows
      .filter((row) => ACTIVE_SEATS.includes(row.seat as (typeof ACTIVE_SEATS)[number]))
      .map((row) => Number(row.final_score));
    expect(new Set(activeScores).size).toBe(5);
    expect(activeScores.every((score) => score !== silent.score)).toBe(true);

    const ranked = finals.rows
      .map((row) => ({ seat: row.seat, score: Number(row.final_score), air: Number(row.air) }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
    expect(ranked[0].score).toBe(Math.max(...finals.rows.map((row) => Number(row.final_score))));

    const audits = await db.query<{ action: string; n: number }>(`
      select action, count(*)::int as n
        from public.audit_logs
       where competition_id = $1
       group by action
       order by action
    `, [competitionId]);
    const byAction = Object.fromEntries(audits.rows.map((row) => [row.action, row.n]));
    expect(byAction.open_round).toBe(6);
    expect(byAction.lock_round).toBeGreaterThanOrEqual(6);
    expect(byAction.publish_round).toBe(6);

    const statuses = await db.query<{ round_index: number; status: string }>(
      `select round_index, status from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    expect(statuses.rows.map((row) => [row.round_index, row.status])).toEqual([
      [1, "published"],
      [2, "published"],
      [3, "published"],
      [4, "published"],
      [5, "published"],
      [6, "published"],
    ]);

    expect(timeline).toHaveLength(6);
    expect(timeline.map((row) => row.event)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);
    expect(mayReadOfficialBoard(false)).toBe(false);
    expect(mayReadOfficialBoard(true)).toBe(true);
    expect(new Set(timeline.map((row) => row.checksum)).size).toBe(6);
    expect(TEAM_A_TO_E.map((row) => row.seat)).toEqual([1, 2, 3, 4, 5]);
    // Sanitized evidence for the audit report (no credentials).
    console.log(
      JSON.stringify({
        teams: TEAM_A_TO_E,
        timeline: timeline.map((row) => ({
          round: row.round,
          event: row.event,
          windowMs: row.windowMs,
          acceptedSeats: row.acceptedSeats,
          holds: row.holds,
          checksum: row.checksum,
          processRunsOk: row.processRunsOk,
        })),
        round6: ranked.slice(0, 8).map((row) => ({ seat: row.seat, score: row.score })),
      }),
    );
  }, 120_000);
});
