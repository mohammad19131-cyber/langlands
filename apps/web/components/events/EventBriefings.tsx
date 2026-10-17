import { EVENT_SCHEDULE, INDICATORS, type EventBrief } from "../../lib/ashfen";

const EVENT_ACCENT: Record<string, string> = {
  HEATWAVE: "#9C5A3B",
  DROUGHT: "#B89A60",
  FLOOD: "#3C5566",
  CONTAMINATION: "#9B3B2E",
  CALM: "#5E7A48",
};

function labelFor(key: string): string {
  return INDICATORS.find((m) => m.key === key)?.label ?? key;
}

function EventCard({ brief }: { brief: EventBrief }) {
  const accent = EVENT_ACCENT[brief.code ?? "CALM"];
  const isShock = brief.code !== null;
  return (
    <article className="relative flex flex-col overflow-hidden border border-line bg-ivory-raised shadow-panel">
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} aria-hidden />
      <header className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
        <div>
          <p className="eyebrow" style={{ color: accent }}>
            Round {brief.round} {isShock ? "· shock" : "· clear"}
          </p>
          <h3 className="mt-2 font-serif text-xl leading-tight text-ink">{brief.name}</h3>
        </div>
        {brief.code ? (
          <span
            className="shrink-0 border px-2 py-0.5 font-sans text-[0.66rem] uppercase tracking-[0.12em]"
            style={{ color: accent, borderColor: `${accent}66` }}
          >
            {brief.code}
          </span>
        ) : null}
      </header>

      <p className="px-6 font-sans text-sm leading-6 text-ink-muted">{brief.tagline}</p>

      <div className="mt-4 flex flex-1 flex-col gap-4 px-6 pb-6">
        {brief.threatens.length > 0 ? (
          <div>
            <p className="eyebrow text-ink-faint">Under pressure</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {brief.threatens.map((k) => (
                <span key={k} className="border border-line bg-ivory px-1.5 py-0.5 font-sans text-[0.72rem] text-ink-muted">
                  {labelFor(k)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p className="eyebrow text-ink-faint">What helps</p>
          <ul className="mt-2 space-y-1">
            {brief.mitigations.map((m) => (
              <li key={m} className="flex gap-2 font-sans text-[0.82rem] leading-5 text-ink">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="border-t border-line bg-ivory-sunk/50 px-6 py-2.5 font-sans text-[0.76rem] italic text-ink-muted">
        {brief.note}
      </footer>
    </article>
  );
}

export function EventBriefings() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {EVENT_SCHEDULE.map((brief) => (
        <EventCard key={brief.round} brief={brief} />
      ))}
    </div>
  );
}
