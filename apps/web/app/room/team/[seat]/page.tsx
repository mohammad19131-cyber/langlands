import { SupportSession } from "../../../../components/room/SupportSession";

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
  return <SupportSession seat={seat} roundParam={roundParam ?? null} />;
}
