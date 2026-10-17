/**
 * Python 3 JSON / round() compatibility for SHA-256 parity with
 * docs/simulation/engine.py canonical_state + state_hash.
 *
 * Ambiguity resolved:
 * - ENGINE_VERSION in the hash blob stays "py-ref-1.1.0" (the frozen contract).
 * - json.dumps(..., sort_keys=True, separators=(",", ":"))
 * - floats use Python's JSON number form: integer-valued floats keep ".0"
 *   (`32.0` not `32`); started/completed round numbers are JSON ints (`1`).
 * - round(x, n) is Python 3 banker's rounding (ties to even), including
 *   final_score's round(..., 2) and snaps round(..., 6).
 * - Signed zero: json.dumps(-0.0) is "-0.0". After play(), shock_log 0 is +0.0.
 */

export function pythonRound(value: number, ndigits: number): number {
  if (!Number.isFinite(value)) return value;
  if (ndigits === 0) return roundHalfEvenInteger(value);
  const factor = 10 ** ndigits;
  return roundHalfEvenInteger(value * factor) / factor;
}

function roundHalfEvenInteger(value: number): number {
  if (!Number.isFinite(value)) return value;
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function pythonJsonNumber(value: number, asInt = false): string {
  if (asInt) {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite integer in canonical state");
    }
    return String(Math.trunc(value));
  }
  if (Object.is(value, -0)) return "-0.0";
  if (!Number.isFinite(value)) {
    throw new Error("non-finite float in canonical state");
  }
  if (Number.isInteger(value)) return `${value}.0`;
  const json = JSON.stringify(value);
  if (!json.includes(".") && !json.toLowerCase().includes("e")) return `${json}.0`;
  return json;
}

type Jsonish =
  | null
  | boolean
  | number
  | string
  | Jsonish[]
  | { [key: string]: Jsonish };

export type CanonicalNumberHint = { path: string; asInt?: boolean };

/**
 * Dump a JSON value the way CPython json.dumps(sort_keys=True, separators=(',', ':'))
 * does for this engine's canonical_state. Integer fields (started/completed values)
 * must be marked by passing them as already-typed JSON numbers with asInt via
 * dumpCanonicalObject.
 */
export function dumpsPythonCanonical(value: unknown, asInt = false): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return pythonJsonNumber(value, asInt);
  if (Array.isArray(value)) {
    return `[${value.map((item) => dumpsPythonCanonical(item, asInt)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${dumpsPythonCanonical(v, asInt)}`)
      .join(",")}}`;
  }
  throw new Error("unsupported canonical value");
}
