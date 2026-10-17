"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ENGINE_VERSION } from "@langlands/sim/public";
import { clockLabel, formatClockTime, remainingMs } from "../../lib/clock";
import { EVENT_LABELS } from "../../lib/format";
import {
  buildSeatsForRound,
  canVoid,
  currentRoomRound,
  missingCount,
  nextRoomAction,
  publicationReady,
  recoveryGuidance,
  type RoomAction,
  type RoomRound,
} from "../../lib/room-ops";
import type { RoomContext } from "../../lib/server/room-context";
import { SeatGrid } from "./SeatGrid";

type LiveRoom = Extract<RoomContext, { ok: true }>;

const ACTION_COPY: Record<Exclude<RoomAction, "none">, { title: string; body: string }> = {
  open: {
    title: "Open this round?",
    body: "Teams will be able to submit until the server closing time. The browser clock is not authoritative.",
  },
  lock: {
    title: "Lock this round?",
    body: "The lock manifest of all 20 seats is captured now. Teams without an accepted save receive the default hold. This cannot be quietly undone after process writes town states.",
  },
  process: {
    title: "Process 20 towns?",
    body: "The frozen engine runs twice. A checksum mismatch stays locked and is not published. A second process after a successful run is a no-op.",
  },
  publish: {
    title: "Publish official results?",
    body: "Publication requires the stored 20/20 checksum to match a replay. A published round cannot be reopened.",
  },
  void: {
    title: "Void this unpublished round?",
    body: "Void is for a broken unpublished round. Published rows are never patched. This is irreversible for this round.",
  },
};

