import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseProvisionTeamIdList,
  seatForProvisionIndex,
  type ProvisionListResult,
} from "../team-login";
import {
  credentialsCsv,
  generateTeamPassword,
  hashTeamPassword,
  systemAuthEmail,
} from "./team-credentials";

export type ProvisionCredential = {
  teamId: string;
  password: string;
  seat: number;
  teamUuid: string;
  userId: string;
};

export type ProvisionResult =
  | {
      ok: true;
      competitionId: string;
      credentials: ProvisionCredential[];
      csv: string;
    }
  | { ok: false; error: string };

type TeamRow = {
  id: string;
  seat: number;
  login_id: string | null;
};

type PlannedSeat = {
  loginId: string;
  seat: number;
  team: TeamRow;
  password: string;
  passwordHash: string;
  email: string;
  existingCaptainId: string | null;
  /** Auth users created in this run (must be deleted on rollback). */
  createdUserId: string | null;
  userId: string | null;
  /** Prior login_id for compensating rollback of team row updates. */
  priorLoginId: string | null;
  /** True after this seat's team row credentials were written in this run. */
  credentialsApplied: boolean;
};

/**
 * Creates or updates all 20 team accounts from a qualified-team ID list.
 * Passwords are generated here and returned once; only bcrypt hashes are stored.
 * On failure, newly created Auth users are deleted and team credential columns
 * written in this run are cleared so seats are not left half-assigned.
 */
export async function provisionQualifiedTeams(
  admin: SupabaseClient,
  competitionId: string,
  rawList: string[] | string,
): Promise<ProvisionResult> {
  const parsed: ProvisionListResult = parseProvisionTeamIdList(rawList);
  if (!parsed.ok) return parsed;

  const { data: teams, error: teamsError } = await admin
    .from("teams")
    .select("id, seat, login_id")
    .eq("competition_id", competitionId)
    .order("seat", { ascending: true });

  if (teamsError) return { ok: false, error: teamsError.message };
  const seatTeams = (teams as TeamRow[] | null) ?? [];
  if (seatTeams.length !== 20) {
    return {
      ok: false,
      error: `Competition has ${seatTeams.length} seats; expected 20 seeded teams.`,
    };
  }

  for (let i = 0; i < 20; i++) {
    if (seatTeams[i]?.seat !== i + 1) {
      return { ok: false, error: "Seat rows are not contiguous 1..20." };
    }
  }

  const planned: PlannedSeat[] = [];
  for (let i = 0; i < parsed.teamIds.length; i++) {
    const loginId = parsed.teamIds[i]!;
    const seat = seatForProvisionIndex(i);
    const team = seatTeams[i]!;
    const password = generateTeamPassword();
    const passwordHash = await hashTeamPassword(password);
    planned.push({
      loginId,
      seat,
      team,
      password,
      passwordHash,
      email: systemAuthEmail(loginId),
      existingCaptainId: null,
      createdUserId: null,
      userId: null,
      priorLoginId: team.login_id,
      credentialsApplied: false,
    });
  }

  try {
    for (const row of planned) {
      const { data: existingMembers, error: membersError } = await admin
        .from("team_members")
        .select("user_id, member_role")
        .eq("team_id", row.team.id);

      if (membersError) throw new Error(membersError.message);

      const captain = (
        (existingMembers as { user_id: string; member_role: string }[] | null) ?? []
      ).find((member) => member.member_role === "captain");
      row.existingCaptainId = captain?.user_id ?? null;

      if (!row.existingCaptainId) {
        const created = await admin.auth.admin.createUser({
          email: row.email,
          password: row.password,
          email_confirm: true,
          user_metadata: {
            display_name: `Team ${row.loginId}`,
            login_id: row.loginId,
          },
        });
        if (created.error || !created.data.user) {
          throw new Error(
            created.error?.message ?? `Failed to create Auth user for ${row.loginId}`,
          );
        }
        row.createdUserId = created.data.user.id;
        row.userId = created.data.user.id;

        const { error: memberInsertError } = await admin.from("team_members").insert({
          team_id: row.team.id,
          user_id: row.userId,
          member_role: "captain",
        });
        if (memberInsertError) throw new Error(memberInsertError.message);
      } else {
        row.userId = row.existingCaptainId;
        const updated = await admin.auth.admin.updateUserById(row.existingCaptainId, {
          email: row.email,
          password: row.password,
          email_confirm: true,
          user_metadata: {
            display_name: `Team ${row.loginId}`,
            login_id: row.loginId,
          },
        });
        if (updated.error) throw new Error(updated.error.message);
      }

      const { error: teamUpdateError } = await admin
        .from("teams")
        .update({
          login_id: row.loginId,
          password_hash: row.passwordHash,
        })
        .eq("id", row.team.id);

      if (teamUpdateError) throw new Error(teamUpdateError.message);
      row.credentialsApplied = true;
    }
  } catch (error) {
    await compensateFailedProvision(admin, planned);
    const message = error instanceof Error ? error.message : "Provisioning failed";
    return { ok: false, error: message };
  }

  const credentials: ProvisionCredential[] = planned.map((row) => ({
    teamId: row.loginId,
    password: row.password,
    seat: row.seat,
    teamUuid: row.team.id,
    userId: row.userId!,
  }));

  return {
    ok: true,
    competitionId,
    credentials,
    csv: credentialsCsv(
      credentials.map((row) => ({
        teamId: row.teamId,
        password: row.password,
        seat: row.seat,
      })),
    ),
  };
}

async function compensateFailedProvision(
  admin: SupabaseClient,
  planned: PlannedSeat[],
): Promise<void> {
  // Reverse order: undo only seats this run mutated.
  for (const row of [...planned].reverse()) {
    if (row.credentialsApplied) {
      await admin
        .from("teams")
        .update({
          login_id: row.priorLoginId,
          password_hash: null,
        })
        .eq("id", row.team.id);
    }

    if (row.createdUserId) {
      await admin
        .from("team_members")
        .delete()
        .eq("team_id", row.team.id)
        .eq("user_id", row.createdUserId);
      await admin.auth.admin.deleteUser(row.createdUserId);
    }
  }
}
