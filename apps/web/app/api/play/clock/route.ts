import { PACK_A } from "@langlands/sim/public";
import { requireConfigured, requireUser } from "../../../../lib/server/authz";
import { jsonError } from "../../../../lib/server/json";
import { createServiceRoleClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Session-scoped round clock. Status and deadlines come from the server.
 * Does not return town state, submissions, or rival data.
 */
export async function GET() {
  const configured = await requireConfigured();
  if (!configured.ok) return Response.json(configured.body, { status: configured.status });
  const authed = await requireUser();
  if (!authed.ok) return Response.json(authed.body, { status: authed.status });

  const admin = createServiceRoleClient();
  type RoundRow = {
    id: string;
    round_index: number;
    status: string;
    opens_at: string | null;
    closes_at: string | null;
    event_code: string | null;
    competition_id: string;
  };
  const [{ data: membership }, { data: roundRows }] = await Promise.all([
    admin
      .from("team_members")
      .select("team_id, teams(competition_id, disqualified)")
      .eq("user_id", authed.user.userId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("rounds")
      .select("id, round_index, status, opens_at, closes_at, event_code, competition_id")
      .order("round_index"),
  ]);

  const teamRaw = (membership as { teams?: unknown } | null)?.teams as
    | { competition_id: string; disqualified: boolean }
    | { competition_id: string; disqualified: boolean }[]
    | undefined;
  const team = Array.isArray(teamRaw) ? teamRaw[0] : teamRaw;
  if (!team || team.disqualified) return jsonError(403, "unauthorized");

  const rounds = ((roundRows as RoundRow[] | null) ?? []).filter(
    (row) => row.competition_id === team.competition_id,
  );
  const active =
    rounds.find((row) => row.status === "open") ??
    rounds.find((row) => row.status === "locked" || row.status === "processing") ??
    rounds.find((row) => row.status === "scheduled") ??
    rounds.filter((row) => row.status === "published").at(-1) ??
    null;

  return Response.json({
    ok: true,
    serverNow: new Date().toISOString(),
    roundId: active?.id ?? null,
    roundIndex: active?.round_index ?? null,
    status: active?.status ?? "none",
    opensAt: active?.opens_at ?? null,
    closesAt: active?.closes_at ?? null,
    eventCode: active?.event_code ?? (active ? PACK_A[active.round_index] ?? null : null),
  });
}
