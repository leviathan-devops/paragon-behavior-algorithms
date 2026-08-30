import { createHash } from 'node:crypto';
import { computeEvidenceSignature, createEvidenceRecord } from './evidence-record.js';
import type { EvidenceRecord } from './evidence-record.js';

export interface StreamSignal {
  memberId?: string;
  family?: string;
  excerpt?: string;
  seq?: number;
  [k: string]: unknown;
}

export interface Directive {
  verb?: string;
  tier?: number;
  demand?: unknown;
  seq?: number;
  [k: string]: unknown;
}

export interface Demand {
  toolClass: string;
  toolPattern: RegExp;
}

export interface ObservedCall {
  tool: string;
  args: Record<string, unknown>;
  exitCode?: number;
}

type CollectorEntry = EvidenceRecord & { complianceVerified?: boolean };

function sortKeys(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return (v as unknown[]).map(sortKeys);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
  return out;
}

async function makeRecord(
  gateId: string,
  operationId: string,
  type: EvidenceRecord['type'],
  data: Record<string, unknown>,
): Promise<EvidenceRecord> {
  let sig: string;
  try {
    sig = await computeEvidenceSignature(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[V2ComplianceCollector] computeEvidenceSignature failed: ${msg}`);
    const payload = JSON.stringify(sortKeys(data));
    sig = createHash('sha256').update(payload).digest('hex');
  }
  try {
    return createEvidenceRecord(gateId, operationId, type, data, sig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[V2ComplianceCollector] createEvidenceRecord failed: ${msg}`);
    throw e;
  }
}

export class V2ComplianceCollector {
  private records: EvidenceRecord[] = [];
  private collectionId: string;

  // THE POOL PRUNE (R-6, 2026-08-28): the records[] array grew unbounded —
  // stale records don't affect the gate verdict (the fresh-subset evaluation
  // excludes them) but the memory grows over a long-running session. The pool
  // is pruned to the TTL window (2× the 300s gate TTL = 600s margin) after
  // every push — the pool is naturally bounded by the offense rate in a
  // 10-minute window.
  private static readonly POOL_TTL_MS = 600_000;

  constructor(collectionId = `v2-compliance-${Date.now()}`) {
    this.collectionId = collectionId;
  }

  private pruneStale(): void {
    const cutoff = Date.now() - V2ComplianceCollector.POOL_TTL_MS;
    if (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records = this.records.filter((r) => (r.timestamp || 0) >= cutoff);
    }
  }

  async recordOffense(signal: StreamSignal, seq: number): Promise<EvidenceRecord> {
    if (signal === null || signal === undefined || typeof signal !== 'object') {
      throw new Error('V2ComplianceCollector.recordOffense: signal is required');
    }
    if (!Number.isFinite(seq)) throw new Error('V2ComplianceCollector.recordOffense: seq must be finite');
    const data: Record<string, unknown> = {
      memberId: (signal as Record<string, unknown>).memberId ?? 'unknown',
      family: (signal as Record<string, unknown>).family ?? 'unknown',
      excerpt: (signal as Record<string, unknown>).excerpt ?? '',
      seq,
      kind: 'offense',
    };
    const rec = await makeRecord('v2-compliance', `${this.collectionId}::${seq}::offense`, 'audit_log', data);
    this.pruneStale();
    this.records.push(rec);
    return rec;
  }

  async recordDispatch(directive: Directive, seq: number): Promise<EvidenceRecord> {
    if (directive === null || directive === undefined || typeof directive !== 'object') {
      throw new Error('V2ComplianceCollector.recordDispatch: directive is required');
    }
    if (!Number.isFinite(seq)) throw new Error('V2ComplianceCollector.recordDispatch: seq must be finite');
    const data: Record<string, unknown> = {
      verb: (directive as Record<string, unknown>).verb ?? 'unknown',
      tier: (directive as Record<string, unknown>).tier ?? 0,
      demand: (directive as Record<string, unknown>).demand ?? null,
      seq,
      kind: 'dispatch',
    };
    const rec = await makeRecord('v2-compliance', `${this.collectionId}::${seq}::dispatch`, 'audit_log', data);
    this.pruneStale();
    this.records.push(rec);
    return rec;
  }

  async measureCompliance(
    demand: Demand,
    observedCalls: ObservedCall[],
  ): Promise<CollectorEntry> {
    if (!demand || typeof demand.toolClass !== 'string' || !(demand.toolPattern instanceof RegExp)) {
      throw new Error('V2ComplianceCollector.measureCompliance: demand must have toolClass string and toolPattern RegExp');
    }
    const calls: ObservedCall[] = Array.isArray(observedCalls) ? observedCalls : [];
    let complianceVerified = false;
    let matchedCall: ObservedCall | null = null;
    for (const c of calls) {
      if (!c || typeof c.tool !== 'string') continue;
      const toolMatch = demand.toolPattern.test(c.tool) || c.tool === demand.toolClass || c.tool.includes(demand.toolClass);
      if (!toolMatch) continue;
      const exitOk = c.exitCode === undefined || c.exitCode === null ? true : c.exitCode === 0;
      if (exitOk) {
        complianceVerified = true;
        matchedCall = c;
        break;
      }
    }
    const data: Record<string, unknown> = {
      demandedTool: demand.toolClass,
      demandedPattern: demand.toolPattern.source,
      observedCount: calls.length,
      matchedTool: matchedCall ? matchedCall.tool : null,
      exitOk: matchedCall ? (matchedCall.exitCode === undefined ? true : matchedCall.exitCode === 0) : false,
      verified: complianceVerified,
      kind: 'compliance',
    };
    const rec = await makeRecord('v2-compliance', `${this.collectionId}::compliance::${Date.now()}`, 'test_result', data);
    const out = Object.assign(rec, { complianceVerified }) as CollectorEntry;
    this.pruneStale();
    this.records.push(rec);
    return out;
  }

  getRecords(): EvidenceRecord[] {
    return [...this.records];
  }

  getCollectionId(): string {
    return this.collectionId;
  }

  clear(): void {
    this.records = [];
  }
}
