// src/audit-engine/__tests__/aether-stepx.test.ts — THE STEP-X ORCHESTRATOR
// BATTERY (SPEC-2 §9.1.7 + §9.10 S1 C7). THE FIXTURES ARE REAL: a temp
// filesystem tree (never a synthetic window), a REAL AuditEngine instance, a
// REAL bun:sqlite in-memory store — the only substituted surface is the BRAIN
// (the model call is battery-mocked per §13.1 S-PB2; the fixture brain
// COMPUTES its verdicts from the brief's data — the window symbols, the
// severities — never fitted to a test oracle).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  runStepX,
  evaluateHealth,
  StepXHealth,
  StepXMachine,
  readWindowWithinScope,
  anchorExistsWithinScope,
  AETHER_COMPOSE_FAILED,
  STEP_X_SKIPPED_PREFIX,
} from '../aether/step-x-orchestrator.ts';
import type {
  StepXInput,
  AetherBrain,
  AetherBrief,
  CompositionResult,
  ProbedVerdict,
} from '../aether/step-x-orchestrator.ts';
import { readVerdicts } from '../aether/aether-store.ts';
import type { AetherStoreDb } from '../aether/aether-store.ts';
import { AuditEngine } from '../index.ts';
import type { AuditFinding } from '../types.ts';

let root: string;
let engine: AuditEngine;

const F = (o: Partial<AuditFinding>): AuditFinding => ({
  severity: 'HIGH', category: 'X', file: '', line: 1, evidence: 'e', description: 'd',
  correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1',
  constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o,
});

// THE FIXTURE BRAIN (the §13.1 battery-mocked model surface). Every field is
// COMPUTED FROM THE BRIEF: the root cites a real symbol extracted from the
// machinery's own source window, the fix cites the finding's real file:line,
// the rank derives from the machinery's severity. The thin-brief refusal is
// the brain contract's loud-fail (§9.2.2 MECHANISM 1).
const fixtureBrain = (overrides: { badAnchorOnIndex?: number; dropIndex?: number } = {}): AetherBrain => ({
  async compose(brief: AetherBrief): Promise<CompositionResult> {
    if (brief.findings.length < 1) {
      throw new Error('AETHER_COMPOSE_FAILED: no findings to probe — the aether cannot judge nothing');
    }
    const verdicts: ProbedVerdict[] = [];
    for (const f of brief.groundTruth.findings) {
      if (overrides.dropIndex === f.index) continue;
      const ghost = overrides.badAnchorOnIndex === f.index;
      const symbol = /function\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(f.sourceWindow)?.[1] ?? 'path';
      verdicts.push({
        findingIndex: f.index,
        adjudication: f.category === 'STRING_MARKER' ? 'RED_HERRING' : 'TRUE_POSITIVE',
        deeperRoot: `the ${symbol} mechanism fails silently here`,
        concreteFix: `${ghost ? 'src/ghost-never-exists.ts' : f.file}:${ghost ? 999 : f.line} — guard + log the error path`,
        consequenceRank: (f.severity === 'CRITICAL' ? 1 : f.severity === 'HIGH' ? 2 : f.severity === 'MEDIUM' ? 3 : 4) as 1 | 2 | 3 | 4,
      });
    }
    return {
      verdicts,
      narrative: 'adjudication: the dirty fixture probed — the silent swallow is the top fix.',
      modelMeta: { model: 'fixture-brain', provider: 'battery', composedAt: Date.now() },
    };
  },
});

const findings = (): AuditFinding[] => [
  F({ file: 'src/bad.ts', line: 1, severity: 'CRITICAL', layer: 'R2', category: 'EMPTY_CATCH' }),
  F({ file: 'src/bad.ts', line: 2, severity: 'HIGH', layer: 'R5', category: 'FAKE_RETURN' }),
  F({ file: 'src/bad.ts', line: 3, severity: 'LOW', layer: 'R3', category: 'STRING_MARKER' }),
  F({ file: 'src/other.ts', line: 1, severity: 'MEDIUM', layer: 'R9', category: 'ANY_TYPE' }),
];

