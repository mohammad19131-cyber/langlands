export type SessionLoad = "ok" | "unauthorized" | "forbidden" | "unavailable";

/** Client fetch budget for play/room context. Loading must end if this elapses. */
export const SESSION_LOAD_TIMEOUT_MS = 12_000;

export function classifySessionLoad(status: number): SessionLoad {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status >= 200 && status < 300) return "ok";
  return "unavailable";
}

/** 401/403 on a cookie-gated page must not keep spinning or bounce to /sign-in. */
export function sessionLoadBlocksPlay(kind: SessionLoad): boolean {
  return kind !== "ok";
}
