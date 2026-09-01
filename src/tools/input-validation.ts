// ════════════════════════════════════════════════════════════════════
// PER-TOOL INPUT VALIDATION — src/tools/input-validation.ts
//
// Custom validation per tool. NOT a global filter.
// Each tool defines rules matching ITS schema, ITS purpose, ITS modes.
//
// Design principles:
// 1. Every tool gets its own validator function
// 2. Mode/layer-conditional rules (DP L1 vs L2 vs L3, CS T1 vs T2)
// 3. Error messages show exact char counts + per-field hints (<80 chars/line)
// 4. Validation runs BEFORE any LLM call — deterministic, zero-token rejection
// 5. .describe() texts carry matching MINIMUM X+ CHARS prefixes so the model
//    knows the requirement BEFORE composing args (prevents wasted calls)
// ════════════════════════════════════════════════════════════════════

export interface FieldRule {
  minChars: number;
  hint: string;
}

export interface ArrayFieldRule {
  minItems: number;
  minTotalChars?: number;
  hint: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function checkStringFields(
  args: Record<string, unknown>,
  rules: Record<string, FieldRule>,
): string[] {
  const errors: string[] = [];
  for (const [field, rule] of Object.entries(rules)) {
    const value = args[field];
    const len = typeof value === 'string' ? value.length : 0;
    if (len < rule.minChars) {
      errors.push(
        `  - '${field}' ${len}c need ${rule.minChars}+. ${rule.hint}`,
      );
    }
  }
  return errors;
}

function checkArrayFields(
  args: Record<string, unknown>,
  rules: Record<string, ArrayFieldRule>,
): string[] {
  const errors: string[] = [];
  for (const [field, rule] of Object.entries(rules)) {
    const arr = args[field];
    const count = Array.isArray(arr) ? arr.length : 0;
    const totalChars = Array.isArray(arr)
      ? arr.reduce((s, x) => s + String(x).length, 0)
      : 0;
    if (count < rule.minItems) {
      errors.push(
        `  - '${field}' ${count} items need ${rule.minItems}+. ${rule.hint}`,
      );
    } else if (rule.minTotalChars && totalChars < rule.minTotalChars) {
      errors.push(
        `  - '${field}' ${totalChars}c total need ${rule.minTotalChars}+. ${rule.hint}`,
      );
    }
  }
  return errors;
}

function formatErrors(header: string, errors: string[]): string | null {
  if (errors.length === 0) return null;
  return `${header}\n${errors.join('\n')}`;
}

// ── DP: trident-deep-planning (layer-conditional) ───────────────────
//
// L1 (content generator, <800 lines): light requirements.
//   requirements 500+, context 2000+ — enough to ground generation.
// L2 (dense engineering spec, 2000+ lines): full structured input.
//   requirements 4000+, context 16000+, all 6 structured fields 8000+.
// L3 (multi-domain context library): domains present with real content.
//   domains[] or (domainNames[]+domainContexts[]), each context 1000+.

const DP_L2_STRING_RULES: Record<string, FieldRule> = {
  requirements: { minChars: 4000, hint: 'Full feature spec + acceptance criteria' },
  context: { minChars: 16000, hint: 'Complete project state + architecture' },
  components: { minChars: 8000, hint: 'Each: purpose, interfaces, deps, file' },
  constraints: { minChars: 8000, hint: 'Each constraint with full WHY' },
  designDecisions: { minChars: 8000, hint: 'Chosen + rejected + rationale + cost' },
  knownGaps: { minChars: 8000, hint: 'Every bug/gap with impact + status' },
  sourceLineage: { minChars: 8000, hint: 'Trace each pattern to origin' },
  fileInventory: { minChars: 8000, hint: 'Each file: path, purpose, lines' },
};

const DP_L1_STRING_RULES: Record<string, FieldRule> = {
  requirements: { minChars: 500, hint: 'What to generate and why' },
  context: { minChars: 2000, hint: 'First-hand context: real files, real arch' },
};

export function validateDeepPlanningInput(
  args: Record<string, unknown>,
): string | null {
  const layerRaw = args.layer;
  const layer =
    typeof layerRaw === 'string' ? parseInt(layerRaw, 10) || 1 : layerRaw || 1;

  if (layer === 2) {
    return formatErrors(
      'ARGUMENT VALIDATION FAILED (DP L2 — 84K+ chars required across 8 fields):',
      checkStringFields(args, DP_L2_STRING_RULES),
    );
  }

  if (layer === 3) {
    const errors: string[] = [];
    const domains = args.domains;
    const domainNames = args.domainNames;
    const domainContexts = args.domainContexts;
    const hasDomains = Array.isArray(domains) && domains.length > 0;
    const hasNamePairs =
      Array.isArray(domainNames) &&
      Array.isArray(domainContexts) &&
      domainNames.length > 0 &&
      domainNames.length === domainContexts.length;
    if (!hasDomains && !hasNamePairs) {
      errors.push(
        '  - L3 requires domains[] OR (domainNames[] + domainContexts[] pairs). Neither provided.',
      );
    }

/** THE R16 TYPE_CERTAINTY GUARDED READ — the domains field is narrowed to the
 *  row array behind the Array.isArray check (the assertion is earned). */
function domainRows(domains: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(domains)) {
    return domains as Array<Record<string, unknown>>;
  }
  return [];
}
    if (hasDomains) {
      domainRows(domains).forEach((d, i): void => {
        const ctx = typeof d?.context === 'string' ? d.context.length : 0;
        if (ctx < 1000) {
          errors.push(
            `  - domains[${i}].context ${ctx}c need 1000+. Full architecture description for this domain.`,
          );
        }
      });
    }
    return formatErrors('ARGUMENT VALIDATION FAILED (DP L3):', errors);
  }

