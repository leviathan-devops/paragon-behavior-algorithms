// @ts-nocheck
import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LayerEngine } from '../layer-engine.ts';
import { EvidenceGate } from '../evidence-gate.ts';
import { classifyProject } from '../code-classifier.ts';
import { R3_ASYNC_CORRECTNESS, SAFE_ASYNC_DEFAULTS } from '../layers/r3-async-correctness.ts';
import { R10_INVOCATION_INTEGRITY, FRAMEWORK_INVOKED } from '../layers/r10-invocation-integrity.ts';

async function runLayerOnFixture(fixtureName: string, layer: typeof R3_ASYNC_CORRECTNESS | typeof R10_INVOCATION_INTEGRITY) {
  const src = fs.readFileSync(path.join(import.meta.dir, 'fixtures/r3-r10', fixtureName), 'utf-8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-'));
  const filePath = path.join(tmp, fixtureName);
  fs.writeFileSync(filePath, src, 'utf-8');
  fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true, esModuleInterop: true } }), 'utf-8');
  const result = await classifyProject(tmp);
  const engine = new LayerEngine();
  engine.registerLayer(layer as never);
  const gate = new EvidenceGate({ typeCheckPassed: true, typeCheckError: null, buildPassed: true, buildError: null, distExists: true, distIsSingleFile: false, distSize: 1000, hasRelativeImports: false, sourceMapExists: true, findings: [] } as never, []);
  const ctx = { constructs: result.constructs, symbolTable: result.symbolTable, callGraph: result.callGraph, preflight: { typeCheckPassed: true, typeCheckError: null, buildPassed: true, buildError: null, distExists: true, distIsSingleFile: false, distSize: 1000, hasRelativeImports: false, sourceMapExists: true, findings: [] }, packageJson: null, tsconfig: null, opencodeJson: null, diagnostics: result.diagnostics, projectRoot: tmp, constructsByFile: result.constructsByFile, isSelfAudit: false, checker: result.checker } as never;
  const findings = await engine.evaluateAll(ctx, gate);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  return findings;
}

describe('R3/R10 rebuild — FORENSIC S2.3 + S2.7 fixture pairs', () => {
  it('R3 exports SAFE_ASYNC_DEFAULTS as named const with 5 members', () => {
    expect(Array.isArray([...SAFE_ASYNC_DEFAULTS])).toBe(true);
    expect([...SAFE_ASYNC_DEFAULTS]).toContain('tridentLog');
    expect([...SAFE_ASYNC_DEFAULTS]).toContain('console.log');
    expect(SAFE_ASYNC_DEFAULTS.length).toBe(5);
  });
  it('R10 exports FRAMEWORK_INVOKED as named const containing isRunning/isError + on/handle conventions', () => {
    expect([...FRAMEWORK_INVOKED]).toContain('isRunning');
    expect([...FRAMEWORK_INVOKED]).toContain('isError');
  });
  it('R3 VIOLATION r3-violation-floating MUST fire', async () => {
    const findings = await runLayerOnFixture('r3-violation-floating.ts', R3_ASYNC_CORRECTNESS);
    const r3 = findings.filter(f => f.layer === 'R3');
    expect(r3.length).toBeGreaterThanOrEqual(1);
  });
  it('R3 VIOLATION r3-violation-then MUST fire', async () => {
    const findings = await runLayerOnFixture('r3-violation-then.ts', R3_ASYNC_CORRECTNESS);
    const r3 = findings.filter(f => f.layer === 'R3');
    expect(r3.length).toBeGreaterThanOrEqual(1);
    expect(r3.some(f => f.evidence.includes('.then'))).toBe(true);
  });
  it('R3 GOLDEN r3-golden-tridentLog MUST stay silent', async () => {
    const findings = await runLayerOnFixture('r3-golden-tridentLog.ts', R3_ASYNC_CORRECTNESS);
    const r3 = findings.filter(f => f.layer === 'R3' && f.evidence.includes('tridentLog'));
    expect(r3.length).toBe(0);
  });
  it('R3 GOLDEN r3-golden-safeAsync MUST stay silent', async () => {
    const findings = await runLayerOnFixture('r3-golden-safeAsync.ts', R3_ASYNC_CORRECTNESS);
    const r3Floating = findings.filter(f => f.layer === 'R3' && (f.evidence.includes('fireAndForgetPersist') || f.evidence.includes('voidPersist')));
    expect(r3Floating.length).toBe(0);
  });
  it('R10 VIOLATION r10-violation-dead MUST fire', async () => {
    const findings = await runLayerOnFixture('r10-violation-dead.ts', R10_INVOCATION_INTEGRITY);
    const r10 = findings.filter(f => f.layer === 'R10' && f.category === 'INVOCATION_INTEGRITY');
    expect(r10.length).toBeGreaterThanOrEqual(1);
  });
  it('R10 VIOLATION r10-violation-second MUST fire', async () => {
    const findings = await runLayerOnFixture('r10-violation-second.ts', R10_INVOCATION_INTEGRITY);
    const r10 = findings.filter(f => f.layer === 'R10');
    expect(r10.length).toBeGreaterThanOrEqual(1);
  });
  it('R10 GOLDEN r10-golden-isRunning MUST stay silent', async () => {
    const findings = await runLayerOnFixture('r10-golden-isRunning.ts', R10_INVOCATION_INTEGRITY);
    const dead = findings.filter(f => f.layer === 'R10' && f.description.includes('isRunning') && f.description.includes('never called'));
    expect(dead.length).toBe(0);
  });
  it('R10 GOLDEN r10-golden-onHandle MUST stay silent', async () => {
    const findings = await runLayerOnFixture('r10-golden-onHandle.ts', R10_INVOCATION_INTEGRITY);
    const deadCheckDynamic = findings.filter(f => f.layer === 'R10' && f.evidence.includes('checkDynamicViaBracket'));
    expect(deadCheckDynamic.length).toBe(0);
    const deadOn = findings.filter(f => f.layer === 'R10' && f.evidence.includes('onUserLogin'));
    expect(deadOn.length).toBe(0);
    const deadHandle = findings.filter(f => f.layer === 'R10' && f.evidence.includes('handleRequest'));
    expect(deadHandle.length).toBe(0);
  });
});
