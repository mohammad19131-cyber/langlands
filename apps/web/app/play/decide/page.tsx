import { PlaySession } from "../../../components/game/PlaySession";

export const metadata = {
  title: "Decide — Ashfen",
};

export const dynamic = "force-dynamic";

export default function DecidePage() {
  return <PlaySession initialTab="decide" deskOpen />;
}
