import { publicPlayContext } from "../../../../lib/play-payload";
import { jsonError } from "../../../../lib/server/json";
import { loadGameContext } from "../../../../lib/server/game-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Allowlisted play props. Called from the client so RSC never reads the Auth
 * cookie or GoTrue user during page render.
 */
export async function GET() {
  const ctx = await loadGameContext();
  if (ctx.configured && !ctx.signedIn) {
    return jsonError(401, "unauthorized");
  }
  return Response.json(publicPlayContext(ctx));
}
