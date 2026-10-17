# Python ↔ TypeScript parity notes

Frozen contract: `docs/simulation/engine.py` version **py-ref-1.1.0** and `docs/simulation/goldens/py_ref_1_1_0.json`.

The TypeScript package does **not** introduce a new engine version string. `ENGINE_VERSION` remains `py-ref-1.1.0` because `canonical_state` includes that field in the SHA-256 blob.

## Hash blob

Python:

```
blob = json.dumps(canonical_state(town), sort_keys=True, separators=(",", ":"))
sha256(blob.encode("utf-8"))
```

Resolved encoding details:

| Field | JSON form |
| --- | --- |
| Index / mix / reserve / population / shock_log | Python `float`, so integer-valued numbers keep `.0` (`32.0`, `0.0`) |
| `started` / `completed` values | Python `int` round numbers, JSON `1` not `1.0` |
| Object keys | `sort_keys=True` at every object |
| Signed zero | `json.dumps(-0.0) == "-0.0"`; after `play()` zeros in `shock_log` are `+0.0` |

`round(x, n)` is Python 3 banker's rounding (ties to even). Used for canonical 10 d.p., snaps 6 d.p., and `final_score` 2 d.p.

## Physics

IEEE-754 operations are intended to match CPython `float` / `math.exp`. Scores on the frozen goldens must match exactly, not merely ±0.01.

If a future Node/`Math.exp` platform diverges, investigate the operation; do not rewrite goldens.
