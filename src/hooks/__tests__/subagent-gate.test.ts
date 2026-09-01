// src/hooks/__tests__/subagent-gate.test.ts
// THE SUBAGENT-TYPE GATE BATTERY (2026-08-13 — the operator's directive: "ensure
// only auditor is poseidon gated and bug hunter is still available when poseidon
// is off — same scope as explore/build subagent gating between bug-hunter/auditor").
//
// THE CONTRACT: the machine's execution surface maps onto the EXISTING two-class
// gate — trident_bug_hunter = the READ-ONLY research class (always allowed, like
// trident_explore — the BASH_LOCKDOWN + REPORT_SCOPE enforce read-only by
// mechanism); trident_auditor = the FIX-SCOPED execution class (Poseidon-gated,
// like trident_build — the FIX_SCOPE locks its writes). The battery extracts the
// gate's type-classification from the source so the classification is TESTED, not
// assumed (the source is the ground truth for the gate's wiring).

import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const hooksPath = path.resolve(__dirname, '..', 'trident-hooks.ts');
const hooksSrc = fs.readFileSync(hooksPath, 'utf8');

/** THE GATE'S CLASSIFICATION — the two branches of the type check. */
const ALWAYS_ALLOWED = ['trident_explore', 'trident_bug_hunter'];
const POSEIDON_GATED = ['trident_build', 'trident_auditor'];

describe('THE SUBAGENT-TYPE GATE (the operator\'s explore/build parity for the machine surface)', () => {
  it('the source classifies the hunter with explore — the always-allowed branch', () => {
    for (const t of ALWAYS_ALLOWED) {
      expect(hooksSrc).toContain(`subagentType === '${t}'`);
    }
    // the always-allowed branch has NO poseidonState reference inside it
    const alwaysBranch = hooksSrc.slice(hooksSrc.indexOf('if (subagentType === \'trident_explore\''), hooksSrc.indexOf('} else if (subagentType === \'trident_build\''));
    expect(alwaysBranch).toContain('trident_bug_hunter');
    expect(alwaysBranch).not.toContain('poseidonState');
  });

  it('the source classifies the auditor with build — the POSEIDON-GATED branch', () => {
    for (const t of POSEIDON_GATED) {
      expect(hooksSrc).toContain(`subagentType === '${t}'`);
    }
    const gatedBranch = hooksSrc.slice(hooksSrc.indexOf('} else if (subagentType === \'trident_build\''), hooksSrc.indexOf('// TASK SUBAGENT GATE'));
    expect(gatedBranch).toContain('trident_auditor');
    expect(gatedBranch).toContain('poseidonState.isActive');
  });

  it('the gate throws the POSEIDON GATE for the gated class when Poseidon is off (the code path)', () => {
    expect(hooksSrc).toContain('[TRIDENT POSEIDON GATE]');
    // the auditor + the build share the SAME gate message (the operator's parity)
    expect(hooksSrc).toContain('trident_build/trident_auditor requires Poseidon Mode to be active');
  });

  it('the hunter is NOT in the Poseidon-gated branch — available when Poseidon is off (the operator\'s directive)', () => {
    const gatedBranch = hooksSrc.slice(hooksSrc.indexOf('} else if (subagentType === \'trident_build\''), hooksSrc.indexOf('// TASK SUBAGENT GATE'));
    expect(gatedBranch).not.toContain('trident_bug_hunter');
    // the always branch carries the hunter with NO gate
    const alwaysBranch = hooksSrc.slice(hooksSrc.indexOf('if (subagentType === \'trident_explore\''), hooksSrc.indexOf('} else if (subagentType === \'trident_build\''));
    expect(alwaysBranch).toContain('trident_bug_hunter');
    expect(alwaysBranch).not.toContain('poseidonState');
  });
});
