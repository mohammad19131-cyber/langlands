import { redirect } from "next/navigation";
import { PublicChrome } from "../../components/entry/PublicChrome";
import { getPublicSupabaseConfig } from "../../lib/env";
import {
  credentialSafeSignInPath,
  queryHasSecret,
  signInErrorMessage,
} from "../../lib/sign-in-request";
import { SignInForm } from "./SignInForm";

export const metadata = {
  title: "Sign in — Langlands R3",
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const incoming = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") incoming.set(key, value);
  }
  if (
    queryHasSecret(incoming) ||
    incoming.has("team-id") ||
    incoming.has("teamId") ||
    incoming.has("password")
  ) {
    redirect(credentialSafeSignInPath(`http://localhost/sign-in?${incoming.toString()}`));
  }

  const config = getPublicSupabaseConfig();
  const initialError = signInErrorMessage(
    typeof params.error === "string" ? params.error : null,
  );

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
            <p className="mx-auto mt-3 max-w-xs text-[0.86rem] leading-6 text-mist-bright">
              Twenty teams restore the town of Ashfen across six rounds.
            </p>
          </div>

          <div className="border border-gold/25 bg-forest-850/80 p-6 backdrop-blur">
            {config.configured ? (
              <SignInForm initialError={initialError} />
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

          <div className="mt-6 space-y-2 text-center text-[0.78rem] leading-5 text-mist-bright">
            <p>Sign in with your Team ID, or a staff email, and password. No self-registration.</p>
            <p className="text-[0.72rem] leading-5 text-mist">
              Scores, budgets, and results are decided on the server.
            </p>
          </div>
        </div>
      </main>
    </PublicChrome>
  );
}
