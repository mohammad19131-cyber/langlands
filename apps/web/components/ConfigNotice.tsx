export function ConfigNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={`relative overflow-hidden border border-line bg-ivory-raised shadow-panel ${compact ? "p-4" : "p-6"}`}
      role="status"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-gold" aria-hidden />
      <p className="eyebrow text-gold-deep">Supabase not configured</p>
      <p className={`mt-2 font-sans text-sm leading-6 text-ink-muted ${compact ? "" : "max-w-2xl"}`}>
        This shell will not pretend to be signed in or connected to a database. Add the public URL
        and anon key, then the service role on the server only. Setup steps are on the sign-in page.
      </p>
    </aside>
  );
}
