// src/subagents/trident-auditor/firewall/__tests__/fix-scope.test.ts
// THE FIX-SCOPE PROOF-CASE BATTERY (W9, spec §6.2:2663-2683 + §7.4.3:3522-3532).
//
// The transcribed pseudocode: the declared-file allow, the undeclared-file
// block (the EXACT message), the stale-declaration block. Plus the adversarial
// extensions mandated by §7.7 (the hostile cases ≥ 3): the empty target, the
// SPEC_DERIVED node block, the phantom-path block (a declared file absent from
// the current graph), the fail-closed unknown, the enforce-hook throw, the MPSE
// triplet on EVERY decision (no triplet = no decision).

import { describe, it, expect } from 'bun:test';
import { classify, enforceFixScope, fixScopeError, FIX_SCOPE_ERROR_BASE, normalizeFixTarget } from '../fix-scope.ts';

const declared = ['src/engine3/visual-setup-generator.ts', 'src/mdve/shape-brain.ts'];   // from report_sections.what_to_do

describe('FIX_SCOPE_LEXICON', () => {
  it('allows a write to a declared fix file (spec §6.2:2668-2671)', () => {
    const d = classify({ file: 'src/engine3/visual-setup-generator.ts' }, declared);
    expect(d.state).toBe('ALLOW_FIX');
    expect(d.verdict).toBe('ALLOW_FIX');
    expect(d.triplet.Pattern).toBe('FIX_SCOPE_DECLARED');       // the MPSE rides the ALLOW
    expect(d.triplet.State).toBe('PARSED->ALLOW_FIX');
    expect(d.triplet.Evidence).toContain('src/engine3/visual-setup-generator.ts');
    expect(d.message).toBe('');                                  // no error on the pure allow
  });

  it('allows a write to a declared fix file carrying a :line anchor (the file is stripped)', () => {
    const d = classify({ file: 'src/mdve/shape-brain.ts:1557' }, declared);
    expect(d.state).toBe('ALLOW_FIX');
    expect(normalizeFixTarget('src/mdve/shape-brain.ts:1557')).toBe('src/mdve/shape-brain.ts');
  });

  it('blocks every undeclared file — the EXACT message (spec §6.2:2672-2676)', () => {
    const d = classify({ file: 'src/orchestrator.ts' }, declared);
    expect(d.state).toBe('BLOCKED');
    expect(d.verdict).toBe('BLOCKED');
    expect(d.message).toContain("fixes are ONLY allowed to the report's declared fix files");
    expect(d.triplet.Pattern).toBe('FIX_SCOPE_BLOCKED');        // the MPSE rides the BLOCK
    expect(d.triplet.State).toBe('PARSED->BLOCKED');
    expect(d.triplet.Evidence).toContain('src/orchestrator.ts');
  });

  it('blocks a stale declaration — the file moved/renamed since the hunt (G22.4, §6.2:2677-2681)', () => {
    // the declared file does not exist on the current graph → the current-graph
    // resolution fails → BLOCKED (a fix to a phantom path is the G14.2 class)
    const d = classify({ file: 'src/engine3/visual-setup-generator.ts' }, declared, { graphExists: false });
    expect(d.state).toBe('BLOCKED');
    expect(d.message).toContain(FIX_SCOPE_ERROR_BASE);
  });

  it('blocks a declared file absent from the CURRENT graph node set (the phantom path)', () => {
    // the file is DECLARED but the current graph has no CODE_DERIVED node for it
    const d = classify({ file: 'src/engine3/visual-setup-generator.ts' }, declared, {
      graph: { nodes: [{ file: 'src/mdve/shape-brain.ts', lineage: 'CODE_DERIVED' }] },
    });
    expect(d.state).toBe('BLOCKED');
    expect(d.message).toContain('does not exist on the current graph');
  });

  it('blocks a SPEC_DERIVED node — the declared architecture is not fixable (§7.4.3:5)', () => {
    const d = classify({ file: 'MASTER_CONTEXT/PLUTUS_ARCHITECTURE_BIBLE_4.0.md' }, ['MASTER_CONTEXT/PLUTUS_ARCHITECTURE_BIBLE_4.0.md'], {
      graph: { nodes: [{ file: 'MASTER_CONTEXT/PLUTUS_ARCHITECTURE_BIBLE_4.0.md', lineage: 'SPEC_DERIVED' }] },
    });
    expect(d.state).toBe('BLOCKED');
    expect(d.message).toContain('SPEC_DERIVED');
  });

  it('allows a declared file present in the current graph as CODE_DERIVED (the current-graph resolution passes)', () => {
    const d = classify({ file: 'src/mdve/shape-brain.ts' }, declared, {
      graph: { nodes: [{ file: 'src/mdve/shape-brain.ts', lineage: 'CODE_DERIVED' }] },
    });
    expect(d.state).toBe('ALLOW_FIX');
  });

  it('does NOT match a SPEC_DERIVED node against the code file set (the forward-map trap)', () => {
    // a SPEC_DERIVED node carries a corpus anchor in `file` — a naive string
    // match would false-positive; the graph resolver EXCLUDES SPEC_DERIVED from
    // the code-node match, so a declared code file with only a SPEC_DERIVED
    // "same file string" node is still a stale/architecture block.
    const d = classify({ file: 'src/engine.ts' }, ['src/engine.ts'], {
      graph: { nodes: [{ file: 'src/engine.ts', lineage: 'SPEC_DERIVED' }] },
    });
    expect(d.state).toBe('BLOCKED');
  });

  it('the enforce hook THROWS the exact named error on a blocked write (no write path)', () => {
    let threw: Error | null = null;
    try {
      enforceFixScope({ file: 'src/orchestrator.ts' }, declared);
    } catch (e: unknown) {
      console.warn('[fix-scope.test] enforceFixScope threw (expected): ' + String(e));
      threw = e as Error;
    }
    expect(threw).not.toBe(null);
    expect(threw!.message).toContain(FIX_SCOPE_ERROR_BASE);
  });

  it('the enforce hook returns the decision on an allowed write', () => {
    const d = enforceFixScope({ file: 'src/engine3/visual-setup-generator.ts' }, declared);
    expect(d.state).toBe('ALLOW_FIX');
  });

  it('the error interpolates the allowed list at the block time (§7.4.1:3492)', () => {
    expect(fixScopeError(declared)).toBe(`${FIX_SCOPE_ERROR_BASE}: src/engine3/visual-setup-generator.ts, src/mdve/shape-brain.ts`);
  });

  it('the empty target is fail-closed — BLOCKED, never ALLOWed (O28.1)', () => {
    const d = classify({ file: '' }, declared);
    expect(d.state).toBe('BLOCKED');
    expect(d.triplet.Pattern).toBe('FIX_SCOPE_BLOCKED');
  });

  it('an undeclared file with a :line anchor is still undeclared (the strip is declared-set comparison, not a bypass)', () => {
    const d = classify({ file: 'src/orchestrator.ts:10-20' }, declared);
    expect(d.state).toBe('BLOCKED');
    expect(d.message).toContain(FIX_SCOPE_ERROR_BASE);
  });

  it('the MPSE triplet is present on EVERY decision — no triplet = no decision', () => {
    for (const [file, expectState] of [
      ['src/engine3/visual-setup-generator.ts', 'ALLOW_FIX'],
      ['src/other.ts', 'BLOCKED'],
    ] as const) {
      const d = classify({ file }, declared);
      expect(d.triplet.Pattern.length).toBeGreaterThanOrEqual(1);
      expect(d.triplet.State).toContain(expectState);
      expect(d.triplet.Evidence.length).toBeGreaterThanOrEqual(1);
      expect(d.mPSE).toEqual(d.triplet);
    }
  });
});
