"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { resolveLoginIdentifier } from "../../lib/organiser-login";

export function SignInForm() {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const identifier = resolveLoginIdentifier(teamId);
    if (identifier.kind === "invalid") {
      setError("Enter your Team ID (digits only, e.g. 004) or organiser email.");
      setPending(false);
      return;
    }

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        identifier.kind === "team"
          ? { teamId: identifier.teamId, password }
          : { email: identifier.email, password },
      ),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Team ID or password is incorrect.");
      setPending(false);
      return;
    }

    const data = (await response.json().catch(() => null)) as { next?: string } | null;
    router.push(data?.next === "/room" ? "/room" : "/play");
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="space-y-2.5">
      <label
        className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#8A8674]"
        htmlFor="team-id"
      >
        Team ID or organiser email
      </label>
      <input
        id="team-id"
        name="team-id"
        type="text"
        required
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={teamId}
        onChange={(event) => setTeamId(event.target.value)}
        className="w-full border border-[#B89A60]/30 bg-black/30 px-3 py-2.5 text-sm text-[#EDE8D9] placeholder-[#6F6B5B] focus:border-[#D9B15A] focus:outline-none"
        placeholder="004 or organiser email"
      />

      <label
        className="mt-3 block text-[0.62rem] uppercase tracking-[0.16em] text-[#8A8674]"
        htmlFor="password"
      >
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full border border-[#B89A60]/30 bg-black/30 px-3 py-2.5 text-sm text-[#EDE8D9] placeholder-[#6F6B5B] focus:border-[#D9B15A] focus:outline-none"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full border border-[#7BA157]/60 bg-[#2A4C39] px-4 py-2.5 text-sm uppercase tracking-[0.08em] text-[#E7F0DE] transition-colors hover:bg-[#335c44] disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {error ? <p className="text-sm text-[#C0533E]">{error}</p> : null}
    </form>
  );
}
