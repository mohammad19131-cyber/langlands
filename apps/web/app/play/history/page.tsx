import { PlaySession } from "../../../components/game/PlaySession";

export const metadata = {
  title: "History — Ashfen",
};

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return <PlaySession initialTab="results" deskOpen />;
}
