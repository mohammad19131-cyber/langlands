export default function PlayLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[#0B0F0D] text-[#E7E3D6]">
      <p className="flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.18em] text-[#8A8674]">
        <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-[#D9B15A]" aria-hidden />
        Loading Ashfen…
      </p>
    </div>
  );
}
