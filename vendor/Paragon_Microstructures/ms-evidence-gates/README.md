# ms-evidence-gates — 5-Criteria Compliance Verification Engine

## Purpose
Verifies compliance is REAL (demanded tool called + artifact produced + freshness + types + signature). Kills theatrical compliance (tool called, no artifact) — the AP-7 trap. The verdict drives the state machine's comply transition (genuine vs minimum).

## Evidence Record
```ts
interface ToolEvidenceRecord {
  type: 'tool_result'; // requiredTypes criterion
  tool: string;        // which tool was called
  args: Record<string, unknown>;
  exitCode: number;    // 0 = success, allTypes criterion
  output: string;      // what was produced (capped 500)
  timestamp: number;   // freshness criterion
  signature: string;   // SHA-256 hex, signatureVerification criterion
}
```
Signature = SHA-256(JSON.stringify({tool,args,exitCode,output,timestamp,type})) via node:crypto.

## The 5 Criteria
1. minEvidenceCount: >=1 matching record where tool===demandedTool && exitCode===0
2. freshness: matching records within freshnessWindowMs (default 300000 = 5 min); stale excluded upfront, never sink verdict
3. requiredTypes: type==='tool_result' for all matching
4. allTypes: exitCode===0 for all matching
5. signatureVerification: SHA-256 recomputes for all matching; tampered signature → criterion false

## Verdict Mapping (PASS 5/5, INCONCLUSIVE >=3, FAIL <3)
- PASS: 5/5 criteria true → genuine compliance path, state machine esc-- and full window
- INCONCLUSIVE: 3 or 4 /5 → ambiguous, probation handling
- FAIL: <3 → no compliance, escalation continues

## Fresh-Subset Evaluation (P1 calibration fix)
Stale records excluded from evaluation set upfront. The freshness criterion reports exclusion, never sinks the verdict forever once any record ages past TTL. Pool grows unbounded but only fresh subset evaluated.

## API
```ts
import { evaluateCompliance, createEvidenceRecord, computeSignature, isGenuineCompliance, isMinimumCompliance } from './src/index.js';
const ev = createEvidenceRecord('trident-container-test', { target: 'src' }, 0, 'artifact results.json PASS ...', Date.now());
const { verdict, criteria, poolSize, totalFresh } = evaluateCompliance('trident-container-test', [ev], 300000);
console.log(verdict); // PASS | INCONCLUSIVE | FAIL
console.log(criteria); // { minEvidenceCount, freshness, requiredTypes, allTypes, signatureVerification }
console.log(computeSignature(ev) === ev.signature); // true
console.log(isGenuineCompliance(ev)); // true if output has artifact marker
console.log(isMinimumCompliance(ev)); // true if exit0
```

## Architecture (IntelligenceLexicon-Edition-v1.0)

| Component | File | Purpose |
|---|---|---|
| Core types | `src/core/types.ts` | ToolEvidenceRecord, GateCriteria, GateResult |
| Core engine | `src/core/engine.ts` | evaluateCompliance, createEvidenceRecord, computeSignature, isGenuine/isMinimum |
| Machines | `src/machines/gates.ts` | FIVE_CRITERIA, GATE_CONFIGS, FRESHNESS_WINDOW_MS, ARTIFACT_MARKERS as data |
| Machines index | `src/machines/index.ts` | Re-export gate configs |
| Entry | `src/index.ts` | Public entry re-exporting from src/core/ + src/machines/ |
| Tests | `tests/properties.ts` | 500-run determinism (fixed-seed, same input→same verdict, no fast-check) |
| Tests | `tests/per-machine.test.ts` | Per-gate behavior + determinism gate |
| Legacy tests | `gates.test.ts` | 13 original cases (preserved) |

## How to integrate (copy-and-customize)

```
1. cp -r ms-evidence-gates <your-plugin>/my-gates
2. Add your criterion: edit src/machines/gates.ts — add entry to FIVE_CRITERIA / GATE_CONFIGS
   (id, criteria[], verdictMap) — verdict mapping pass 5/5 inconclusive >=3 fail <3.
3. Add your marker: edit src/machines/gates.ts — ARTIFACT_MARKERS array — then
   update src/core/engine.ts isGenuineCompliance check.
4. Wire: src/index.ts re-exports from src/core/ — add your new gate import there
5. Implement: src/core/engine.ts — add your criterion's check in evaluateCompliance
6. Test: bun test (per-machine + 500-run properties) + tsc --noEmit
7. Customize: update src/core/types.ts for new GateCriteria fields
```

## Genuine vs Minimum Split
- GENUINE: demanded tool + exit0 + artifact-pattern match (output contains 'artifact'/'results.json'/'PASS' and length>50) → clean slate, esc-- (min 0), state machine probationDeadline null
- MINIMUM: demanded tool + exit0 + no artifact → probation half-window (seq+2), esc stays, still PASS on gate but state machine keeps escalation memory

