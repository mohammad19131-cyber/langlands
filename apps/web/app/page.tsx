import { redirect } from "next/navigation";

/**
 * There is no landing page. The experience is LOGIN → GAME → PLAY, so the root
 * route sends every visitor straight to Ashfen. /play itself decides whether to
 * require sign-in (live backend) or open the inspect-only preview.
 */
export default function HomePage() {
  redirect("/play");
}
