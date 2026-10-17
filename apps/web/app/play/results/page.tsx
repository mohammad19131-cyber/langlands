import { redirect } from "next/navigation";
import { GameScreen } from "../../../components/game/GameScreen";
import { loadGameContext } from "../../../lib/server/game-context";

export const metadata = {
  title: "Results — Ashfen",
};

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const ctx = await loadGameContext();
  if (ctx.configured && !ctx.signedIn) {
    redirect("/sign-in");
  }
  return <GameScreen ctx={ctx} initialTab="results" deskOpen />;
}
