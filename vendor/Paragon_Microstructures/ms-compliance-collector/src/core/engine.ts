import { createHash } from 'node:crypto';
import type { ToolEvidenceRecord, OffenseRecord, DispatchRecord } from './types.js';
import { POOL_TTL_MS } from './types.js';

export type { ToolEvidenceRecord, OffenseRecord, DispatchRecord } from './types.js';
export { POOL_TTL_MS, GATE_TTL_MS } from './types.js';

function computeSignature(tool: string, args: Record<string, unknown>, exitCode: number, output: string): string {
  const payload = JSON.stringify({ tool, args, exitCode, output });
  return createHash('sha256').update(payload).digest('hex');
}

export function verifySignature(record: ToolEvidenceRecord): boolean {
  try {
    const expected = computeSignature(record.tool, record.args, record.exitCode, record.output);
    return expected === record.signature;
  } catch {
    return false;
  }
}

export class ComplianceCollector {
  private records: ToolEvidenceRecord[] = [];
  private offenses: OffenseRecord[] = [];
  private dispatches: DispatchRecord[] = [];

  private pruneStale(): void {
    try {
      const cutoff = Date.now() - POOL_TTL_MS;
      if (this.records.length > 0 && (this.records[0].timestamp ?? 0) < cutoff) {
        this.records = this.records.filter((r) => (r.timestamp ?? 0) >= cutoff);
      }
      if (this.offenses.length > 0 && (this.offenses[0].timestamp ?? 0) < cutoff) {
        this.offenses = this.offenses.filter((r) => (r.timestamp ?? 0) >= cutoff);
      }
      if (this.dispatches.length > 0 && (this.dispatches[0].timestamp ?? 0) < cutoff) {
        this.dispatches = this.dispatches.filter((r) => (r.timestamp ?? 0) >= cutoff);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ComplianceCollector] pruneStale failed: ${msg}`);
    }
  }

  recordOffense(layerId: string, violation: unknown): void {
    if (!layerId || typeof layerId !== 'string') {
      throw new Error('ComplianceCollector.recordOffense: layerId is required');
    }
    try {
      this.pruneStale();
      this.offenses.push({ layerId, violation, timestamp: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ComplianceCollector] recordOffense failed: ${msg}`);
      throw e;
    }
  }

  recordDispatch(layerId: string, tier: number, surface: string): void {
    if (!layerId || typeof layerId !== 'string') {
      throw new Error('ComplianceCollector.recordDispatch: layerId is required');
    }
    if (!Number.isFinite(tier)) {
      throw new Error('ComplianceCollector.recordDispatch: tier must be finite');
    }
    if (!surface || typeof surface !== 'string') {
      throw new Error('ComplianceCollector.recordDispatch: surface is required');
    }
    try {
      this.pruneStale();
      this.dispatches.push({ layerId, tier, surface, timestamp: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ComplianceCollector] recordDispatch failed: ${msg}`);
      throw e;
    }
  }

  measureCompliance(tool: string, args: Record<string, unknown>, exitCode: number, output: string): boolean {
    if (!tool || typeof tool !== 'string') {
      throw new Error('ComplianceCollector.measureCompliance: tool is required');
    }
    try {
      this.pruneStale();
      const signature = computeSignature(tool, args ?? {}, exitCode, output ?? '');
      const record: ToolEvidenceRecord = {
        type: 'tool_result',
        tool,
        args: args ?? {},
        exitCode,
        output: output ?? '',
        timestamp: Date.now(),
        signature,
      };
      this.records.push(record);
      return exitCode === 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ComplianceCollector] measureCompliance failed: ${msg}`);
      throw e;
    }
  }

  getRecords(): ToolEvidenceRecord[] {
    try {
      const cutoff = Date.now() - POOL_TTL_MS;
      return this.records.filter((r) => (r.timestamp ?? 0) >= cutoff).map((r) => ({ ...r }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ComplianceCollector] getRecords failed: ${msg}`);
      return [];
    }
  }

  getOffenses(): OffenseRecord[] {
    try {
      const cutoff = Date.now() - POOL_TTL_MS;
      return this.offenses.filter((r) => (r.timestamp ?? 0) >= cutoff).map((r) => ({ ...r }));
    } catch (e) {
      return [];
    }
  }

  getDispatches(): DispatchRecord[] {
    try {
      const cutoff = Date.now() - POOL_TTL_MS;
      return this.dispatches.filter((r) => (r.timestamp ?? 0) >= cutoff).map((r) => ({ ...r }));
    } catch (e) {
      return [];
    }
  }

  clear(): void {
    this.records = [];
    this.offenses = [];
    this.dispatches = [];
  }
}
