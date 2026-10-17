import { RoundMachineError } from "@langlands/round-machine";

export function jsonError(status: number, error: string, message?: string) {
  return Response.json({ ok: false, error, message }, { status });
}

export function fromMachineError(error: unknown): Response {
  if (error instanceof RoundMachineError) {
    return jsonError(error.httpStatus, error.code, error.message);
  }
  const message = error instanceof Error ? error.message : "unexpected";
  return jsonError(500, "error", message);
}
