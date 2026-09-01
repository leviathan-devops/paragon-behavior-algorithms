// src/subagents/trident-bug-hunter/firewall/__tests__/bashclassify-probe.test.ts
// THE RUNTIME PROBE REGRESSION (2026-08-13 — the poseidon-container finding: the
// dispatched trident_bug_hunter subagent's `rm -rf /tmp/x` EXECUTED — the
// BASH_LOCKDOWN did not fire at runtime. This battery pins the classifier's
// behavior on the exact probe commands so the runtime gap is attributable: the
// classifier OR the R12 agent gate — never both unexamined.)

import { describe, it, expect } from 'bun:test';
import { classify } from '../readonly.ts';

describe('THE BASH_LOCKDOWN CLASSIFIER — the exact runtime probe commands', () => {
  it('BLOCKS rm -rf (the mutation family — the probe that EXECUTED at runtime)', () => {
    const d = classify('rm -rf /tmp/x');
    expect(d.verdict).toBe('BLOCKED');
    expect(d.message).toContain('code edits are not allowed. bash is ONLY granted for search and read capabilities.');
  });

  it('BLOCKS node -e (the execution family)', () => {
    const d = classify('node -e "console.log(1)"');
    expect(d.verdict).toBe('BLOCKED');
  });

  it('BLOCKS printf redirect (the mutation family)', () => {
    const d = classify('printf hi > /tmp/x');
    expect(d.verdict).toBe('BLOCKED');
  });

  it('ALLOWS cat (the read family)', () => {
    const d = classify('cat /workspace/fixture-profile/src/engine.ts');
    expect(d.verdict).toBe('ALLOW_READ');
  });

  it('ALLOWS git status (the read family)', () => {
    const d = classify('git status');
    expect(d.verdict).toBe('ALLOW_READ');
  });
});
