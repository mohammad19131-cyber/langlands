import { notFound } from "next/navigation";
import { GameScreen } from "../../../components/game/GameScreen";
import { fixtureGameContext } from "../../../lib/game-fixture";
import { publicPlayContext } from "../../../lib/play-payload";

export const metadata = {
  title: "Player fixture — Langlands R3",
};

export const dynamic = "force-dynamic";

/** Development-only HUD inspection. Hidden in production builds. */
export default function PlayFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GameScreen ctx={publicPlayContext(fixtureGameContext())} />;
}
