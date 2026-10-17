"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ENGINE_VERSION } from "@langlands/sim/public";
import type { SessionState } from "../lib/session";

const NAV = [
  { href: "/", label: "Briefing" },
  { href: "/rules", label: "Field guide" },
  { href: "/play", label: "Play" },
  { href: "/board", label: "Board" },
];

export function SiteHeader({
  session,
  configured,
}: {
  session: SessionState;
  configured: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // The decision desk is a full-viewport game screen with its own HUD.
  if (pathname.startsWith("/play")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory-raised/95">
      <div className="mx-auto flex max-w-shell items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="inline-block h-4 w-4 translate-y-0.5 border border-ink" aria-hidden>
            <span className="block h-full w-full origin-center scale-50 bg-gold" />
          </span>
          <span className="font-serif text-lg tracking-tight text-ink">Ashfen</span>
          <span className="font-sans text-[0.7rem] uppercase tracking-[0.18em] text-ink-faint">
            Langlands R3
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 font-sans text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`relative py-1 transition-colors ${
                isActive(item.href) ? "text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
              {isActive(item.href) ? (
                <span className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-gold" />
              ) : null}
            </Link>
          ))}
          <Link
            href="/sign-in"
            className="border border-ink/70 px-3 py-1 text-ink transition-colors hover:bg-ink hover:text-ivory"
          >
            {session.kind === "signed_in" ? "Account" : "Sign in"}
          </Link>
          <span className="hidden items-center gap-2 border-l border-line pl-4 font-sans text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint lg:flex">
            {ENGINE_VERSION}
            {!configured ? <span className="text-gold-deep">· offline</span> : null}
          </span>
        </nav>
      </div>
    </header>
  );
}
