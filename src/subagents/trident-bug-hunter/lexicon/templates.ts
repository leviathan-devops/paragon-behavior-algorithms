// src/subagents/trident-bug-hunter/lexicon/templates.ts
// THE PREDICATE TEMPLATE LIBRARY (W4, spec §3.7 lines 1007-1133). The machine's
// transferable intelligence: the corpus's prose rules compile into deterministic
// predicates through the 5 typed families (WIRING/CONTRACT/PROVENANCE/DOMAIN/
// PROCESS). The templates are the machine's CONSTANT; the profile's bindings are
// the VARIABLE (D10). W5's diagnostics engine dispatches on the family; the
// calibration mutation-tests the checks; W10's Plutus deployment instantiates
// the P1-P22 battery through them (K3.1). The auditor's 6th family (CONFORMANCE)
// is W9's — it lands with the auditor wave, never here.
//
// THE A3 HOSTILE-CORPUS LAW holds in the SIGNATURE: every check is a pure
// function `(ctx: CheckContext) => Finding[]` over the INJECTED graph/source
// reads. There is NO exec/run/spawn hook anywhere in the lexicon — a check,
// even fed the 'run everything' fake rule, is STRUCTURALLY unable to execute
// anything (the hostile text rides only in `bindings` as DATA — G22.1).
// THE DETERMINISM LAW (K20.3): the checks are pure functions of the context —
// no timestamps, no randomness, no global state, no I/O beyond the injected
// reads. The same graph + the same bindings ALWAYS yield the same findings.
//
// DESIGN DIVERGENCES (recorded honestly): (1) the spec's §3.7 CheckContext
// (lines 1018-1023) carries `readSource`/`battery`/`history`; the W4 wave
// directive mandates `{graph, source: {read}, bindings}` — this file carries the
// W4 wave's shape (the battery/history belong to W5's engine context, not the
// predicate context). (2) the spec's `PredicateFamily` includes 'CONFORMANCE'
// (line 1016) — this file exports the 5 W4 families; CONFORMANCE is W9's.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SEVERITIES, type Severity, type FindingVerdict } from '../../../shared/knowledge-graph/db.ts';
import type { GraphAdapter } from '../graph/interface.ts';

// ---------------------------------------------------------------------------
// The typed shapes (spec §3.7 lines 1016-1046 — the W4-wave family set)
// ---------------------------------------------------------------------------

/** The 5 W4 predicate families. W5 dispatches on the EXACT union. */
export type PredicateFamily = 'WIRING' | 'CONTRACT' | 'PROVENANCE' | 'DOMAIN' | 'PROCESS';

export const PREDICATE_FAMILIES: readonly PredicateFamily[] = [
  'WIRING', 'CONTRACT', 'PROVENANCE', 'DOMAIN', 'PROCESS',
];

/** THE check context — the ONLY surface a check reads. The graph adapter + the
 *  lockdown-compliant source read + the validated bindings. No exec/run hook. */
export interface CheckContext {
  graph: GraphAdapter;
  source: { read(file: string, range?: [number, number]): string };
  bindings: Record<string, unknown>;
  /** the W14/W15 hoisted content map (additive — the audit Batch-B R23 passes it; the hunter sets it when available). */
  contentMap?: Map<string, string>;
}

/** A predicate finding — the MPSE-triplet shape aligned to the db.ts finding
 *  canon: the severity is CRIT|HIGH|MED|WARN (db.ts:66), the verdict is
 *  VIOLATION|PASS (db.ts:78), the evidence is MANDATORY (no triplet = no
 *  finding, O9.1 — the db rejects an empty evidence string). */
export interface Finding {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  range?: [number, number];
  evidence: string;
  verdict: FindingVerdict;
  week?: string;
}

/** The compiled battery row (spec §3.7 lines 1032-1040 + the W4 wave's
 *  batteryVersion field). The check is DETERMINISTIC — the decision layer. */
export interface CompiledPredicate {
  id: string;
  family: PredicateFamily;
  template: string;                  // the template id (e.g. 'provenance.traces-to-source')
  bindings: Record<string, unknown>; // the validated bound parameters (the D13 card data rides here)
  verbatimQuote: string;             // the D13 law — the rule's exact words from the corpus
  anchor: string;                    // the rule's file:line in the corpus
  severity: Severity;
  batteryVersion: string;
  check(ctx: CheckContext): Finding[];
}

