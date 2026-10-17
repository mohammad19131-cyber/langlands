"use client";

import { useEffect, useState } from "react";
import type { GameContext } from "../../lib/game-types";
import { EVENT_LABELS } from "../../lib/format";

const EVENT_TONE: Record<string, string> = {
  HEATWAVE: "#C07A43",
  DROUGHT: "#C7A954",
  FLOOD: "#5B86A6",
  CONTAMINATION: "#C0533E",
};

function useCountdown(closesAt: string | null, status: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "open" || !closesAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [closesAt, status]);

  if (!closesAt || status !== "open") return null;
  const ms = new Date(closesAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  const clamped = Math.max(0, ms);
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return { label: `${m}:${s.toString().padStart(2, "0")}`, expired: ms <= 0 };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">{label}</span>
      <span className="mt-1 font-serif text-[0.95rem] tabular-nums" style={{ color: accent ?? "#EDE8D9" }}>
        {value}
      </span>
    </div>
  );
}

export function GameHeader({
  ctx,
  onOpenStandings,
  onOpenScoring,
  onOpenEvent,
}: {
  ctx: GameContext;
  onOpenStandings: () => void;
  onOpenScoring: () => void;
  onOpenEvent: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const i = ctx.town.indicators;
  const ecology = (i.air + i.water_q + i.soil + i.bio + (100 - i.pollution)) / 5;
  const welfare = (i.health + i.services + i.jobs) / 3;
  const countdown = useCountdown(ctx.round?.closesAt ?? null, ctx.round?.status ?? "none");
  const eventCode = ctx.round?.eventCode ?? null;
  const roundNo = ctx.round?.index ?? 1;
  const roundCount = ctx.competition?.roundCount ?? 6;

  const statusLabel =
    ctx.round?.status === "open"
      ? countdown
        ? countdown.expired
          ? "Closing"
          : countdown.label
        : "Open"
      : ctx.round?.status === "scheduled"
        ? "Opens soon"
        : ctx.round?.status === "locked" || ctx.round?.status === "processing"
          ? "Locked"
          : ctx.round?.status === "published"
            ? "Published"
            : "Planning";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-[#B89A60]/20 bg-[#0E1512]/95 px-4 backdrop-blur">
      {/* Brand + team */}
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center border border-[#B89A60]/50">
          <span className="h-3 w-3 bg-gradient-to-br from-[#B89A60] to-[#7A2E25]" />
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#E3DCC8]">
            Langlands R3
          </span>
          <span className="mt-0.5 text-[0.62rem] tracking-[0.1em] text-[#8A8674]">
            {ctx.team ? `${ctx.team.name} · Seat ${ctx.team.seat}` : "Ashfen command"}
          </span>
        </div>
      </div>

      {/* Round + timer + event */}
      <div className="ml-1 flex items-center gap-3 border-l border-[#B89A60]/15 pl-4">
        <div className="flex flex-col leading-none">
          <span className="text-[0.58rem] uppercase tracking-[0.14em] text-[#8A8674]">Round</span>
          <span className="mt-1 font-serif text-[0.95rem] tabular-nums text-[#EDE8D9]">
            {roundNo} <span className="text-[#8A8674]">/ {roundCount}</span>
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 border px-2 py-1 ${
            countdown && !countdown.expired
              ? "border-[#7BA157]/40 text-[#9FC27E]"
              : "border-[#B89A60]/25 text-[#C9C2AD]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              ctx.round?.status === "open" ? "bg-[#7BA157] animate-pulse" : "bg-[#8A8674]"
            }`}
          />
          <span className="font-mono text-[0.72rem] tabular-nums">{statusLabel}</span>
        </div>
        <button
          type="button"
          onClick={onOpenEvent}
          className="flex items-center gap-1.5 border px-2 py-1 text-[0.68rem] uppercase tracking-[0.1em] transition-colors hover:bg-white/5"
          style={{
            borderColor: eventCode ? `${EVENT_TONE[eventCode]}66` : "#B89A6033",
            color: eventCode ? EVENT_TONE[eventCode] : "#9FC27E",
          }}
        >
          {eventCode ? EVENT_LABELS[eventCode] ?? eventCode : "No shock"}
        </button>
      </div>

      {/* Metrics */}
      <div className="ml-auto flex items-center gap-5">
        <Stat label="Credits" value={`${Math.round(ctx.budget.available)}`} accent="#D9B15A" />
        <Stat label="Population" value={ctx.town.population.toLocaleString()} />
        <Stat label="Ecology" value={`${Math.round(ecology)}`} accent="#7BA157" />
        <Stat label="Welfare" value={`${Math.round(welfare)}`} accent="#9FC27E" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-l border-[#B89A60]/15 pl-3">
        <button
          type="button"
          onClick={onOpenScoring}
          className="border border-[#B89A60]/25 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em] text-[#C9C2AD] transition-colors hover:bg-white/5"
        >
          Scoring
        </button>
        <button
          type="button"
          onClick={onOpenStandings}
          className="border border-[#B89A60]/25 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.1em] text-[#C9C2AD] transition-colors hover:bg-white/5"
        >
          Standings
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="grid h-8 w-8 place-items-center border border-[#B89A60]/25 text-[0.72rem] font-semibold text-[#C9C2AD] transition-colors hover:bg-white/5"
          >
            {(ctx.email ?? "?").slice(0, 1).toUpperCase()}
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-10 w-60 border border-[#B89A60]/25 bg-[#111815] p-3 shadow-2xl"
            >
              <p className="truncate text-[0.72rem] text-[#C9C2AD]">{ctx.email ?? "Not signed in"}</p>
              {ctx.isOrganiser ? (
                <p className="mt-1 text-[0.62rem] uppercase tracking-[0.12em] text-[#D9B15A]">
                  Organiser
                </p>
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
