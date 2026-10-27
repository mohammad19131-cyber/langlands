import { PlaySession } from "../../../components/game/PlaySession";

export const metadata = {
  title: "Results — Ashfen",
};

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  return <PlaySession initialTab="results" deskOpen />;
}
