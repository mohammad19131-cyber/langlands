import { PlaySession } from "../../components/game/PlaySession";

export const metadata = {
  title: "Ashfen — Langlands R3",
};

export const dynamic = "force-dynamic";

export default function PlayPage() {
  return <PlaySession />;
}
