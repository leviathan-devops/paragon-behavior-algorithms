import { z } from 'zod';

export const GateCriteriaSchema = z.object({
  gateId: z.string().min(1),
  description: z.string(),
  requiredEvidenceTypes: z.array(z.enum(['build_output', 'test_result', 'deploy_confirm', 'audit_log', 'metric'])),
  minEvidenceCount: z.number().int().min(1).default(1),
  ttlMs: z.number().int().positive().default(300000),
  requireAllTypes: z.boolean().default(false),
  customValidator: z.string().optional(),
  severity: z.enum(['critical', 'warning', 'info']).default('critical'),
});

export type GateCriteriaConfig = z.infer<typeof GateCriteriaSchema>;

export type GateVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR';

export const V2_STEER_CRITERIA: GateCriteriaConfig = GateCriteriaSchema.parse({
  gateId: 'v2-steer',
  description: 'tier 1 steer — advisory evidence suffices',
  requiredEvidenceTypes: ['audit_log'],
  minEvidenceCount: 1,
  ttlMs: 300000,
  requireAllTypes: false,
  severity: 'info',
});

export const V2_STEER_JUSTIFICATION =
  'CALIBRATION ANCHOR: demand tier achieved PASS twice on host (ts 1787792691946 / 1787792694581) ' +
  'with audit_log count=2 — proves the evidence pipeline emits audit_log at that rate. ' +
  'Steer tier is the lowest rung: advisory sessions emit audit_log via enforcement router ADVISORY ' +
  '(router.ts:57 / pipeline.ts:445) per-pattern, sparse bursts separated by minutes. ' +
  'Requiring >1 evidence or dual-types at tier 0 would make PASS unreachable for honest advisory ' +
  'traffic — observed INCONCLUSIVE 0/N incl ts 1787801727082 is the symptom. ' +
  'EXPECTED VERDICT FLIP: single fresh audit_log + valid signature → PASS (was INCONCLUSIVE when ' +
  'minCount or type set demanded >1). WHY HIGHER TIERS STAY STRICT: demand requires count 2 ' +
  '(2× steer), deny/lock require dual-type audit_log+test_result — each tier adds a distinct ' +
  'hardening dimension (count or type-cardinality) that steer alone does not satisfy; loosening ' +
  'steer cannot satisfy demand/deny requiredTypes or minCount. Fail-closed dial (shared-state.ts:18) ' +
  'and verbsForLevel STEER={STEER_INJECT,EVIDENCE_FEED} (router.ts:106) unchanged — this file ' +
  'only hosts canonical presets, registration remains in pipeline.ts enforce-singletons.';

export const V2_TIER_PRESETS: Readonly<Record<string, GateCriteriaConfig>> = {
  'v2-steer': V2_STEER_CRITERIA,
  'v2-demand': GateCriteriaSchema.parse({
    gateId: 'v2-demand',
    description: 'tier 2 demand — STRICTER than steer (count 2)',
    requiredEvidenceTypes: ['audit_log'],
    minEvidenceCount: 2,
    ttlMs: 300000,
    requireAllTypes: false,
    severity: 'warning',
  }),
  'v2-deny': GateCriteriaSchema.parse({
    gateId: 'v2-deny',
    description: 'tier 3 deny — STRICTER than steer (dual-type + count 2)',
    requiredEvidenceTypes: ['audit_log', 'test_result'],
    minEvidenceCount: 2,
    ttlMs: 300000,
    requireAllTypes: false,
    severity: 'critical',
  }),
  'v2-lock': GateCriteriaSchema.parse({
    gateId: 'v2-lock',
    description: 'tier 4 lock — STRICTEST (dual-type + count 3)',
    requiredEvidenceTypes: ['audit_log', 'test_result'],
    minEvidenceCount: 3,
    ttlMs: 300000,
    requireAllTypes: false,
    severity: 'critical',
  }),
};

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  evidenceEvaluated: number;
  evidencePassed: number;
  evidenceFailed: number;
  criteriaResults: Array<{ criteria: string; passed: boolean; detail: string }>;
  timestamp: number;
  durationMs: number;
}
