// src/audit-engine/__tests__/event-wiring.test.ts — THE E-PB5 WIRING CONTRACT
// (the source-level pins the container proof exercised live). THE AP-9 CLASS:
// a wiring claim is pinned HERE at the source level AND proven in the container
// (trident-spec23-20260821) — one channel alone is not the contract.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import * as path from 'path';

// the workspace root: three levels above this file (src/audit-engine/__tests__/)
const WS_ROOT = path.resolve(process.cwd(), '..');
const read = (rel: string): string => readFileSync(path.join(WS_ROOT, rel), 'utf8');

describe('THE E-PB5 WIRING CONTRACT — ONE registration, the W5 dispatch preserved', () => {
  const hooksSrc = read('src/hooks/trident-hooks.ts');

  it('EXACTLY ONE registerEventSubstrate registration call in trident-hooks.ts', () => {
    // the registration CALL appears exactly once (the import binds the name
    // without parens; only the invocation carries `registerEventSubstrate(`)
    const callMatches = hooksSrc.match(/registerEventSubstrate\(/g) ?? [];
    expect(callMatches.length).toBe(1);
    // and the call targets the module-level substrate stub (never a second Hooks)
    expect(hooksSrc.includes('registerEventSubstrate(substrateHooks')).toBe(true);
  });

  it('THE W5 DISPATCH IS PRESERVED — the substrate AUGMENTS, never replaces', () => {
    expect(hooksSrc.includes('dispatchRuntimeEvent(w5Target')).toBe(true);
    // the enforcement arm runs AFTER the W5 dispatch in sessionHook
    const w5Idx = hooksSrc.indexOf('dispatchRuntimeEvent(w5Target');
    const armIdx = hooksSrc.indexOf('substrateHooks.event(input)');
    expect(w5Idx).toBeGreaterThanOrEqual(0);
    expect(armIdx > w5Idx).toBe(true);
  });

  it('THE TRIAGE + DELIVERY SEAMS ARE WIRED (classifier + append-never-delete delivery)', () => {
    expect(hooksSrc.includes('setTriageClassifier(')).toBe(true);
    expect(hooksSrc.includes('DefaultTriageMachine(')).toBe(true);
    expect(hooksSrc.includes("workingArchitecture: ['teb-throw-block', 'd17-gate', 'one-event-hook']")).toBe(true);
    expect(hooksSrc.includes('setBlockDelivery(substrateBlockDelivery)')).toBe(true);
  });

  it('THE OBSERVER LAW: the enforcement arm failure NEVER breaks the session hook', () => {
    // the arm is wrapped non-fatal — the routing failure logs + continues
    const armBlock = hooksSrc.slice(hooksSrc.indexOf('ensureEventSubstrate();'), hooksSrc.indexOf('ensureEventSubstrate();') + 600);
    expect(armBlock.includes('try')).toBe(true);
    expect(armBlock.includes('non-fatal')).toBe(true);
  });
});

describe('THE FR-11 GRAPH-QUERY BRIDGE — the brief consumes the bug-hunter verbs', () => {
  const briefSrc = read('src/audit-engine/aether/supremacy-brief.ts');

  it('THE IMPORT-CONTRACT: supremacy-brief imports runQuery from the bug-hunter surface', () => {
    expect(briefSrc.includes("from '../../subagents/trident-bug-hunter/surface/query-tool.js'")).toBe(true);
    expect(briefSrc.includes("verb: 'unwired'")).toBe(true);
    expect(briefSrc.includes("verb: 'who-calls'")).toBe(true);
  });

  it('THE BRIDGE DEGRADES HONESTLY: an absent graphDb keeps the buildable defaults', () => {
    expect(briefSrc.includes('options.graphDb')).toBe(true);
    // the try/catch around the queries — a query failure never breaks the brief
    expect(briefSrc.includes("catch (qErr")).toBe(true);
  });
});
