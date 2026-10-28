import "server-only";
import { planEventTick, publicTickResult, type TickPlan } from "../event-tick-plan";
import { createServiceRoleClient } from "../supabase/admin";
import { runProcessAndMaybeSave } from "./run-process";

export async function runEventTick(args: {
  competitionId: string;
  actorId: string;
}): Promise<{ ok: boolean; plan: TickPlan; result?: unknown; error?: string }> {
  const admin = createServiceRoleClient();
  const { data: competition, error: competitionError } = await admin
    .from("competitions")
    .select("id, status")
    .eq("id", args.competitionId)
    .maybeSingle();
  if (competitionError || !competition) {
    return {
      ok: false,
      plan: { step: "blocked", roundId: null, reason: "Competition not found." },
      error: "unknown competition",
    };
  }
  const { data: roundRows } = await admin
    .from("rounds")
    .select("id, round_index, status, closes_at, process_checksum")
    .eq("competition_id", args.competitionId)
    .order("round_index");
  const plan = planEventTick({
    competitionStatus: String(competition.status),
    nowMs: Date.now(),
    rounds: (roundRows as Array<{
      id: string;
      round_index: number;
      status: string;
      closes_at: string | null;
      process_checksum: string | null;
    }> | null) ?? [],
  });

  try {
    if (plan.step === "lock" && plan.roundId) {
      const { data, error } = await admin.rpc("lock_round", {
        _round_id: plan.roundId,
        _actor: args.actorId,
      });
      if (error) throw error;
      await admin.rpc("audit_append", {
        _actor: args.actorId,
        _competition: args.competitionId,
        _team: null,
        _action: "lock_round",
        _payload: { roundId: plan.roundId, source: "event_tick" },
      });
      return { ok: true, plan, result: publicTickResult(data) };
    }
    if (plan.step === "process" && plan.roundId) {
      const processed = await runProcessAndMaybeSave(admin, {
        roundId: plan.roundId,
        actorId: args.actorId,
        publish: false,
      });
      return { ok: true, plan, result: publicTickResult(processed) };
    }
    if (plan.step === "publish" && plan.roundId) {
      const processed = await runProcessAndMaybeSave(admin, {
        roundId: plan.roundId,
        actorId: args.actorId,
        publish: true,
      });
      return { ok: true, plan, result: publicTickResult(processed) };
    }
    if (plan.step === "open" && plan.roundId) {
      const { data, error } = await admin.rpc("open_round", {
        _round_id: plan.roundId,
        _actor: args.actorId,
      });
      if (error) throw error;
      await admin.rpc("audit_append", {
        _actor: args.actorId,
        _competition: args.competitionId,
        _team: null,
        _action: "open_round",
        _payload: { roundId: plan.roundId, source: "event_tick" },
      });
      return { ok: true, plan, result: publicTickResult(data) };
    }
    if (plan.step === "complete") {
      await admin.from("competitions").update({ status: "closed" }).eq("id", args.competitionId).eq("status", "live");
      return { ok: true, plan };
    }
    return { ok: true, plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tick failed";
    return { ok: false, plan: { ...plan, step: "blocked", reason: message }, error: message };
  }
}
