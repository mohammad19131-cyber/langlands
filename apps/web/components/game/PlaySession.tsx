"use client";

import { useEffect, useState } from "react";
import type { GameContext } from "../../lib/game-types";
import { publicPlayContext } from "../../lib/play-payload";
import {
  SESSION_LOAD_TIMEOUT_MS,
  classifySessionLoad,
  sessionLoadBlocksPlay,
} from "../../lib/session-load";
import { GameScreen } from "./GameScreen";
import type { DeskTab } from "./CommandDesk";

type OverlayKind = "standings" | "scoring" | "event" | "review" | null;

function AshfenLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#0B0F0D] text-[#E7E3D6]">
      <p className="flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.18em] text-[#8A8674]">
        <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-[#D9B15A]" aria-hidden />
        Loading Ashfen…
      </p>
    </div>
  );
}

function AshfenLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
      <div className="max-w-sm text-center">
        <p className="text-[0.9rem] leading-6 text-[#A9A491]">
          Ashfen could not be loaded. The last server state is unchanged.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="border border-[#B89A60]/40 px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-[#E3DCC8] hover:bg-white/5"
          >
            Try again
          </button>
          <form method="POST" action="/auth/sign-out">
            <button
              type="submit"
              className="border border-[#B89A60]/25 px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-[#8A8674] hover:bg-white/5"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function PlaySession({
  initialTab = "decide",
  deskOpen = false,
  initialOverlay = null,
}: {
  initialTab?: DeskTab;
  deskOpen?: boolean;
  initialOverlay?: OverlayKind;
}) {
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SESSION_LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        const res = await fetch("/api/play/context", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        const kind = classifySessionLoad(res.status);
        if (cancelled) return;
        if (sessionLoadBlocksPlay(kind)) {
          setUnavailable(true);
          return;
        }
        const data = (await res.json()) as GameContext;
        const next = publicPlayContext(data);
        if (cancelled) return;
        if (!next.town?.indicators) {
          setUnavailable(true);
          return;
        }
        setUnavailable(false);
        setCtx(next);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [retry]);

  if (unavailable) {
    return (
      <AshfenLoadError
        onRetry={() => {
          setUnavailable(false);
          setRetry((n) => n + 1);
        }}
      />
    );
  }
  if (!ctx) return <AshfenLoading />;
  return (
    <GameScreen
      ctx={ctx}
      initialTab={initialTab}
      deskOpen={deskOpen}
      initialOverlay={initialOverlay}
      onRoundStatusChange={(status) => {
        if (status !== ctx.round?.status) setRetry((n) => n + 1);
      }}
    />
  );
}
