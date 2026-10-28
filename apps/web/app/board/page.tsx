import Link from "next/link";
import { redirect } from "next/navigation";
import { PlaySession } from "../../components/game/PlaySession";
import { mayReadOfficialBoard } from "../../lib/board-access";
import { requireConfigured, requireUser, userIsOrganiser } from "../../lib/server/authz";

export const metadata = {
  title: "Official board — Langlands R3",
};

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const configured = await requireConfigured();
  if (!configured.ok) redirect("/sign-in");
  const authed = await requireUser();
  if (!authed.ok) redirect("/sign-in");
  if (!mayReadOfficialBoard(await userIsOrganiser(authed.user.userId))) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-parchment">
        <h1 className="font-serif text-2xl tracking-tight">Official board</h1>
        <p className="mt-4 text-sm leading-6 text-parchment/80">
          The 20-town standings are organiser-only. Delegates cannot view ranks or retrieve other
          teams’ scores.
        </p>
        <p className="mt-6">
          <Link href="/play" className="text-sm underline decoration-gold/60 underline-offset-4">
            Return to Ashfen
          </Link>
        </p>
      </main>
    );
  }
  return <PlaySession initialTab="results" deskOpen={false} initialOverlay="standings" />;
}
