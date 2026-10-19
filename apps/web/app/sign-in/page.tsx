import { redirect } from "next/navigation";
import { PublicChrome } from "../../components/entry/PublicChrome";
import { getPublicSupabaseConfig } from "../../lib/env";
import { userIsOrganiser } from "../../lib/server/authz";
import { getSessionState } from "../../lib/session";
import { SignInForm } from "./SignInForm";

export const metadata = {
  title: "Sign in — Langlands R3",
};

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const config = getPublicSupabaseConfig();
  const session = await getSessionState();
  if (session.kind === "signed_in") {
    redirect((await userIsOrganiser(session.userId)) ? "/room" : "/play");
  }

  return (
    <PublicChrome current="sign-in">
      <main className="relative flex min-h-[calc(100vh-4.5rem)] items-center justify-center overflow-hidden px-6 py-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 0%, rgba(122,46,37,0.28) 0%, rgba(122,46,37,0.08) 32%, transparent 60%), radial-gradient(100% 80% at 50% 120%, rgba(14,27,20,0.9) 0%, transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative w-full max-w-md">
          <div className="mb-8 text-center">
            <span className="mx-auto mb-5 grid h-11 w-11 place-items-center border border-gold/50">
              <span className="h-5 w-5 bg-gradient-to-br from-gold to-[#7A2E25]" />
            </span>
            <h1 className="font-serif text-3xl tracking-tight text-parchment-paper">
              Langlands R3
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[0.86rem] leading-6 text-mist-bright">
              An environmental strategy competition. Teams recover and manage Ashfen across six
              rounds, balancing environmental health, public welfare, economic stability, and
              resilience. Ranking uses an established automated scoring system.
            </p>
          </div>

          <div className="border border-gold/25 bg-forest-850/80 p-6 backdrop-blur">
            {config.configured ? (
              <SignInForm />
            ) : (
              <div id="sign-in" className="scroll-mt-24 space-y-2">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-gold-soft">
                  Backend not configured
                </p>
                <p className="text-[0.82rem] leading-6 text-mist-bright">
                  This build has no Supabase connection, so sign-in is unavailable. You can still
                  open the inspect-only preview of Ashfen.
                </p>
                <a
                  href="/play"
                  className="mt-3 inline-block border border-gold/30 px-4 py-2 text-[0.78rem] text-parchment transition-colors hover:bg-white/5"
                >
                  Open preview
                </a>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3 text-center text-[0.78rem] leading-5 text-mist-bright">
            <p>
              Students sign in with the Team ID and password supplied by the competition organiser.
              There is no self-registration or password reset on this page.
            </p>
            <p>
              Organisers use this same form with their staff email and password — not a Team ID.
            </p>
            <p className="text-[0.72rem] leading-5 text-mist">
              Scores, budgets, and results are decided on the server.
            </p>
          </div>
        </div>
      </main>
    </PublicChrome>
  );
}
