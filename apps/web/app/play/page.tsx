import { redirect } from "next/navigation";
import { GameScreen } from "../../components/game/GameScreen";
import { loadGameContext } from "../../lib/server/game-context";

export const metadata = {
  title: "Ashfen — Langlands R3",
};

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const ctx = await loadGameContext();
  // Live deployment with a real backend: require sign-in before the game screen.
  if (ctx.configured && !ctx.signedIn) {
    redirect("/sign-in");
  }
  return <GameScreen ctx={ctx} />;
}
