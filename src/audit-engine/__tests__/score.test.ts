import { describe, test, expect } from 'bun:test';
import { computeScore, ORACLE_SCORE_CONSTANTS } from '../scoring.ts';
import { EvidenceGate } from '../evidence-gate.ts';
import type { AuditFinding } from '../types.ts';

function mkPreflight(overrides: Partial<any> = {}): any {
  return {
    typeCheckPassed: true,
    typeCheckError: null,
    buildPassed: true,
    buildError: null,
    distExists: true,
    distIsSingleFile: true,
    distSize: 1024,
    hasRelativeImports: false,
    sourceMapExists: true,
    findings: [],
    ...overrides,
  };
}
function mkFinding(layer: string, confidence: number, file: string = 'src/audit-engine/scoring.ts', line: number = 1): AuditFinding {
  const absFile = file.startsWith('/') || file.startsWith('(') ? file : `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/${file}`;
  return {
    layer,
    severity: 'HIGH',
    category: 'TEST',
    file: absFile,
    line,
    evidence: `evidence for ${layer} at ${absFile}:${line}`,
    description: `dirty pattern ${layer}`,
    correction: 'fix it',
    runtimeImpact: 'impact',
    confidence,
    constructType: null,
    callGraphRef: null,
    evidenceSuppressed: false,
    triad: { pattern: { memberId: 'test', familySeverity: 'HIGH' }, state: { machineId: layer, from: 'ANALYZED', to: 'EVIDENCED' }, evidence: { file: absFile, line } },
  } as unknown as AuditFinding;
}
function gate(preflight: any = mkPreflight()) {
  return new EvidenceGate(preflight, [], []);
}
function layersStub() { return []; }

describe('score honesty — hydra-normalized density (Wave M §2.6)', () => {
  test('constants exist and have BECAUSE shape', () => {
    expect((ORACLE_SCORE_CONSTANTS as any).DENSITY_SCALE_IMMORTAL).toBe(30);
    expect((ORACLE_SCORE_CONSTANTS as any).DENSITY_SCALE_HYDRA).toBe(20);
    expect((ORACLE_SCORE_CONSTANTS as any).DENSITY_PENALTY_SCALE).toBeUndefined();
  });
  test('dirty fixture scores NOT-RUNTIME', () => {
    const preflight = mkPreflight();
    const findings: AuditFinding[] = [];
    for (let i = 0; i < 8; i++) findings.push(mkFinding('R2', 0.90, '(entire project)', i + 1));
    for (let i = 0; i < 4; i++) findings.push(mkFinding('R5', 0.95, '(entire project)', i + 10));
    for (let i = 0; i < 5; i++) findings.push(mkFinding('r-lexicon', 0.30, 'src/hydra/fixture.ts', i + 1));
    const ev = new EvidenceGate(preflight, [], findings);
    const result = computeScore(findings, ev, 10, 10, layersStub(), 80, 100, 80, true, false);
    expect(result.grade).toBe('NOT RUNTIME GRADE');
    expect(result.score).toBeLessThan(60);
  });
  test('clean fixture scores RUNTIME', () => {
    const preflight = mkPreflight();
    const findings: AuditFinding[] = [];
    for (let i = 0; i < 3; i++) findings.push(mkFinding('r-lexicon', 0.95, 'src/audit-engine/scoring.ts', i + 1));
    for (let i = 0; i < 2; i++) findings.push(mkFinding('r-actor', 0.90, 'src/audit-engine/scoring.ts', i + 10));
    const ev = new EvidenceGate(preflight, [], findings);
    const result = computeScore(findings, ev, 20, 20, layersStub(), 95, 100, 95, true, false);
    expect(result.grade).toBe('RUNTIME GRADE');
    expect(result.score).toBeGreaterThanOrEqual(95);
  });
  test('clean with zero findings scores RUNTIME', () => {
    const ev = gate();
    const result = computeScore([], ev, 15, 15, layersStub(), 90, 10, 9, true, false);
    expect(result.grade).toBe('RUNTIME GRADE');
    expect(result.score).toBeGreaterThanOrEqual(95);
  });
  test('empty/null boundary — filesScanned 0 is INCONCLUSIVE', () => {
    const ev = gate();
    const f = [mkFinding('R2', 0.9)];
    const r = computeScore(f, ev, 0, 0, layersStub(), 0, 0, 0, false, false);
    expect(r.grade).toBe('INCONCLUSIVE');
    expect(r.score).toBe(0);
  });
  test('boundary — single file high immortal density caps at 15', () => {
    const preflight = mkPreflight();
    const findings: AuditFinding[] = [];
    for (let i = 0; i < 20; i++) findings.push(mkFinding('R2', 0.90, 'src/audit-engine/scoring.ts', i + 1));
    const ev = new EvidenceGate(preflight, [], findings);
    const r1 = computeScore(findings, ev, 1, 1, layersStub(), 90, 10, 9, true, false);
    const r2 = computeScore(findings.slice(0, 10), ev, 1, 1, layersStub(), 90, 10, 9, true, false);
    expect(r1.score).toBe(r2.score);
  });
  test('concurrent — Promise.all preserves score determinism', async () => {
    const preflight = mkPreflight();
    const findings = [mkFinding('R2', 0.9, 'src/audit-engine/scoring.ts', 1), mkFinding('R3', 0.9, 'src/audit-engine/scoring.ts', 2)];
    const ev = new EvidenceGate(preflight, [], findings);
    const promises = Array.from({ length: 5 }, () => Promise.resolve(computeScore(findings, ev, 10, 10, layersStub(), 80, 10, 8, true, false)));
    const results = await Promise.all(promises);
    const scores = results.map(r => r.score);
    expect(new Set(scores).size).toBe(1);
  });
  test('hydra mass 0 with no hydra findings is treated as 1 (no hydra penalty)', () => {
    const preflight = mkPreflight();
    const findings = [mkFinding('R2', 0.9, 'src/audit-engine/scoring.ts', 1)];
    const ev = new EvidenceGate(preflight, [], findings);
    const r = computeScore(findings, ev, 10, 10, layersStub(), 90, 10, 9, true, false);
    expect(r.score).toBeGreaterThan(50);
  });
  test('formula mutation check — flipping penalty direction would break dirty/clean', () => {
    const preflight = mkPreflight();
    const dirty: AuditFinding[] = [];
    for (let i = 0; i < 8; i++) dirty.push(mkFinding('R2', 0.90, '(entire project)', i + 1));
    for (let i = 0; i < 4; i++) dirty.push(mkFinding('R5', 0.95, '(entire project)', i + 10));
    for (let i = 0; i < 5; i++) dirty.push(mkFinding('r-lexicon', 0.30, 'src/hydra/fixture.ts', i + 1));
    const evD = new EvidenceGate(preflight, [], dirty);
    const dirtyResult = computeScore(dirty, evD, 10, 10, layersStub(), 80, 100, 80, true, false);
    const cleanFindings: AuditFinding[] = [];
    for (let i = 0; i < 3; i++) cleanFindings.push(mkFinding('r-lexicon', 0.95, 'src/audit-engine/scoring.ts', i + 1));
    const evC = new EvidenceGate(preflight, [], cleanFindings);
    const cleanResult = computeScore(cleanFindings, evC, 20, 20, layersStub(), 95, 100, 95, true, false);
    expect(dirtyResult.score).toBeLessThan(cleanResult.score);
    expect(dirtyResult.grade).not.toBe(cleanResult.grade);
  });
});
