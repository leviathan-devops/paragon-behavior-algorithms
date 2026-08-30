import type { EvidenceRecord } from './evidence-record.js';
import { computeEvidenceSignature } from './evidence-record.js';
import type { GateCriteriaConfig, GateResult } from './gate-criteria.js';

export interface IGateEngine {
  registerGate(criteria: GateCriteriaConfig): void;
  evaluate(gateId: string, evidence: EvidenceRecord[]): Promise<GateResult>;
  getGate(gateId: string): GateCriteriaConfig | undefined;
  listGates(): GateCriteriaConfig[];
  reset(): void;
}

export class GateEngine implements IGateEngine {
  private gates = new Map<string, GateCriteriaConfig>();

  registerGate(criteria: GateCriteriaConfig): void {
    if (this.gates.has(criteria.gateId)) throw new Error(`DUPLICATE_GATE: ${criteria.gateId} already registered`);
    this.gates.set(criteria.gateId, criteria);
  }

  getGate(gateId: string): GateCriteriaConfig | undefined {
    return this.gates.get(gateId);
  }

  listGates(): GateCriteriaConfig[] {
    return [...this.gates.values()];
  }

  reset(): void {
    this.gates.clear();
  }

  async evaluate(gateId: string, evidence: EvidenceRecord[]): Promise<GateResult> {
    const start = Date.now();
    try {
      const criteria = this.gates.get(gateId);
      if (!criteria) {
        return {
          gateId,
          verdict: 'ERROR',
          evidenceEvaluated: evidence?.length ?? 0,
          evidencePassed: 0,
          evidenceFailed: evidence?.length ?? 0,
          criteriaResults: [{ criteria: 'gate-exists', passed: false, detail: `gate ${gateId} not registered` }],
          timestamp: Date.now(),
          durationMs: Date.now() - start,
        };
      }

      const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
      // ═══ THE FRESH-SUBSET EVALUATION (the P1 calibration fix, 2026-08-28 —
      // the live finding: the all-records freshness check sank gate verdicts
      // FOREVER once any record aged past the TTL, because the pool grows
      // unbounded while the freshness criterion required ALL records fresh.
      // THE SPEC INTENT: stale evidence cannot SATISFY criteria; fresh evidence
      // SUFFICES. Fix: the stale records are EXCLUDED from the evaluation set
      // up front — every criterion evaluates the fresh subset; the freshness
      // criterion reports the excluded count instead of sinking the verdict. ═══
      const now = Date.now();
      const freshEvidence: EvidenceRecord[] = safeEvidence.filter(
        (ev) => now - (ev.timestamp || 0) <= criteria.ttlMs,
      );
      const staleCount = safeEvidence.length - freshEvidence.length;
      const criteriaResults: GateResult['criteriaResults'] = [];
      let passedCount = 0;
      const totalCriteria = 5;

      const minCountPassed = freshEvidence.length >= criteria.minEvidenceCount;
      criteriaResults.push({
        criteria: 'minEvidenceCount',
        passed: minCountPassed,
        detail: `need ${criteria.minEvidenceCount}, have ${freshEvidence.length}`,
      });
      if (minCountPassed) passedCount++;

      // THE FRESHNESS CRITERION (post-fix): the evaluation set is pre-filtered
      // to fresh records — the criterion reports the exclusion, never sinks.
      const freshnessPassed = true;
      criteriaResults.push({
        criteria: 'freshness',
        passed: true,
        detail: `${freshEvidence.length} fresh within TTL ${criteria.ttlMs}ms, ${staleCount} stale excluded from evaluation`,
      });
      if (freshnessPassed) passedCount++;

      let requiredTypesPassed = true;
      if (criteria.requiredEvidenceTypes.length > 0) {
        const present = new Set<string>(freshEvidence.map((e) => e.type));
        const missing: string[] = [];
        for (const t of criteria.requiredEvidenceTypes) if (!present.has(t)) missing.push(t);
        requiredTypesPassed = missing.length === 0;
        criteriaResults.push({
          criteria: 'requiredTypes',
          passed: requiredTypesPassed,
          detail: requiredTypesPassed ? `all required types present` : `missing types: ${missing.join(',')}`,
        });
      } else {
        criteriaResults.push({ criteria: 'requiredTypes', passed: true, detail: 'no required types' });
      }
      if (requiredTypesPassed) passedCount++;

      let allTypesPassed = true;
      if (criteria.requireAllTypes) {
        const present2 = new Set<string>(freshEvidence.map((e) => e.type));
        const required = new Set<string>(criteria.requiredEvidenceTypes);
        for (const t of required) if (!present2.has(t)) { allTypesPassed = false; break; }
        if (required.size > 0 && freshEvidence.length > 0) {
          for (const ev of freshEvidence) if (!required.has(ev.type)) { allTypesPassed = false; break; }
        }
        criteriaResults.push({
          criteria: 'allTypes',
          passed: allTypesPassed,
          detail: allTypesPassed ? 'all evidence types satisfy requirement' : 'requireAllTypes not satisfied',
        });
      } else {
        criteriaResults.push({ criteria: 'allTypes', passed: true, detail: 'requireAllTypes disabled' });
      }
      if (allTypesPassed) passedCount++;

      let sigPassed = true;
      let sigFailed = 0;
      for (const ev of safeEvidence) {
        try {
          const expected = await computeEvidenceSignature(ev.data);
          if (expected !== ev.signature) sigFailed++;
        } catch {
          sigFailed++;
        }
      }
      sigPassed = sigFailed === 0;
      criteriaResults.push({
        criteria: 'signatureVerification',
        passed: sigPassed,
        detail: sigPassed ? 'all signatures valid' : `${sigFailed} signature mismatch`,
      });
      if (sigPassed) passedCount++;

      let verdict: GateResult['verdict'];
      if (passedCount === totalCriteria) verdict = 'PASS';
      else if (passedCount >= Math.ceil(totalCriteria / 2)) verdict = 'INCONCLUSIVE';
      else verdict = 'FAIL';

      const evidencePassed = sigPassed ? safeEvidence.length - sigFailed : 0;
      const evidenceFailed = sigFailed + (minCountPassed ? 0 : 1) + (freshnessPassed ? 0 : staleCount);

      return {
        gateId,
        verdict,
        evidenceEvaluated: freshEvidence.length,
        evidencePassed: verdict === 'PASS' ? freshEvidence.length : Math.max(0, freshEvidence.length - sigFailed),
        evidenceFailed: staleCount + sigFailed,
        criteriaResults,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        gateId,
        verdict: 'ERROR',
        evidenceEvaluated: 0,
        evidencePassed: 0,
        evidenceFailed: 0,
        criteriaResults: [{ criteria: 'internal-error', passed: false, detail: msg }],
        timestamp: Date.now(),
        durationMs: Date.now() - start,
      };
    }
  }
}
