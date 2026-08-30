// core/collector.ts — THE COMPLIANCE EVIDENCE POOL
//
// The pool that feeds the gates. Pruned by TTL (600s = 2× the 300s gate TTL).
// The pruneStale method fires after every push — the pool is naturally bounded
// by the offense rate in a 10-minute window.

import type { EvidenceRecord, ComplianceDemand, ObservedCall } from './types.js';
import { createHash, randomUUID } from 'node:crypto';

// ═══ THE TTL PRUNE (the production-hardening) ═══
const POOL_TTL_MS = 600_000;

function sortedJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function computeSignature(data: Record<string, unknown>): string {
  return createHash('sha256').update(sortedJson(data)).digest('hex');
}

function makeRecord(gateId: string, operationId: string,
  type: EvidenceRecord['type'], data: Record<string, unknown>): EvidenceRecord {
  const signature = computeSignature(data);
  return {
    id: randomUUID(), gateId, operationId, type, data,
    signature, timestamp: Date.now(), verified: false,
  };
}

export interface CollectorEntry {
  evidence: EvidenceRecord;
  complianceVerified: boolean;
}

export class ComplianceCollector {
  private records: EvidenceRecord[] = [];
  private collectionId: string;

  constructor(collectionId = `compliance-${Date.now()}`) {
    this.collectionId = collectionId;
  }

  private pruneStale(): void {
    const cutoff = Date.now() - POOL_TTL_MS;
    if (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records = this.records.filter((r) => (r.timestamp || 0) >= cutoff);
    }
  }

  async recordOffense(signal: { memberId?: string; family?: string; excerpt?: string },
    seq: number): Promise<EvidenceRecord> {
    if (signal === null || signal === undefined || typeof signal !== 'object') {
      throw new Error('ComplianceCollector.recordOffense: signal is required');
    }
    if (!Number.isFinite(seq)) throw new Error('ComplianceCollector.recordOffense: seq must be finite');
    const data: Record<string, unknown> = {
      memberId: signal.memberId ?? 'unknown',
      family: signal.family ?? 'unknown',
      excerpt: signal.excerpt ?? '',
      seq, kind: 'offense',
    };
    const rec = makeRecord('compliance', `${this.collectionId}::${seq}::offense`, 'audit_log', data);
    this.pruneStale();
    this.records.push(rec);
    return rec;
  }

  async recordDispatch(directive: { verb?: string; tier?: number },
    seq: number): Promise<EvidenceRecord> {
    if (directive === null || directive === undefined || typeof directive !== 'object') {
      throw new Error('ComplianceCollector.recordDispatch: directive is required');
    }
    const data: Record<string, unknown> = {
      verb: directive.verb ?? 'unknown',
      tier: directive.tier ?? 0,
      seq, kind: 'dispatch',
    };
    const rec = makeRecord('compliance', `${this.collectionId}::${seq}::dispatch`, 'audit_log', data);
    this.pruneStale();
    this.records.push(rec);
    return rec;
  }

  async measureCompliance(demand: ComplianceDemand, calls: ObservedCall[]): Promise<CollectorEntry> {
    if (!demand || typeof demand.toolClass !== 'string' || !(demand.toolPattern instanceof RegExp)) {
      throw new Error('ComplianceCollector.measureCompliance: demand must have toolClass and toolPattern');
    }
    const safeCalls: ObservedCall[] = Array.isArray(calls) ? calls : [];
    let complianceVerified = false;
    let matchedCall: ObservedCall | null = null;
    for (const c of safeCalls) {
      if (demand.toolPattern.test(c.tool) && c.exitCode === 0) {
        complianceVerified = true;
        matchedCall = c;
        break;
      }
    }
    const data: Record<string, unknown> = {
      demandedTool: demand.toolClass,
      observedCount: safeCalls.length,
      matchedTool: matchedCall?.tool ?? null,
      exitOk: safeCalls.every((c) => c.exitCode === 0),
      verified: complianceVerified,
      kind: 'compliance',
    };
    const rec = makeRecord('compliance', `${this.collectionId}::compliance::${Date.now()}`, 'test_result', data);
    this.pruneStale();
    this.records.push(rec);
    return { evidence: rec, complianceVerified };
  }

  getRecords(): EvidenceRecord[] { return [...this.records]; }
  clear(): void { this.records.length = 0; }
}
