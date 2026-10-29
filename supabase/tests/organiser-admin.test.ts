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

const allocJson = JSON.stringify(EMPTY_ALLOCATIONS);

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

    const audits = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_logs
        where competition_id = $1 and action in ('organiser_update_team', 'organiser_update_team_member')`,
      [competitionId],
    );
    expect(audits.rows[0].n).toBeGreaterThanOrEqual(2);

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

  it("rejects invalid member roles and short names", async () => {
    await expect(
      db.query(
        `select public.organiser_update_team_member($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)`,
        [teamA, USER_A, USER_ORG, "Still Valid", "organiser"],
      ),
    ).rejects.toThrow(/invalid member role/i);

    await expect(
      db.query(`select public.organiser_update_team($1::uuid, $2::uuid, $3::text)`, [teamA, USER_ORG, "x"]),
    ).rejects.toThrow(/invalid team name/i);

    await expect(
      db.query(
        `select public.organiser_update_team_member($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text)`,
        [teamA, USER_A, USER_ORG, "A", "captain"],
      ),
    ).rejects.toThrow(/invalid display name/i);

    const role = await db.query<{ member_role: string }>(
      `select member_role::text from public.team_members where team_id = $1 and user_id = $2`,
      [teamA, USER_A],
    );
    expect(role.rows[0].member_role).toBe("captain");
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

    const audit = await db.query<{ n: number; reserve: number }>(
      `select count(*)::int as n, max((payload->>'reserve')::numeric) as reserve
         from public.audit_logs
        where competition_id = $1 and action = 'reset_competition_play'`,
      [competitionId],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(Number(audit.rows[0].reserve)).toBe(220);

    await db.exec(`
      update public.town_templates
         set initial_state = jsonb_set(initial_state, '{reserve}', '61.5'::jsonb)
       where competition_id = '${competitionId}'
    `);
    const resetAgain = await db.query<{ reset_competition_play: { reserve: number } }>(
      `select public.reset_competition_play($1::uuid, $2::uuid) as reset_competition_play`,
      [competitionId, USER_ORG],
    );
    expect(resetAgain.rows[0].reset_competition_play.reserve).toBe(220);
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

  it("isolates reset from another competition and rolls back on missing template", async () => {
    const otherId = randomUUID();
    const otherTeam = randomUUID();
    const otherRound = randomUUID();
    const otherSub = randomUUID();

    await db.exec(`
      insert into public.competitions (
        id, slug, title, status, rules_version, scenario_pack, engine_version,
        team_count, round_count, current_round_index, catalogue_hash, created_by
      ) values (
        '${otherId}', 'other-comp-isolation', 'Other Comp', 'live', 'A-CAT-1.1', 'A', 'py-ref-1.1.0',
        20, 6, 1, 'isolation-hash', null
      );
      insert into public.town_templates (competition_id, initial_state, published, checksum)
      values ('${otherId}', '{"reserve":220}'::jsonb, true, 'iso');
      insert into public.teams (id, competition_id, seat, name, slug)
      values ('${otherTeam}', '${otherId}', 1, 'Other Team', 'other-team');
      insert into public.rounds (
        id, competition_id, round_index, status, opens_at, closes_at, event_code
      ) values (
        '${otherRound}', '${otherId}', 1, 'open',
        now() - interval '1 minute', now() + interval '1 hour', null
      );
      insert into public.submissions (
        id, round_id, team_id, status, allocations, project_starts, idempotency_key, schema_version
      ) values (
        '${otherSub}', '${otherRound}', '${otherTeam}', 'accepted',
        '${allocJson}'::jsonb, '{}'::text[], 'iso-sub-1', 'py-ref-1.1.0'
      );
      insert into public.competition_staff (competition_id, user_id, staff_role)
      values ('${otherId}', '${USER_ORG}', 'organiser');
    `);

    await db.exec(`
      update public.town_templates
         set initial_state = jsonb_set(initial_state, '{reserve}', '99'::jsonb)
       where competition_id = '${competitionId}'
    `);
    await openRoundWindow(db, round1);
    await db.exec(`
      insert into public.submissions (
        id, round_id, team_id, status, allocations, project_starts, idempotency_key, schema_version
      ) values (
        '${randomUUID()}', '${round1}', '${teamA}', 'accepted',
        '${allocJson}'::jsonb, '{}'::text[], 'iso-main-sub', 'py-ref-1.1.0'
      )
    `);

    const resetMain = await db.query<{ reset_competition_play: { ok: boolean } }>(
      `select public.reset_competition_play($1::uuid, $2::uuid) as reset_competition_play`,
      [competitionId, USER_ORG],
    );
    expect(resetMain.rows[0].reset_competition_play.ok).toBe(true);

    const otherLeft = await db.query<{ n: number; status: string; reserve: string }>(`
      select
        (select count(*)::int from public.submissions where id = '${otherSub}') as n,
        (select status from public.rounds where id = '${otherRound}') as status,
        (select initial_state->>'reserve' from public.town_templates where competition_id = '${otherId}') as reserve
    `);
    expect(otherLeft.rows[0].n).toBe(1);
    expect(otherLeft.rows[0].status).toBe("open");
    expect(Number(otherLeft.rows[0].reserve)).toBe(220);

    await expect(
      db.query(`select public.organiser_update_team($1::uuid, $2::uuid, $3::text)`, [
        otherTeam,
        USER_A,
        "Cross Comp",
      ]),
    ).rejects.toThrow(/unauthorized|permission denied/i);

    const otherName = await db.query<{ name: string }>(`select name from public.teams where id = $1`, [
      otherTeam,
    ]);
    expect(otherName.rows[0].name).toBe("Other Team");

    // Transactional rollback: missing template aborts the whole reset.
    await db.exec(`delete from public.town_templates where competition_id = '${otherId}'`);
    await expect(
      db.query(`select public.reset_competition_play($1::uuid, $2::uuid)`, [otherId, USER_ORG]),
    ).rejects.toThrow(/town template missing/i);

    const rolled = await db.query<{ n: number; status: string; comp: string }>(`
      select
        (select count(*)::int from public.submissions where id = '${otherSub}') as n,
        (select status from public.rounds where id = '${otherRound}') as status,
        (select status from public.competitions where id = '${otherId}') as comp
    `);
    expect(rolled.rows[0].n).toBe(1);
    expect(rolled.rows[0].status).toBe("open");
    expect(rolled.rows[0].comp).toBe("live");
  });
});
