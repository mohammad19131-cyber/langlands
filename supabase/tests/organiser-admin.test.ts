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
  USER_B,
  USER_ORG,
  asUser,
  createPglite,
  executor,
  fixtureUsers,
  openRound as openRoundWindow,
} from "./harness.ts";

describe("organiser reset and team edit (PGlite; hosted NOT VERIFIED)", () => {
  let db: PGlite;
  let exec: Executor;
  let competitionId: string;
  let teamA: string;
  let teamB: string;
  let round1: string;

  beforeAll(async () => {
    db = await createPglite();
    exec = executor(db);
    const fx = await fixtureUsers(db);
    competitionId = fx.competitionId;
    teamA = fx.teamA;
    teamB = fx.teamB;
    round1 = fx.round1;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("lets an organiser rename a team and member, and refuses a captain", async () => {
    const renamed = await db.query<{ organiser_update_team: { name: string } }>(
      `select public.organiser_update_team($1::uuid, $2::uuid, $3::text) as organiser_update_team`,
      [teamA, USER_ORG, "Ashfen North"],
    );
    expect(renamed.rows[0].organiser_update_team.name).toBe("Ashfen North");
    const stored = await db.query<{ name: string }>(`select name from public.teams where id = $1`, [teamA]);
    expect(stored.rows[0].name).toBe("Ashfen North");

    const member = await db.query<{ organiser_update_team_member: { displayName: string; memberRole: string } }>(
      `select public.organiser_update_team_member($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text) as organiser_update_team_member`,
      [teamA, USER_A, USER_ORG, "Captain North", "captain"],
    );
    expect(member.rows[0].organiser_update_team_member.displayName).toBe("Captain North");
    expect(member.rows[0].organiser_update_team_member.memberRole).toBe("captain");

    await asUser(db, USER_A, async () => {
      await expect(
        db.query(`select public.organiser_update_team($1::uuid, $2::uuid, $3::text)`, [
          teamA,
          USER_A,
          "Hijack",
        ]),
      ).rejects.toThrow(/unauthorized|permission denied/i);
    });
  });

  it("resets play data, keeps teams and members, and restores starting credits", async () => {
    await db.exec(`update public.competitions set status = 'live' where id = '${competitionId}'`);
    await openRoundWindow(db, round1);
    const preTown = createInitialTown();
    await asUser(db, USER_A, () =>
      submitDecision(exec, {
        roundId: round1,
        teamId: teamA,
        body: { allocations: { ...EMPTY_ALLOCATIONS, water: 10 }, projectStarts: [] },
        idempotencyKey: "admin-reset-a1",
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
    await publishWithRecompute(exec, {
      roundId: round1,
      actorId: USER_ORG,
      token: token.rows[0].process_claim_token,
    });

    const beforeTeams = await db.query<{ n: number }>(
      `select count(*)::int as n from public.teams where competition_id = $1`,
      [competitionId],
    );
    const beforeMembers = await db.query<{ n: number }>(
      `select count(*)::int as n
         from public.team_members m
         join public.teams t on t.id = m.team_id
        where t.competition_id = $1`,
      [competitionId],
    );
    expect(beforeTeams.rows[0].n).toBe(20);

    const reset = await db.query<{ reset_competition_play: { ok: boolean; status: string; teams: number } }>(
      `select public.reset_competition_play($1::uuid, $2::uuid) as reset_competition_play`,
      [competitionId, USER_ORG],
    );
    expect(reset.rows[0].reset_competition_play.ok).toBe(true);
    expect(reset.rows[0].reset_competition_play.status).toBe("ready");
    expect(reset.rows[0].reset_competition_play.teams).toBe(20);

    const leftover = await db.query<{ subs: number; towns: number; pubs: number; runs: number }>(`
      select
        (select count(*)::int from public.submissions s join public.rounds r on r.id = s.round_id where r.competition_id = $1) as subs,
        (select count(*)::int from public.town_states ts join public.rounds r on r.id = ts.round_id where r.competition_id = $1) as towns,
        (select count(*)::int from public.published_results pr join public.rounds r on r.id = pr.round_id where r.competition_id = $1) as pubs,
        (select count(*)::int from public.round_process_runs rp join public.rounds r on r.id = rp.round_id where r.competition_id = $1) as runs
    `, [competitionId]);
    expect(leftover.rows[0]).toEqual({ subs: 0, towns: 0, pubs: 0, runs: 0 });

    const afterTeams = await db.query<{ n: number; name: string }>(
      `select count(*)::int as n, max(name) filter (where id = $2) as name
         from public.teams where competition_id = $1`,
      [competitionId, teamA],
    );
    expect(afterTeams.rows[0].n).toBe(beforeTeams.rows[0].n);
    expect(afterTeams.rows[0].name).toBe("Ashfen North");

    const afterMembers = await db.query<{ n: number; display: string; role: string }>(
      `select count(*)::int as n,
              max(p.display_name) filter (where m.user_id = $2) as display,
              max(m.member_role::text) filter (where m.user_id = $2) as role
         from public.team_members m
         join public.teams t on t.id = m.team_id
         join public.profiles p on p.id = m.user_id
        where t.competition_id = $1`,
      [competitionId, USER_A],
    );
    expect(afterMembers.rows[0].n).toBe(beforeMembers.rows[0].n);
    expect(afterMembers.rows[0].display).toBe("Captain North");
    expect(afterMembers.rows[0].role).toBe("captain");

    const rounds = await db.query<{ status: string }>(
      `select distinct status from public.rounds where competition_id = $1`,
      [competitionId],
    );
    expect(rounds.rows.map((row) => row.status)).toEqual(["scheduled"]);

    const events = await db.query<{ round_index: number; event_code: string | null }>(
      `select round_index, event_code from public.rounds where competition_id = $1 order by round_index`,
      [competitionId],
    );
    expect(events.rows.map((row) => row.event_code)).toEqual([
      null,
      "HEATWAVE",
      "DROUGHT",
      "FLOOD",
      "CONTAMINATION",
      null,
    ]);

    const reserve = await db.query<{ reserve: string }>(
      `select initial_state->>'reserve' as reserve from public.town_templates where competition_id = $1`,
      [competitionId],
    );
    expect(Number(reserve.rows[0].reserve)).toBe(220);

    await asUser(db, USER_B, async () => {
      await expect(
        db.query(`select public.reset_competition_play($1::uuid, $2::uuid)`, [competitionId, USER_B]),
      ).rejects.toThrow(/unauthorized|permission denied/i);
    });
  });
});
