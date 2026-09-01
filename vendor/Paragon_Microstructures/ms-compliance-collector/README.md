# ms-compliance-collector — Evidence Pool + Compliance Measurement Engine

## What It Does

ms-compliance-collector is the EVIDENCE layer of the Paragon Tool Engine (PTA). It collects tool execution evidence as signed records, tracks offenses and dispatches per layer, and measures compliance via `measureCompliance(tool,args,exitCode,output)` which returns `exitCode===0`. The evidence pool outlives the gate window (TTL 600s = 2× gate 300s) and every record carries a SHA-256 signature over tool+args+exitCode+output.

This is the infrastructure MS-10 per MASTER_L1_SPEC §2 and PTA_L2_SPEC §2.11. The pool is the source the evidence gates read; without TTL discipline the gates read stale or forged evidence.

## How to Import

```typescript
import { ComplianceCollector, verifySignature, POOL_TTL_MS } from './src/index.js';
import type { ToolEvidenceRecord, OffenseRecord, DispatchRecord } from './src/core/types.js';

const cc = new ComplianceCollector();
cc.recordOffense('SMOKE_TEST_GUARD', { family: 'TEST_EVASION' });
cc.recordDispatch('SMOKE_TEST_GUARD', 1, 'tool.execute.before');
const ok = cc.measureCompliance('trident-container-test', {}, 0, 'output');
const records = cc.getRecords(); // TTL-filtered
verifySignature(records[0]); // true
```

Zero cross-MS dependencies. Uses `node:crypto` only.

## The Interface

### Types (src/core/types.ts)

```typescript
interface ToolEvidenceRecord { type:'tool_result'; tool:string; args:Record<string,unknown>; exitCode:number; output:string; timestamp:number; signature:string; }
interface OffenseRecord { layerId:string; violation:unknown; timestamp:number; }
interface DispatchRecord { layerId:string; tier:number; surface:string; timestamp:number; }
const POOL_TTL_MS = 600_000; // 2× gate
const GATE_TTL_MS = 300_000;
```

### Engine (src/core/engine.ts)

- `ComplianceCollector.recordOffense(layerId, violation)` — logs the violation with timestamp. Validates layerId. Throws if missing. Calls pruneStale().
- `recordDispatch(layerId, tier, surface)` — logs enforcement dispatch. Validates tier finite and surface string.
- `measureCompliance(tool, args, exitCode, output): boolean` — signs the call, pushes ToolEvidenceRecord, returns `exitCode===0`. Null args/output coalesced to `{}`/`''`.
- `getRecords(): ToolEvidenceRecord[]` — returns TTL-filtered shallow copies (records older than 600s excluded). Fail-safe empty on error.
- `verifySignature(record): boolean` — recomputes SHA-256 and compares.
- `clear()` — empties all pools.

### Machines (src/machines/machines.ts)

- `COMPLIANCE_LEXICON` — evidence families, TTL config, signature fields as data (the machine surface).
- `EVIDENCE_FAMILIES` — the typed family list consumed by gates.

### Error Paths

All mutating methods validate inputs FIRST and throw with a named message. Catch blocks log via `console.error` and propagate. `getRecords`/`getOffenses`/`getDispatches` are fail-closed (return `[]` on error). `pruneStale` never throws outward.

## How to Test

```bash
cd ms-compliance-collector && bun test
bunx tsc --noEmit
```

- `tests/per-machine.test.ts` — 12 adversarial cases: offense retrievable, dispatch tier+surface, measureCompliance true/false by exitCode, signature valid vs tampered, TTL expiry, null args, throws on missing layerId/tier/tool, clear, concurrent distinct signatures.
- `tests/properties.ts` — 500-run determinism: same input → same boolean and signature (2× collector), tamper detection, clear empties, exitCode mapping 0/non-0. Fixed seeds, pure TS loop, NO fast-check.

## How to Compose

