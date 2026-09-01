import * as z from 'zod';
import type { GateCheck, GateResult, GraphifyGraph, SharedMemoryStore, SubagentSettlement, SubagentSpec } from '../types.js';
import { checkContract, InvariantDeath } from '../../audit-engine/math/contract.ts';

export interface AuditGateInput {
  readonly targetRoot: string;
  readonly specs?: string[];
  readonly specPaths?: string[];
}

export interface MpseConformance {
  readonly contractId: string;
  readonly specPath: string;
  readonly specLine: number;
  readonly specQuote: string;
  readonly implementationStatus: 'conformant' | 'violated' | 'unimplemented';
  readonly file?: string;
  readonly line?: number;
  readonly evidence?: string;
}

export interface MpseSubagentOutput {
  readonly conformances: MpseConformance[];
  readonly summary: string;
}

export const MpseConformanceSchema = z.object({
  contractId: z.string().min(1),
  specPath: z.string().min(1),
  specLine: z.number().int().positive(),
  specQuote: z.string().min(1),
  implementationStatus: z.enum(['conformant', 'violated', 'unimplemented']),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  evidence: z.string().optional(),
});

export const MpseSubagentOutputSchema = z.object({
  conformances: z.array(MpseConformanceSchema),
  summary: z.string().min(1),
});

export interface LasmeGateOutputShape {
  readonly gateName: string;
  readonly synthesis: {
    readonly candidates?: Array<{
      readonly layer?: string;
      readonly predicate?: string;
      readonly subject?: string;
      readonly object?: string;
      readonly file: string;
      readonly line: number;
      readonly evidence?: string;
    }>;
    readonly [k: string]: unknown;
  };
  readonly results?: unknown[];
  readonly telemetry?: unknown;
  readonly [k: string]: unknown;
}

export interface MpseConformanceRow {
  readonly contractId: string;
  readonly specPath: string;
  readonly specLine: number;
  readonly implementationStatus: 'conformant' | 'violated' | 'unimplemented';
  readonly verificationAgent: string;
  readonly lasmeShapeFound: boolean;
  readonly file?: string;
  readonly line?: number;
}

export interface MpseSynthesis {
  readonly conformanceMatrix: MpseConformanceRow[];
  readonly violations: MpseConformanceRow[];
  readonly traceGaps: MpseConformanceRow[];
}

const GRAPH_TOOLS_USAGE_LAW = `GRAPH TOOLS USAGE LAW:

You have access to graphify tools: graphify:query, graphify:path,
graphify:explain, graphify:subgraph. These query a knowledge graph
of the codebase built by tree-sitter AST parsing.

RULES:
1. ALWAYS query the graph BEFORE reading files directly. The graph
   gives you the structural overview; file reads give you the details.
2. Every edge in the graph carries a confidence tag:
   - EXTRACTED = the relationship is explicit in the source code
   - INFERRED = graphify derived it from resolution
   When citing evidence, prefer EXTRACTED edges. Flag INFERRED edges
   with [INFERRED] in your evidence field.
3. Use graphify:path to trace connections between concepts you find.
   This reveals impact chains that file reading alone cannot show.
4. Use graphify:subgraph with depth=3 around any finding to understand
   its blast radius (what it affects downstream).
5. The graph shows the FOREST. File reads show the TREES. Use both.
6. NEVER fabricate a graph node or edge. If the graph doesn't show a
   connection, report "no graph connection found" — never invent one.
7. Community labels in the graph show detected subsystems. Use these
   to understand architectural boundaries.
8. God nodes (highest degree) are potential single points of failure.
   Flag findings that involve god nodes with severity +1.`;

