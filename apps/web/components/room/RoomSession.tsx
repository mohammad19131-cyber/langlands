"use client";

import { useEffect, useState } from "react";
import { classifySessionLoad } from "../../lib/session-load";
import type { RoomContext } from "../../lib/server/room-context";
import { ControlRoom } from "./ControlRoom";

type LiveRoom = Extract<RoomContext, { ok: true }>;

export function RoomSession() {
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/room", { cache: "no-store" });
        const kind = classifySessionLoad(res.status);
        if (kind === "unauthorized") {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (kind === "forbidden") {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (kind !== "ok") {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const data = (await res.json()) as LiveRoom & { ok?: boolean };
        if (!cancelled && data?.ok) {
          setUnavailable(false);
          setRoom(data);
        } else if (!cancelled) {
          setUnavailable(true);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  if (forbidden) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
        <p className="max-w-md text-center text-[0.9rem] leading-6 text-[#A9A491]">Not available.</p>
      </main>
    );
  }
  if (unavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
        <div className="max-w-sm text-center">
          <p className="text-[0.9rem] leading-6 text-[#A9A491]">
            The control room could not be loaded. The last known server state is unchanged.
          </p>
          <button
            type="button"
            onClick={() => {
              setUnavailable(false);
              setRetry((n) => n + 1);
            }}
            className="mt-4 border border-[#B89A60]/40 px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-[#E3DCC8] hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] text-[#8A8674]">
        <p className="text-[0.72rem] uppercase tracking-[0.18em]">Loading control room…</p>
      </main>
    );
  }
  return <ControlRoom initial={room} />;
}
