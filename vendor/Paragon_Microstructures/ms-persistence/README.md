# ms-persistence — Per-Session Atomic State Store

## What It Does

ms-persistence is the PERSISTENCE layer of the Paragon Tool Engine (PTA). It provides per-session atomic state storage: `persistState`/`loadState` for `pta-state-<sid>.json`, `persistSynapse`/`loadSynapse` for `pta-synapse-<sid>.json`, `persistChain`/`loadChain` for `pta-chain-<sid>.json`, and `appendLedger` for `pta-ledger.jsonl`. All state writes are `write .tmp + renameSync` atomic; all loads are fail-closed (`null` on missing or corrupt JSON, never a throw into the caller's enforcement path); the ledger is `O_APPEND` append-only (never shrinks).

This is infrastructure MS-12 per MASTER_L1_SPEC §2. The PBA-proven atomicity + fail-closed patterns ported for PTA.

## How to Import

```typescript
import { Persistence, persistState, loadState, appendLedger } from './src/index.js';
import type { EnforcementEvent } from './src/core/types.js';

const p = new Persistence('/tmp/pta-state'); // or new Persistence() → os.tmpdir()/pta-state
p.persistState('sid-42', { tier: 1, seq: 10 });
const rec = p.loadState('sid-42');           // {tier:1,seq:10} or null if corrupt/missing
p.appendLedger({ type: 'enforce', timestamp: Date.now(), layerId: 'SMOKE_TEST_GUARD' });
const evts = p.readLedger();
```

Zero cross-MS dependencies. Uses `node:fs`/`node:path`/`node:os` only.

## The Interface

### Types (src/core/types.ts)

```typescript
interface EnforcementEvent { type:string; sessionId?:string; layerId?:string; tier?:number; timestamp:number; [key:string]:unknown; }
interface PersistenceConfig { stateDir:string; }
```

### Engine (src/core/engine.ts)

- `new Persistence(stateDir?)` — stateDir defaults to `os.tmpdir()/pta-state`. All files under this dir.
- `persistState(sid, record)` — `JSON.stringify` → `atomicWrite(pta-state-<sid>.json)`.
- `loadState(sid): unknown|null` — readFileSync + JSON.parse; `null` on ENOENT or corrupt.
- `persistSynapse(sid, snapshot)` / `loadSynapse(sid)` — same pattern for `pta-synapse-<sid>.json`.
- `persistChain(sid, record)` / `loadChain(sid)` — same for `pta-chain-<sid>.json`.
- `appendLedger(event)` — `mkdir -p` + `appendFileSync(JSON.stringify(event)+'\n')`. Throws if event missing.
- `readLedger(): EnforcementEvent[]` — split by `\n`, JSON.parse each line, skip corrupt lines, `[]` on ENOENT.
- Module functions `persistState(sid,record,stateDir?)` etc. — functional wrappers constructing a fresh `Persistence` per call.

### Machines (src/machines/machines.ts)

- `PERSISTENCE_LEXICON` — file naming functions, atomicity config (`write-tmp-then-rename`, suffix `.tmp`), ledger mode (`O_APPEND`/`utf8`/`\n`), fail-closed mapping (`corrupt→null`, `missing→null`) as data.

### Error Paths

Every persist validates `sid` is a non-empty string and throws if not. Atomic write catches unlink cleanup failures via inner catch + `console.error`; outer catch logs and rethrows. Load catches `ENOENT` → `null` (not an error), corrupt JSON → `null` + `console.error`. Append validates `event` is an object and throws if not. All catches use `e instanceof Error ? e.message : String(e)`.

## How to Test

```bash
cd ms-persistence && bun test
bunx tsc --noEmit
```

- `tests/per-machine.test.ts` — 13 cases: state round-trip, synapse round-trip, atomicity no `.tmp` residue, corrupt JSON→null, corrupt synapse→null, missing→null, ledger append valid lines, append-only proof (earlier prefix preserved), sid isolation, throws on empty sid/null event, chain round-trip, empty ledger `[]`.
- `tests/properties.ts` — 500-run determinism: same sid/record → same persisted load (state), synapse round-trip, ledger append order (`a` then `b`), sid isolation (`A` vs `B`). Fixed seeds, pure TS, NO fast-check.

## How to Compose

- ParagonToolEngine constructs one `Persistence(stateDir)` at init; the state machine and synapse serialize themselves via `persistState`/`persistSynapse` at every transition.
- ChainTracker persists via `persistChain`.
- The ledger is the audit trail consumed by `trident-evidence-query`; its append-only guarantee is the honesty proof.

## How to Copy-and-Customize

```
1. cp -r ms-persistence <your-plugin>/persistence
2. Swap the file map: edit src/machines/machines.ts — rename pta-state-* prefixes or add a new file kind (e.g. pta-bridge-<sid>.json).
3. Add a method: add persistBridge/loadBridge in src/core/engine.ts following the atomicWrite + fail-closed load pattern.
4. Wire: export your lexicon in src/machines/index.ts DEFAULT_MACHINES.
5. Test: bun test (per-machine + 500-run properties).
6. Build: bunx tsc --noEmit — entry is src/index.ts.
```

Adding a file kind example:

```typescript
persistFoo(sid: string, data: unknown): void {
  if (!sid || typeof sid !== 'string') throw new Error('Persistence.persistFoo: sid required');
  const json = JSON.stringify(data);
  atomicWrite(this.filePath(`pta-foo-${sid}.json`), json);
}
loadFoo(sid: string): unknown|null {
  if (!sid || typeof sid !== 'string') return null;
  try { return JSON.parse(readFileSync(this.filePath(`pta-foo-${sid}.json`),'utf8')); }
  catch(e){ if((e as any).code==='ENOENT') return null; console.error(String(e)); return null; }
}
```

## Architecture Notes

- `atomicWrite(filePath, data)` writes to `filePath.tmp` then `renameSync` — rename is atomic on POSIX even under crash between write and rename, the final file is either old or new, never partial. The `.tmp` is cleaned on failure.
- `ensureDir` is `mkdirSync(dir,{recursive:true})` before every write — safe for concurrent callers.
- `defaultStateDir()` is `os.tmpdir()/pta-state` for tests; production passes a real dir via constructor.
- `stateDir` is `readonly` after construction — the dir is the session namespace; two Persistence instances with the same dir share files (intentional for the module-function wrappers).
- Loads are `unknown|null` typed — the caller casts to its `BehaviorRecord` shape; persistence is type-agnostic (JSON blob).
- The ledger file `pta-ledger.jsonl` is global (no sid suffix) — it is the single append-only evidence stream.

## File Map

- `src/core/types.ts:1` — EnforcementEvent, PersistenceConfig
- `src/core/engine.ts:1` — Persistence class + persistState/loadState/persistSynapse/loadSynapse/appendLedger + helpers atomicWrite/ensureDir/defaultStateDir
- `src/machines/machines.ts:1` / `index.ts:1` — PERSISTENCE_LEXICON
- `src/index.ts:1` — public entry
- `index.ts:1`, `types.ts:1` — root shims
- `index.test.ts:1` — preserved original 13-case suite
- `tests/per-machine.test.ts:1` — 13 per-machine cases
- `tests/properties.ts:1` — 500-run properties
- `README.md:1` — this file (100+ lines)

## Verification Commands

```bash
ls ms-persistence/src/index.ts ms-persistence/src/core/engine.ts
bun test ms-persistence
bunx tsc --noEmit
wc -l ms-persistence/README.md
grep -r "from '../ms-" ms-persistence # 0
```

## Operator Doctrine

- Atomicity doctrine: state writes are `tmp+rename` ALWAYS — partial write is corruption and the loader must fail-closed to `null`, never guess.
- Ledger doctrine: the ledger is append-only evidence — `O_APPEND`, one line per event, never rewritten.

## References

- MASTER_L1_SPEC §2 MS-12 (lines 623-653)
- PTA_L2_SPEC §2.9 persistence (pta-state/ta-synapse/ta-chain/ta-ledger files, atomic tmp+rename)
- IntelligenceLexicon-Edition-v1.0 src/core/state-store.ts (session-scoped Map pattern — persistence is the durable analogue)

## Additional Details

- Package paragon-microstructures, type:module, bun, strict ES2022
- Zero cross-MS deps
- Error paths first, no empty catches, no silent swallows
- Hardcode ban — every value from the record/args, never a fixed literal
- Adversarial suite covers empty/null/concurrent/boundary
- IntelligenceLexicon layout (src/core + src/machines + src/index.ts + tests/properties.ts)
