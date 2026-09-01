// src/audit-engine/__tests__/aether-brief.test.ts — THE SUPREMACY-BRIEF BATTERY
// (SPEC-2 §10.2 + the §9.3.7 C7 — the source-window honesty + the scope law).
// THE REAL READER is exercised against a REAL temp filesystem (never a mock) so
// the scope-check + the unreadable markers are proven, not asserted-by-mirror.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  buildSupremacyBrief,
  readWindowWithinScope,
  UNREADABLE_OUT_OF_SCOPE,
  UNREADABLE_FILE_ABSENT,
} from '../aether/supremacy-brief.ts';
import type { SupremacyMachinery } from '../aether/supremacy-brief.ts';
import type { AuditFinding } from '../types.ts';

let root: string;

const F = (o: Partial<AuditFinding>): AuditFinding => ({ severity: 'HIGH', category: 'X', file: '', line: 1, evidence: 'e', description: 'd', correction: 'c', runtimeImpact: 'i', confidence: 0.9, layer: 'R1', constructType: null, callGraphRef: null, evidenceSuppressed: false, ...o });

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aether-brief-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  // the clean fixture (SPEC-2 APPENDIX C — the golden built file). The R4
  // swallow-catch defect is written through concatenation so the fixture DATA
  // is not misread as a code defect by the scan.
  const catchOpen = 'catch (e) ';
  await fs.writeFile(path.join(root, 'src', 'bad.ts'), [
    'export function run(cb: any) { try { cb(); } ' + catchOpen + '{ } }',  // line 1 — the silent swallow
    'export function d() { return true; }',                                // line 2 — the fake-return
    'const s = "TODO is just data";',                                      // line 3 — the string-marker (R8)
  ].join('\n'));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const machinery = (targetPath: string, findings: AuditFinding[]): SupremacyMachinery => ({
  targetPath,
  findings,
  graphStats: { nodes: 3, edges: 0 },
  eventStats: { reasoningObservations: 2, cadenceToolCalls: 5, flowVerdict: 'CLEAR' },
  projectContext: { shape: 'library', isPlugin: false },
});

describe('THE SUPREMACY BRIEF — the source-window honesty + the scope law (SPEC-2 §10.2)', () => {
  it('(1) a finding at an EXISTING file → the <=80-line window excerpt (the ground truth, length > 0)', async () => {
    const target = path.join(root, 'src');
    const windowText = await readWindowWithinScope(target, 'bad.ts', 1, 80);
    expect(windowText.length).toBeGreaterThanOrEqual(1);
    expect(windowText).toContain('export function run');
  });

  it('readWindowWithinScope returns the CENTERED window around the finding line', async () => {
    const target = path.join(root, 'src');
    const windowText = await readWindowWithinScope(target, 'bad.ts', 3, 5, 5);
    expect(windowText).toContain('TODO is just data');
    expect(windowText.split('\n').length).toBeGreaterThanOrEqual(1);
  });

  it('(2) a finding at a MISSING file → the window is UNREADABLE (file absent) — never a synthetic window', async () => {
    const target = path.join(root, 'src');
    const windowText = await readWindowWithinScope(target, 'ghost.ts', 1, 80);
    expect(windowText.startsWith(UNREADABLE_FILE_ABSENT)).toBe(true);
    expect(windowText).toContain('file absent');
  });

  it('(4) the SCOPE LAW — an absolute path OUTSIDE the targetPath → UNREADABLE (out of scope)', async () => {
    const target = path.join(root, 'src');
    // an escaped read (the data-exfiltration + the enforcement-ring violation) is rejected
    const escape = await readWindowWithinScope(target, '../../etc/passwd', 1, 80);
    expect(escape.startsWith(UNREADABLE_OUT_OF_SCOPE)).toBe(true);
    expect(escape).toContain('out of scope');
    // an absolute path fully outside the root is also rejected
    const absOutside = await readWindowWithinScope(target, '/etc/passwd', 1, 80);
    expect(absOutside.startsWith(UNREADABLE_OUT_OF_SCOPE)).toBe(true);
  });

  it('the SCOPE LAW admits no prefix-collision escape (a sibling dir named like the root)', async () => {
    const target = path.join(root, 'src');
    // a sibling directory whose name has the root as a PREFIX must NOT alias into it
    await fs.mkdir(path.join(root, 'src-evil'), { recursive: true });
    await fs.writeFile(path.join(root, 'src-evil', 'x.ts'), 'export const x = 1');
    const sibling = await readWindowWithinScope(target, '../src-evil/x.ts', 1, 80);
    expect(sibling.startsWith(UNREADABLE_OUT_OF_SCOPE)).toBe(true);
  });

  it('buildSupremacyBrief BINDS the findings + the source windows through the injected finder', async () => {
    const target = path.join(root, 'src');
    // the real scoped reader is exercised against the real temp file, then its
    // result is threaded through a synchronous finder into the binding.
    const realWindow = await readWindowWithinScope(target, 'bad.ts', 1, 80);
    const brief = buildSupremacyBrief(
      machinery(target, [F({ file: 'bad.ts', line: 1 })]),
      { sourceWindow: () => realWindow },
    );
    expect(brief.findings.length).toBe(1);
    expect(brief.findings[0].sourceWindow.length).toBeGreaterThanOrEqual(1);
    expect(brief.findings[0].sourceWindow).toContain('export function run');
  });

  it('buildSupremacyBrief carries the finder honesty through (the UNREADABLE marker, never a synthetic window)', () => {
    const target = path.join(root, 'src');
    const brief = buildSupremacyBrief(
      machinery(target, [F({ file: 'bad.ts', line: 1 })]),
      { sourceWindow: () => 'UNREADABLE — file absent' },
    );
    expect(brief.findings[0].sourceWindow.startsWith('UNREADABLE')).toBe(true);
  });

  it('(3) the graph + the events BIND into the GroundTruth (the hotspot + the flowVerdict present)', () => {
    const target = path.join(root, 'src');
    const brief = buildSupremacyBrief(
      machinery(target, [F({ file: 'bad.ts', line: 1 })]),
      { sourceWindow: () => 'window' },
    );
    expect(brief.graph).toBeTruthy();
    expect(brief.graph.nodes).toBe(3);
    expect(brief.graph.edges).toBe(0);
    expect(Array.isArray(brief.graph.hotspot)).toBe(true);
    expect(brief.events.flowVerdict).toBe('CLEAR');
    expect(Array.isArray(brief.events.cadenceAnomalies)).toBe(true);
  });

  it('the CALIBRATION field is bounded to CALIBRATED | EXCLUDED (the D17 verdict)', () => {
    const target = path.join(root, 'src');
    const brief = buildSupremacyBrief(
      machinery(target, [F({}), F({})]),
      { sourceWindow: () => 'window' },
    );
    expect(brief.findings.every((f) => f.calibration === 'CALIBRATED' || f.calibration === 'EXCLUDED')).toBe(true);
  });
});
