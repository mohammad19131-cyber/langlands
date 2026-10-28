"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clockLabel, formatClockTime, remainingMs } from "../../lib/clock";
import { EVENT_LABELS } from "../../lib/format";
import {
  buildSeatsForRound,
  canExtend,
  canReopen,
  canRestore,
  canVoid,
  currentRoomRound,
  holdCount,
  missingCount,
  nextRoomAction,
  openTargetRound,
  publicationReady,
  recoveryGuidance,
  runnerMode,
  savedCount,
  type RoomAction,
  type RoomRound,
} from "../../lib/room-ops";
import type { RoomContext } from "../../lib/server/room-context";
import { RESET_PLAY_CONFIRM } from "../../lib/admin-ops";
import { SeatGrid } from "./SeatGrid";
import { TeamRoster } from "./TeamRoster";

type LiveRoom = Extract<RoomContext, { ok: true }>;

const ACTION_COPY: Record<Exclude<RoomAction, "none">, { title: string; body: string }> = {
  open: {
    title: "Open this round?",
    body: "Teams get 18 minutes on the server clock to save their plans. The time on this screen is only a display.",
  },
  lock: {
    title: "Close submissions now?",
    body: "Every team’s last saved plan is frozen. Teams with nothing saved keep all credits in reserve and start no projects. After scoring starts, this cannot be quietly undone.",
  },
  process: {
    title: "Score this round?",
    body: "The same engine scores all 20 towns twice. If the two runs disagree, results stay unpublished. A second click after a successful score does nothing.",
  },
  publish: {
    title: "Publish official results?",
    body: "Players and the public board see these scores. A published round cannot be reopened or rewritten.",
  },
  void: {
    title: "Abandon this unpublished round?",
    body: "Use only if this round must be thrown out. Published scores are never changed. Restore it before opening the next year.",
  },
  restore: {
    title: "Restore this abandoned round?",
    body: "It returns to waiting. Opening starts a new 18-minute window. This does not skip a year or change published scores.",
  },
  reopen: {
    title: "Let teams save again?",
    body: "Only before scoring has written towns. The original closing time stays unless you add time first.",
  },
  extend: {
    title: "Add five minutes?",
    body: "Moves the server closing time five minutes later. Use this if delegates still need time.",
  },
};

