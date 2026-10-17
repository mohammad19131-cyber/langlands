import { healthBand } from "../../lib/ashfen";

const BAND_COLOR: Record<ReturnType<typeof healthBand>, string> = {
  critical: "#9B3B2E",
  strained: "#9C5A3B",
  fair: "#B89A60",
  strong: "#5E7A48",
};

const BAND_LABEL: Record<ReturnType<typeof healthBand>, string> = {
  critical: "Critical",
  strained: "Strained",
  fair: "Fair",
  strong: "Strong",
};

/**
 * Indicator meter. `value` is the raw 0–100 reading shown to the reader;
 * `health` is the normalised 0–100 used to colour the band (so pollution,
 * where lower is better, still reads red when high). Not a chart for its own
 * sake — the number is always present as text.
 */
export function Meter({
  label,
  value,
  health,
  hint,
  dark = false,
}: {
  label: string;
  value: number;
  health: number;
  hint?: string;
  dark?: boolean;
}) {
  const band = healthBand(health);
  const color = BAND_COLOR[band];
  const pct = Math.max(2, Math.min(100, health));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-sans text-sm ${dark ? "text-ivory/85" : "text-ink"}`}>{label}</span>
        <span
          className={`font-sans text-sm tabular-nums ${dark ? "text-ivory" : "text-ink"}`}
          title={`${BAND_LABEL[band]} · ${hint ?? ""}`}
        >
          {Math.round(value)}
          {hint ? <span className={`ml-1 text-[0.7rem] ${dark ? "text-ivory/50" : "text-ink-faint"}`}>{hint}</span> : null}
        </span>
      </div>
      <div
        className={`relative h-[6px] w-full overflow-hidden rounded-[1px] ${dark ? "bg-ivory/15" : "bg-ivory-sunk"}`}
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${Math.round(value)} of 100, ${BAND_LABEL[band]}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-[1px] transition-[width] duration-700 ease-editorial"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        {/* target tick at the 68 "strong" threshold for quick reading */}
        <div
          className={`absolute inset-y-0 w-px ${dark ? "bg-ivory/30" : "bg-ink/15"}`}
          style={{ left: "68%" }}
        />
      </div>
    </div>
  );
}