const completeInput = (): StepXInput => ({
  targetPath: root,
  functionality: {
    findings: findings(),
    graphStats: { nodes: 3, edges: 1 },
    eventStats: { reasoningObservations: 2, cadenceToolCalls: 5, flowVerdict: 'CLEAR' },
    projectContext: { shape: 'library', isPlugin: false },
  },
  engine,
});

const brokenInput = (): StepXInput => ({
  targetPath: root,
  functionality: {} as StepXInput['functionality'],   // the machinery-incomplete (the D17/graph/events absent)
  engine,
});

const expectRejects = async (fn: () => Promise<unknown>, marker: string): Promise<void> => {
  let message = '';
  try {
    await fn();
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  expect(message.includes(marker)).toBe(true);
};

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-stepx-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const catchOpen = 'catch (e) ';
  await fs.writeFile(path.join(root, 'src', 'bad.ts'), [
    'export function run(cb: any) { try { cb(); } ' + catchOpen + '{ } }',   // line 1 — the silent swallow
    'export function d() { return true; }',                                  // line 2 — the fake-return
    'const s = "TODO is just data";',                                        // line 3 — the string-marker
  ].join('\n'));
  await fs.writeFile(path.join(root, 'src', 'other.ts'), 'export function keep(x: number) { return x + 1; }');
  engine = new AuditEngine();
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('THE STEP-X ORCHESTRATOR — the health gate + the sequencing (SPEC-2 §9.1.7 C7)', () => {
  it('THE HEALTH GATE — the machinery-incomplete input → MACHINERY_INCOMPLETE (the C7 literal)', () => {
    expect(evaluateHealth({ functionality: {}, engine } as StepXInput)).toBe(StepXHealth.MACHINERY_INCOMPLETE);
  });

  it('THE HEALTH GATE — the complete input + the bound brain → HEALTHY', () => {
    expect(evaluateHealth(completeInput(), fixtureBrain())).toBe(StepXHealth.HEALTHY);
  });

  it('THE HEALTH GATE — a malformed findings array (a finding missing its layer) → MACHINERY_INCOMPLETE', () => {
    const input = completeInput();
    (input.functionality.findings[0] as Partial<AuditFinding>).layer = undefined;
    expect(evaluateHealth(input, fixtureBrain())).toBe(StepXHealth.MACHINERY_INCOMPLETE);
  });

  it('THE HEALTH GATE — the absent graph stats → MACHINERY_INCOMPLETE', () => {
    const input = completeInput();
    (input.functionality as { graphStats?: unknown }).graphStats = undefined;
    expect(evaluateHealth(input, fixtureBrain())).toBe(StepXHealth.MACHINERY_INCOMPLETE);
  });

  it('THE HEALTH GATE — a present-but-empty scope root → TARGET_UNSCOPED', () => {
    const input = completeInput();
    input.targetPath = '   ';
    expect(evaluateHealth(input, fixtureBrain())).toBe(StepXHealth.TARGET_UNSCOPED);
  });

  it('THE HEALTH GATE — a brain without the compose surface → BRAIN_UNAVAILABLE', () => {
    expect(evaluateHealth(completeInput(), {} as unknown as AetherBrain)).toBe(StepXHealth.BRAIN_UNAVAILABLE);
  });

  it('THE FULL FLOW — ran=true + the verdicts length === the findings length (the C7 literal)', async () => {
    const input = completeInput();
    const r = await runStepX(input, fixtureBrain());
    expect(r.ran).toBe(true);
    expect(r.verdicts.length).toBe(input.functionality.findings.length);
    expect(r.verifiedBy.length).toBe(4);
    expect(r.report.includes("the model's suggested triage")).toBe(true);
    expect(r.report.includes('## 4. THE RED-HERRINGS')).toBe(true);
    expect(r.report.includes('CALIB_STALE')).toBe(true);
  });

  it('THE SCOPED WINDOW — a file OUTSIDE the targetPath → UNREADABLE (the scope law)', async () => {
    const window = await readWindowWithinScope(root, '../../etc/passwd', 1, 80);
    expect(window.startsWith('UNREADABLE')).toBe(true);
  });

  it('THE MISSING FILE — a ghost finding file → UNREADABLE (never a synthetic window)', async () => {
    const window = await readWindowWithinScope(root, 'src/ghost.ts', 1, 80);
    expect(window.startsWith('UNREADABLE')).toBe(true);
  });

  it('THE SKIP IS LOUD — the machinery-incomplete input → ran=false + the report header carries STEP-X SKIPPED', async () => {
    const r = await runStepX(brokenInput(), fixtureBrain());
    expect(r.ran).toBe(false);
    expect(r.skippedReason === `${STEP_X_SKIPPED_PREFIX}MACHINERY_INCOMPLETE`).toBe(true);
    expect(r.report.includes('STEP-X SKIPPED')).toBe(true);
    expect(r.verdicts.length).toBe(0);
  });

  it('THE SKIP ON THE DEAD BRAIN — a brain without compose → the loud skip, never a crash', async () => {
    const r = await runStepX(completeInput(), {} as unknown as AetherBrain);
    expect(r.ran).toBe(false);
    expect(r.skippedReason === `${STEP_X_SKIPPED_PREFIX}BRAIN_UNAVAILABLE`).toBe(true);
    expect(r.report.includes('STEP-X SKIPPED')).toBe(true);
  });

  it('THE PER-CLAIM VERIFY — one bad anchor flags THAT claim UNVERIFIED; the rest ship (the C7 literal)', async () => {
    const r = await runStepX(completeInput(), fixtureBrain({ badAnchorOnIndex: 1 }));
    expect(r.ran).toBe(true);
    expect(r.verdicts.length).toBe(4);                    // the verified still ship
    expect(r.report.includes('UNVERIFIED')).toBe(true);
    expect(r.report.includes('VERIFY_ANCHOR_ABSENT')).toBe(true);
    expect(r.verifiedBy.length).toBe(3);
    expect(r.verifiedBy.includes('silent-verifier:finding-1')).toBe(false);
    expect(r.verifiedBy.includes('silent-verifier:finding-0')).toBe(true);
  });

  it('THE COUNT-MISMATCH DEGRADE — a dropped verdict → the count-bound fires; the report ships with EVERY claim UNVERIFIED (never a partial trust on a broken map)', async () => {
    const r = await runStepX(completeInput(), fixtureBrain({ dropIndex: 2 }));
    expect(r.ran).toBe(true);                             // the degrade, never the whole-report deletion
    expect(r.verdicts.length).toBe(3);
    expect(r.report.includes('VERIFY_COUNT_MISMATCH')).toBe(true);
    expect(r.verifiedBy.length).toBe(0);
  });

  it('THE BRAIN REJECTION — a model stall → AETHER_COMPOSE_FAILED (the loud-fail, NO fake report)', async () => {
    const stalled: AetherBrain = {
      async compose() { throw new Error('the provider timed out'); },
    };
    await expectRejects(() => runStepX(completeInput(), stalled), AETHER_COMPOSE_FAILED);
  });

  it('THE THIN BRIEF — zero findings on healthy machinery → the brain refuses (AETHER_COMPOSE_FAILED), never a judgment over nothing', async () => {
    const input = completeInput();
    input.functionality.findings = [];
    expect(evaluateHealth(input, fixtureBrain())).toBe(StepXHealth.HEALTHY);   // the empty-target is a health pass
    await expectRejects(() => runStepX(input, fixtureBrain()), AETHER_COMPOSE_FAILED);
  });

  it('THE MACHINE — the transition chain is recorded per run (IDLE→HEALTH_GATING→…→EMITTED + the triad-log)', async () => {
    const machine = new StepXMachine();
    const r = await machine.drive(completeInput(), fixtureBrain());
    expect(r.ran).toBe(true);
    expect(machine.current).toBe('EMITTED');
    const patterns = machine.audit().map((rec) => rec.pattern);
    expect(patterns[0]).toBe('IDLE->HEALTH_GATING');
    expect(patterns.includes('HEALTH_GATING->BRIEFING')).toBe(true);
    expect(patterns.includes('BRIEFING->COMPOSING')).toBe(true);
    expect(patterns.includes('COMPOSING->POLISHING')).toBe(true);
    expect(patterns.includes('POLISHING->VERIFYING')).toBe(true);
    expect(patterns.includes('VERIFYING->STORING')).toBe(true);
    expect(patterns.includes('STORING->EMITTED')).toBe(true);
  });

  it('THE MACHINE FAIL-STATES — the skip records SKIPPED; the compose failure records FAILED', async () => {
    const skipMachine = new StepXMachine();
    await skipMachine.drive(brokenInput(), fixtureBrain());
    expect(skipMachine.current).toBe('SKIPPED');

    const failMachine = new StepXMachine();
    const stalled: AetherBrain = { async compose() { throw new Error('stall'); } };
    await expectRejects(() => failMachine.drive(completeInput(), stalled), AETHER_COMPOSE_FAILED);
    expect(failMachine.current).toBe('FAILED');
  });

  it('THE STORE-BOUND RUN — the verdicts persist under the run_id (the real bun:sqlite handle, the §10.4 rows)', async () => {
    const db = new Database(':memory:') as unknown as AetherStoreDb;
    const r = await runStepX(completeInput(), fixtureBrain(), { store: db, runId: 'audit-stepx-1' });
    expect(r.ran).toBe(true);
    expect(r.report.includes('persisted')).toBe(true);
    const rows = await readVerdicts(db, 'audit-stepx-1');
    expect(rows.length).toBe(4);
    expect(rows.every((row) => row.verified === 1)).toBe(true);
    expect(rows.map((row) => row.finding_index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('THE STORE-BOUND RUN WITH A BAD CLAIM — the bad anchor persists verified=0, the rest 1 (the honest remainder)', async () => {
    const db = new Database(':memory:') as unknown as AetherStoreDb;
    await runStepX(completeInput(), fixtureBrain({ badAnchorOnIndex: 3 }), { store: db, runId: 'audit-stepx-2' });
    const rows = await readVerdicts(db, 'audit-stepx-2');
    expect(rows.filter((row) => row.verified === 0).map((row) => row.finding_index)).toEqual([3]);
    expect(rows.filter((row) => row.verified === 1).length).toBe(3);
  });

  it('THE STORE FAILURE DEGRADES — a broken handle → the report still emits, marked STORE_WRITE_FAILED (never a fake write)', async () => {
    const brokenStore = {
      exec() { throw new Error('disk full'); },
      prepare() { throw new Error('disk full'); },
      query() { throw new Error('disk full'); },
    } as unknown as AetherStoreDb;
    const r = await runStepX(completeInput(), fixtureBrain(), { store: brokenStore, runId: 'audit-stepx-3' });
    expect(r.ran).toBe(true);
    expect(r.report.includes('STORE_WRITE_FAILED')).toBe(true);
    expect(r.report.includes('NOT PERSISTED')).toBe(true);
  });

  it('THE STORE-ABSENT RUN — no handle → the honest "not persisted" note (the S-PB4 boundary stated, never hidden)', async () => {
    const r = await runStepX(completeInput(), fixtureBrain());
    expect(r.report.includes('NOT PERSISTED')).toBe(true);
  });

  it('THE ANCHOR RESOLVER — a real anchor resolves within scope; an escape + a ghost + a bad line all resolve ABSENT', () => {
    expect(anchorExistsWithinScope(root, 'src/bad.ts', 1)).toBe(true);
    expect(anchorExistsWithinScope(root, 'src/bad.ts', 3)).toBe(true);
    expect(anchorExistsWithinScope(root, '../../etc/passwd', 1)).toBe(false);   // the scope escape
    expect(anchorExistsWithinScope(root, 'src/ghost.ts', 1)).toBe(false);       // the ghost file
    expect(anchorExistsWithinScope(root, 'src/bad.ts', 9999)).toBe(false);      // the out-of-range line
    expect(anchorExistsWithinScope(root, 'src/bad.ts', 0)).toBe(false);         // the zero line
  });
});
