export type EvidenceType = 'build_output' | 'test_result' | 'deploy_confirm' | 'audit_log' | 'metric';

export interface EvidenceRecord {
  id: string;
  gateId: string;
  operationId: string;
  type: EvidenceType;
  data: Record<string, unknown>;
  signature: string;
  timestamp: number;
  verified: boolean;
}

export interface EvidenceBundle {
  gateId: string;
  evidence: EvidenceRecord[];
  metadata: { collectedAt: number; source: string; operationId: string };
}

function sortedJson(data: Record<string, unknown>): string {
  const sorted = sortKeys(data);
  return JSON.stringify(sorted);
}

function sortKeys(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return (v as unknown[]).map(sortKeys);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
  return out;
}

export async function computeEvidenceSignature(data: Record<string, unknown>): Promise<string> {
  const payload = sortedJson(data);
  const enc = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function createEvidenceRecord(
  gateId: string,
  operationId: string,
  type: EvidenceType,
  data: Record<string, unknown>,
  signature: string,
): EvidenceRecord {
  return {
    id: crypto.randomUUID(),
    gateId,
    operationId,
    type,
    data,
    signature,
    timestamp: Date.now(),
    verified: false,
  };
}
