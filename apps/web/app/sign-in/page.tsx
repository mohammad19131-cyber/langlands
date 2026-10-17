import { redirect } from "next/navigation";
import { getPublicSupabaseConfig } from "../../lib/env";
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
    redirect("/play");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0F0D] px-6 py-12 text-[#E7E3D6]">
      {/* Subtle dark-red gradient wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(122,46,37,0.28) 0%, rgba(122,46,37,0.08) 32%, transparent 60%), radial-gradient(100% 80% at 50% 120%, rgba(14,27,20,0.9) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-5 grid h-11 w-11 place-items-center border border-[#B89A60]/50">
            <span className="h-5 w-5 bg-gradient-to-br from-[#B89A60] to-[#7A2E25]" />
          </span>
          <h1 className="font-serif text-3xl tracking-tight text-[#F2ECDC]">Langlands R3</h1>
          <p className="mt-2 text-[0.8rem] leading-5 text-[#9A947F]">
            Take command of Ashfen. Restore a town recovering from environmental disaster across six
            years of decisions.
          </p>
        </div>

        <div className="border border-[#B89A60]/25 bg-[#0F1613]/80 p-6 backdrop-blur">
          {config.configured ? (
            <SignInForm />
          ) : (
            <div className="space-y-2">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#D9B15A]">
                Backend not configured
              </p>
              <p className="text-[0.82rem] leading-6 text-[#9A947F]">
                This build has no Supabase connection, so sign-in is unavailable. You can still open
                the inspect-only preview of Ashfen.
              </p>
              <a
                href="/play"
                className="mt-3 inline-block border border-[#B89A60]/30 px-4 py-2 text-[0.78rem] text-[#D7CFB8] transition-colors hover:bg-white/5"
              >
                Open preview
              </a>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[0.68rem] leading-4 text-[#5F5B4D]">
          Accounts are organiser-invited. Scores, budgets and results are decided on the server.
        </p>
      </div>
    </main>
  );
}