/** A typed template: the zod schema validates the bound params; the check is
 *  the deterministic decision layer over the graph/source reads (the A3 law). */
export interface PredicateTemplate {
  id: string;
  family: PredicateFamily;
  parameters: z.ZodType;             // validates the bound params — an invalid binding is a loud named error
  check(ctx: CheckContext): Finding[];
}

// ---------------------------------------------------------------------------
// The named-error vocabulary (O32.1) — the loud fail-state contract
// ---------------------------------------------------------------------------

/** The base lexicon error: every failure NAMES its code in the message. */
export class LexiconError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

export function templateBindingInvalid(templateId: string, detail: string): LexiconError {
  return new LexiconError(
    'TEMPLATE_BINDING_INVALID',
    `TEMPLATE_BINDING_INVALID: template=${templateId} detail=${detail} (the bound params failed the template's zod schema — an invalid binding is a loud named error, never a coerced default)`,
  );
}

export function templateMissing(templateId: string): LexiconError {
  return new LexiconError(
    'TEMPLATE_MISSING',
    `TEMPLATE_MISSING: template=${templateId} (the stored check_code names a template absent from the library — the battery cannot be reinstated)`,
  );
}

// ---------------------------------------------------------------------------
// The shared primitives (the content-addressing + the deterministic helpers)
// ---------------------------------------------------------------------------

