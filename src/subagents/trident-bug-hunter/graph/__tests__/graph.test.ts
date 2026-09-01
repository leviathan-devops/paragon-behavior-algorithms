// src/subagents/trident-bug-hunter/graph/__tests__/graph.test.ts
// THE GRAPHADAPTER CONTRACT TESTS (W2) — the interface + the substrate
// selection + the named-error vocabulary (spec §3.2:629-656). The contract is
// the machine's boundary: the diagnostics engine, the query surface and the
// auditor consume ONLY this surface (C18.1) — a drift here poisons W4-W6.

import { describe, it, expect } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { ProjectProfileSchema, type ProjectProfile } from '../../../../shared/knowledge-graph/profile-schema.ts';
import {
  LINEAGES, selectAdapter,
  adapterFailed, adapterParseError, graphEmpty,
  GraphError, AdapterFailedError, AdapterParseError, GraphEmptyError,
} from '../interface.ts';
import { CorbellAdapter } from '../corbell-adapter.ts';
import { IxAdapter } from '../ix-adapter.ts';
import { NativeAstAdapter } from '../native-ast-adapter.ts';

export function minimalProfile(substrate: 'corbell' | 'ix' | 'native-ast' = 'corbell', root = path.join(os.tmpdir(), 'kg-bh-profile-root')): ProjectProfile {
  return ProjectProfileSchema.parse({
    project: { name: 'plutus-ts', root, languages: ['typescript'], entryPoints: ['src/index.ts'], build: 'bun build', test: 'bun test' },
    graph: { substrate, scope: ['src'], excludes: [] },
    rules: { corpus: ['MASTER_CONTEXT/SPEC.md'], bindings: {} },
    pipeline: { stages: [{ id: 'harvest', entry: 'harvestOrders', contract: 'the temporal filter' }] },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  });
}

describe('GraphAdapter contract (spec §3.2:629-656)', () => {
  it('selects the substrate from the profile (spec §3.2:634-637)', () => {
    expect(selectAdapter(minimalProfile('corbell')) instanceof CorbellAdapter).toBe(true);
    expect(selectAdapter(minimalProfile('ix')) instanceof IxAdapter).toBe(true);
    expect(selectAdapter(minimalProfile('native-ast')) instanceof NativeAstAdapter).toBe(true);
  });

  it('throws ADAPTER_FAILED for an unknown substrate (spec §3.2:638-641)', () => {
    const bad = minimalProfile('corbell');
    const poisoned = { ...bad, graph: { ...bad.graph, substrate: 'nope' as never } };
    expect(() => selectAdapter(poisoned)).toThrow(/ADAPTER_FAILED/);
  });

  it('carries the full lineage duality (R5.2, O28.4)', () => {
    expect(LINEAGES).toEqual(['SPEC_DERIVED', 'CODE_DERIVED', 'HYBRID']);
    for (const l of LINEAGES) {
      expect(typeof l).toBe('string');
    }
  });

  it('the named errors all carry their code (O32.1)', () => {
    const af = adapterFailed('corbell', 'boom');
    expect(af instanceof GraphError).toBe(true);
    expect(af instanceof AdapterFailedError).toBe(true);
    expect(af.message).toContain('ADAPTER_FAILED');
    expect(af.command).toBe('corbell');
    expect(af.detail).toBe('boom');

    const ap = adapterParseError('build stdout', 'no rows');
    expect(ap instanceof AdapterParseError).toBe(true);
    expect(ap.message).toContain('ADAPTER_PARSE_ERROR');
    expect(ap.section).toBe('build stdout');

    const ge = graphEmpty('zero nodes');
    expect(ge instanceof GraphEmptyError).toBe(true);
    expect(ge.message).toContain('GRAPH_EMPTY');
    expect(ge.detail).toBe('zero nodes');
  });

  it('the lineage is MANDATORY in the type — the store rejects a lineage-less node (O28.4)', () => {
    // a node whose lineage is not one of the three literals fails the type;
    // at runtime W1's writeGraph throws LINEAGE_MISSING (tested in the
    // sqlite-store suite). Here we pin the literals the type accepts.
    expect(LINEAGES.length).toBe(3);
    expect(LINEAGES).not.toContain('NOPE');
  });
});