function formatLasmeContext(memory: SharedMemoryStore): string {
  try {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    if (lasmeOutput === null || lasmeOutput === undefined) return 'No LASME output available — this is the first gate or LASME has not yet completed.';
    const synth = lasmeOutput.synthesis as Record<string, unknown>;
    const candidates = (synth?.['candidates'] as unknown[]) ?? (lasmeOutput as unknown as { candidates?: unknown[] }).candidates ?? [];
    const verdicts = (synth?.['verdicts'] as unknown) ?? (lasmeOutput as unknown as { verdicts?: unknown }).verdicts ?? [];
    return `The LASME gate found these structural shapes at these sites:\n${JSON.stringify(candidates, null, 2)}\n\nThe aether adjudicated them as:\n${JSON.stringify(verdicts, null, 2)}\n\nCheck each against the spec contracts.`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `LASME context unavailable due to error: ${msg}`;
  }
}

function buildOutputContract(): string {
  return `OUTPUT CONTRACT (byte-explicit — your response MUST be valid JSON matching this zod schema):

\`\`\`json
{
  "conformances": [
    {
      "contractId": "string (required, non-empty)",
      "specPath": "string (required, file path of the spec clause)",
      "specLine": "number (required, positive int, line in spec)",
      "specQuote": "string (required, verbatim quote from spec)",
      "implementationStatus": "conformant | violated | unimplemented",
      "file": "string (optional, implementing file)",
      "line": "number (optional, positive int, implementing line)",
      "evidence": "string (optional, verbatim evidence quote)"
    }
  ],
  "summary": "string (required, 1+ chars, summary of findings)"
}
\`\`\`

Rules:
- implementationStatus MUST be exactly one of: conformant, violated, unimplemented
- Every declared contract MUST have exactly one conformance entry
- violated = implementation exists but does not satisfy the contract
- unimplemented = no implementation found (TRACE_GAP — include specPath+specLine+specQuote, omit file/line or set to expected site)
- conformant = implementation exists and satisfies contract (include file+line+evidence)
- Return ONLY the JSON object, no surrounding prose or markdown fences.`;
}

export const contractCheckerSpec: SubagentSpec<AuditGateInput, MpseSubagentOutput> = {
  id: 'contract-checker',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: [
    'trace contract.checkContract() call chains',
    'find function implementations matching spec declarations',
  ],
  outputSchema: MpseSubagentOutputSchema,
  buildSystemPrompt(input: AuditGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    const lasmeContext = formatLasmeContext(memory);
    const lasmeSummary = lasmeOutput !== null && lasmeOutput !== undefined ? `LASME candidates: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['candidates'] ?? [])} | verdicts: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['verdicts'] ?? [])}` : 'No LASME output';
    return `You are the CONTRACT-CHECKER — GRAPH TOOLS USAGE LAW applies — specialized MPSE contract verification agent.

YOUR MISSION: Verify each declared contract against code. Trace contract.checkContract() call chains. Find implementations matching spec declarations. For each contract, determine: conformant (implementation satisfies spec), violated (implementation contradicts spec), or unimplemented (no implementation found → TRACE_GAP).

TARGET: ${input.targetRoot}
SPECS: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}

CROSS-GATE INTELLIGENCE (LASME context — retrieved via const lasmeOutput = memory.getGateOutput('LASME') — you MUST cross-examine LASME findings against contracts):
${lasmeContext}

LASME raw (for correlation — lasmeShapeFound is determined by file+line match):
${lasmeSummary}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "trace contract.checkContract() call chains"
- "find function implementations matching spec declarations"

THEN VERIFY WITH FILE READS:
- Read each spec declaration to confirm contract text
- Read candidate implementations to verify conformance
- Check call chains: does contract checkContract() exist and is it invoked?

FOR EACH CONTRACT, RETURN a conformance entry with implementationStatus.

${buildOutputContract()}`;
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Verify contracts for target ${input.targetRoot}. Specs: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}. Trace each declared contract to its implementation. Return conformances[] + summary as JSON.`;
  },
};

export const oracleCheckerSpec: SubagentSpec<AuditGateInput, MpseSubagentOutput> = {
  id: 'oracle-checker',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: [
    'find Math.abs and comparison operators near threshold constants',
    'trace epsilon oracle patterns',
  ],
  outputSchema: MpseSubagentOutputSchema,
  buildSystemPrompt(input: AuditGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    const lasmeContext = formatLasmeContext(memory);
    const lasmeSummary = lasmeOutput !== null && lasmeOutput !== undefined ? `LASME candidates: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['candidates'] ?? [])} | verdicts: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['verdicts'] ?? [])}` : 'No LASME output';
    return `You are the ORACLE-CHECKER — GRAPH TOOLS USAGE LAW applies — specialized MPSE epsilon/oracle verification agent.