/** sha256 — the content-addressing primitive behind the battery version + the
 *  predicate ids. Deterministic by construction: the same bytes → the same hex. */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function readPath(obj: Record<string, unknown>, dotted: string): unknown {
  let cur: unknown = obj;
  for (const part of dotted.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// THE CALIBRATED OPERATOR SWITCH (the ISE law — name the calibration): the
// 4 operators are the NAMED comparison bands over the bindings-supplied
// `threshold` — the threshold's calibration source is the profile's
// `rules.bindings` (the operator's curated numeric ceilings, validated by W5's
// calibration mutation gate). No magic number lives here: every comparison is
// against a binding, never a hardcoded constant.
//
// THE R16 TYPE_CERTAINTY note: `bindings` is Record<string, unknown> (the zod
// schema validated the SHAPE at compile, but the read is still `unknown` at the
// check's runtime). The typed reads below go through the R16-guarded accessors
// — each assertion is earned by a typeof/Array.isArray guard in the same block,
// never a bare cast on an unvalidated read.
function compareOperator(op: 'lt' | 'lte' | 'gt' | 'gte', value: number, threshold: number): boolean {
  switch (op) {
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    default: return value > threshold;
  }
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the severity binding (z.enum-validated
 *  at compile, typeof-guarded at runtime). A non-string binding is the named
 *  loud error, never a silent cast — the check claims only validated input. */
function bindSeverity(bindings: Record<string, unknown>): Severity {
  const sev = bindings['severity'];
  if (typeof sev === 'string') {
    return sev as Severity;
  }
  throw templateBindingInvalid('severity', 'the severity binding must be a string');
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a string[] binding (default []). */
function bindStringArray(bindings: Record<string, unknown>, key: string): string[] {
  const v = bindings[key];
  if (Array.isArray(v)) {
    return v as string[];
  }
  return [];
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the stages binding (z.array-validated
 *  at compile, Array.isArray-guarded at runtime). */
function bindStages(bindings: Record<string, unknown>): { id: string; entry: string }[] {
  const v = bindings['stages'];
  if (Array.isArray(v)) {
    return v as { id: string; entry: string }[];
  }
  return [];
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the operator binding: narrowed by the
 *  literal-union check (no cast at all — the comparison narrows the unknown). */
function bindOperator(bindings: Record<string, unknown>): 'lt' | 'lte' | 'gt' | 'gte' {
  const v = bindings['operator'];
  if (typeof v === 'string' && (v === 'lt' || v === 'lte' || v === 'gt' || v === 'gte')) {
    return v;
  }
  return 'gt';
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the number binding (typeof-guarded). */
function bindNumber(bindings: Record<string, unknown>, key: string): number | undefined {
  const v = bindings[key];
  if (typeof v === 'number') {
    return v;
  }
  return undefined;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the range binding (Array.isArray-
 *  guarded; the z.tuple schema validated the shape at compile). */
function bindRange(bindings: Record<string, unknown>): [number, number] | undefined {
  const v = bindings['range'];
  if (Array.isArray(v)) {
    return v as [number, number];
  }
  return undefined;
}

/** The content-addressed predicate id: the template + the anchor + the bound
 *  params → the same inputs ALWAYS produce the same id (K20.3 determinism). */
function contentAddress(templateId: string, bindings: Record<string, unknown>, anchor: string): string {
  return `${templateId}:${sha256(`${anchor}|${JSON.stringify(bindings)}`).slice(0, 12)}`;
}

/** The D13 card fields EVERY template's schema carries — the quote, the anchor
 *  and the severity ride through the compile as the rule's provenance (D13).
 *  The severity canon is the db.ts SEVERITIES constant (db.ts:66). */
const CARD_FIELDS = {
  verbatimQuote: z.string(),
  anchor: z.string(),
  severity: z.enum(SEVERITIES),
} as const;

/**
 * Bind a template to the validated params + the D13 card meta → a compiled
 * predicate. The check closes over the template's check + the VALIDATED
 * bindings (the zod parse runs here — an invalid binding throws the loud
 * named TEMPLATE_BINDING_INVALID, never a coerced default).
 */
export function compileTemplate(
  template: PredicateTemplate,
  rawBindings: Record<string, unknown>,
  card: { verbatimQuote: string; anchor: string; severity: Severity },
  batteryVersion: string,
): CompiledPredicate {
  let validated: Record<string, unknown>;
  try {
    validated = template.parameters.parse(rawBindings) as Record<string, unknown>;
  } catch (e: unknown) {
    throw templateBindingInvalid(template.id, `the bound params failed the template's zod schema: ${String(e)}`);
  }
  return {
    id: contentAddress(template.id, validated, card.anchor),
    family: template.family,
    template: template.id,
    bindings: validated,
    verbatimQuote: card.verbatimQuote,
    anchor: card.anchor,
    severity: card.severity,
    batteryVersion,
    check: (ctx: CheckContext) => template.check({ ...ctx, bindings: validated }),
  };
}

// ---------------------------------------------------------------------------
// THE 5 FAMILIES (spec §3.7 lines 1049-1056) — the deterministic checks
// ---------------------------------------------------------------------------

// --- WIRING (the codebase-health family) — reads the unwired() / whoCalls()
//     graph queries. A 0-inbound-caller export is the dead-machinery class.

const WIRING_DEAD_MODULE: PredicateTemplate = {
  id: 'wiring.no-dead-module',
  family: 'WIRING',
  parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    // the unwired() adapter query = the 0-inbound-callers DeadNode class (graph/interface.ts:106)
    for (const dead of ctx.graph.unwired()) {
      findings.push({
        ruleId: 'wiring.no-dead-module',
        severity: sev,
        file: dead.file,
        line: dead.line,
        evidence: `dead module ${dead.name} (${dead.file}:${dead.line}) has zero inbound callers — the unwired() graph read lists it`,
        verdict: 'VIOLATION',
      });
    }
    return findings;
  },
};

const WIRING_EXPORT_IMPORTER: PredicateTemplate = {
  id: 'wiring.every-export-has-an-importer',
  family: 'WIRING',
  parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    for (const node of ctx.graph.nodes()) {
      if (node.kind !== 'class' && node.kind !== 'function' && node.kind !== 'method') continue;
      const callers = ctx.graph.whoCalls(node.name);
      if (callers.length === 0 && node.file) {
        findings.push({
          ruleId: 'wiring.every-export-has-an-importer',
          severity: sev,
          file: node.file,
          line: node.line ?? 0,
          evidence: `export ${node.name} (${node.file}:${node.line ?? '?'}) has zero call sites — whoCalls('${node.name}') returned []`,
          verdict: 'VIOLATION',
        });
      }
    }
    return findings;
  },
};

// --- CONTRACT (the architecture family) — the declared interface vs the code.

const CONTRACT_MUST_IMPLEMENT: PredicateTemplate = {
  id: 'contract.must-implement',
  family: 'CONTRACT',
  parameters: z.object({
    ...CARD_FIELDS,
    declaredInterface: z.string().default(''),
    requiredMembers: z.array(z.string()).default([]),
  }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    const declaredInterface = String(ctx.bindings['declaredInterface'] ?? '');
    const requiredMembers = bindStringArray(ctx.bindings, 'requiredMembers');
    // nothing declared → nothing to verify → the honest silent (the check claims only what it can measure)
    if (!declaredInterface || requiredMembers.length === 0) return findings;
    for (const node of ctx.graph.nodes('class')) {
      if (node.name !== declaredInterface && node.data?.['interface'] !== declaredInterface) continue;
      const members = node.data !== undefined && node.data !== null ? bindStringArray(node.data, 'members') : [];
      const missing = requiredMembers.filter((m) => !members.includes(m));
      if (missing.length > 0) {
        findings.push({
          ruleId: 'contract.must-implement',
          severity: sev,
          file: node.file ?? '',
          line: node.line ?? 0,
          evidence: `class ${node.name} (${node.file}:${node.line ?? '?'}) declares members ${JSON.stringify(members)} — missing the declared members ${missing.join(', ')}`,
          verdict: 'VIOLATION',
        });
      }
    }
    return findings;
  },
};

// --- PROVENANCE (the truth family) — the lineage duality + the D13 self-check.

const PROVENANCE_TRACES_TO_SOURCE: PredicateTemplate = {
  id: 'provenance.traces-to-source',
  family: 'PROVENANCE',
  parameters: z.object({
    ...CARD_FIELDS,
    targetKinds: z.array(z.string()).default([]),
    requiredTraces: z.array(z.string()).default([]),
  }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    const targetKinds = bindStringArray(ctx.bindings, 'targetKinds');
    const requiredTraces = bindStringArray(ctx.bindings, 'requiredTraces');
    // the spec's §3.7 pseudocode (lines 1061-1080): every target node must carry a
    // traces-to edge from each required trace — the graph chain read, never an execution
    for (const targetKind of targetKinds) {
      for (const node of ctx.graph.nodes(targetKind as never)) {
        const incoming = ctx.graph.chain(node.id);
        const present = requiredTraces.some((r) =>
          incoming.some((step) => step.to === node.id && step.kind === 'traces-to' && step.from.includes(r)),
        );
        if (!present) {
          findings.push({
            ruleId: 'provenance.traces-to-source',
            severity: sev,
            file: node.file ?? '',
            line: node.line ?? 0,
            evidence: `${node.name} lacks a traces-to edge from ${requiredTraces.join('/')} — incoming edges: ${incoming.map((s) => `${s.kind}@${s.from}`).join(', ') || 'NONE'}`,
            verdict: 'VIOLATION',
          });
        }
      }
    }
    return findings;
  },
};

const PROVENANCE_QUOTED_NOT_SYNTHESIZED: PredicateTemplate = {
  id: 'provenance.quoted-not-synthesized',
  family: 'PROVENANCE',
  parameters: z.object({
    ...CARD_FIELDS,
    file: z.string().default(''),
    quote: z.string().default(''),
    range: z.tuple([z.number(), z.number()]).optional(),
  }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    const file = String(ctx.bindings['file'] ?? '');
    const quote = String(ctx.bindings['quote'] ?? '');
    // the D13 self-enforcement (the P16 instantiation): the machine asserts only
    // what it can quote — the verbatim text must be present in the source read.
    // No file/quote bound → nothing to verify → the honest silent.
    if (!file || !quote) return findings;
    const range = bindRange(ctx.bindings);
    const text = ctx.source.read(file, range);
    if (!text.includes(quote)) {
      findings.push({
        ruleId: 'provenance.quoted-not-synthesized',
        severity: sev,
        file,
        line: range?.[0] ?? 0,
        evidence: `the verbatim quote '${quote.slice(0, 80)}...' is absent from ${file} — doctrine is QUOTED, never synthesized (D13)`,
        verdict: 'VIOLATION',
      });
    }
    return findings;
  },
};

// --- DOMAIN (the project-rules family) — the bindings-driven numeric thresholds
//     (the price-anchoring ceilings, the divergence caps — P4/P6/P7-P15 class).

const DOMAIN_NUMERIC_THRESHOLD: PredicateTemplate = {
  id: 'domain.numeric-threshold',
  family: 'DOMAIN',
  parameters: z.object({
    ...CARD_FIELDS,
    symbol: z.string().default(''),
    valuePath: z.string().default(''),
    operator: z.enum(['lt', 'lte', 'gt', 'gte']).default('gt'),
    threshold: z.number().optional(),
  }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    const symbol = String(ctx.bindings['symbol'] ?? '');
    const valuePath = String(ctx.bindings['valuePath'] ?? '');
    const operator = bindOperator(ctx.bindings);
    const threshold = bindNumber(ctx.bindings, 'threshold');
    // unmeasurable (no symbol/path/threshold bound) → the honest silent — the
    // check claims only what it can measure from the graph/source reads
    if (!symbol || !valuePath || typeof threshold !== 'number') return findings;
    for (const node of ctx.graph.nodes()) {
      if (node.name !== symbol) continue;
      const value = readPath(node.data ?? {}, valuePath);
      if (typeof value !== 'number') continue;
      if (compareOperator(operator, value, threshold)) {
        findings.push({
          ruleId: 'domain.numeric-threshold',
          severity: sev,
          file: node.file ?? '',
          line: node.line ?? 0,
          evidence: `${node.name}.${valuePath} = ${value} violates the declared ${operator} ${threshold} ceiling (bindings: ${JSON.stringify(ctx.bindings)})`,
          verdict: 'VIOLATION',
        });
      }
    }
    return findings;
  },
};

// --- PROCESS (the engineering family) — the declared stage sequence vs the call graph.

const PROCESS_GATES_OUTPUTS: PredicateTemplate = {
  id: 'process.gates-measure-outputs-not-logic',
  family: 'PROCESS',
  parameters: z.object({
    ...CARD_FIELDS,
    stages: z.array(z.object({ id: z.string(), entry: z.string() })).default([]),
  }),
  check(ctx) {
    const findings: Finding[] = [];
    const sev = bindSeverity(ctx.bindings);
    const stages = bindStages(ctx.bindings);
    // the declared pipeline order vs the call graph (the P18 instantiation): each
    // stage's entry must be reachable from the previous stage's entry in the
    // graph's awaits/caller reads — a declared sequence that is not wired is a violation
    for (let i = 0; i + 1 < stages.length; i++) {
      const cur = stages[i];
      const next = stages[i + 1];
      const outgoing = ctx.graph.awaits(cur.entry);
      const callers = ctx.graph.whoCalls(next.entry);
      const connected = outgoing.some((e) => e.to.includes(next.entry)) || callers.some((c) => c.caller === cur.entry);
      if (!connected) {
        findings.push({
          ruleId: 'process.gates-measure-outputs-not-logic',
          severity: sev,
          file: cur.entry,
          line: 0,
          evidence: `stage ${cur.id} (entry ${cur.entry}) has no graph edge reaching stage ${next.id} (entry ${next.entry}) — the declared sequence is not wired in the call graph`,
          verdict: 'VIOLATION',
        });
      }
    }
    return findings;
  },
};

/** THE template library — the compiler + the compiled-store rehydration look
 *  the templates up here by id. The library is the machine's constant. */
export const TEMPLATE_LIBRARY: Readonly<Record<string, PredicateTemplate>> = {
  'wiring.no-dead-module': WIRING_DEAD_MODULE,
  'wiring.every-export-has-an-importer': WIRING_EXPORT_IMPORTER,
  'contract.must-implement': CONTRACT_MUST_IMPLEMENT,
  'provenance.traces-to-source': PROVENANCE_TRACES_TO_SOURCE,
  'provenance.quoted-not-synthesized': PROVENANCE_QUOTED_NOT_SYNTHESIZED,
  'domain.numeric-threshold': DOMAIN_NUMERIC_THRESHOLD,
  'process.gates-measure-outputs-not-logic': PROCESS_GATES_OUTPUTS,
};
