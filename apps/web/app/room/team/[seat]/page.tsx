import Link from "next/link";
import { redirect } from "next/navigation";
import { SupportView } from "../../../../components/room/SupportView";
import { loadRoomContext } from "../../../../lib/server/room-context";

export const metadata = { title: "Support — Langlands R3" };
export const dynamic = "force-dynamic";

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ seat: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { seat: raw } = await params;
  const { round: roundParam } = await searchParams;
  const seat = Number(raw);
  const ctx = await loadRoomContext();
  if (!ctx.ok && ctx.status === 401) redirect("/sign-in");
  if (!ctx.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
        <p className="text-[0.9rem] text-[#A9A491]">Not available.</p>
      </main>
    );
  }
  const team = ctx.teams.find((row) => row.seat === seat);
  const requested = roundParam && ctx.rounds.some((row) => row.id === roundParam) ? roundParam : null;
  const roundId = requested ?? ctx.currentRoundId ?? ctx.rounds[0]?.id ?? null;
  if (!team || !roundId) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-[#E7E3D6]">
        <p className="text-[#A9A491]">That seat is not in this competition, or no round exists.</p>
        <Link href="/room" className="mt-6 inline-block text-[#D9B15A] underline">
          Back to the control room
        </Link>
      </main>
    );
  }
  return <SupportView roundId={roundId} teamId={team.teamId} seat={team.seat} name={team.name} loginId={team.loginId} />;
}