YOUR MISSION: For each numeric threshold in spec, verify epsilon bound is enforced in code. Look for Math.abs + comparison operators near contract calls. Threshold without epsilon guard is VIOLATION.

TARGET: ${input.targetRoot}
SPECS: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}

CROSS-GATE INTELLIGENCE (LASME context — retrieved via const lasmeOutput = memory.getGateOutput('LASME')):
${lasmeContext}

LASME raw:
${lasmeSummary}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "find Math.abs and comparison operators near threshold constants"
- "trace epsilon oracle patterns"

THEN VERIFY WITH FILE READS:
- Read each numeric threshold declaration in spec
- Grep for Math.abs, epsilon, tolerance, threshold near constants
- Verify each threshold has bounded comparison (e.g., Math.abs(a - b) < epsilon)

FOR EACH THRESHOLD CONTRACT, RETURN conformance:
- conformant = epsilon bound present and correctly enforced
- violated = threshold exists but epsilon guard missing or incorrect
- unimplemented = threshold clause has no code counterpart (TRACE_GAP)

${buildOutputContract()}`;
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Verify epsilon bounds for target ${input.targetRoot}. Specs: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}. Check each numeric threshold for Math.abs + epsilon enforcement. Return conformances[] + summary as JSON.`;
  },
};

export const stageCheckerSpec: SubagentSpec<AuditGateInput, MpseSubagentOutput> = {
  id: 'stage-checker',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: [
    'show function call chains with their pre/post conditions',
    'find stage gate violations',
  ],
  outputSchema: MpseSubagentOutputSchema,
  buildSystemPrompt(input: AuditGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    const lasmeContext = formatLasmeContext(memory);
    const lasmeSummary = lasmeOutput !== null && lasmeOutput !== undefined ? `LASME candidates: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['candidates'] ?? [])} | verdicts: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['verdicts'] ?? [])}` : 'No LASME output';
    return `You are the STAGE-CHECKER — GRAPH TOOLS USAGE LAW applies — specialized MPSE stage-gate verification agent.

YOUR MISSION: For each stage gate (pre/post/inv) in spec, verify stage is respected in call chain. Missing pre-condition check, skipped post-condition, or violated invariant = VIOLATION.

TARGET: ${input.targetRoot}
SPECS: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}

CROSS-GATE INTELLIGENCE (LASME context — retrieved via const lasmeOutput = memory.getGateOutput('LASME')):
${lasmeContext}

LASME raw:
${lasmeSummary}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "show function call chains with their pre/post conditions"
- "find stage gate violations"

THEN VERIFY WITH FILE READS:
- Read each stage gate declaration (pre/post/inv) from spec
- Trace call chain that should enforce gate
- Verify pre-conditions checked before call, post-conditions after, invariants held

FOR EACH STAGE CONTRACT, RETURN conformance:
- conformant = stage gate enforced in call chain
- violated = stage gate exists in spec but not enforced in code
- unimplemented = stage clause has no code path (TRACE_GAP)

${buildOutputContract()}`;
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Verify stage gates for target ${input.targetRoot}. Specs: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}. Check each pre/post/inv gate is respected in call chain. Return conformances[] + summary as JSON.`;
  },
};

export const provenanceCheckerSpec: SubagentSpec<AuditGateInput, MpseSubagentOutput> = {
  id: 'provenance-checker',
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
  graphQueries: [
    'path spec clause reference to code implementation',
    'find unreachable spec declarations',
  ],
  outputSchema: MpseSubagentOutputSchema,
  buildSystemPrompt(input: AuditGateInput, _graph: GraphifyGraph, memory: SharedMemoryStore): string {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    const lasmeContext = formatLasmeContext(memory);
    const lasmeSummary = lasmeOutput !== null && lasmeOutput !== undefined ? `LASME candidates: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['candidates'] ?? [])} | verdicts: ${JSON.stringify((lasmeOutput.synthesis as Record<string, unknown>)?.['verdicts'] ?? [])}` : 'No LASME output';
    return `You are the PROVENANCE-CHECKER — GRAPH TOOLS USAGE LAW applies — specialized MPSE provenance verification agent.