  // L1 default
  return formatErrors(
    'ARGUMENT VALIDATION FAILED (DP L1):',
    checkStringFields(args, DP_L1_STRING_RULES),
  );
}

// ── CS: trident-context-synthesis (mode-conditional) ────────────────
//
// T1 (lightweight injectable): keyFacts 3+ items.
// T2 (dense bible, 3000+ lines): keyFacts 5+ items / 2000+ total chars,
//   plus structured fields 1000+ each (components, constraints,
//   designDecisions, knownGaps, sourceLineage).

const CS_T2_STRING_RULES: Record<string, FieldRule> = {
  context: { minChars: 4000, hint: 'Full narrative context. Source of truth' },
  requirements: { minChars: 500, hint: 'What to synthesize and why' },
  components: { minChars: 1000, hint: 'Name, purpose, file, interfaces' },
  constraints: { minChars: 1000, hint: 'Each with full WHY' },
  designDecisions: { minChars: 1000, hint: 'Rationale + rejected alternatives' },
  knownGaps: { minChars: 1000, hint: 'Bugs/issues with status' },
  sourceLineage: { minChars: 1000, hint: 'Pattern attribution' },
};

export function validateContextSynthesisInput(
  args: Record<string, unknown>,
): string | null {
  const mode = args.outputMode;

  if (mode === 'T2') {
    const errors = [
      ...checkArrayFields(args, {
        keyFacts: {
          minItems: 5,
          minTotalChars: 2000,
          hint: 'T2 needs dense grounding: 5+ facts, 2000+ chars',
        },
      }),
      ...checkStringFields(args, CS_T2_STRING_RULES),
    ];
    return formatErrors('ARGUMENT VALIDATION FAILED (CS T2):', errors);
  }

  // T1
  return formatErrors(
    'ARGUMENT VALIDATION FAILED (CS T1):',
    checkArrayFields(args, {
      keyFacts: {
        minItems: 3,
        hint: 'Provide 3-10 key facts',
      },
    }),
  );
}

// ── PS: trident-problem-solving ─────────────────────────────────────
//
// problem 500+, reasoning 3+ steps, workingPlan 3+ phases,
// context 2000+, components 500+, knownGaps 500+.

const PS_STRING_RULES: Record<string, FieldRule> = {
  problem: { minChars: 500, hint: 'Symptom + what breaks + expected vs actual' },
  context: { minChars: 2000, hint: 'Session knowledge: tried, observed, arch' },
  components: { minChars: 500, hint: 'Affected components with file refs' },
  knownGaps: { minChars: 500, hint: 'Known bugs related to this problem' },
};

