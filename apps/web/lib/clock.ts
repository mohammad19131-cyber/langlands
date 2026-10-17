export type ClockSnapshot = {
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  serverNow: string;
  roundIndex: number;
  roundId: string | null;
  eventCode: string | null;
};

export function remainingMs(closesAt: string | null, serverNow: string, clientNow = Date.now()): number | null {
  if (!closesAt) return null;
  const close = Date.parse(closesAt);
  const server = Date.parse(serverNow);
  if (Number.isNaN(close) || Number.isNaN(server)) return null;
  const offset = clientNow - server;
  return close - (clientNow - offset);
}

export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clockLabel(args: {
  status: string;
  opensAt: string | null;
  remainingMs: number | null;
}): string {
  if (args.status === "open") {
    if (args.remainingMs == null) return "Open";
    if (args.remainingMs <= 0) return "Deadline passed";
    return formatCountdown(args.remainingMs);
  }
  if (args.status === "scheduled") return args.opensAt ? `Opens ${formatClockTime(args.opensAt)}` : "Scheduled";
  if (args.status === "locked" || args.status === "processing") return "Locked";
  if (args.status === "published") return "Published";
  if (args.status === "void") return "Void";
  return "Planning";
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
