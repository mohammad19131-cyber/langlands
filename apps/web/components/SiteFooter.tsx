"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ENGINE_VERSION, ROUNDS } from "@langlands/sim/public";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/play")) return null;

  return (
    <footer className="mt-24 border-t border-line bg-forest-800 text-ivory">
      <div className="mx-auto grid max-w-shell gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr] md:px-10">
        <div className="max-w-sm">
          <div className="flex items-baseline gap-2.5">
            <span className="inline-block h-4 w-4 translate-y-0.5 border border-ivory/60" aria-hidden>
              <span className="block h-full w-full origin-center scale-50 bg-gold" />
            </span>
            <span className="font-serif text-lg tracking-tight">Ashfen</span>
          </div>
          <p className="mt-4 font-sans text-sm leading-6 text-ivory/70">
            A pedagogical environmental strategy competition. Not a validated Earth-system model.
            Scores, clocks, and remaining credits are server-authoritative; browsers may only
            propose decisions.
          </p>
        </div>

        <nav className="font-sans text-sm">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-gold-soft">Navigate</p>
          <ul className="mt-4 space-y-2.5 text-ivory/80">
            <li><Link href="/" className="hover:text-ivory">Briefing</Link></li>
            <li><Link href="/rules" className="hover:text-ivory">Field guide</Link></li>
            <li><Link href="/play" className="hover:text-ivory">Decision desk</Link></li>
            <li><Link href="/board" className="hover:text-ivory">Results board</Link></li>
          </ul>
        </nav>

        <div className="font-sans text-sm">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-gold-soft">The frozen set</p>
          <dl className="mt-4 space-y-2.5 text-ivory/80">
            <div className="flex justify-between gap-4"><dt>Teams</dt><dd className="tabular-nums">20</dd></div>
            <div className="flex justify-between gap-4"><dt>Rounds</dt><dd className="tabular-nums">{ROUNDS}</dd></div>
            <div className="flex justify-between gap-4"><dt>Engine</dt><dd className="tabular-nums">{ENGINE_VERSION}</dd></div>
            <div className="flex justify-between gap-4"><dt>Scenario</dt><dd>Pack A</dd></div>
          </dl>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="mx-auto max-w-shell px-6 py-5 font-sans text-[0.74rem] text-ivory/50 md:px-10">
          Ashfen is a fictional town. Coefficients are game assumptions, not measured field results.
        </div>
      </div>
    </footer>
  );
}
