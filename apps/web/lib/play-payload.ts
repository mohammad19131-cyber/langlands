import { publicPlayerLabel } from "./display-identity";
import type { GameContext } from "./game-types";

/**
 * Allowlisted play-screen props. The Auth user, session, JWT, and credentials
 * must never appear here — only the seated team's public identity.
 */
export function publicPlayContext(ctx: GameContext): GameContext {
  const team = ctx.team
    ? {
        id: String(ctx.team.id),
        name: String(ctx.team.name),
        seat: Number(ctx.team.seat),
        loginId: ctx.team.loginId == null ? null : String(ctx.team.loginId),
      }
    : null;

  return {
    mode: ctx.mode === "live" ? "live" : "preview",
    configured: Boolean(ctx.configured),
    signedIn: Boolean(ctx.signedIn),
    email: team
      ? publicPlayerLabel({
          loginId: team.loginId,
          teamName: team.name,
          seat: team.seat,
        })
      : null,
    isOrganiser: Boolean(ctx.isOrganiser),
    team,
    competition: ctx.competition
      ? {
          id: String(ctx.competition.id),
          title: String(ctx.competition.title),
          roundCount: Number(ctx.competition.roundCount),
        }
      : null,
    round: ctx.round
      ? {
          id: ctx.round.id,
          index: ctx.round.index,
          status: ctx.round.status,
          opensAt: ctx.round.opensAt,
          closesAt: ctx.round.closesAt,
          eventCode: ctx.round.eventCode,
          serverNow: ctx.round.serverNow,
        }
      : null,
    town: ctx.town,
    budget: {
      available: Number(ctx.budget.available),
      income: Number(ctx.budget.income),
      maintenance: Number(ctx.budget.maintenance),
      reserve: Number(ctx.budget.reserve),
    },
    startedCodes: [...ctx.startedCodes],
    completedCodes: [...ctx.completedCodes],
    submission: ctx.submission
      ? {
          allocations: { ...ctx.submission.allocations },
          projectStarts: [...ctx.submission.projectStarts],
          status: String(ctx.submission.status),
        }
      : null,
    leaderboard: ctx.leaderboard,
    boardByRound: ctx.boardByRound,
    ownHistory: ctx.ownHistory,
    publishedRoundIndex: ctx.publishedRoundIndex,
    publishedRounds: [...ctx.publishedRounds],
    roundSummaries: ctx.roundSummaries.map((row) => ({
      index: row.index,
      id: row.id,
      status: row.status,
    })),
    notice: ctx.notice,
  };
}

/** Names of Auth/session fields that must not appear in the play RSC payload. */
export function playPayloadLeakNames(serialized: string): string[] {
  const hits: string[] = [];
  if (/@users\.langlands\.internal/i.test(serialized)) hits.push("system-auth-email");
  if (/email_confirmed_at/i.test(serialized)) hits.push("email_confirmed_at");
  if (/access_token/i.test(serialized)) hits.push("access_token");
  if (/refresh_token/i.test(serialized)) hits.push("refresh_token");
  if (/"aud"\s*:\s*"authenticated"/i.test(serialized)) hits.push("auth-aud");
  if (/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\./.test(serialized)) hits.push("jwt");
  if (/base64-eyJ/i.test(serialized)) hits.push("base64-session-cookie");
  if (/auth-token/i.test(serialized)) hits.push("auth-token-cookie");
  if (/"password(_hash)?"\s*:/i.test(serialized)) hits.push("password");
  if (/"email"\s*:\s*"[^"]+@[^"]+"/i.test(serialized)) hits.push("email-address");
  return hits;
}
