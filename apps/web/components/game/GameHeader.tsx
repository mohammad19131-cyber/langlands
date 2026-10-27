"use client";

import { useEffect, useState } from "react";
import { clockLabel, formatCountdown, remainingMs } from "../../lib/clock";
import type { GameContext } from "../../lib/game-types";

function useServerCountdown(closesAt: string | null, serverNow: string | null, status: string) {
  const [now, setNow] = useState(() => Date.now());
  const [sampledAt, setSampledAt] = useState(() => Date.now());
  useEffect(() => {
    const t = Date.now();
    setSampledAt(t);
    setNow(t);
  }, [serverNow]);
  useEffect(() => {
    if (status !== "open" || !closesAt || !serverNow) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [closesAt, serverNow, status]);
  if (status !== "open" || !serverNow) return null;
  return remainingMs(closesAt, serverNow, now, sampledAt);
}

function teamLine(ctx: GameContext): string {
  if (ctx.isOrganiser && !ctx.team) return "Organiser";
  if (!ctx.team) return ctx.mode === "preview" ? "Unofficial preview" : "Not seated";
  const id = ctx.team.loginId ? `Team ${ctx.team.loginId}` : ctx.team.name;
  return `${id} · Seat ${String(ctx.team.seat).padStart(2, "0")}`;
}

function roundWord(status: string, expired: boolean): string {
  if (status === "open") return expired ? "Deadline passed" : "Open";
  if (status === "scheduled") return "Scheduled";
  if (status === "locked" || status === "processing") return "Locked";
  if (status === "published") return "Published";
  if (status === "void") return "Void";
  return "Planning";
}

export function GameHeader({
  ctx,
  serverNow,
  roundStatus,
  saveLabel,
  onOpenStandings,
  onOpenScoring,
  onOpenEvent,
  onOpenDesk,
}: {
  ctx: GameContext;
  serverNow: string;
  roundStatus: string;
  saveLabel: string;
  onOpenStandings: () => void;
  onOpenScoring: () => void;
  onOpenEvent: () => void;
  onOpenDesk: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const remaining = useServerCountdown(ctx.round?.closesAt ?? null, serverNow, roundStatus);
  const roundNo = ctx.round?.index ?? 1;
  const roundCount = ctx.competition?.roundCount ?? 6;
  const statusLabel = clockLabel({
    status: roundStatus,
    opensAt: ctx.round?.opensAt ?? null,
    remainingMs: remaining,
  });
  const expired = roundStatus === "open" && remaining != null && remaining <= 0;
  const openLive = roundStatus === "open" && !expired;

  return (
    <header className="relative z-30 flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#B89A60]/20 bg-[#0E1512]/95 px-3 py-2 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center border border-[#B89A60]/50">
          <span className="h-3 w-3 bg-gradient-to-br from-[#B89A60] to-[#7A2E25]" />
        </span>
        <div className="flex min-w-0 flex-col leading-none">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#E3DCC8]">
            Langlands R3
          </span>
          <span className="mt-0.5 truncate text-[0.68rem] text-[#C9C2AD]">{teamLine(ctx)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:border-l sm:border-[#B89A60]/15 sm:pl-4">
        <div className="flex flex-col leading-none">
          <span className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Round</span>
          <span className="mt-1 font-serif text-[0.95rem] tabular-nums text-[#EDE8D9]">
            {roundNo} <span className="text-[#8A8674]">/ {roundCount}</span>
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 border px-2 py-1 ${
            openLive
              ? "border-[#7BA157]/40 text-[#9FC27E]"
              : expired
                ? "border-[#C0533E]/40 text-[#C0533E]"
                : "border-[#B89A60]/25 text-[#C9C2AD]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${openLive ? "bg-[#7BA157]" : "bg-[#8A8674]"}`}
            aria-hidden
          />
          <span className="text-[0.68rem] uppercase tracking-[0.08em]">{roundWord(roundStatus, expired)}</span>
          {openLive && remaining != null ? (
            <span className="font-mono text-[0.72rem] tabular-nums text-[#EDE8D9]">
              {formatCountdown(remaining)} left
            </span>
          ) : roundStatus !== "open" ? (
            <span className="font-mono text-[0.72rem] tabular-nums">{statusLabel}</span>
          ) : null}
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Available</span>
          <span className="mt-1 font-serif text-[0.95rem] tabular-nums text-[#D9B15A]">
            {Math.round(ctx.budget.available)} cr
          </span>
        </div>
        <div className="hidden flex-col leading-none lg:flex">
          <span className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Reserve</span>
          <span className="mt-1 font-serif text-[0.95rem] tabular-nums text-[#EDE8D9]">
            {Math.round(ctx.budget.reserve)}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <p className="hidden max-w-[11rem] truncate text-[0.62rem] uppercase tracking-[0.08em] text-[#C9C2AD] sm:block">
          {saveLabel}
        </p>
        <button
          type="button"
          onClick={onOpenEvent}
          className="hidden border border-[#B89A60]/25 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em] text-[#C9C2AD] transition-colors hover:bg-white/5 md:inline"
        >
          Event
        </button>
        <button
          type="button"
          onClick={onOpenDesk}
          className="border border-[#D9B15A]/50 bg-[#D9B15A]/10 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em] text-[#F2ECDC] transition-colors hover:bg-[#D9B15A]/16"
        >
          Desk
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More pages"
            className="grid h-8 w-8 place-items-center border border-[#B89A60]/25 text-[0.9rem] leading-none text-[#C9C2AD] transition-colors hover:bg-white/5"
          >
            <span aria-hidden>···</span>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-10 z-40 w-60 border border-[#B89A60]/25 bg-[#111815] p-3 shadow-2xl"
            >
              <p className="truncate text-[0.72rem] text-[#C9C2AD]">{teamLine(ctx)}</p>
              <p className="mt-1 text-[0.62rem] uppercase tracking-[0.1em] text-[#8A8674]">{saveLabel}</p>
              <div className="mt-3 grid gap-1.5">
                <a
                  href="/play/results"
                  className="block border border-[#B89A60]/30 px-3 py-1.5 text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Results
                </a>
                <a
                  href="/board"
                  className="block border border-[#B89A60]/30 px-3 py-1.5 text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Board
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenScoring();
                  }}
                  className="border border-[#B89A60]/30 px-3 py-1.5 text-left text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Scoring
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStandings();
                  }}
                  className="border border-[#B89A60]/30 px-3 py-1.5 text-left text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Standings
                </button>
              </div>
              {ctx.isOrganiser ? (
                <a
                  href="/room"
                  className="mt-3 block border border-[#B89A60]/30 px-3 py-1.5 text-center text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Control room
                </a>
              ) : null}
              {ctx.signedIn ? (
                <form action="/auth/sign-out" method="post" className="mt-3">
                  <button
                    type="submit"
                    className="w-full border border-[#B89A60]/30 px-3 py-1.5 text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </form>
              ) : (
                <a
                  href="/sign-in"
                  className="mt-3 block border border-[#B89A60]/30 px-3 py-1.5 text-center text-[0.72rem] text-[#E3DCC8] transition-colors hover:bg-white/5"
                >
                  Sign in
                </a>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