YOUR MISSION: For each spec clause, trace to code that implements it. Missing trace = TRACE_GAP finding (implementationStatus: unimplemented). Every spec clause MUST have provenance chain to code — if no code implements clause, emit unimplemented.

TARGET: ${input.targetRoot}
SPECS: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}

CROSS-GATE INTELLIGENCE (LASME context — retrieved via const lasmeOutput = memory.getGateOutput('LASME')):
${lasmeContext}

LASME raw:
${lasmeSummary}

${GRAPH_TOOLS_USAGE_LAW}

GRAPH QUERIES FOR THIS AGENT (run these first):
- "path spec clause reference to code implementation"
- "find unreachable spec declarations"

THEN VERIFY WITH FILE READS:
- Read each spec clause that cites file:line or code concept
- Use graphify:path to trace from spec clause reference to implementing code
- If no path exists, clause is unreachable → TRACE_GAP (unimplemented)

FOR EACH SPEC CLAUSE, RETURN conformance:
- conformant = spec clause traces to implementing code (include file+line+evidence)
- violated = code exists but diverges from spec clause intent
- unimplemented = no code traces to clause (TRACE_GAP — MUST include specPath+specLine+specQuote, explain missing site in evidence)

${buildOutputContract()}`;
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Verify provenance for target ${input.targetRoot}. Specs: ${JSON.stringify(input.specs ?? input.specPaths ?? [])}. Trace each spec clause to implementing code. Missing trace = TRACE_GAP. Return conformances[] + summary as JSON.`;
  },
};

export const mpseSubagentIds = ['contract-checker', 'oracle-checker', 'stage-checker', 'provenance-checker'] as const;

export const mpseSpecs: SubagentSpec<AuditGateInput, MpseSubagentOutput>[] = [
  contractCheckerSpec,
  oracleCheckerSpec,
  stageCheckerSpec,
  provenanceCheckerSpec,
];