## Functions
- computeSignature(record): string — SHA-256 hex over tool+args+exitCode+output+timestamp+type
- createEvidenceRecord(tool,args,exitCode,output,timestamp?): ToolEvidenceRecord — computes signature automatically
- evaluateCompliance(demandedTool,evidencePool,freshnessWindowMs=300000): GateResult — 5-criteria evaluation with stale exclusion
- isGenuineCompliance(ev): boolean — exit0 + type tool_result + artifact marker
- isMinimumCompliance(ev): boolean — type tool_result + exit0

## Error Handling
- Null/undefined/non-array pool → treated as [] → FAIL, never throw
- Missing timestamp → treated as stale (0) → excluded
- Signature recompute failure → criterion false, not throw
- evaluateCompliance never throws; internal try-catch returns FAIL on unexpected error (loud-fail-or-clear-pass: error paths handled FIRST)
- Empty catches BANNED — every catch logs or propagates.

## Testing
- Original: 13 cases — PASS 5/5, INCONCLUSIVE 4/5, FAIL <3, freshness expiry, exitCode, sig tamper, genuine/minimum, empty/null pool, purity
- New: tests/per-machine.test.ts — 7 per-gate cases + 500-run determinism
- New: tests/properties.ts — 500 runs pure TS loop, fixed seed, demandedTool/pool randomization, verdict determinism

## Invariants
- Every value computed from data — no hardcode fitted to oracle
- Fresh-subset never sinks verdict; staleCount tracked separately
- MatchingFresh = fresh.filter(tool===demanded && exit0); criteria evaluated on matchingFresh only
- Signature verification iterates all matching, counts failures

## Provenance
From gate-engine.ts (171L, fresh-subset evaluation, 5 criteria, verdict PASS/INCONCLUSIVE/FAIL) — proven P1 calibration fix 2026-08-28. Replicated pattern using ToolEvidenceRecord with SHA-256.

## Constraints
Zero cross-MS imports. Zero v2 imports. Uses node:crypto (Bun compatible). Standalone TypeScript.

## File Map
- src/core/types.ts: ToolEvidenceRecord, GateCriteria, GateResult
- src/core/engine.ts: computeSignature, createEvidenceRecord, evaluateCompliance, isGenuineCompliance, isMinimumCompliance
- src/machines/gates.ts: FIVE_CRITERIA, GATE_CONFIGS, FRESHNESS_WINDOW_MS, ARTIFACT_MARKERS
- src/machines/index.ts: re-export gate configs
- src/index.ts: public entry re-exporting from src/core/ + src/machines/
- tests/properties.ts: 500-run determinism (runProperties, fixed seed, demandedTool/pool randomization)
- tests/per-machine.test.ts: 7 per-gate cases + properties gate
- gates.test.ts: 13 original green cases (preserved)
- README.md: this file

## Verification
- bun test ms-evidence-gates → 20 pass (13 original + 7 per-machine)
- bunx tsc --noEmit → 0 errors from this dir
- ls ms-evidence-gates/src/index.ts → exists

## Anti-Patterns Killed
- Theatrical compliance (tool called no artifact) caught by genuine check
- Empty catches, console-only handlers, always-passing tests — all BANNED
- Hardcode ban enforced — no test oracle fitting

## Integration
Evidence pool collected by ms-compliance-collector (TTL 600s, 2× gate TTL). Gate result drives state machine COMPLIANCE_VERIFIED (PASS genuine→esc--, minimum→probation) vs COMPLIANCE_FAILED (FAIL→escalate).

## Future
- Per-layer verificationPatterns (RegExp match on output)
- Ledger persistence pta-ledger.jsonl O_APPEND
- Gate presets per tier (strictness scaling)

## References
- MASTER_L1_SPEC §2 MS-09
- PTA_L2_SPEC §2.11 evidence gates
- IntelligenceLexicon-Edition-v1.0 — Registry → machines → hooks pattern
- gate-engine.ts 171L proven

## Changelog
- v1.1 2026-08-31 IntelligenceLexicon restructure: src/ tree, 5-criteria data table, 500-run properties, per-machine tests
- v1.0 2026-08-31 5-criteria engine, SHA-256, fresh-subset, 13 tests

## License
Private — paragon-microstructures, PTA.

## Appendix: Example Scenarios
Scenario PASS: one fresh trident-container-test exit0 artifact results.json valid sig → 5/5 → PASS.
Scenario FAIL stale: same but timestamp 10 min ago with 5 min window → 0/5 → FAIL.
Scenario FAIL exit non-zero: tool called but exit 1 → minEvidenceCount false → FAIL.

## Contact
Paragon V3 Tool-Chain Algorithms — MS-09 Evidence Gates.
