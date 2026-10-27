"use client";

import { EVENT_SCHEDULE } from "../../lib/ashfen";
import { EVENT_LABELS } from "../../lib/format";
import type { GameContext } from "../../lib/game-types";

const EVENT_TONE: Record<string, string> = {
  HEATWAVE: "#C07A43",
  DROUGHT: "#C7A954",
  FLOOD: "#5B86A6",
  CONTAMINATION: "#C0533E",
};

export function EventStrip({
  ctx,
  onOpenBriefing,
}: {
  ctx: GameContext;
  onOpenBriefing: () => void;
}) {
  const round = ctx.round?.index ?? 1;
  const brief = EVENT_SCHEDULE.find((item) => item.round === round) ?? EVENT_SCHEDULE[0];
  const code = ctx.round?.eventCode ?? brief.code;
  const tone = code ? EVENT_TONE[code] : "#7BA157";

  return (
    <button
      type="button"
      onClick={onOpenBriefing}
      className="relative z-20 flex w-full items-center gap-4 border-b border-[#B89A60]/20 bg-[#0E1512]/90 px-4 py-2 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span
        className="shrink-0 border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.14em]"
        style={{ borderColor: `${tone}66`, color: tone }}
      >
        {code ? EVENT_LABELS[code] ?? code : brief.name}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.78rem] text-[#D7CFB8]">{brief.tagline}</span>
      <span className="shrink-0 text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
        This round
      </span>
    </button>
  );
}
