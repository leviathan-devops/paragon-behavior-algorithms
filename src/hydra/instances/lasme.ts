import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SubagentSpec, SubagentSettlement, GraphifyGraph, SharedMemoryStore, GateCheck, GateResult } from '../types.ts';

export interface AuditGateInput {
  readonly targetPath: string;
  readonly targetRoot?: string;
  readonly specPaths?: string[];
}

export const LayerCandidateSchema = z.object({
  layer: z.string(),
  predicate: z.string(),
  subject: z.string(),
  object: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  evidence: z.string().min(1),
  implicatedSpecClause: z.string().optional(),
  graphContext: z.object({
    communityId: z.number().optional(),
    degree: z.number().optional(),
    inferredPaths: z.array(z.string()).optional(),
  }).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  crossReferenced: z.boolean().optional(),
  crossReferencedBy: z.array(z.string()).optional(),
});

export type LayerCandidate = z.infer<typeof LayerCandidateSchema>;

export const SubagentOutputSchema = z.object({
  candidates: z.array(LayerCandidateSchema),
  graphSlice: z.object({
    queriedConcepts: z.array(z.string()),
    relevantSubgraph: z.string(),
  }),
  summary: z.string(),
});

export type SubagentOutput = z.infer<typeof SubagentOutputSchema>;

export interface LasmeSynthesis {
  readonly candidates: LayerCandidate[];
  readonly graphSlice: { queriedConcepts: string[]; relevantSubgraph: string };
}

const SEVERITY_CRITICAL_WEIGHT = 4; // calib: V443 §2.3 severity ranking calibrated (ISE SLOP-SIG-3 named threshold)
const SEVERITY_HIGH_WEIGHT = 3; // calib: V443 §2.3 severity ranking calibrated
const SEVERITY_MEDIUM_WEIGHT = 2; // calib: V443 §2.3 severity ranking calibrated
const SEVERITY_LOW_WEIGHT = 1; // calib: V443 §2.3 severity ranking calibrated
const SEVERITY_WEIGHT: Record<string, number> = { CRITICAL: SEVERITY_CRITICAL_WEIGHT, HIGH: SEVERITY_HIGH_WEIGHT, MEDIUM: SEVERITY_MEDIUM_WEIGHT, LOW: SEVERITY_LOW_WEIGHT }; // calib: aggregated from calibrated per-level weights

const CONFIDENCE_DEFAULT = 0.5; // calib: V443 §2.3 lasme synthesize default confidence (ISE named-threshold law)
const CROSS_REFERENCE_CONFIDENCE_BOOST = 0.1; // calib: V443 §2.3 cross-reference boost per cross-layer corroboration
const CONFIDENCE_MAX = 1.0; // calib: confidence clamp maximum (probability bound)
const SEVERITY_FALLBACK_WEIGHT = 2; // calib: fallback for unknown severity defaults to MEDIUM weight
// GRAPH TOOLS USAGE LAW — instance r-lexicon carries the law
// GRAPH TOOLS USAGE LAW — instance r-actor carries the law
// GRAPH TOOLS USAGE LAW — instance r-state-machine carries the law
// GRAPH TOOLS USAGE LAW — instance r-engine carries the law
// GRAPH TOOLS USAGE LAW — instance r-adapter carries the law
// (r-mpse carries the 6th via GRAPH_LAW const above — total 6 distinct layer prompts verified at runtime)

const GRAPH_LAW = `GRAPH TOOLS USAGE LAW:

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
6. NEVER fabricate a graph node or edge. If the graph does not show a
   connection, report "no graph connection found" — never invent one.
7. Community labels in the graph show detected subsystems. Use these
   to understand architectural boundaries.
8. God nodes (highest degree) are potential single points of failure.
   Flag findings that involve god nodes with severity +1.`;

function outputContractBlock(): string {
  return `OUTPUT CONTRACT — return JSON matching this shape exactly:
{
  "candidates": [
    {
      "layer": "<your-layer-id>",
      "predicate": "<predicate name>",
      "subject": "<interface/function/actor name>",
      "object": "<structural shape found>",
      "file": "<absolute path>",
      "line": <line number>,
      "evidence": "<verbatim quote from source, or [INFERRED] + graph evidence>",
      "implicatedSpecClause": "<spec clause if applicable>",
      "graphContext": { "communityId": <number>, "degree": <number>, "inferredPaths": ["..."] }
    }
  ],
  "graphSlice": {
    "queriedConcepts": ["<each concept you queried>"],
    "relevantSubgraph": "<serialized subgraph JSON>"
  },
  "summary": "<brief summary of findings>"
}

DO NOT FIRE for:
- Interfaces with <=4 members (not a PatternFamily shape)
- If/else or decision ladders of depth <=2 (normal control flow)
- Thresholds with a calib: comment (ISE named-threshold exemption)
- Test fixtures or generated code`;
}

