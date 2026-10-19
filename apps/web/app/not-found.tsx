import Link from "next/link";
import { PublicChrome } from "../components/entry/PublicChrome";

export default function NotFound() {
  return (
    <PublicChrome>
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="font-sans text-sm uppercase tracking-[0.18em] text-gold">Not found</p>
        <h1 className="mt-3 font-serif text-3xl text-parchment-paper">
          No such page in this competition.
        </h1>
        <p className="mt-4 max-w-xl font-sans text-sm leading-6 text-mist-bright">
          The live board and decision desk are not mocked here. Sign in if you have a Team ID, or
          read the field guide first.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 font-sans text-sm">
          <Link href="/sign-in" className="text-gold underline-offset-4 hover:underline">
            Sign in
          </Link>
          <Link href="/rules" className="text-mist-bright underline-offset-4 hover:underline">
            Rules / Field guide
          </Link>
        </div>
      </main>
    </PublicChrome>
  );
}
