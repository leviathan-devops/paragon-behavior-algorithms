// src/tests/naming-contract.test.ts — THE FAMILY-NAMING CONTRACT (the spec §2.10)
//
// THE LESSON THIS PIN LOCKS: the boilerplate extraction caught the neuron-key
// bug (the synapse neurons keyed by the member-id prefix, the thresholds keyed
// by a DIFFERENT name — the fusion never fired, and only a cross-domain
// fixture caught it). Trident routes by memberId.split('.')[0]
// (event-router.ts:136,175) into synapse neurons pre-created for the
// ViolationFamily union (synapse.ts:63,69). This pin makes that implicit
// naming agreement a REGRESSION TRIPWIRE: a future member with a mismatched
// prefix, or a renamed family, fails HERE instead of silently dead-ending a
// family's escalation path.

import { describe, expect, test } from 'bun:test';
import type { ViolationFamily } from '../v2/contracts.js';
import { V2Synapse, THR_V2_DEFAULTS } from '../v2/counters/synapse.js';
import { FORGERY_MEMBERS } from '../v2/lexicons/members/forgery-intent.js';
import { THEATRICAL_MEMBERS } from '../v2/lexicons/members/theatrical-planning.js';
import { DOUBT_HEDGE_MEMBERS } from '../v2/lexicons/members/doubt-hedge.js';
import { SCOPE_SHRINK_MEMBERS } from '../v2/lexicons/members/scope-shrink.js';
import { PERMISSION_GATE_MEMBERS } from '../v2/lexicons/members/permission-gate.js';
import { TEST_EVASION_MEMBERS } from '../v2/lexicons/members/test-evasion.js';
import type { WeightedViolation } from '../v2/contracts.js';

const FAMILIES: readonly ViolationFamily[] = [
  'FORGERY_INTENT', 'THEATRICAL_PLANNING', 'DOUBT_HEDGE',
  'PERMISSION_GATE', 'SCOPE_SHRINK', 'TEST_EVASION',
];

const ALL_MEMBERS = [
  ...FORGERY_MEMBERS, ...THEATRICAL_MEMBERS, ...DOUBT_HEDGE_MEMBERS,
  ...SCOPE_SHRINK_MEMBERS, ...PERMISSION_GATE_MEMBERS, ...TEST_EVASION_MEMBERS,
];

describe('THE FAMILY-NAMING CONTRACT (the spec §2.10)', () => {
  test('1. every member-id prefix is a registered ViolationFamily', () => {
    expect(ALL_MEMBERS.length).toBeGreaterThan(0);
    for (const m of ALL_MEMBERS) {
      const fam = m.id.split('.')[0] as ViolationFamily;
      expect(FAMILIES).toContain(fam);
    }
  });

  test('2. every ViolationFamily has a live synapse neuron + a fire threshold', () => {
    // The synapse pre-creates neurons for the family union (synapse.ts:69);
    // the defaults carry a finite fire threshold per family (synapse.ts:15).
    const s = new V2Synapse(THR_V2_DEFAULTS);
    for (const fam of FAMILIES) {
      const n = s.getNeuron(fam);
      expect(n).toBeDefined();
      expect(Number.isFinite(THR_V2_DEFAULTS.fire[fam])).toBe(true);
      expect(THR_V2_DEFAULTS.fire[fam]).toBeGreaterThan(0);
    }
  });

  test('3. a signal for EVERY member routes to a LIVE neuron (the end-to-end key)', () => {
    // THE LOAD-BEARING PIN: drives a violation for every registered member id
    // through the production routing (memberId.split('.')[0]) and asserts the
    // λ landed on a live neuron — the exact hole the trading domain fell into.
    const s = new V2Synapse(THR_V2_DEFAULTS);
    for (const m of ALL_MEMBERS) {
      const fam = m.id.split('.')[0] as ViolationFamily;
      const v: WeightedViolation = {
        memberId: m.id, family: fam, plane: 'reasoning',
        excerpt: 'naming-contract probe', weight: 0.5,
        anchor: { seq: 1, ts: Date.now(), sessionID: 'naming-contract' },
      } as unknown as WeightedViolation;
      s.accumulate(v, 1);
      const n = s.getNeuron(fam);
      expect(n).toBeDefined();
      expect(n!.value).toBeGreaterThan(0);   // the λ landed on the LIVE neuron
      expect(n!.isPrimed).toBe(true);
    }
  });
});