export async function mpseSynthesize(
  results: SubagentSettlement<MpseSubagentOutput>[],
  _graph: GraphifyGraph,
  memory: SharedMemoryStore,
): Promise<MpseSynthesis> {
  let lasmeCandidates: Array<{ file: string; line: number }> = [];
  try {
    const lasmeOutput = memory.getGateOutput('LASME') as LasmeGateOutputShape | null;
    if (lasmeOutput !== null && lasmeOutput !== undefined) {
      const synth = lasmeOutput.synthesis as Record<string, unknown>;
      const rawCandidates = (synth?.['candidates'] as unknown[]) ?? (lasmeOutput as unknown as { candidates?: unknown[] }).candidates ?? [];
      if (Array.isArray(rawCandidates)) {
        lasmeCandidates = rawCandidates
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .filter((c) => typeof c['file'] === 'string' && typeof c['line'] === 'number')
          .map((c) => ({ file: c['file'] as string, line: c['line'] as number }));
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`MPSE_SYNTHESIZE_LASME_READ_FAILED: ${msg}`);
  }

  const conformanceMatrix: MpseConformanceRow[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled' || result.value === undefined || result.value === null) continue;
    const conformances = result.value.conformances ?? [];
    for (const c of conformances) {
      if (!c.contractId || !c.specPath || typeof c.specLine !== 'number') {
        throw new Error(`MPSE_SYNTHESIZE_INVALID_CONFORMANCE: missing contractId/specPath/specLine in ${JSON.stringify(c)}`);
      }
      const lasmeShapeFound = lasmeCandidates.some((lc) => lc.file === c.file && lc.line === c.line);
      const row: MpseConformanceRow = {
        contractId: c.contractId,
        specPath: c.specPath,
        specLine: c.specLine,
        implementationStatus: c.implementationStatus,
        verificationAgent: result.subagentId,
        lasmeShapeFound,
        ...(c.file !== undefined ? { file: c.file } : {}),
        ...(c.line !== undefined ? { line: c.line } : {}),
      };
      conformanceMatrix.push(row);
    }
  }

  const violations = conformanceMatrix.filter((m) => m.implementationStatus === 'violated');
  const traceGaps = conformanceMatrix.filter((m) => m.implementationStatus === 'unimplemented');
  {
    const invBindings = { profile: 'mpse-inv', values: { violationCount: violations.length, traceGapCount: traceGaps.length, matrixSize: conformanceMatrix.length, hasRows: conformanceMatrix.length > 0 } } as unknown as import('../../audit-engine/math/expr.ts').Bindings;
    const invContract = { id: 'mpse-invariant', preconditions: [], postconditions: [], invariants: [{ kind: 'ge' as const, l: { kind: 'var' as const, name: 'matrixSize' }, r: { kind: 'lit' as const, value: 0 } }], provenance: [] } as unknown as import('../../audit-engine/math/contract.ts').MathContract;
    const invCheck = checkContract(invContract, 'inv', invBindings);
    if (invCheck.verdict !== 'VALID') throw new InvariantDeath(invContract.id, invContract.invariants[0]!);
    void invCheck;
  }

  return { conformanceMatrix, violations, traceGaps };
}

export function createMpsePreGates(): GateCheck<AuditGateInput>[] {
  const lasmeGateExists: GateCheck<AuditGateInput> = {
    name: 'mpse-pre-lasme-output-exists',
    description: 'LASME gate output exists in memory',
    check: async (_target: AuditGateInput): Promise<GateResult> => {
      try {
        const mem = (_target as unknown as { memory?: SharedMemoryStore }).memory;
        if (mem !== undefined && mem !== null && typeof mem.getGateOutput === 'function') {
          const out = mem.getGateOutput('LASME');
          if (out !== null && out !== undefined) return { passed: true };
          return { passed: false, reason: 'MPSE_PRE_LASME_MISSING: LASME gate output not found in shared memory — run LASME before MPSE' };
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `MPSE_PRE_LASME_ERROR: ${msg}` };
      }
      return { passed: false, reason: 'MPSE_PRE_LASME_MISSING: LASME gate output not found in shared memory — cannot verify pre-gate without memory handle' };
    },
  };

  const specContractsParse: GateCheck<AuditGateInput> = {
    name: 'mpse-pre-spec-contracts-parse',
    description: 'Spec contracts parse — at least one declaration exists',
    check: async (target: AuditGateInput): Promise<GateResult> => {
      try {
        const specs = target.specs ?? target.specPaths ?? [];
        if (!Array.isArray(specs)) {
          return { passed: false, reason: 'MPSE_PRE_SPEC_INVALID: specs must be an array' };
        }
        if (specs.length === 0) {
          return { passed: false, reason: 'MPSE_PRE_SPEC_EMPTY: no spec contracts declared — at least 1 required' };
        }
        for (const s of specs) {
          if (typeof s !== 'string' || s.trim() === '') {
            return { passed: false, reason: `MPSE_PRE_SPEC_INVALID_ENTRY: spec entry must be non-empty string got=${JSON.stringify(s)}` };
          }
        }
        const allValid = specs.every((s) => typeof s === 'string' && s.trim().length > 0);
        if (!allValid) return { passed: false, reason: 'MPSE_PRE_SPEC_VALIDATION_FAILED: not all specs are valid non-empty strings' };
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `MPSE_PRE_SPEC_ERROR: ${msg}` };
      }
    },
  };

  return [lasmeGateExists, specContractsParse];
}

