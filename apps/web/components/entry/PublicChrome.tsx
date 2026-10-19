import Link from "next/link";
import type { ReactNode } from "react";

type PublicPage = "sign-in" | "rules";

const NAV: { href: string; id: PublicPage; label: string }[] = [
  { href: "/rules", id: "rules", label: "Rules / Field guide" },
  { href: "/sign-in#sign-in", id: "sign-in", label: "Sign in" },
];

export function PublicChrome({
  children,
  current,
}: {
  children: ReactNode;
  current?: PublicPage;
}) {
  return (
    <div className="min-h-screen bg-forest-950 text-parchment">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-gold/50 focus:bg-forest-850 focus:px-3 focus:py-2 focus:text-parchment-paper"
      >
        Skip to content
      </a>
      <header className="border-b border-gold/25 bg-forest-850/95">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
          <Link
            href="/sign-in"
            className="font-serif text-lg tracking-tight text-parchment-paper"
          >
            Langlands R3
          </Link>
          <nav
            aria-label="Public pages"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.72rem] uppercase tracking-[0.16em]"
          >
            {NAV.map((item) => {
              const active = current === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "text-gold"
                      : "text-mist-bright hover:text-parchment-paper"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div id="content">{children}</div>
    </div>
  );
}
