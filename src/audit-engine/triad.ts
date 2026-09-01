// src/audit-engine/triad.ts
// THE EVIDENCE TRIAD (PARAGON_L2_BUILD_SPEC.md §4.3.2, STTGF §2.8, W0 contracts)
// Every finding/transition/directive carries the EVIDENCE TRIAD
// {Pattern, State, Evidence} — fired-without-triad THROWS (Law 2: NO-TRIPLET-NO-FINDING).
// Source: Manta contracts.ts §§25-47 / PARAGON_V1/src/lasme/contracts.ts (160 lines)
//         + Knuth KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/PARAGON_V1/src/lasme/contracts.ts
// This module is the SINGLE TYPE AUTHORITY for the triad shape — all consumers
// import from here, never redefine (the shape drift ban).

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PatternRef {
  readonly memberId: string;
  readonly familySeverity: Severity;
}

export interface StateRef {
  readonly machineId: string;
  readonly from: string;
  readonly to: string;
}

export interface EvidenceRef {
  readonly graphNodeId?: string;
  readonly file: string;
  readonly line: number;
}

export interface EvidenceTriad {
  readonly pattern: PatternRef;
  readonly state: StateRef;
  readonly evidence: EvidenceRef;
}

export function isEvidenceTriad(v: unknown): v is EvidenceTriad {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  const pat = t.pattern as Record<string, unknown> | undefined;
  const sta = t.state as Record<string, unknown> | undefined;
  const ev = t.evidence as Record<string, unknown> | undefined;
  if (!pat || typeof pat.memberId !== 'string' || pat.memberId.trim() === '') return false;
  if (!pat.familySeverity || typeof pat.familySeverity !== 'string') return false;
  if (!sta || typeof sta.machineId !== 'string' || sta.machineId.trim() === '') return false;
  if (typeof sta.from !== 'string' || typeof sta.to !== 'string') return false;
  if (!ev || typeof ev.file !== 'string' || ev.file.trim() === '') return false;
  if (typeof ev.line !== 'number' || !Number.isFinite(ev.line)) return false;
  return true;
}

export function assertEvidenceTriad(triad: unknown, anchor: string): asserts triad is EvidenceTriad {
  if (!isEvidenceTriad(triad)) {
    throw new Error(`FINDING_NO_TRIPLET: anchor=${anchor} — the EvidenceTriad {Pattern,State,Evidence} is mandatory (Law 2: no triplet = no finding)`);
  }
}
