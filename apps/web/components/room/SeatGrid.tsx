"use client";

import type { RoomSeat, SeatStatus } from "../../lib/room-ops";

const STATUS_STYLE: Record<SeatStatus, { label: string; color: string; border: string }> = {
  missing: { label: "Missing", color: "#C7A954", border: "#C7A95466" },
  saved: { label: "Saved", color: "#9FC27E", border: "#7BA15766" },
  accepted: { label: "Accepted", color: "#9FC27E", border: "#7BA15766" },
  late: { label: "Late", color: "#C07A43", border: "#C07A4366" },
  dq: { label: "DQ", color: "#C0533E", border: "#C0533E66" },
};

export function SeatGrid({
  seats,
  roundId,
  roundStatus,
}: {
  seats: RoomSeat[];
  roundId: string | null;
  roundStatus: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">20 seats</p>
        <p className="text-[0.66rem] text-[#8A8674]">
          {roundStatus === "open"
            ? "Saved plans can still be changed until time runs out"
            : "After close, each seat is frozen"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {seats.map((seat) => {
          const tone = STATUS_STYLE[seat.status];
          const body = (
            <>
              <span className="block text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
                Seat {String(seat.seat).padStart(2, "0")}
              </span>
              <span className="mt-1 block truncate text-[0.8rem] text-[#E3DCC8]">
                {seat.loginId ? `Team ${seat.loginId}` : seat.name}
              </span>
              <span className="mt-1 block text-[0.72rem] tabular-nums text-[#C9C2AD]">
                {Number.isFinite(seat.credits) ? `${seat.credits.toFixed(seat.credits % 1 === 0 ? 0 : 2)} cr` : "— cr"}
              </span>
              <span className="mt-1 block text-[0.66rem] uppercase tracking-[0.1em]" style={{ color: tone.color }}>
                {tone.label}
              </span>
            </>
          );
          const className = "border bg-[#0F1613] px-3 py-2 hover:bg-white/[0.03]";
          return roundId ? (
            <a
              key={seat.seat}
              href={`/room/team/${String(seat.seat).padStart(2, "0")}${roundId ? `?round=${roundId}` : ""}`}
              className={className}
              style={{ borderColor: tone.border }}
            >
              {body}
            </a>
          ) : (
            <div key={seat.seat} className={className} style={{ borderColor: tone.border }}>
              {body}
            </div>
          );
        })}
      </div>
      {seats.length === 0 ? (
        <p className="text-[0.8rem] leading-6 text-[#A9A491]">
          No seats have been seeded yet. The grid stays empty rather than inventing twenty teams.
        </p>
      ) : null}
    </div>
  );
}