export function ControlRoom({ initial }: { initial: LiveRoom }) {
  const router = useRouter();
  const [room, setRoom] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.currentRoundId ?? initial.rounds[0]?.id ?? null);
  const [confirm, setConfirm] = useState<Exclude<RoomAction, "none"> | "reset" | null>(null);
  const [resetPhrase, setResetPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [sampledAt, setSampledAt] = useState(() => Date.now());

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
  const remaining = remainingMs(selected?.closesAt ?? null, room.serverNow, Date.now() + tick * 0, sampledAt);
  const missing = missingCount(seats);
  const saved = savedCount(seats);
  const holds = holdCount(seats);
  const canPublish = publicationReady(selected, selected?.lastRun ?? null);
  const mode = runnerMode(room.competition.status);
  const openTarget = openTargetRound({ selected, rounds: room.rounds });

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSampledAt(Date.now());
  }, [room.serverNow]);

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

  useEffect(() => {
    if (mode !== "automatic") return;
    const tickAuto = async () => {
      try {
        const tickRes = await fetch("/api/event/tick", { method: "POST" });
        const tickBody = (await tickRes.json().catch(() => ({}))) as {
          ok?: boolean;
          plan?: { step?: string; reason?: string };
          error?: string;
        };
        if (tickBody.plan?.step === "blocked" || tickBody.ok === false) {
          setError(tickBody.plan?.reason || tickBody.error || "Automatic progress stopped.");
        }
        const snap = await fetch("/api/room", { cache: "no-store" });
        if (snap.ok) {
          const body = (await snap.json()) as LiveRoom;
          if (body.ok) setRoom(body);
        }
      } catch {
        /* keep last snapshot */
      }
    };
    const id = window.setInterval(tickAuto, 20_000);
    return () => window.clearInterval(id);
  }, [mode]);

  const clock = selected
    ? clockLabel({
        status: selected.status,
        opensAt: selected.opensAt,
        remainingMs: remaining,
      })
    : "—";

  async function run(next: Exclude<RoomAction, "none">) {
    if (!selected) return;
    const targetId = next === "open" ? (openTarget?.id ?? selected.id) : selected.id;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        next === "extend" ? `/api/rounds/${targetId}/window` : `/api/rounds/${targetId}/${next}`,
        {
          method: "POST",
          headers: next === "extend" ? { "Content-Type": "application/json" } : undefined,
          body: next === "extend" ? JSON.stringify({ extendMinutes: 5 }) : undefined,
        },
      );
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

  async function startEvent() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/event/start", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message || data.error || `Start failed (${res.status})`);
        return;
      }
      setMessage("Event started. Round 1 is open for 18 minutes.");
      router.refresh();
      const snap = await fetch("/api/room", { cache: "no-store" });
      if (snap.ok) {
        const body = (await snap.json()) as LiveRoom;
        if (body.ok) setRoom(body);
      }
    } catch {
      setError("Could not start the event. The last known server state is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPlay() {
    if (resetPhrase.trim() !== RESET_PLAY_CONFIRM) {
      setError(`Type ${RESET_PLAY_CONFIRM} to confirm the reset.`);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: resetPhrase.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message || data.error || `Reset failed (${res.status})`);
        return;
      }
      setMessage("Play data cleared. Teams and members were kept. Starting credits are 220.");
      setConfirm(null);
      setResetPhrase("");
      router.refresh();
      const snap = await fetch("/api/room", { cache: "no-store" });
      if (snap.ok) {
        const body = (await snap.json()) as LiveRoom;
        if (body.ok) setRoom(body);
      }
    } catch {
      setError("Could not reset play data. The last known server state is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function pauseEvent(resume: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/event/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message || data.error || `Update failed (${res.status})`);
        return;
      }
      setMessage(resume ? "Automatic progress resumed." : "Automatic progress paused. Manual steps still work.");
      const snap = await fetch("/api/room", { cache: "no-store" });
      if (snap.ok) {
        const body = (await snap.json()) as LiveRoom;
        if (body.ok) setRoom(body);
      }
    } catch {
      setError("Could not update automatic progress.");
    } finally {
      setBusy(false);
    }
  }

  const confirmBody = useMemo(() => {
    if (!confirm || confirm === "reset" || !selected) return "";
    const base = ACTION_COPY[confirm].body;
    if (confirm === "open") {
      return `${base} Opening starts a fresh 18-minute clock from now.`;
    }
    if (confirm === "lock") {
      return `${base} ${missing} seated team${missing === 1 ? "" : "s"} currently have no accepted save.`;
    }
    if (confirm === "publish") {
      return `${base} Scoring already succeeded for this round.`;
    }
    return base;
  }, [confirm, missing, selected]);

  return (
    <div className="min-h-screen bg-[#0B0F0D] text-[#E7E3D6]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#B89A60]/20 bg-[#0E1512]/95 px-4 py-3">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#E3DCC8]">
            {room.competition.title}
          </p>
          <p className="mt-0.5 text-[0.7rem] text-[#8A8674]">
            {mode === "automatic"
              ? "Automatic — rounds advance after each deadline"
              : mode === "paused"
                ? "Paused — automatic progress is stopped"
                : mode === "complete"
                  ? "Finished — official results are on the board"
                  : "Manual — you run each step"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[0.66rem] uppercase tracking-[0.1em] text-[#8A8674]">
          <a href="/board" className="border border-[#B89A60]/25 px-2 py-1 text-[#C9C2AD] hover:bg-white/5">
            Leaderboard
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
                  Next: {primaryLabel(action, selected)}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[0.78rem] sm:grid-cols-4">
                <Stat label="Teams seated" value={String(seats.length)} />
                <Stat label="Plans saved" value={String(saved)} />
                <Stat label="Not yet saved" value={String(missing)} />
                <Stat label="Official holds" value={String(holds)} />
              </dl>
              <p className="mt-3 text-[0.78rem] leading-6 text-[#C9C2AD]">{operatorHint(selected, action, missing, mode)}</p>
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

          <TeamRoster
            teams={room.teams}
            busy={busy}
            onSaved={(text) => {
              setError(null);
              setMessage(text);
              void fetch("/api/room", { cache: "no-store" })
                .then((res) => res.json())
                .then((body: LiveRoom) => {
                  if (body.ok) setRoom(body);
                })
                .catch(() => undefined);
            }}
            onError={(text) => {
              setMessage(null);
              setError(text);
            }}
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
                Attempt {selected.lastRun.attempt} · {selected.lastRun.ok ? "succeeded" : "failed"}
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
            {mode !== "automatic" && mode !== "complete" ? (
              <ActionButton
                label="Start automatic event"
                disabled={busy || room.competition.paused}
                accent
                onClick={() => void startEvent()}
              />
            ) : null}
            {mode === "automatic" ? (
              <ActionButton label="Pause automatic" disabled={busy} onClick={() => void pauseEvent(false)} />
            ) : null}
            {mode === "paused" ? (
              <ActionButton label="Resume automatic" disabled={busy} accent onClick={() => void pauseEvent(true)} />
            ) : null}
            <ActionButton
              label={primaryLabel(action, selected)}
              disabled={!selected || action === "none" || (action === "publish" && !canPublish) || busy}
              accent={action === "publish" || action === "open"}
              onClick={() => action !== "none" && setConfirm(action)}
            />
            <ActionButton
              label="Add 5 minutes"
              disabled={!selected || !canExtend(selected.status) || busy}
              onClick={() => setConfirm("extend")}
            />
          </div>
          <details className="border border-white/10 px-3 py-2">
            <summary className="cursor-pointer text-[0.72rem] uppercase tracking-[0.08em] text-[#8A8674]">
              Recovery only
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                label="Let teams save again"
                disabled={!selected || !canReopen(selected) || busy}
                onClick={() => setConfirm("reopen")}
              />
              <ActionButton
                label="Abandon round"
                danger
                disabled={!selected || !canVoid(selected.status) || busy}
                onClick={() => setConfirm("void")}
              />
              <ActionButton
                label="Restore abandoned round"
                disabled={!selected || !canRestore(selected.status) || busy}
                onClick={() => setConfirm("restore")}
              />
              <ActionButton
                label="Reset play data"
                danger
                disabled={busy}
                onClick={() => {
                  setResetPhrase("");
                  setConfirm("reset");
                }}
              />
            </div>
          </details>
          <p className="text-[0.68rem] leading-5 text-[#8A8674]">
            Automatic mode still needs a server ping each minute (Vercel Cron with a secret, or this
            page left open). If a step fails, automatic progress stops. Do not void or restore during
            a healthy live round.
          </p>
        </section>
      </main>

      {confirm === "reset" ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setConfirm(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Reset play data"
            className="relative w-full max-w-md border border-[#B89A60]/30 bg-[#0F1613] p-5"
          >
            <h2 className="font-serif text-xl text-[#EDE8D9]">Reset all play data?</h2>
            <p className="mt-3 text-[0.84rem] leading-6 text-[#C9C2AD]">
              This deletes submissions, town states, published results, process runs, and lock
              captures. Teams, members, logins, and the catalogue stay. Rounds return to scheduled
              with starting credits. Type {RESET_PLAY_CONFIRM} to continue.
            </p>
            <input
              value={resetPhrase}
              onChange={(event) => setResetPhrase(event.target.value)}
              className="mt-4 w-full border border-white/10 bg-[#0B0F0D] px-3 py-2 text-[0.84rem] text-[#E3DCC8]"
              placeholder={RESET_PLAY_CONFIRM}
              autoComplete="off"
            />
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
                disabled={busy || resetPhrase.trim() !== RESET_PLAY_CONFIRM}
                onClick={() => void resetPlay()}
                className="flex-1 border border-[#C0533E]/70 bg-[#5A241C] px-3 py-2 text-[0.76rem] uppercase tracking-[0.08em] text-[#F0D8D3] hover:bg-[#6B2C22] disabled:opacity-50"
              >
                {busy ? "Working…" : "Reset play"}
              </button>
            </div>
          </div>
        </div>
      ) : confirm && selected ? (
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
                className={`flex-1 border px-3 py-2 text-[0.76rem] uppercase tracking-[0.08em] disabled:opacity-50 ${
                  confirm === "void"
                    ? "border-[#C0533E]/70 bg-[#5A241C] text-[#F0D8D3] hover:bg-[#6B2C22]"
                    : "border-[#7BA157]/60 bg-[#2A4C39] text-[#E7F0DE] hover:bg-[#335c44]"
                }`}
              >
                {busy ? "Working…" : confirm === "void" ? "Void round" : "Confirm"}
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
  danger,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border px-4 py-2 text-[0.74rem] uppercase tracking-[0.08em] ${
        danger
          ? "border-[#C0533E]/50 text-[#E7B9B0] hover:bg-[#C0533E]/10"
          : accent
            ? "border-[#7BA157]/60 bg-[#2A4C39] text-[#E7F0DE] hover:bg-[#335c44]"
            : "border-[#B89A60]/40 text-[#D7CFB8] hover:bg-white/5"
      } disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-[#5F5B4D]`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 px-3 py-2">
      <dt className="text-[0.58rem] uppercase tracking-[0.12em] text-[#8A8674]">{label}</dt>
      <dd className="mt-1 font-serif text-xl tabular-nums text-[#EDE8D9]">{value}</dd>
    </div>
  );
}

function primaryLabel(action: RoomAction, round: RoomRound | null): string {
  if (action === "open" && round?.status === "published") return "Open next round";
  if (action === "open" && round?.index === 1) return "Open round 1";
  if (action === "open") return "Open this round";
  if (action === "lock") return "Close submissions";
  if (action === "process") return "Score this round";
  if (action === "publish") return "Publish results";
  if (action === "none") return "Waiting";
  return action;
}

function operatorHint(round: RoomRound, action: RoomAction, missing: number, mode: string): string {
  if (round.status === "open") {
    return `${missing} team${missing === 1 ? "" : "s"} have not saved. When time is up, close submissions — unsaved teams keep a hold. ${mode === "automatic" ? "Automatic mode will close at the deadline." : "You must close submissions yourself unless you start automatic mode."}`;
  }
  if (round.status === "locked") {
    return "Plans are frozen. Score this round next. Nothing is official until you publish.";
  }
  if (round.status === "processing") {
    return action === "publish"
      ? "Scoring succeeded. Publish to show official results and unlock the next round."
      : "Scoring is incomplete. Score again. Do not publish until this succeeds.";
  }
  if (round.status === "published") {
    return action === "open"
      ? "This round is official. Open the next round when the hall is ready."
      : "All published rounds are on the leaderboard.";
  }
  if (round.status === "scheduled") {
    return action === "open"
      ? "This round is waiting. Opening starts the 18-minute clock."
      : "The previous round must be published before this one can open.";
  }
  if (round.status === "void") {
    return "This round was abandoned. Restore it before continuing the same year.";
  }
  return "Refresh if this does not match what you just did.";
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
