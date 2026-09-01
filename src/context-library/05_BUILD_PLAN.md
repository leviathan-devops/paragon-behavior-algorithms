# Build Plan — trident-brain-v4.3.3

**Version:** v4.3.3
**Generated:** 2026-06-18T18:38:16.739Z

---

## Overview

This file provides the complete build workflow: phase-by-phase commands,
dependency ordering, verification gates, and rollback procedures.
Follow phases in order. Do not skip verification gates.

## Build Chain

| Step | Command | Purpose | Expected Output |
|------|---------|---------|-----------------|
| 1 | `tsc --noEmit` | Type checking | Exit code 0 |
| 2 | `esbuild src/index.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/index.js --sourcemap --external:@opencode-ai/plugin --external:zod` | Single-file bundle | `dist/index.js` exists |
| 3 | `node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"` | Load verification | Prints module keys |
| 4 | `grep "from '\\.\." dist/index.js` | No relative imports | 0 matches |
| 5 | `grep -c "ctx.hook" dist/index.js` | Hook count | >= 4 |
| 6 | `grep -c "ctx.tool" dist/index.js` | Tool count | >= 3 |

## Phase Details

### Phase 1: Entry Point Setup

**Commands:**
```bash
mkdir -p src/hooks src/tools src/audit-engine/layers src/artifacts
touch src/index.ts src/config.ts src/types.ts src/orchestrator.ts src/utils.ts
# Implement index.ts with hook registration
# Implement config.ts with TRIDENT_CONFIG
tsc --noEmit  # Verify: 0 errors
```

**Gate:** `tsc --noEmit` exits 0
**Rollback:** `rm src/index.ts src/config.ts`

### Phase 2: State Machine

**Commands:**
```bash
# Implement orchestrator.ts with state machine
tsc --noEmit  # Verify: 0 errors
# Test: create instance, call startMode, completeLayer
node -e "import('./dist/index.js').then(() => console.log('OK'))"
```

**Gate:** orchestrator methods work without errors
**Rollback:** Revert orchestrator.ts

### Phase 3: Audit Engine

**Commands:**
```bash
mkdir -p src/audit-engine/layers
touch src/audit-engine/types.ts src/audit-engine/layer-engine.ts
touch src/audit-engine/layers/r5-empty-catch.ts
# Implement types, engine, and at least R5 layer
tsc --noEmit  # Verify: 0 errors
```

**Gate:** `LayerEngine.run()` returns score
**Rollback:** `rm -rf src/audit-engine`

### Phase 4: Mode Tools

**Commands:**
```bash
touch src/tools/trident-brain-v4-3-3-tools.ts
# Implement tool definitions with zod schemas
tsc --noEmit  # Verify: 0 errors
grep -c "z.object" src/tools/trident-brain-v4-3-3-tools.ts  # >= 3
```

**Gate:** All tools have schemas with `.strict()`
**Rollback:** Revert tools file

### Phase 5: Identity Hooks

**Commands:**
```bash
touch src/hooks/trident-brain-v4-3-3-hooks.ts
# Implement SCAN+REPLACE identity injection
tsc --noEmit  # Verify: 0 errors
grep "scanReplace" src/hooks/trident-brain-v4-3-3-hooks.ts  # Must exist
```

**Gate:** SCAN+REPLACE method exists, identity block markers present
**Rollback:** Revert hooks file

### Phase 6: Artifact Generation

**Commands:**
```bash
# Implement utils.ts (tridentLog, writeArtifactFile)
# Implement artifact generators
tsc --noEmit  # Verify: 0 errors
# Test artifact writing
node -e "import('./dist/index.js').then(m => console.log('OK'))"
```

**Gate:** writeArtifactFile creates files on disk
**Rollback:** Revert utils and artifacts

### Phase 7: Bundle and Deploy

**Commands:**
```bash
# Full bundle
npx esbuild src/index.ts --bundle --platform=node --format=esm \
  --target=node20 --outfile=dist/index.js --sourcemap \
  --external:@opencode-ai/plugin --external:zod
# Verify no relative imports
grep "from '\\.\." dist/index.js && echo "FAIL" || echo "OK"
# Load test
node -e "import('./dist/index.js').then(m => console.log('OK:', Object.keys(m)))"
```

**Gate:** Bundle loads without errors
**Rollback:** Rebuild from last known good

## Dependencies Table

| Phase | Depends On | Blocks | Gate |
|-------|-----------|--------|------|
| 1 | — | 2,3,4,5,6 | tsc passes |
| 2 | 1 | 4,7 | FSM methods work |
| 3 | 1 | 4 | Engine returns score |
| 4 | 1,2,3 | 7 | Schemas exist |
| 5 | 1 | — | SCAN+REPLACE exists |
| 6 | 1 | 7 | Artifacts write to disk |
| 7 | 1,2,4,6 | — | Bundle loads |

## Rollback Procedures

| Scenario | Rollback Action | Data Loss |
|----------|----------------|-----------|
| Phase 1 fails | Delete created files | None (nothing built yet) |
| Phase 2 fails | Revert orchestrator.ts | Phase 1 work intact |
| Phase 3 fails | Delete audit-engine/ | Phases 1-2 intact |
| Phase 4 fails | Revert tools file | Phases 1-3 intact |
| Phase 5 fails | Revert hooks file | Phases 1-4 intact |
| Phase 6 fails | Revert utils/artifacts | Phases 1-5 intact |
| Phase 7 fails | Rebuild from Phase 6 state | No source loss |

## Verification Gates Summary

Each gate MUST pass before proceeding to the next phase.

| Gate | Check | Pass Criteria |
|------|-------|---------------|
| G1 | TypeScript compilation | `tsc --noEmit` exit 0 |
| G2 | Bundle creation | `dist/index.js` exists |
| G3 | No relative imports | grep returns 0 matches |
| G4 | Hook count | grep >= 4 |
| G5 | Tool count | grep >= 3 |
| G6 | SCAN+REPLACE exists | grep finds method |
| G7 | Bundle loads | node import succeeds |


---
*Generated by Trident v4.3.3*