export function createMpsePostGates(): GateCheck<MpseSynthesis>[] {
  const conformanceComplete: GateCheck<MpseSynthesis> = {
    name: 'mpse-post-conformance-complete',
    description: 'Every declared contract has a conformance verdict',
    check: async (synthesis: MpseSynthesis): Promise<GateResult> => {
      try {
        if (synthesis === null || synthesis === undefined || !Array.isArray(synthesis.conformanceMatrix)) {
          return { passed: false, reason: 'MPSE_POST_MATRIX_MISSING: conformanceMatrix is not an array' };
        }
        if (synthesis.conformanceMatrix.length === 0) {
          return { passed: false, reason: 'MPSE_POST_CONFORMANCE_EMPTY: no conformance verdicts — every declared contract must have a verdict' };
        }
        for (const row of synthesis.conformanceMatrix) {
          if (!row.contractId || !row.specPath || typeof row.specLine !== 'number' || !row.implementationStatus) {
            return { passed: false, reason: `MPSE_POST_ROW_INCOMPLETE: row missing required fields: ${JSON.stringify(row)}` };
          }
          if (!['conformant', 'violated', 'unimplemented'].includes(row.implementationStatus)) {
            return { passed: false, reason: `MPSE_POST_ROW_BAD_STATUS: ${row.implementationStatus}` };
          }
        }
        const hasVerificationAgent = synthesis.conformanceMatrix.every((r) => typeof r.verificationAgent === 'string' && r.verificationAgent.length > 0);
        if (!hasVerificationAgent) return { passed: false, reason: 'MPSE_POST_MISSING_AGENT: every row must have verificationAgent' };
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `MPSE_POST_CONFORMANCE_ERROR: ${msg}` };
      }
    },
  };

  const traceGapsNamed: GateCheck<MpseSynthesis> = {
    name: 'mpse-post-trace-gaps-named',
    description: 'Every TRACE_GAP names the missing implementation site',
    check: async (synthesis: MpseSynthesis): Promise<GateResult> => {
      try {
        if (synthesis === null || synthesis === undefined || !Array.isArray(synthesis.traceGaps)) {
          return { passed: false, reason: 'MPSE_POST_TRACE_GAPS_MISSING: traceGaps is not an array' };
        }
        for (const gap of synthesis.traceGaps) {
          if (!gap.specPath || typeof gap.specLine !== 'number') {
            return { passed: false, reason: `MPSE_POST_TRACE_GAP_UNNAMED: trace gap missing spec reference: ${JSON.stringify(gap)}` };
          }
          if (!gap.contractId) {
            return { passed: false, reason: `MPSE_POST_TRACE_GAP_NO_CONTRACT: trace gap missing contractId: ${JSON.stringify(gap)}` };
          }
        }
        const gapsHaveSpecPaths = synthesis.traceGaps.every((g) => typeof g.specPath === 'string' && g.specPath.length > 0);
        if (!gapsHaveSpecPaths) return { passed: false, reason: 'MPSE_POST_TRACE_GAP_SPEC_PATH_CHECK: not all gaps have specPath' };
        return { passed: true };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { passed: false, reason: `MPSE_POST_TRACE_GAP_ERROR: ${msg}` };
      }
    },
  };

  return [conformanceComplete, traceGapsNamed];
}
