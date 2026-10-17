"use client";

import { useState, type FormEvent } from "react";
import { createBrowserSupabase } from "../../lib/supabase/client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=/play`;
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("The competition backend is not configured in this browser build.");
      setPending(false);
      return;
    }
    const { error: signError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (signError) {
      setError(signError.message);
    } else {
      setMessage("If that address is invited, a sign-in link is on its way.");
    }
    setPending(false);
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    setMessage(null);
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("The competition backend is not configured in this browser build.");
      setPending(false);
      return;
    }
    const { error: signError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (signError) {
      setError(signError.message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={sendMagicLink} className="space-y-2.5">
        <label
          className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#8A8674]"
          htmlFor="email"
        >
          Team email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full border border-[#B89A60]/30 bg-black/30 px-3 py-2.5 text-sm text-[#EDE8D9] placeholder-[#6F6B5B] focus:border-[#D9B15A] focus:outline-none"
          placeholder="team@school.edu"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full border border-[#7BA157]/60 bg-[#2A4C39] px-4 py-2.5 text-sm uppercase tracking-[0.08em] text-[#E7F0DE] transition-colors hover:bg-[#335c44] disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.14em] text-[#5F5B4D]">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className="w-full border border-[#B89A60]/30 px-4 py-2.5 text-sm text-[#D7CFB8] transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        Continue with Google
      </button>

      {error ? <p className="text-sm text-[#C0533E]">{error}</p> : null}
      {message ? <p className="text-sm text-[#9FC27E]">{message}</p> : null}
    </div>
  );
}
