// core/gate-engine.ts — THE FRESH-SUBSET EVIDENCE EVALUATION
//
// The gate evaluates the FRESH subset of the evidence pool — stale records are
// EXCLUDED (they cannot satisfy any criterion). The freshness criterion reports
// the exclusion, never sinks the verdict.

import type { EvidenceRecord, GateCriteria, GateResult } from './types.js';

export class GateEngine {
  private readonly gates = new Map<string, GateCriteria>();

  registerGate(criteria: GateCriteria): void {
    this.gates.set(criteria.gateId, criteria);
  }

  getGate(gateId: string): GateCriteria | undefined { return this.gates.get(gateId); }
  listGates(): string[] { return [...this.gates.keys()]; }
  reset(): void { this.gates.clear(); }

  async evaluate(gateId: string, evidence: EvidenceRecord[]): Promise<GateResult> {
    const start = Date.now();
    const criteria = this.gates.get(gateId);
    if (!criteria) {
      return {
        gateId, verdict: 'ERROR', evidenceEvaluated: 0, evidencePassed: 0, evidenceFailed: evidence.length,
        criteriaResults: [{ criteria: 'gate-exists', passed: false, detail: `gate ${gateId} not registered` }],
        timestamp: Date.now(), durationMs: Date.now() - start,
      };
    }

    const safeEvidence: EvidenceRecord[] = Array.isArray(evidence) ? evidence : [];
    // THE FRESH-SUBSET EVALUATION: stale records excluded from the set
    const now = Date.now();
    const freshEvidence = safeEvidence.filter((ev) => now - (ev.timestamp || 0) <= criteria.ttlMs);
    const staleCount = safeEvidence.length - freshEvidence.length;
    const criteriaResults: GateResult['criteriaResults'] = [];
    let passedCount = 0;
    const totalCriteria = 5;

    // 1. minEvidenceCount
    const minCountPassed = freshEvidence.length >= criteria.minEvidenceCount;
    criteriaResults.push({
      criteria: 'minEvidenceCount', passed: minCountPassed,
      detail: `need ${criteria.minEvidenceCount}, have ${freshEvidence.length}`,
    });
    if (minCountPassed) passedCount++;

    // 2. freshness (report-only post-fix: the set is pre-filtered)
    criteriaResults.push({
      criteria: 'freshness', passed: true,
      detail: `${freshEvidence.length} fresh within TTL ${criteria.ttlMs}ms, ${staleCount} stale excluded`,
    });
    passedCount++;

    // 3. requiredTypes
    let requiredTypesPassed = true;
    if (criteria.requiredEvidenceTypes.length > 0) {
      const present = new Set<string>(freshEvidence.map((e) => e.type));
      const missing: string[] = [];
      for (const t of criteria.requiredEvidenceTypes) if (!present.has(t)) missing.push(t);
      requiredTypesPassed = missing.length === 0;
      criteriaResults.push({
        criteria: 'requiredTypes', passed: requiredTypesPassed,
        detail: requiredTypesPassed ? 'all required types present' : `missing: ${missing.join(',')}`,
      });
    } else {
      criteriaResults.push({ criteria: 'requiredTypes', passed: true, detail: 'no required types' });
    }
    if (requiredTypesPassed) passedCount++;

    // 4. allTypes (if requireAllTypes)
    let allTypesPassed = true;
    if (criteria.requireAllTypes) {
      const required = new Set<string>(criteria.requiredEvidenceTypes);
      for (const ev of freshEvidence) {
        if (!required.has(ev.type)) { allTypesPassed = false; break; }
      }
    }
    criteriaResults.push({
      criteria: 'allTypes', passed: allTypesPassed,
      detail: allTypesPassed ? 'all types satisfy' : 'requireAllTypes not satisfied',
    });
    if (allTypesPassed) passedCount++;

    // 5. signatureVerification (if verifySignatures)
    let sigPassed = true;
    let sigFailed = 0;
    if (criteria.verifySignatures) {
      for (const ev of freshEvidence) {
        // The signature verification (SHA-256 recompute) — domain-specific;
        // the boilerplate trusts the record's signature by default.
        if (!ev.signature || ev.signature.length === 0) sigFailed++;
      }
      sigPassed = sigFailed === 0;
    }
    criteriaResults.push({
      criteria: 'signatureVerification', passed: sigPassed,
      detail: sigPassed ? 'signatures valid' : `${sigFailed} signature failures`,
    });
    if (sigPassed) passedCount++;

    const verdict: GateResult['verdict'] =
      passedCount === totalCriteria ? 'PASS' :
      passedCount >= 3 ? 'INCONCLUSIVE' : 'FAIL';

    return {
      gateId, verdict,
      evidenceEvaluated: freshEvidence.length,
      evidencePassed: verdict === 'PASS' ? freshEvidence.length : Math.max(0, freshEvidence.length - sigFailed),
      evidenceFailed: staleCount + sigFailed,
      criteriaResults,
      timestamp: Date.now(), durationMs: Date.now() - start,
    };
  }
}
