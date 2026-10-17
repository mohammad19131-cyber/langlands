export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-reading flex-col justify-center px-6 py-20 md:px-10">
      <p className="eyebrow">Loading</p>
      <p className="mt-3 flex items-center gap-3 font-serif text-2xl text-ink">
        <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-gold" aria-hidden />
        Surveying Ashfen…
      </p>
    </main>
  );
}
