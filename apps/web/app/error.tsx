"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-reading flex-col justify-center px-6 py-20 md:px-10">
      <p className="eyebrow text-state-danger">Error</p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight text-ink md:text-4xl">
        This page could not be rendered.
      </h1>
      <p className="mt-4 font-sans text-sm leading-6 text-ink-muted">
        {error.message || "Unexpected failure."} No scores or town states were invented to fill the
        gap.
      </p>
      <div className="mt-8">
        <button type="button" onClick={reset} className="btn-ghost">
          Try again
        </button>
      </div>
    </main>
  );
}
