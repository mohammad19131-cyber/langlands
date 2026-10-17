"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SECTORS, type Sector } from "@langlands/sim/public";
import type { GameContext } from "../../lib/game-types";
import { districtsForSector } from "./sectors";
import type { DistrictId } from "../map/town-geometry";
import {
  emptyAllocations,
  fullAllocations,
  projectCost,
  startEligibility,
} from "./game-logic";
import { GameMap } from "./GameMap";
import { GameHeader } from "./GameHeader";
import { DistrictPanel } from "./DistrictPanel";
import { ActionBar } from "./ActionBar";
import {
  EventOverlay,
  ReviewModal,
  ScoringOverlay,
  StandingsOverlay,
  type SubmitState,
} from "./Overlays";

type OverlayKind = "standings" | "scoring" | "event" | "review" | null;

export function GameScreen({ ctx }: { ctx: GameContext }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<DistrictId | null>(null);
  const [selected, setSelected] = useState<DistrictId | null>(null);
  const [openCategory, setOpenCategory] = useState<Sector | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle", message: null });

  const [stagedStarts, setStagedStarts] = useState<string[]>(
    () => ctx.submission?.projectStarts ?? [],
  );
  const [allocations, setAllocations] = useState<Record<Sector, number>>(() =>
    fullAllocations(ctx.submission?.allocations ?? {}),
  );

  const roundStatus = ctx.round?.status ?? "none";
  const planningAllowed =
    ctx.mode === "preview" || roundStatus === "open" || roundStatus === "scheduled";
  const editLocked = !planningAllowed;
  const canSubmit =
    ctx.mode === "live" && roundStatus === "open" && !!ctx.round?.id && !!ctx.team;

  const targets = useMemo<DistrictId[]>(
    () => (openCategory ? districtsForSector(openCategory) : []),
    [openCategory],
  );

  function toggleStart(code: string) {
    setSubmit({ status: "idle", message: null });
    setStagedStarts((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return prev;
      const elig = startEligibility(code, ctx.startedCodes, ctx.completedCodes, prev);
      if (!elig.ok) return prev;
      return [...prev, code];
    });
  }

  function allocate(sector: Sector, value: number) {
    setSubmit({ status: "idle", message: null });
    setAllocations((prev) => ({ ...prev, [sector]: Math.max(0, Math.round(value)) }));
  }

  function spreadEvenly() {
    const remaining = Math.max(0, ctx.budget.available - projectCost(stagedStarts));
    const base = Math.floor(remaining / SECTORS.length);
    let leftover = Math.round(remaining - base * SECTORS.length);
    const next = emptyAllocations();
    for (const s of SECTORS) {
      next[s] = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
    }
    setAllocations(next);
  }

  function clearAllocations() {
    setAllocations(emptyAllocations());
  }

  function pickSector(sector: Sector) {
    setOpenCategory(sector);
    setBudgetOpen(false);
  }

  async function doSubmit() {
    if (!ctx.round?.id || !ctx.team) return;
    setSubmit({ status: "submitting", message: null });
    try {
      const res = await fetch(`/api/rounds/${ctx.round.id}/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          teamId: ctx.team.id,
          allocations: fullAllocations(allocations),
          projectStarts: stagedStarts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setSubmit({
          status: "error",
          message:
            data?.error ||
            data?.message ||
            `Submission rejected (${res.status}). Nothing was changed on the server.`,
        });
        return;
      }
      const applied = data.applied;
      const starts: string[] = applied?.projectStarts ?? stagedStarts;
      setSubmit({
        status: "success",
        message:
          data.status === "duplicate"
            ? "Already recorded — this exact decision was previously submitted."
            : `Submitted. Server accepted ${starts.length} start${starts.length === 1 ? "" : "s"}; ${Math.round(
                applied?.unspent ?? 0,
              )} cr held in reserve.`,
      });
      setTimeout(() => router.refresh(), 1200);
    } catch {
      setSubmit({
        status: "error",
        message: "Network error reaching the server. Your decision was not submitted.",
      });
    }
  }

  const statusBanner = bannerFor(ctx, roundStatus);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0B0F0D] text-[#E7E3D6]">
      <GameHeader
        ctx={ctx}
        onOpenStandings={() => setOverlay("standings")}
        onOpenScoring={() => setOverlay("scoring")}
        onOpenEvent={() => setOverlay("event")}
      />

      <main className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <GameMap
            town={ctx.town}
            hovered={hovered}
            onHover={setHovered}
            selected={selected}
            onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
            targets={targets}
          />
        </div>
        <div className="game-vignette pointer-events-none absolute inset-0" />

        {/* Town label */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 border border-[#B89A60]/20 bg-black/40 px-3 py-1 text-[0.66rem] uppercase tracking-[0.14em] text-[#B8B2A0] backdrop-blur">
          {ctx.town.label}
        </div>

        {statusBanner ? (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-[#B89A60]/25 bg-black/50 px-4 py-2 text-center text-[0.76rem] text-[#D7CFB8] backdrop-blur">
            {statusBanner}
          </div>
        ) : null}

        {selected ? (
          <DistrictPanel
            districtId={selected}
            town={ctx.town}
            onClose={() => setSelected(null)}
            onPickSector={pickSector}
          />
        ) : null}
      </main>

      <ActionBar
        ctx={ctx}
        locked={editLocked}
        canSubmit={canSubmit}
        openCategory={openCategory}
        onToggleCategory={(s) => setOpenCategory((cur) => (cur === s ? null : s))}
        stagedStarts={stagedStarts}
        onToggleStart={toggleStart}
        allocations={allocations}
        onAllocate={allocate}
        onSpread={spreadEvenly}
        onClear={clearAllocations}
        budgetOpen={budgetOpen}
        onToggleBudget={() => setBudgetOpen((v) => !v)}
        onReview={() => {
          setSubmit({ status: "idle", message: null });
          setOverlay("review");
        }}
      />

      {overlay === "standings" ? (
        <StandingsOverlay ctx={ctx} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "scoring" ? (
        <ScoringOverlay ctx={ctx} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "event" ? <EventOverlay ctx={ctx} onClose={() => setOverlay(null)} /> : null}
      {overlay === "review" ? (
        <ReviewModal
          ctx={ctx}
          stagedStarts={stagedStarts}
          allocations={allocations}
          submit={submit}
          onConfirm={doSubmit}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </div>
  );
}

function bannerFor(ctx: GameContext, status: string): string | null {
  if (ctx.mode === "preview") return null;
  if (status === "open") return null;
  return ctx.notice;
}
