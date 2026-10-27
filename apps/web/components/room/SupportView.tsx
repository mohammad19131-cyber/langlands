"use client";

import { useEffect, useState } from "react";
import { SECTOR_LABELS } from "../../lib/format";

export function SupportView({
  roundId,
  teamId,
  seat,
  name,
  loginId,
}: {
  roundId: string;
  teamId: string;
  seat: number;
  name: string;
  loginId: string | null;
}) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [payload, setPayload] = useState<{
    round?: { index: number; status: string };
    submission?: { allocations?: Record<string, number>; project_starts?: string[]; status?: string } | null;
    town?: { snapshot_score?: number; final_score?: number; engine_version?: string } | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/rounds/${roundId}/support/${teamId}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState("error");
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setPayload(data);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, teamId]);

  return (
    <main className="min-h-screen bg-[#0B0F0D] px-4 py-8 text-[#E7E3D6]">
      <div className="mx-auto max-w-xl space-y-4">
        <a href="/room" className="text-[0.72rem] uppercase tracking-[0.12em] text-[#8A8674]">
          ← Control room
        </a>
        <h1 className="font-serif text-3xl text-[#EDE8D9]">
          Seat {String(seat).padStart(2, "0")} · {loginId ? `Team ${loginId}` : name}
        </h1>
        <p className="text-[0.78rem] leading-6 text-[#8A8674]">
          Audited support read. This request is written to audit_logs. Players and judges do not
          see this page.
        </p>
        {state === "loading" ? <p className="text-[#8A8674]">Reading the support API…</p> : null}
        {state === "error" ? <p className="text-[#C0533E]">Not available.</p> : null}
        {state === "ready" ? (
          <div className="space-y-4 border border-[#B89A60]/20 p-4">
            <p className="text-[0.74rem] text-[#C9C2AD]">
              Round {payload?.round?.index ?? "—"} · {payload?.round?.status ?? "—"}
            </p>
            {payload?.submission ? (
              <div>
                <p className="text-[0.62rem] uppercase tracking-[0.12em] text-[#8A8674]">
                  Accepted submission · {payload.submission.status}
                </p>
                <ul className="mt-2 space-y-1 text-[0.8rem] text-[#E3DCC8]">
                  {Object.entries(payload.submission.allocations ?? {}).map(([sector, value]) => (
                    <li key={sector} className="flex justify-between">
                      <span>{SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS] ?? sector}</span>
                      <span className="tabular-nums">{value}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.74rem] text-[#8A8674]">
                  Starts: {payload.submission.project_starts?.join(", ") || "none"}
                </p>
              </div>
            ) : (
              <p className="text-[0.8rem] text-[#A9A491]">No accepted submission. A lock would record a hold.</p>
            )}
            {payload?.town ? (
              <p className="text-[0.74rem] text-[#C9C2AD]">
                Processed snapshot {payload.town.snapshot_score ?? "—"} · engine{" "}
                {payload.town.engine_version ?? "—"}
              </p>
            ) : (
              <p className="text-[0.74rem] text-[#8A8674]">No town_states row for this round yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
