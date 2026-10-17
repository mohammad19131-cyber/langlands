import { redirect } from "next/navigation";
import { ControlRoom } from "../../components/room/ControlRoom";
import { loadRoomContext } from "../../lib/server/room-context";

export const metadata = { title: "Control room — Langlands R3" };
export const dynamic = "force-dynamic";

export default async function RoomPage() {
  const ctx = await loadRoomContext();
  if (!ctx.ok && ctx.status === 401) redirect("/sign-in");
  if (!ctx.ok && ctx.status === 403) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
        <p className="max-w-md text-center text-[0.9rem] leading-6 text-[#A9A491]">Not available.</p>
      </main>
    );
  }
  if (!ctx.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F0D] px-6 text-[#E7E3D6]">
        <p className="max-w-md text-center text-[0.9rem] leading-6 text-[#A9A491]">
          {ctx.error} The control room does not invent a live field.
        </p>
      </main>
    );
  }
  return <ControlRoom initial={ctx} />;
}
