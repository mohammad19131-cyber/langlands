import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="font-sans text-sm uppercase tracking-[0.18em] text-bronze">Not found</p>
      <h1 className="mt-3 font-serif text-3xl text-ink">No such page in this competition.</h1>
      <p className="mt-4 font-sans text-sm text-ink-muted">
        The live board and decision desk are not mocked here.
      </p>
      <Link href="/" className="mt-8 inline-block font-sans text-sm text-moss underline">
        Return to the briefing
      </Link>
    </main>
  );
}
