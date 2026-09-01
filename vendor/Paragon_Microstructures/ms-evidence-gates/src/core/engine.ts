import { createHash } from 'node:crypto';
import type { ToolEvidenceRecord, GateResult, GateCriteria } from './types.js';
export type { ToolEvidenceRecord, GateResult, GateCriteria } from './types.js';

export function computeSignature(record: Omit<ToolEvidenceRecord, 'signature'> & { signature?: string }): string {
  const payload = JSON.stringify({ tool: record.tool, args: record.args, exitCode: record.exitCode, output: record.output, timestamp: record.timestamp, type: record.type });
  return createHash('sha256').update(payload).digest('hex');
}

export function createEvidenceRecord(tool: string, args: Record<string, unknown>, exitCode: number, output: string, timestamp?: number): ToolEvidenceRecord {
  const base = { type: 'tool_result' as const, tool, args, exitCode, output, timestamp: timestamp ?? Date.now() };
  const sig = computeSignature(base);
  return { ...base, signature: sig };
}

function verifySignature(ev: ToolEvidenceRecord): boolean {
  try {
    const expected = computeSignature(ev);
    return expected === ev.signature;
  } catch {
    return false;
  }
}

export function isGenuineCompliance(ev: ToolEvidenceRecord): boolean {
  if (ev.exitCode !== 0) return false;
  if (ev.type !== 'tool_result') return false;
  const hasArtifact = ev.output.includes('artifact') || ev.output.includes('results.json') || ev.output.includes('PASS') || ev.output.length > 50;
  return hasArtifact;
}

export function isMinimumCompliance(ev: ToolEvidenceRecord): boolean {
  return ev.type === 'tool_result' && ev.exitCode === 0;
}

export function evaluateCompliance(demandedTool: string, evidencePool: ToolEvidenceRecord[], freshnessWindowMs: number = 300000): GateResult {
  try {
    const pool = Array.isArray(evidencePool) ? evidencePool : [];
    const now = Date.now();
    const fresh = pool.filter((ev) => now - (ev.timestamp || 0) <= freshnessWindowMs);
    const matchingFresh = fresh.filter((ev) => ev.tool === demandedTool && ev.exitCode === 0);
    const hasMatchingFresh = matchingFresh.length >= 1;
    const freshnessPassed = hasMatchingFresh;
    const requiredTypesPassed = matchingFresh.length === 0 ? false : matchingFresh.every((ev) => ev.type === 'tool_result');
    const allTypesPassed = matchingFresh.length === 0 ? false : matchingFresh.every((ev) => ev.exitCode === 0);
    const sigPassed = matchingFresh.length === 0 ? false : matchingFresh.every((ev) => verifySignature(ev));
    const criteria: GateCriteria = {
      minEvidenceCount: hasMatchingFresh,
      freshness: freshnessPassed,
      requiredTypes: requiredTypesPassed,
      allTypes: allTypesPassed,
      signatureVerification: sigPassed,
    };
    const passCount = Object.values(criteria).filter(Boolean).length;
    let verdict: GateResult['verdict'];
    if (passCount === 5) verdict = 'PASS';
    else if (passCount >= 3) verdict = 'INCONCLUSIVE';
    else verdict = 'FAIL';
    return { verdict, criteria, poolSize: pool.length, totalFresh: fresh.length };
  } catch (err) {
    throw err;
  }
}
