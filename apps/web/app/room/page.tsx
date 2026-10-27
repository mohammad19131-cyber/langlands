import { RoomSession } from "../../components/room/RoomSession";

export const metadata = { title: "Control room — Langlands R3" };
export const dynamic = "force-dynamic";

export default function RoomPage() {
  return <RoomSession />;
}
