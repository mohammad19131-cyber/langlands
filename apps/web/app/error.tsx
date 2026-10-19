"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-reading flex-col justify-center px-6 py-20 md:px-10">
      <p className="font-sans text-xs uppercase tracking-[0.2em] text-state-danger">Error</p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight text-parchment-paper md:text-4xl">
        This page could not be rendered.
      </h1>
      <p className="mt-4 font-sans text-sm leading-6 text-mist-bright">
        {error.message || "Unexpected failure."} No scores or town states were invented to fill the
        gap.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="border border-gold/40 px-5 py-2.5 text-sm text-parchment-paper hover:bg-white/5"
        >
          Try again
        </button>
        <Link href="/sign-in" className="text-sm text-gold underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    </main>
  );
}