export function validateProblemSolvingInput(
  args: Record<string, unknown>,
): string | null {
  const errors = [
    ...checkStringFields(args, PS_STRING_RULES),
    ...checkArrayFields(args, {
      reasoning: {
        minItems: 3,
        hint: 'obs|hypothesis|evidence|conclusion pipe format',
      },
      workingPlan: {
        minItems: 3,
        hint: 'desc|files|outcome|risk|rollback pipe format',
      },
    }),
  ];
  return formatErrors('ARGUMENT VALIDATION FAILED (PS):', errors);
}

// ── CT: trident-container-test — TEST PLAN VALIDATION ───────────────
//
// Forces a proper runtime-grade test plan BEFORE setup is allowed.
// The plan is validated STRUCTURALLY — theatrical plans are rejected.
//
// Required sections (case-insensitive headers):
//   OBJECTIVE — what changed and what is being verified
//   TOOLS UNDER TEST — which tools/behaviors this suite exercises
//   TEST SCENARIOS — min 3 tests, each with prompt + pass criteria + fail criteria
//   ADVERSARIAL — min 1 adversarial scenario (edge/malformed/hostile input)
//   EVIDENCE — what mechanical evidence will be collected per test
//   PASS CRITERIA — numeric pass/fail determination
//
// Theatrical rejection: plans that only probe trident-status, contain
// "declare success" without evidence criteria, or have <3 real scenarios.

const CT_PLAN_MIN_CHARS = 2000;
const CT_PLAN_MIN_SCENARIOS = 3;

