/**
 * TimeWindowedGate — evidence filtering by recency window.
 *
 * Doctrine anchor: 02_STATE Appendix C (02_STATE:8133-8152) — TimeWindowedGate
 * with constructor(windowMs) and evaluate(evidence, requiredTypes) filtering
 * evidence by timestamp >= cutoff (now - windowMs).
 *
 * v2 mapping note (V2_CORRECTED_OVERHAUL_PLAN.md §3.5 / §7 honest remainder):
 * The doctrine uses wall-clock ms; the v2 escalation machine has no wall-clock
 * law and maps seq → window. This gate operates on wall-clock timestamps as
 * the substrate; the machine maps its seq-based complianceDeadlineSeq to the
 * window by converting seq ticks to windowMs at the call site. The mapping is
 * documented here per the plan so the window semantics remain doctrine-correct
 * while the machine's seq clock drives the evaluation trigger.
 */

import type { EvidenceRecord, EvidenceType } from './evidence-record.js';

export interface TimeWindowedGateResult {
  passed: boolean;
  windowed: EvidenceRecord[];
  missing: EvidenceType[];
}

export class TimeWindowedGate {
  private readonly windowMs: number;

  constructor(windowMs: number) {
    if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('TimeWindowedGate: windowMs must be a finite positive number');
    }
    this.windowMs = windowMs;
  }

  evaluate(evidence: EvidenceRecord[], requiredTypes: EvidenceType[]): TimeWindowedGateResult {
    if (!Array.isArray(requiredTypes)) {
      throw new Error('TimeWindowedGate: requiredTypes must be an array');
    }
    const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
    const now = Date.now();
    const cutoff = now - this.windowMs;

    const windowed: EvidenceRecord[] = [];
    for (const ev of safeEvidence) {
      if (!ev || typeof ev.timestamp !== 'number' || !Number.isFinite(ev.timestamp)) continue;
      if (ev.timestamp >= cutoff) windowed.push(ev);
    }

    const present = new Set<string>(windowed.map((e) => e.type));
    const missing: EvidenceType[] = [];
    for (const t of requiredTypes) {
      if (!present.has(t)) missing.push(t);
    }

    const passed = missing.length === 0;
    return { passed, windowed, missing };
  }

  getWindowMs(): number {
    return this.windowMs;
  }
}
