import "server-only";
import { STARTING_RESERVE } from "@langlands/sim/public";
import { isMissingRpc, STARTING_RESERVE_FALLBACK } from "../admin-ops";
import { createServiceRoleClient } from "../supabase/admin";

type Admin = ReturnType<typeof createServiceRoleClient>;

const STARTING = Number.isFinite(STARTING_RESERVE) ? Number(STARTING_RESERVE) : STARTING_RESERVE_FALLBACK;

const MISSING_RPC =
  "Organiser RPCs are not installed on this database. Apply supabase/migrations/0015_organiser_reset_and_team_edit.sql in the SQL editor, then retry.";

type RpcResult = { ok: true; result: Record<string, unknown> } | { ok: false; message: string };

/**
 * Single transactional reset via security-definer RPC (migration 0015).
 * No multi-step client deletes — a failure rolls the whole function back.
 */
export async function resetCompetitionPlay(
  admin: Admin,
  competitionId: string,
  actorId: string,
): Promise<RpcResult> {
  const { data, error } = await admin.rpc("reset_competition_play", {
    _competition: competitionId,
    _actor: actorId,
  });
  if (error) {
    return {
      ok: false,
      message: isMissingRpc(error.message) ? MISSING_RPC : error.message,
    };
  }
  const result = asObject(data);
  if (!result || result.ok !== true) {
    return { ok: false, message: "Reset RPC returned an unexpected payload." };
  }
  const reserve = Number(result.reserve);
  if (reserve !== STARTING) {
    return {
      ok: false,
      message: `Reset did not restore reserve to ${STARTING} (got ${Number.isFinite(reserve) ? reserve : "missing"}).`,
    };
  }
  return { ok: true, result };
}

/** Single transactional team rename + audit via migration 0015 RPC. */
export async function renameTeam(
  admin: Admin,
  teamId: string,
  actorId: string,
  name: string,
): Promise<RpcResult> {
  const { data, error } = await admin.rpc("organiser_update_team", {
    _team_id: teamId,
    _actor: actorId,
    _name: name,
  });
  if (error) {
    return {
      ok: false,
      message: isMissingRpc(error.message) ? MISSING_RPC : error.message,
    };
  }
  const result = asObject(data);
  if (!result || result.ok !== true) {
    return { ok: false, message: "Team update RPC returned an unexpected payload." };
  }
  if (result.teamId !== teamId) {
    return { ok: false, message: "Team update RPC targeted the wrong team." };
  }
  return { ok: true, result };
}

/** Single transactional member rename/role + audit via migration 0015 RPC. */
export async function renameTeamMember(
  admin: Admin,
  teamId: string,
  userId: string,
  actorId: string,
  displayName: string,
  memberRole: "captain" | "member" | null,
): Promise<RpcResult> {
  const { data, error } = await admin.rpc("organiser_update_team_member", {
    _team_id: teamId,
    _user_id: userId,
    _actor: actorId,
    _display_name: displayName,
    _member_role: memberRole,
  });
  if (error) {
    return {
      ok: false,
      message: isMissingRpc(error.message) ? MISSING_RPC : error.message,
    };
  }
  const result = asObject(data);
  if (!result || result.ok !== true) {
    return { ok: false, message: "Member update RPC returned an unexpected payload." };
  }
  if (result.teamId !== teamId || result.userId !== userId) {
    return { ok: false, message: "Member update RPC targeted the wrong membership." };
  }
  return { ok: true, result };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