const CT_REQUIRED_SECTIONS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'OBJECTIVE', patterns: [/^#+\s*.*objective/im, /\bobjective\s*:/i] },
  { key: 'TOOLS UNDER TEST', patterns: [/^#+\s*.*tools?\s+(under\s+test|to\s+test)/im, /\btools?\s+under\s+test\s*:/i] },
  { key: 'TEST SCENARIOS', patterns: [/^#+\s*.*(test\s+)?scenarios/im, /\btest\s+scenarios?\s*:/i] },
  { key: 'ADVERSARIAL', patterns: [/^#+\s*.*adversarial/im, /\badversarial\s*:/i] },
  { key: 'EVIDENCE', patterns: [/^#+\s*.*evidence/im, /\bevidence\s+(plan|collection)\s*:/i] },
  { key: 'PASS CRITERIA', patterns: [/^#+\s*.*pass(\/fail)?\s+criteria/im, /\bpass\s+criteria\s*:/i] },
];

const CT_THEATRICAL_MARKERS: RegExp[] = [
  /just\s+run\s+trident-status/i,
  /declare\s+(success|victory|done)\s+(without|and\s+skip)/i,
  /happy\s+path\s+only/i,
  /skip\s+(adversarial|edge\s+cases?)/i,
  /no\s+adversarial\s+tests?\s+needed/i,
  /smoke\s+test\s+only/i,
];

// Probe-only detection: a plan whose scenarios ONLY invoke status/help/idle
// inspection tools probes no runtime behavior — it is THEATER regardless of
// how structurally complete its sections are. Used to reject theatrical
// plans that would otherwise slip past the structure-gated markers.
const CT_PROBE_ONLY_TOOLS: RegExp[] = [
  /\btrident-status\b/i,
  /\btrident-help\b/i,
  /\btrident-status\s+only\b/i,
];

export function validateTestPlan(plan: unknown): string | null {
  if (typeof plan !== 'string' || plan.length < CT_PLAN_MIN_CHARS) {
    const len = typeof plan === 'string' ? plan.length : 0;
    return (
      'TEST PLAN VALIDATION FAILED:\n' +
      `  - testPlan ${len}c need ${CT_PLAN_MIN_CHARS}+.\n` +
      '  Required: OBJECTIVE, TOOLS UNDER TEST, TEST SCENARIOS (3+),\n' +
      '  ADVERSARIAL (1+), EVIDENCE, PASS CRITERIA.'
    );
  }

  const errors: string[] = [];

  // Required sections
  for (const section of CT_REQUIRED_SECTIONS) {
    const found = section.patterns.some((p) => p.test(plan));
    if (!found) {
      errors.push(`  - Missing section: ${section.key}`);
    }
  }

  // Scenario count — count scenario-like structures
  const scenarioMatches =
    plan.match(/(?:^|\n)\s*(?:#{2,4}\s*)?(?:test|scenario)\s*\d+/gi) ||
    plan.match(/(?:^|\n)\s*[-*]\s*(?:test|scenario)\s*\d+/gi) ||
    [];
  if (scenarioMatches.length < CT_PLAN_MIN_SCENARIOS) {
    errors.push(
      `  - ${scenarioMatches.length} scenarios found, need ${CT_PLAN_MIN_SCENARIOS}+.`,
    );
    errors.push('  - Each scenario: name, prompt, pass criteria, fail criteria.');
  }

  // Pass/fail criteria presence per plan
  const hasPass = /\bpass\s*(criteria|condition|evidence)?\s*:/i.test(plan) || /\bexpected\s*(result|behavior|output)\s*:/i.test(plan);
  const hasFail = /\bfail\s*(criteria|condition|evidence)?\s*:/i.test(plan) || /\bfail(?:ure)?\s+(if|when|condition)/i.test(plan);
  if (!hasPass) errors.push('  - No pass criteria defined per test.');
  if (!hasFail) errors.push('  - No fail criteria defined per test.');

  // Theatrical markers — gated on structural failure.
  // A fully-structured plan (all sections + scenarios + pass/fail) may legitimately
  // DOCUMENT theatrical examples as test cases (e.g., "verify setup rejects a plan
  // like 'just run trident-status'"). Marker phrases inside documented examples are
  // NOT theatrical intent. Markers therefore only fire when the plan is ALSO
  // structurally deficient — where they signal genuine laziness, not examples.
  if (errors.length > 0) {
    for (const marker of CT_THEATRICAL_MARKERS) {
      if (marker.test(plan)) {
        errors.push('  - Theatrical content: adversarial testing is mandatory.');
        break; // One marker message is enough
      }
    }
  }

  // PROBE-ONLY REJECTION (unconditional): if the plan's scenario PROMPTs only
  // reference inspection tools (trident-status/help) and reference no
  // behavioral tool (trident-container-test, bash, edit, write), it probes
  // nothing and is theater regardless of structural completeness. This closes
  // the GATE-C S5 gap: a structurally-complete probe-only plan must be rejected.
  const scenarioBlock = plan.match(/##?\s*(TEST\s+SCENARIOS?|ADVERSARIAL)[\s\S]*?(?=##?\s*(EVIDENCE|PASS\s+CRITERIA|$))/i)?.[0] || '';
  const probeOnlyRefs = CT_PROBE_ONLY_TOOLS.filter(m => m.test(scenarioBlock));
  const hasBehavioralTool = /\btrident-container-test\b|\bbash\b|\bedit\b|\bwrite\b|\bgrep\b|\bread\b/i.test(scenarioBlock);
  if (probeOnlyRefs.length > 0 && !hasBehavioralTool) {
    errors.push('  - Theatrical content: probe-only plan (trident-status/help only) — adversarial testing is mandatory.');
  }

  if (errors.length === 0) return null;
  return 'TEST PLAN VALIDATION FAILED:\n' + errors.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST-PLAN-FIRST (v2.0): validates that a DP output contains a valid embedded
// container test plan section. Called after L1/L2 generation.
// ─────────────────────────────────────────────────────────────────────────────

export function validateEmbeddedTestPlan(plan: unknown): string | null {
  if (typeof plan !== 'string') return 'TEST PLAN MISSING: DP output must include a CONTAINER TEST PLAN section';
  const errors: string[] = [];

  // Section must exist (L1 = CONTAINER TEST PLAN, L2 = EXACT CONTAINER TEST PLAN)
  if (!/CONTAINER TEST PLAN/i.test(plan)) {
    errors.push('Missing CONTAINER TEST PLAN section');
  }

  // Must reference at least 5 adversarial angles (numbered angle rows)
  const angleMentions = (plan.match(/\*\*[A-Z][A-Za-z ]+\*\* —/g) || []).length;
  if (angleMentions < 5) {
    errors.push(`Only ${angleMentions}/5+ adversarial angles specified`);
  }

  // Must have evidence requirement
  if (!/evidence/i.test(plan)) {
    errors.push('Missing evidence requirement');
  }

  // Must have pass criteria / threshold
  if (!/\bpass\b/i.test(plan)) {
    errors.push('Missing pass criteria');
  }

  if (errors.length > 0) {
    return 'TEST PLAN VALIDATION FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n');
  }
  return null;
}
