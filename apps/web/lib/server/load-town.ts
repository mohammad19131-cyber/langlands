import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTown } from "@langlands/round-machine";
import type { Town } from "@langlands/sim";

export async function loadPreTownForTeam(
  admin: SupabaseClient,
  competitionId: string,
  teamId: string,
  roundIndex: number,
): Promise<{ town: Town; previousSnapshots: number[] } | null> {
  if (roundIndex === 1) {
    const { data } = await admin
      .from("town_templates")
      .select("initial_state")
      .eq("competition_id", competitionId)
      .maybeSingle();
    if (!data) return null;
    return { town: parseTown(data.initial_state), previousSnapshots: [] };
  }

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, round_index, status")
    .eq("competition_id", competitionId)
    .lt("round_index", roundIndex)
    .eq("status", "published")
    .order("round_index");
  const prev = rounds?.find((r) => r.round_index === roundIndex - 1);
  if (!prev) return null;

  const ids = (rounds ?? []).map((r) => r.id);
  const { data: states } = await admin
    .from("town_states")
    .select("round_id, state, snapshot_score")
    .eq("team_id", teamId)
    .in("round_id", ids);

  const prevState = states?.find((s) => s.round_id === prev.id);
  if (!prevState) return null;
  const snapshots = (rounds ?? [])
    .map((r) => states?.find((s) => s.round_id === r.id)?.snapshot_score)
    .filter((n) => n !== undefined && n !== null)
    .map(Number);
  return { town: parseTown(prevState.state), previousSnapshots: snapshots };
}
