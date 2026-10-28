"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SECTORS, type Sector } from "@langlands/sim/public";
import { remainingMs } from "../../lib/clock";
import {
  budgetCheck,
  decisionsEqual,
  emptyAllocations,
  fullAllocations,
  humanizeSubmitError,
  idempotencyKeyFor,
  projectCost,
  saveStatusLabel,
  silentHoldNotice,
  type DecisionPayload,
} from "../../lib/decision";
import type { GameContext, RoundPhase } from "../../lib/game-types";
import { submissionClosedMessage } from "../../lib/submission-closed";
import { districtsForSector } from "./sectors";
import type { DistrictId } from "../map/town-geometry";
import { startEligibility } from "./game-logic";
import { GameMap } from "./GameMap";
import { GameHeader } from "./GameHeader";
import { DistrictPanel } from "./DistrictPanel";
import { ActionBar } from "./ActionBar";
import { CommandDesk, type DeskTab } from "./CommandDesk";
import { EventStrip } from "./EventStrip";
import {
  EventOverlay,
  ReviewModal,
  ScoringOverlay,
  StandingsOverlay,
  WaitOverlay,
  type SubmitState,
} from "./Overlays";

type OverlayKind = "standings" | "scoring" | "event" | "review" | null;

export function GameScreen({
  ctx,
  initialTab = "decide",
  deskOpen: deskStart = false,
  initialOverlay = null,
  onRoundStatusChange,
}: {
  ctx: GameContext;
  initialTab?: DeskTab;
  deskOpen?: boolean;
  initialOverlay?: OverlayKind;
  onRoundStatusChange?: (status: RoundPhase) => void;
}) {
  const onRoundStatusChangeRef = useRef(onRoundStatusChange);
  onRoundStatusChangeRef.current = onRoundStatusChange;
  const [hovered, setHovered] = useState<DistrictId | null>(null);
  const [selected, setSelected] = useState<DistrictId | null>(null);
  const [openCategory, setOpenCategory] = useState<Sector | null>(null);
  const [deskOpen, setDeskOpen] = useState(deskStart);
  const [deskTab, setDeskTab] = useState<DeskTab>(initialTab);
  const [overlay, setOverlay] = useState<OverlayKind>(initialOverlay);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle", message: null });
  const [serverNow, setServerNow] = useState(ctx.round?.serverNow ?? new Date().toISOString());
  const [sampledAt, setSampledAt] = useState(() => Date.now());
  const [roundStatus, setRoundStatus] = useState(ctx.round?.status ?? "none");
  const [tick, setTick] = useState(0);
  const savingRef = useRef(false);

  const [stagedStarts, setStagedStarts] = useState<string[]>(
    () => ctx.submission?.projectStarts ?? [],
  );
  const [allocations, setAllocations] = useState<Record<Sector, number>>(() =>
    fullAllocations(ctx.submission?.allocations ?? {}),
  );
  const [accepted, setAccepted] = useState<DecisionPayload>(() => ({
    allocations: fullAllocations(ctx.submission?.allocations ?? {}),
    projectStarts: ctx.submission?.projectStarts ?? [],
  }));

  const payload: DecisionPayload = useMemo(
    () => ({ allocations: fullAllocations(allocations), projectStarts: stagedStarts }),
    [allocations, stagedStarts],
  );
  const dirty = !decisionsEqual(payload, accepted);
  const check = budgetCheck(payload, ctx.budget.available);
  const remaining = remainingMs(ctx.round?.closesAt ?? null, serverNow, Date.now() + tick * 0, sampledAt);
  const expired = roundStatus === "open" && remaining != null && remaining <= 0;
  const planningAllowed = ctx.mode === "preview" || roundStatus === "open";
  const deadlinePassed =
    submit.status === "closed" ||
    expired ||
    (roundStatus === "open" && submit.status === "error" && /deadline|closed/i.test(submit.message ?? ""));
  const editLocked =
    !planningAllowed || deadlinePassed || roundStatus === "locked" || roundStatus === "processing";
  const canSubmit =
    ctx.mode === "live" &&
    roundStatus === "open" &&
    !!ctx.round?.id &&
    !!ctx.team &&
    !deadlinePassed;
  const serverAccepted =
    !dirty && (submit.status === "success" || Boolean(ctx.submission));
  const saveLabel = saveStatusLabel({
    saving: submit.status === "submitting",
    live: ctx.mode === "live",
    roundStatus,
    dirty,
    serverAccepted,
  });
  const holdNotice = silentHoldNotice({
    live: ctx.mode === "live",
    roundOpen: roundStatus === "open" && !deadlinePassed,
    serverAccepted,
  });

  const targets = useMemo<DistrictId[]>(
    () => (openCategory ? districtsForSector(openCategory) : []),
    [openCategory],
  );

  const persist = useCallback(async () => {
    if (!ctx.round?.id || !canSubmit || savingRef.current) return;
    if (check.projectsExceedAvailable) {
      setSubmit({
        status: "error",
        message: "Project costs exceed available credits. The server would reject the extra starts.",
      });
      return;
    }
    savingRef.current = true;
    setSubmit({ status: "submitting", message: null });
    const key = await idempotencyKeyFor(ctx.round.id, payload);
    try {
      const res = await fetch(`/api/rounds/${ctx.round.id}/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          allocations: payload.allocations,
          projectStarts: payload.projectStarts,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        status?: string;
        applied?: { projectStarts?: string[]; unspent?: number; allocations?: Record<string, number> };
      };
      if (
        data?.error === "closed" ||
        (res.status === 403 && /deadline|closed|not open/i.test(data?.message ?? data?.error ?? ""))
      ) {
        setSubmit({
          status: "closed",
          message: data?.message?.trim() || submissionClosedMessage(roundStatus),
        });
        return;
      }
      if (!res.ok || data?.ok === false) {
        setSubmit({
          status: "error",
          message: humanizeSubmitError(
            data?.message ||
              data?.error ||
              `Submission rejected (${res.status}). The last accepted server save is unchanged.`,
          ),
        });
        return;
      }
      const confirmedStarts = data.applied?.projectStarts ?? payload.projectStarts;
      const confirmedAlloc = data.applied?.allocations
        ? fullAllocations(data.applied.allocations)
        : payload.allocations;
      const confirmed: DecisionPayload = {
        allocations: confirmedAlloc,
        projectStarts: confirmedStarts,
      };
      setStagedStarts(confirmed.projectStarts);
      setAllocations(confirmed.allocations);
      setAccepted(confirmed);
      setSubmit({
        status: "success",
        message:
          data.status === "duplicate"
            ? "Already saved — this exact plan is on the server."
            : `Saved. ${confirmed.projectStarts.length} project${confirmed.projectStarts.length === 1 ? "" : "s"} started · ${Math.round(data.applied?.unspent ?? 0)} cr held in reserve.`,
      });
    } catch {
      setSubmit({
        status: "error",
        message: humanizeSubmitError("network"),
      });
    } finally {
      savingRef.current = false;
    }
  }, [canSubmit, check.projectsExceedAvailable, ctx.round?.id, payload, roundStatus]);

  useEffect(() => {
    if (!canSubmit || !dirty || check.projectsExceedAvailable) return;
    const timer = window.setTimeout(() => {
      void persist();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [canSubmit, dirty, check.projectsExceedAvailable, persist]);

  useEffect(() => {
    setRoundStatus(ctx.round?.status ?? "none");
    if (ctx.round?.serverNow) {
      setServerNow(ctx.round.serverNow);
      setSampledAt(Date.now());
    }
  }, [ctx.round?.status, ctx.round?.serverNow]);

  useEffect(() => {
    if (roundStatus !== "open") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [roundStatus]);

  useEffect(() => {
    if (ctx.mode !== "live") return;
    const previous = ctx.round?.status ?? "none";
    const poll = async () => {
      try {
        const res = await fetch("/api/play/clock", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          serverNow?: string;
          status?: RoundPhase;
        };
        if (data.serverNow) {
          setServerNow(data.serverNow);
          setSampledAt(Date.now());
        }
        if (data.status) {
          setRoundStatus(data.status);
          if (data.status !== previous) onRoundStatusChangeRef.current?.(data.status);
        }
      } catch {
        /* keep last good clock */
      }
    };
    const id = window.setInterval(poll, 5000);
    return () => window.clearInterval(id);
  }, [ctx.mode, ctx.round?.status]);

  function toggleStart(code: string) {
    setSubmit({ status: "idle", message: null });
    setStagedStarts((prev) => {
      if (prev.includes(code)) return prev.filter((item) => item !== code);
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
    for (const sector of SECTORS) {
      next[sector] = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover -= 1;
    }
    setAllocations(next);
  }

  function pickSector(sector: Sector) {
    setOpenCategory(sector);
    setDeskOpen(true);
    setDeskTab("catalogue");
  }

  const statusBanner = bannerFor(ctx, roundStatus, deadlinePassed);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0B0F0D] text-[#E7E3D6]">
      <GameHeader
        ctx={ctx}
        serverNow={serverNow}
        roundStatus={roundStatus}
        saveLabel={saveLabel}
        onOpenScoring={() => setOverlay("scoring")}
        onOpenEvent={() => setOverlay("event")}
        onOpenDesk={() => {
          setDeskOpen(true);
          setDeskTab("decide");
        }}
      />
      <EventStrip ctx={ctx} onOpenBriefing={() => setOverlay("event")} />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1 overflow-hidden">
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
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 border border-[#B89A60]/20 bg-black/40 px-3 py-1 text-[0.66rem] uppercase tracking-[0.14em] text-[#B8B2A0] backdrop-blur">
            {ctx.town.label}
          </div>
          {statusBanner ? (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border border-[#B89A60]/25 bg-black/50 px-4 py-2 text-center text-[0.76rem] text-[#D7CFB8] backdrop-blur">
              {statusBanner}
            </div>
          ) : null}
          {ctx.mode === "preview" ? (
            <div className="pointer-events-none absolute left-4 top-4 max-w-sm border border-[#D9B15A]/40 bg-black/55 px-3 py-2 text-[0.72rem] leading-5 text-[#E3DCC8] backdrop-blur">
              Unofficial preview. Official results publish when all 20 towns are processed. Nothing
              here is a live score.
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
          {roundStatus === "locked" || roundStatus === "processing" ? (
            <WaitOverlay
              title={roundStatus === "processing" ? "Processing 20 towns" : "Decisions locked"}
              body={
                ctx.notice ??
                "Decisions are locked. Official results publish when all 20 towns are processed."
              }
            />
          ) : null}
          {roundStatus === "void" ? (
            <WaitOverlay
              title="Round voided"
              body={ctx.notice ?? "This round was voided. Wait for the next round to open."}
            />
          ) : null}
        </div>
        {deskOpen ? (
          <CommandDesk
            ctx={ctx}
            tab={deskTab}
            onTab={setDeskTab}
            locked={editLocked}
            stagedStarts={stagedStarts}
            allocations={allocations}
            onToggleStart={toggleStart}
            onAllocate={allocate}
            onSpread={spreadEvenly}
            onClear={() => setAllocations(emptyAllocations())}
            onClose={() => setDeskOpen(false)}
            focusSector={openCategory}
          />
        ) : null}
      </main>

      <ActionBar
        ctx={ctx}
        locked={editLocked}
        canSubmit={canSubmit && !check.projectsExceedAvailable}
        saving={submit.status === "submitting"}
        saveLabel={saveLabel}
        dirty={dirty}
        serverAccepted={serverAccepted}
        submitMessage={submit.message}
        submitTone={
          submit.status === "error" || submit.status === "closed"
            ? submit.status
            : submit.status === "success"
              ? "success"
              : "idle"
        }
        holdNotice={holdNotice}
        openCategory={openCategory}
        onToggleCategory={(sector) => {
          setOpenCategory((cur) => (cur === sector ? null : sector));
          setDeskOpen(true);
          setDeskTab("catalogue");
        }}
        stagedStarts={stagedStarts}
        onToggleStart={toggleStart}
        allocations={allocations}
        onToggleBudget={() => {
          setDeskOpen(true);
          setDeskTab("decide");
        }}
        onSave={() => void persist()}
        onReview={() => {
          setSubmit((prev) => ({ ...prev, status: prev.status === "submitting" ? prev.status : "idle" }));
          setOverlay("review");
        }}
      />

      {overlay === "standings" && ctx.isOrganiser ? (
        <StandingsOverlay ctx={ctx} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "scoring" ? <ScoringOverlay ctx={ctx} onClose={() => setOverlay(null)} /> : null}
      {overlay === "event" ? <EventOverlay ctx={ctx} onClose={() => setOverlay(null)} /> : null}
      {overlay === "review" ? (
        <ReviewModal
          ctx={ctx}
          stagedStarts={stagedStarts}
          allocations={allocations}
          submit={submit}
          onConfirm={() => void persist()}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </div>
  );
}

function bannerFor(ctx: GameContext, status: string, deadlinePassed: boolean): string | null {
  if (deadlinePassed) return "Deadline passed. Waiting for results.";
  if (status === "open") return null;
  if (status === "scheduled") {
    return ctx.round?.opensAt
      ? `Round ${ctx.round.index} opens at ${new Date(ctx.round.opensAt).toLocaleString()}. Controls stay closed until then.`
      : (ctx.notice ?? "The next round has not opened yet.");
  }
  if (ctx.mode === "preview") return ctx.notice;
  return ctx.notice;
}
