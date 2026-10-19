import { redirect } from "next/navigation";

/**
 * Public entry is sign-in. Signed-in visitors are sent on to /play or /room
 * from that page. Unconfigured builds still offer the inspect-only preview
 * from the sign-in screen. This route is not a briefing.
 */
export default function HomePage() {
  redirect("/sign-in");
}