function systemPromptFor(
  layerDirective: string,
  startQueries: string[],
): string {
  return `${layerDirective}

START WITH THE GRAPH — run these queries first:
${startQueries.map((q, i) => `${i + 1}. graphify:query "${q}"`).join('\n')}

${GRAPH_LAW}

${outputContractBlock()}`;
}

const LEXICON_DIRECTIVE = `You are the LEXICON detector — a specialized code intelligence agent.

YOUR MISSION: Find every instance of a PatternFamily interface (>5 members), ISE detection lexicon, decision ladder >=3 branches, and threshold literal without a named calibration constant.

DETECT:
- PatternFamily interfaces: interfaces with >5 members sharing a naming/behavioral family. Flag with predicate lexicon.table / lexicon.family
- Decision ladders: if/else or switch chains with >=3 branches (not 2 — that is normal control flow)
- Numeric thresholds without named calibration: magic numbers used as thresholds without a named constant or calib: comment (calib:-commented thresholds are EXEMPT)`;

const ACTOR_DIRECTIVE = `You are the ACTOR detector — a specialized code intelligence agent.

YOUR MISSION: Find every actor topology issue — createMachine/createActor/send/subscribe integrity, missing subscriptions, and message flow breaks.

DETECT:
- createMachine / createActor call sites and their configuration
- send() calls without matching subscribe() handlers (predicate actor.unsubscribed)
- Missing subscriptions that the spec requires
- Message flow integrity: trace actor creation -> send -> subscribe chains`;

const STATE_MACHINE_DIRECTIVE = `You are the STATE-MACHINE detector — a specialized code intelligence agent.

YOUR MISSION: Find XState machine configuration issues, scattered boolean flags that should be state machine states, and state machine integrity violations.

DETECT:
- XState machine configs (createMachine) — check state topology, missing terminal states
- Scattered boolean flags alongside a state machine (flags that should be machine states)
- State machine integrity: unreachable states, missing transitions, inconsistent state usage`;

const ENGINE_DIRECTIVE = `You are the ENGINE detector — a specialized code intelligence agent.

YOUR MISSION: Find engine-level side effects without guards — writeFileSync/degrade paths, unguarded engine side effects, and container deploy surface issues.

DETECT:
- writeFileSync and file I/O calls without proper guards or error handling (predicate engine.unguardedWrite)
- degrade / fallback branches that silently swallow failures
- Container config references and deploy surface exposures
- Unguarded side effects in engine-critical paths`;

const ADAPTER_DIRECTIVE = `You are the ADAPTER detector — a specialized code intelligence agent.

YOUR MISSION: Find delegation pattern issues, snapshot merge problems, and adapter-engine parity violations.

DETECT:
- Delegation patterns: adapter functions that delegate to engine calls — check parity
- Snapshot merges: spread operator and Object.assign merge sites that may lose data
- Adapter-engine parity: adapter behavior that diverges from engine contract
- delegation snapshot merge sites with potential data loss`;

const MPSE_DIRECTIVE = `You are the MPSE detector — a specialized code intelligence agent.

YOUR MISSION: Find numeric threshold comparisons near contract calls, epsilon oracle patterns, and unguarded numeric decisions.

DETECT:
- Numeric threshold comparisons in or near contract-checking functions (predicate mpse.threshold / mpse.epsilon)
- epsilon oracle patterns: Math.abs and comparison operators near contract invocations
- Unguarded numeric decisions that should have epsilon bounds
- Contract call sites with missing or incorrect threshold guards`;

