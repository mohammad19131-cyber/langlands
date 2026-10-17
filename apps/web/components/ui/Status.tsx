import type { ReactNode } from "react";

type Tone = "neutral" | "live" | "wait" | "gold" | "danger" | "done";

const DOT: Record<Tone, string> = {
  neutral: "#8A9188",
  live: "#5E7A48",
  wait: "#B89A60",
  gold: "#937840",
  danger: "#9B3B2E",
  done: "#2A4C39",
};

export function StatusDot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      {pulse ? (
        <span
          className="absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-60"
          style={{ backgroundColor: DOT[tone] }}
        />
      ) : null}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: DOT[tone] }} />
    </span>
  );
}

export function StatusChip({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 border border-line bg-ivory px-2.5 py-1 font-sans text-[0.7rem] uppercase tracking-[0.14em] text-ink-muted">
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}
