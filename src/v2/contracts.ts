// src/v2/contracts.ts — the v2 event-aware capture system's shared type vocabulary
//
// Types-only file: zero logic beyond the PARAGON_TMP_DIR constant (spec §2.3 R8 —
// the evidence tree mirrors the wave manager's trident-tmp convention).
// Source of truth: STTGF_EVENT_AWARE_PARAGON_V2_L2_SPEC.md §2.1 (contracts block),
// §2.8 (EnforcementDirective), §2.9 (V2Level).
// EvidenceTriad is IMPORTED from ../lasme/contracts.js — never redefined
// (the single-source law; no-triad-no-record holds in v2 too, §2.1 line 170).

import { EvidenceTriad } from '../lasme/contracts.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ═══ THE WORKSPACE RESOLVER (HT-OPS-2 — the operator's directive 2026-08-23) ═══
// os.homedir() was the container-era assumption (/root uniform). Host reality:
// leviathan boots resolve /home/leviathan, root boots /root, arbitrary cwds land
// anywhere — and SPLIT TREES made cross-boot state look amnesiac (HT-BUG-4's
// other half). Resolution order: TRIDENT_WORKSPACE_ROOT env override > walk up
// from cwd until a directory literally named OPENCODE_WORKSPACE > probe known
// launch homes (existing-wins) > legacy homedir fallback.
function resolveOpenCodeWorkspace(): string {
  const envRoot = process.env.TRIDENT_WORKSPACE_ROOT;
  if (envRoot && envRoot.length > 0) return envRoot;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (path.basename(dir) === 'OPENCODE_WORKSPACE') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const probes = [
    process.env.HOME ? path.join(process.env.HOME, 'OPENCODE_WORKSPACE') : '',
    path.join(os.homedir(), 'OPENCODE_WORKSPACE'),
    '/root/OPENCODE_WORKSPACE',
  ].filter((s) => s.length > 0);
  for (const candidate of probes) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch { /* probe misses are expected */ }
  }
  return path.join(os.homedir(), 'OPENCODE_WORKSPACE');
}

export const OPENCODE_WORKSPACE_ROOT = resolveOpenCodeWorkspace();

export const PARAGON_TMP_DIR = path.join(OPENCODE_WORKSPACE_ROOT, 'trident-paragon-tmp');

export type V2Plane = 'reasoning' | 'text-think' | 'tool-cadence' | 'enforcement';
export type V2Level = 'OFF' | 'STEER' | 'FULL';

export type ViolationFamily = 'FORGERY_INTENT' | 'THEATRICAL_PLANNING' | 'DOUBT_HEDGE' | 'PERMISSION_GATE' | 'SCOPE_SHRINK' | 'TEST_EVASION';

export type PatternGroup = 'verb-frame' | 'claim-signal' | 'command-classifier' | 'trigger-lexicon';

export interface ClassifierInput {
  readonly text: string;
  readonly tool?: string;
  readonly args?: Record<string, unknown>;
  readonly sessionID?: string;
}

export interface ClassifierResult {
  readonly intent: string;
  readonly confidence: number;
  readonly action: 'allow' | 'block' | 'warn' | 'chain';
  readonly matchedFamilies: readonly string[];
  readonly evidence: string;
}

export interface FourBankPatternFamily {
  readonly group: PatternGroup;
  readonly descriptive: readonly RegExp[];
  readonly suggestive: readonly RegExp[];
  readonly substitute?: readonly RegExp[];
  readonly use?: readonly RegExp[];
}

export interface StreamSignal {
  readonly memberId: string;
  readonly plane: V2Plane;
  readonly excerpt: string;   // boundedSlice ≤200 chars
  readonly anchor: { readonly seq: number; readonly ts: number; readonly sessionID: string; readonly messageID?: string; readonly partID?: string };
  readonly weight: number;
}

export interface WeightedViolation extends StreamSignal {
  readonly family: ViolationFamily;
  readonly weight: number;
}

export interface MacroPatternHit {
  readonly patternId: 'DOUBT_THEN_OVERCLAIM' | 'FORGERY_AFTER_WARHEAD' | 'ESCALATING_INSISTENCE' | 'TEST_EVASION';
  readonly evidence: ReadonlyArray<WeightedViolation>;
  readonly windowSeq: number;
}

export type EnforcementVerb = 'TOOL_PREPEND' | 'STEER_INJECT' | 'EVIDENCE_FEED' | 'ADVISORY';

export interface EnforcementDirective {
  readonly verb: EnforcementVerb;
  readonly trigger: MacroPatternHit | WeightedViolation;
  readonly level: V2Level;
  readonly triad: EvidenceTriad;
  /** THE ESCALATION TIER (audit 2026-08-28, E-05): the message templates are
   * tier-proportional per the neural map's pinned strings — tier 0-1 STEER,
   * tier >=2 DEMAND. Optional for backward compat with existing constructors. */
  readonly tier?: number;
}