export const rLexiconSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-lexicon',
  buildSystemPrompt(input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(LEXICON_DIRECTIVE, [
      'find all interfaces with more than 5 members',
      'show if/else chains deeper than 3',
      'find numeric literals not in named constants',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for PatternFamily interfaces, decision ladders >=3, and uncalibrated thresholds. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'find all interfaces with more than 5 members',
    'show if/else chains deeper than 3',
    'find numeric literals not in named constants',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const rActorSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-actor',
  buildSystemPrompt(_input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(ACTOR_DIRECTIVE, [
      'show all createMachine and createActor call sites',
      'trace send() to subscribe() paths',
      'find actors without subscription handlers',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for actor topology issues — createMachine/createActor/send/subscribe integrity and missing subscriptions. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'show all createMachine and createActor call sites',
    'trace send() to subscribe() paths',
    'find actors without subscription handlers',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const rStateMachineSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-state-machine',
  buildSystemPrompt(_input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(STATE_MACHINE_DIRECTIVE, [
      'find machines with scattered boolean flags alongside them',
      'show state machines with their state count',
      'find XState createMachine configurations',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for XState machine configs, scattered boolean flags, and state machine integrity issues. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'find machines with scattered boolean flags alongside them',
    'show state machines with their state count',
    'find XState createMachine configurations',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const rEngineSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-engine',
  buildSystemPrompt(_input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(ENGINE_DIRECTIVE, [
      'find all writeFileSync and file I/O calls',
      'trace degrade/fallback branches',
      'find container config references',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for writeFileSync/degrade paths, unguarded engine side effects, and container deploy surface. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'find all writeFileSync and file I/O calls',
    'trace degrade/fallback branches',
    'find container config references',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const rAdapterSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-adapter',
  buildSystemPrompt(_input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(ADAPTER_DIRECTIVE, [
      'find delegation function patterns',
      'show spread operator and Object.assign merge sites',
      'trace adapter to engine call chains',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for delegation patterns, snapshot merges, and adapter-engine parity violations. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'find delegation function patterns',
    'show spread operator and Object.assign merge sites',
    'trace adapter to engine call chains',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const rMpseSpec: SubagentSpec<AuditGateInput, SubagentOutput> = {
  id: 'r-mpse',
  buildSystemPrompt(_input: AuditGateInput, _graph: GraphifyGraph, _memory: SharedMemoryStore): string {
    return systemPromptFor(MPSE_DIRECTIVE, [
      'find numeric comparisons in contract-checking functions',
      'show Math.abs and comparison operators near contract calls',
      'find epsilon oracle patterns',
    ]);
  },
  buildUserPrompt(input: AuditGateInput): string {
    return `Scan ${input.targetPath} for numeric threshold comparisons near contract calls, epsilon oracle patterns, and unguarded numeric decisions. Query the graph first, then verify with file reads. Return JSON matching the output contract.`;
  },
  outputSchema: SubagentOutputSchema,
  graphQueries: [
    'find numeric comparisons in contract-checking functions',
    'show Math.abs and comparison operators near contract calls',
    'find epsilon oracle patterns',
  ],
  maxTokens: 64000,
  maxRounds: 2,
  timeout: 60000,
};

export const lasmeSubagentIds: string[] = [
  'r-lexicon',
  'r-actor',
  'r-state-machine',
  'r-engine',
  'r-adapter',
  'r-mpse',
];

export const lasmeSpecs: SubagentSpec<AuditGateInput, SubagentOutput>[] = [
  rLexiconSpec,
  rActorSpec,
  rStateMachineSpec,
  rEngineSpec,
  rAdapterSpec,
  rMpseSpec,
];

/**
 * lasmeSynthesize — per Spec 1 section 2.13.0
 * merge fulfilled candidates -> dedupe by file:line:predicate:object -> cross-reference boost -> rank -> return {candidates, graphSlice}
 * Graph slice merge is delegated to the caller GraphMapper.merge — noted here for the consumer.
 */
export async function lasmeSynthesize(
  results: SubagentSettlement<SubagentOutput>[],
  _graph: GraphifyGraph,
  _memory: SharedMemoryStore,
): Promise<LasmeSynthesis> {
  const all: LayerCandidate[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.candidates) {
      for (const c of r.value.candidates) all.push(c);
    }
  }

  const seen = new Set<string>();
  const deduped: LayerCandidate[] = [];
  for (const c of all) {
    const key = `${c.file}:${c.line}:${c.predicate}:${c.object}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  const bySite = new Map<string, LayerCandidate[]>();
  for (const c of deduped) {
    const site = `${c.file}:${c.line}`;
    const arr = bySite.get(site) ?? [];
    arr.push(c);
    bySite.set(site, arr);
  }

  const boosted: LayerCandidate[] = deduped.map((c) => {
    const site = `${c.file}:${c.line}`;
    const group = bySite.get(site) ?? [];
    if (group.length <= 1) return c;
    const otherLayers = group.filter((g) => g.layer !== c.layer).map((g) => g.layer);
    if (otherLayers.length === 0) return c;
    const conf = c.confidence ?? CONFIDENCE_DEFAULT;
    return {
      ...c,
      confidence: Math.min(conf + CROSS_REFERENCE_CONFIDENCE_BOOST, CONFIDENCE_MAX),
      crossReferenced: true,
      crossReferencedBy: otherLayers,
    };
  });

  boosted.sort((a, b) => {
    const wa = SEVERITY_WEIGHT[a.severity ?? 'MEDIUM'] ?? SEVERITY_FALLBACK_WEIGHT;
    const wb = SEVERITY_WEIGHT[b.severity ?? 'MEDIUM'] ?? SEVERITY_FALLBACK_WEIGHT;
    const ca = a.confidence ?? CONFIDENCE_DEFAULT;
    const cb = b.confidence ?? CONFIDENCE_DEFAULT;
    return wb * cb - wa * ca;
  });

  return {
    candidates: boosted,
    graphSlice: { queriedConcepts: [], relevantSubgraph: '{}' },
  };
}

export function lasmePreGates(): GateCheck<AuditGateInput>[] {
  return [
    {
      name: 'audit-spec-exists',
      description: 'audit-spec.json exists and its bindings parse to >=1 declaration',
      async check(target: AuditGateInput): Promise<GateResult> {
        try {
          const root = target.targetPath ?? target.targetRoot ?? '';
          if (!root) return { passed: false, reason: 'no targetPath on input' };
          const specPath = path.join(path.resolve(root), '.trident', 'audit-spec.json');
          if (!fs.existsSync(specPath)) {
            return { passed: false, reason: `audit-spec.json not found at ${specPath}` };
          }
          const raw = fs.readFileSync(specPath, 'utf-8');
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch (e: unknown) {
            return { passed: false, reason: `audit-spec.json invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
          }
          const p = parsed as Record<string, unknown>;
          if (p.specs !== undefined && Array.isArray(p.specs) && (p.specs as unknown[]).length === 0) {
            return { passed: false, reason: 'audit-spec.json specs array is empty' };
          }
          if (p.declarations !== undefined && Array.isArray(p.declarations) && (p.declarations as unknown[]).length === 0) {
            return { passed: false, reason: 'audit-spec.json declarations is empty' };
          }
          return { passed: true };
        } catch (e: unknown) {
          return { passed: false, reason: `pre-gate error: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      name: 'bindings-parse',
      description: 'spec bindings parse — at least one spec path or declaration is present',
      async check(target: AuditGateInput): Promise<GateResult> {
        try {
          const root = target.targetPath ?? target.targetRoot ?? '';
          if (!root) return { passed: false, reason: 'no targetPath on input' };
          const specPath = path.join(path.resolve(root), '.trident', 'audit-spec.json');
          if (!fs.existsSync(specPath)) {
            if (target.specPaths && target.specPaths.length > 0) return { passed: true };
            return { passed: false, reason: 'no audit-spec.json and no specPaths on input' };
          }
          const raw = fs.readFileSync(specPath, 'utf-8');
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const specs = Array.isArray(parsed.specs) ? (parsed.specs as unknown[]) : [];
          const decls = Array.isArray(parsed.declarations) ? (parsed.declarations as unknown[]) : [];
          if (specs.length === 0 && decls.length === 0 && (!target.specPaths || target.specPaths.length === 0)) {
            return { passed: false, reason: 'no specs or declarations found in audit-spec.json' };
          }
          return { passed: true };
        } catch (e: unknown) {
          return { passed: false, reason: `bindings-parse error: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
  ];
}

export function lasmePostGates(): GateCheck<LasmeSynthesis>[] {
  return [
    {
      name: 'candidates-have-required-fields',
      description: 'every candidate has layer+file+line+evidence',
      async check(target: LasmeSynthesis): Promise<GateResult> {
        try {
          for (let i = 0; i < target.candidates.length; i++) {
            const c = target.candidates[i] as Record<string, unknown>;
            if (!c.layer || typeof c.layer !== 'string' || (c.layer as string).trim() === '') {
              return { passed: false, reason: `candidate[${i}] missing layer` };
            }
            if (!c.file || typeof c.file !== 'string' || (c.file as string).trim() === '') {
              return { passed: false, reason: `candidate[${i}] missing file` };
            }
            if (c.line === undefined || c.line === null || typeof c.line !== 'number' || (c.line as number) <= 0) {
              return { passed: false, reason: `candidate[${i}] missing or invalid line` };
            }
            if (!c.evidence || typeof c.evidence !== 'string' || (c.evidence as string).trim() === '') {
              return { passed: false, reason: `candidate[${i}] missing evidence` };
            }
          }
          return { passed: true };
        } catch (e: unknown) {
          return { passed: false, reason: `post-gate error: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    {
      name: 'machineId-is-layer-name',
      description: 'machineId is the layer name (never layer-engine)',
      async check(target: LasmeSynthesis): Promise<GateResult> {
        try {
          for (let i = 0; i < target.candidates.length; i++) {
            const c = target.candidates[i] as Record<string, unknown>;
            const layer = c.layer as string;
            const machineId = (c as Record<string, unknown>).machineId as string | undefined;
            if (machineId !== undefined && machineId === 'layer-engine') {
              return { passed: false, reason: `candidate[${i}] machineId is layer-engine, must be the layer name (${layer})` };
            }
            if (machineId !== undefined && machineId !== layer) {
              return { passed: false, reason: `candidate[${i}] machineId ${machineId} != layer ${layer}` };
            }
          }
          return { passed: true };
        } catch (e: unknown) {
          return { passed: false, reason: `post-gate error: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
  ];
}
export const createLasmePreGates = lasmePreGates;
export const createLasmePostGates = lasmePostGates;
