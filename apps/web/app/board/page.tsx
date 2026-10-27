import { PlaySession } from "../../components/game/PlaySession";

export const metadata = {
  title: "Board — Langlands R3",
};

export const dynamic = "force-dynamic";

export default function BoardPage() {
  return <PlaySession initialTab="results" deskOpen={false} initialOverlay="standings" />;
}
