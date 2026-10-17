# @langlands/sim

Pure deterministic engine. Port of `docs/simulation/engine.py` (`py-ref-1.1.0`, catalogue A-CAT-1.1).

No fetch, no React, no randomness, no database.

```
npm test          # vitest
npm run typecheck
```

Public surface: `createInitialTown`, `stepRound(town, submission, roundIndex)`, `finalScore`, `CATALOGUE`, `PACK_A`, `ENGINE_VERSION`.

Browser-safe subset (no `node:crypto`): `import { CATALOGUE, PACK_A, WEIGHTS, ENGINE_VERSION } from "@langlands/sim/public"`. Official `stepRound` stays on the server.

`ENGINE_VERSION` stays `py-ref-1.1.0` so SHA-256 blobs match the frozen Python goldens. See `PARITY.md`.