export function ControlRoom({ initial }: { initial: LiveRoom }) {
  const router = useRouter();
  const [room, setRoom] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.currentRoundId ?? initial.rounds[0]?.id ?? null);
  const [confirm, setConfirm] = useState<Exclude<RoomAction, "none"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const selected = room.rounds.find((row) => row.id === selectedId) ?? currentRoomRound(room.rounds);
  const seats = buildSeatsForRound({
    teams: room.teams,
    round: selected,
    submissions: room.submissions,
    manifest: selected?.manifest ?? [],
  });
  const action = nextRoomAction({
    round: selected,
    rounds: room.rounds,
    competitionPaused: room.competition.paused,
    lastRun: selected?.lastRun ?? null,
  });
  const remaining = remainingMs(selected?.closesAt ?? null, room.serverNow, Date.now() + tick * 0);
  const missing = missingCount(seats);
  const canPublish = publicationReady(selected, selected?.lastRun ?? null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/room", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveRoom & { ok?: boolean };
        if (data?.ok) setRoom(data);
      } catch {
        /* keep last snapshot */
      }
    };
    const id = window.setInterval(poll, 5000);
    return () => window.clearInterval(id);
  }, []);

  const clock = selected
    ? clockLabel({
        status: selected.status,
        opensAt: selected.opensAt,
        remainingMs: remaining,
      })
    : "—";

  async function run(next: Exclude<RoomAction, "none">) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rounds/${selected.id}/${next}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        checksum?: string;
        noop?: boolean;
        error?: string;
        message?: string;
        lock_manifest?: unknown;
      };
      if (!res.ok || data?.ok === false) {
        const detail = data.message || data.error || `Request failed (${res.status})`;
        setError(detail);
        return;
      }
      const extra =
        data.noop
          ? " Already completed — this was a no-op."
          : data.checksum
            ? ` Checksum ${data.checksum.slice(0, 12)}…`
            : "";
      setMessage(`${next} → ${data.status ?? "ok"}.${extra}`);
      setConfirm(null);
      router.refresh();
      const snap = await fetch("/api/room", { cache: "no-store" });
      if (snap.ok) {
        const body = (await snap.json()) as LiveRoom;
        if (body.ok) setRoom(body);
      }
    } catch {
      setError("Network error reaching the round machine. The last known server state is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  const confirmBody = useMemo(() => {
    if (!confirm || !selected) return "";
    const base = ACTION_COPY[confirm].body;
    if (confirm === "open") {
      return `${base} Server window: ${selected.opensAt ? formatClockTime(selected.opensAt) : "—"} → ${
        selected.closesAt ? formatClockTime(selected.closesAt) : "—"
      }.`;
    }
    if (confirm === "lock") {
      return `${base} ${missing} seated team${missing === 1 ? "" : "s"} currently have no accepted save.`;
    }
    if (confirm === "publish") {
      return `${base} Stored checksum ${selected.processChecksum ?? "—"}.`;
    }
    return base;
  }, [confirm, missing, selected]);

  return (
    <div className="min-h-screen bg-[#0B0F0D] text-[#E7E3D6]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#B89A60]/20 bg-[#0E1512]/95 px-4 py-3">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#E3DCC8]">
            Control room
          </p>
          <p className="mt-0.5 text-[0.7rem] text-[#8A8674]">{room.competition.title}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[0.66rem] uppercase tracking-[0.1em] text-[#8A8674]">
          <span className="border border-[#B89A60]/25 px-2 py-1">
            Engine {room.competition.engineVersion || ENGINE_VERSION}
          </span>
          <span className="border border-[#B89A60]/25 px-2 py-1">
            Catalogue {room.competition.catalogueHash.slice(0, 12) || "—"}
          </span>
          <a href="/play" className="border border-[#B89A60]/25 px-2 py-1 text-[#C9C2AD] hover:bg-white/5">
            Play
          </a>
          <a href="/board" className="border border-[#B89A60]/25 px-2 py-1 text-[#C9C2AD] hover:bg-white/5">
            Board
          </a>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="border border-[#B89A60]/25 px-2 py-1 text-[#C9C2AD] hover:bg-white/5">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-2">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">Six rounds</p>
          {room.rounds.map((row) => (
            <RoundButton
              key={row.id}
              round={row}
              active={row.id === selected?.id}
              onSelect={() => setSelectedId(row.id)}
            />
          ))}
          {room.rounds.length === 0 ? (
            <p className="text-[0.8rem] leading-6 text-[#A9A491]">
              No rounds have been scheduled yet. The control room stays empty until the seed exists.
            </p>
          ) : null}
        </aside>

        <section className="space-y-5">
          {selected ? (
            <div className="border border-[#B89A60]/20 bg-[#0F1613] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">
                    Round {selected.index}
                    {selected.eventCode ? ` · ${EVENT_LABELS[selected.eventCode] ?? selected.eventCode}` : " · no shock"}
                  </p>
                  <h1 className="mt-1 font-serif text-2xl text-[#EDE8D9]">{labelStatus(selected.status)}</h1>
                  <p className="mt-2 text-[0.78rem] text-[#C9C2AD]">
                    Opens {selected.opensAt ? formatClockTime(selected.opensAt) : "—"} · Closes{" "}
                    {selected.closesAt ? formatClockTime(selected.closesAt) : "—"} · {clock}
                  </p>
                </div>
                <p className="text-[0.72rem] uppercase tracking-[0.12em] text-[#D9B15A]">
                  Next: {action === "none" ? "stand by" : action}
                </p>
              </div>
              {selected.status === "open" ? (
                <p className="mt-3 text-[0.78rem] text-[#C9C2AD]">
                  {missing} of {seats.length} seated teams have no accepted save.
                </p>
              ) : null}
              {room.competition.paused ? (
                <p className="mt-3 text-[0.78rem] text-[#C7A954]">Competition paused. Opening is blocked.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-[0.84rem] leading-6 text-[#A9A491]">No round is available to operate.</p>
          )}

          <SeatGrid
            seats={seats}
            roundId={selected?.id ?? null}
            roundStatus={selected?.status ?? "none"}
          />

          {selected?.manifest.length ? (
            <div className="border border-[#B89A60]/15 p-4">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">Lock manifest</p>
              <p className="mt-1 text-[0.74rem] text-[#C9C2AD]">
                {selected.manifest.filter((row) => row.held && !row.disqualified).length} holds ·{" "}
                {selected.manifest.filter((row) => !row.held).length} accepted captures · allocations are not
                shown here
              </p>
            </div>
          ) : null}

          {selected?.lastRun ? (
            <div className="border border-[#B89A60]/15 p-4 text-[0.78rem] text-[#C9C2AD]">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">Last process run</p>
              <p className="mt-2">
                Attempt {selected.lastRun.attempt} · {selected.lastRun.ok ? "ok" : "failed"} · checksum{" "}
                {selected.lastRun.checksum ?? "—"}
              </p>
              {selected.lastRun.engineVersion ? <p className="mt-1">Engine {selected.lastRun.engineVersion}</p> : null}
              {selected.lastRun.error ? (
                <p className="mt-2 text-[#C0533E]">{selected.lastRun.error}</p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="border border-[#C0533E]/40 bg-[#C0533E]/10 px-4 py-3 text-[0.8rem] leading-6 text-[#E7D4CE]">
              <p>{error}</p>
              <p className="mt-2 text-[#C9C2AD]">{recoveryGuidance(error)}</p>
            </div>
          ) : null}
          {message ? <p className="text-[0.8rem] text-[#9FC27E]">{message}</p> : null}

          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Open"
              disabled={!selected || action !== "open" || busy}
              onClick={() => setConfirm("open")}
            />
            <ActionButton
              label="Lock"
              disabled={!selected || action !== "lock" || busy}
              onClick={() => setConfirm("lock")}
            />
            <ActionButton
              label={busy && confirm === "process" ? "Processing…" : "Process"}
              disabled={!selected || action !== "process" || busy}
              onClick={() => setConfirm("process")}
            />
            <ActionButton
              label="Publish"
              disabled={!selected || action !== "publish" || !canPublish || busy}
              accent
              onClick={() => setConfirm("publish")}
            />
            <ActionButton
              label="Void"
              disabled={!selected || !canVoid(selected.status) || busy}
              onClick={() => setConfirm("void")}
            />
          </div>
          <p className="text-[0.68rem] leading-5 text-[#8A8674]">
            Every button calls the existing round APIs. Role checks run on the server. Published rounds
            cannot be reopened.
          </p>
        </section>
      </main>

      {confirm && selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setConfirm(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ACTION_COPY[confirm].title}
            className="relative w-full max-w-md border border-[#B89A60]/30 bg-[#0F1613] p-5"
          >
            <h2 className="font-serif text-xl text-[#EDE8D9]">{ACTION_COPY[confirm].title}</h2>
            <p className="mt-3 text-[0.84rem] leading-6 text-[#C9C2AD]">{confirmBody}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="flex-1 border border-white/10 px-3 py-2 text-[0.76rem] text-[#C9C2AD] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(confirm)}
                className="flex-1 border border-[#7BA157]/60 bg-[#2A4C39] px-3 py-2 text-[0.76rem] uppercase tracking-[0.08em] text-[#E7F0DE] hover:bg-[#335c44] disabled:opacity-50"
              >
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoundButton({
  round,
  active,
  onSelect,
}: {
  round: RoomRound;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full border px-3 py-2 text-left ${
        active ? "border-[#D9B15A] bg-[#D9B15A]/10" : "border-white/10 hover:bg-white/5"
      }`}
    >
      <span className="text-[0.72rem] uppercase tracking-[0.12em] text-[#E3DCC8]">Round {round.index}</span>
      <span className="mt-1 block text-[0.66rem] text-[#8A8674]">{labelStatus(round.status)}</span>
    </button>
  );
}

function ActionButton({
  label,
  disabled,
  onClick,
  accent,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border px-4 py-2 text-[0.74rem] uppercase tracking-[0.08em] ${
        accent
          ? "border-[#7BA157]/60 bg-[#2A4C39] text-[#E7F0DE] hover:bg-[#335c44]"
          : "border-[#B89A60]/40 text-[#D7CFB8] hover:bg-white/5"
      } disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-[#5F5B4D]`}
    >
      {label}
    </button>
  );
}

function labelStatus(status: string): string {
  if (status === "processing") return "Processing 20 towns";
  if (status === "scheduled") return "Scheduled";
  if (status === "open") return "Open";
  if (status === "locked") return "Locked";
  if (status === "published") return "Published";
  if (status === "void") return "Void";
  return status;
}