- ParagonToolEngine (Plan 2) constructs one ComplianceCollector at engine init; gates call `getRecords()` at verification time.
- ChainTracker and PBA Bridge feed into intent; this MS feeds gates.
- Persistence can serialize the pool snapshot via `persistSynapse` (future).
- Layer loader is orthogonal; this MS has no knowledge of layers.

## How to Copy-and-Customize

```
1. cp -r ms-compliance-collector <your-plugin>/compliance-collector
2. Swap the lexicon: edit src/machines/machines.ts — add your evidence kinds and TTL.
3. Add your signature fields: extend signatureFields and computeSignature if needed.
4. Register: export your machines in src/machines/index.ts DEFAULT_MACHINES.
5. Test: bun test (per-machine + 500-run properties) then container runtime.
6. Build: bunx tsc --noEmit — entry is src/index.ts re-exporting src/core/.
```

To add a new evidence kind: add a typed record in `src/core/types.ts`, push it in a new method on `ComplianceCollector` following `measureCompliance` pattern (validate FIRST, prune, sign, push, return). Add a per-machine test and a property case.

Warning: do NOT change `POOL_TTL_MS` without updating gate TTL — the 2× invariant is doctrine.

## Architecture Notes

- `pruneStale` runs on every write (push) and on every read (getRecords) — the pool is naturally bounded by the 10-minute offense rate even in a long session.
- Signatures use `JSON.stringify({tool,args,exitCode,output})` → SHA-256 hex. Verification recomputes identically.
- `getRecords` returns shallow copies via `map(r=>({...r}))` so callers cannot mutate the pool.
- Dual TTL filtering: prune mutates internal arrays; getRecords filters again at read (defensive even if prune was skipped).
- All catch blocks use `e instanceof Error ? e.message : String(e)` and `console.error` (log-and-continue where appropriate, propagate where the caller must know).

## File Map

- `src/core/types.ts:1` — ToolEvidenceRecord, OffenseRecord, DispatchRecord, POOL_TTL_MS/GATE_TTL_MS
- `src/core/engine.ts:1` — ComplianceCollector + verifySignature + computeSignature
- `src/machines/machines.ts:1` / `src/machines/index.ts:1` — COMPLIANCE_LEXICON, EVIDENCE_FAMILIES
- `src/index.ts:1` — public entry re-exporting src/core/
- `index.ts:1`, `types.ts:1` — root shims for backward compat (preserve existing test imports)
- `index.test.ts:1` — preserved original 12-case suite (imports via root shim — 143/0 battery not shrunk)
- `tests/per-machine.test.ts:1` — 12 per-machine cases (new canonical per IntelligenceLexicon layout)
- `tests/properties.ts:1` — 500-run determinism properties

## Verification Commands

```bash
ls ms-compliance-collector/src/index.ts ms-compliance-collector/src/core/engine.ts
bun test ms-compliance-collector
bunx tsc --noEmit
wc -l ms-compliance-collector/README.md # >=100
grep -r "from '../ms-" ms-compliance-collector # 0
```

## Operator Doctrine

- R6 "NOTHING should kill the agent loop" — getRecords fail-closed to `[]` never throws into enforcement.
- TTL doctrine: pool 600s = 2× gate 300s — the evidence pool must outlive the gate's freshness window.

## References

- MASTER_L1_SPEC §2 MS-10 (lines 588-612)
- PTA_L2_SPEC §2.11 evidence gates
- Proven reference: v4.4.2-baseline/src/v2/enforce/compliance-collector.ts (read-only)

## Additional Details

- Package paragon-microstructures, type:module, bun, strict ES2022, bundler resolution
- Deterministic signing, synchronous, node:crypto only
- No cross-MS deps, verified by grep
- Error paths first, no empty catches, side effects precede claims
- Hardcode ban enforced — every value from data
- Adversarial suite covers empty/null/concurrent/boundary
- Implements IntelligenceLexicon-Edition-v1.0 layout (src/core + src/machines + src/index.ts + tests/properties.ts)
