/**
 * Test Generation Engine — DP L2 Phase 7
 *
 * Consumes ThreatReport[] (Phase 2) and DefenseSpec[] (Phase 3) and produces
 * a deterministic TestSpec[] array.  For every (threat, defense) pair where
 * the defense's threatPattern matches the threat's pattern, two tests are
 * generated:
 *
 *   1. NEGATIVE test — simulates the attack vector, expects FAIL
 *   2. POSITIVE test — simulates a legitimate case, expects PASS
 *
 * Threats with no matching defense produce a BLIND-SPOT test, flagging a gap
 * in the defense catalog.
 *
 * Determinism contract: no Date.now(), no Math.random().  All timestamps are
 * static constants.  Output is purely a function of the input arrays.
 *
 * Phase 7 input : ThreatReport[] + DefenseSpec[]
 * Phase 7 output: TestSpec[] — negative, positive, and blind-spot tests
 *
 * @module artifacts/test-generator
 */

import type {ThreatReport} from './threat-modeler.ts';
import type { DefenseSpec } from './defense-catalog.ts';
import { THREAT_PATTERN_DIRECT_MAP } from './defense-catalog.ts';

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/**
 * A single test specification.  Each test simulates either an attack vector
 * (NEGATIVE, expects FAIL) or a legitimate case (POSITIVE, expects PASS).
 * Blind-spot tests flag threats with no catalog defense.
 */
export interface TestSpec {
  /** Test name — prefixed with NEG:, POS:, or BLIND:. */
  name: string;
  /** Defense domain or 'blind-spot' for unmatched threats. */
  category: string;
  /** Attack vector being tested, or 'none' for positive tests. */
  defeatVector: string;
  /** Input object simulating the attack or legitimate scenario. */
  input: Record<string, unknown>;
  /** Expected verification result — PASS or FAIL. */
  expectedResult: 'PASS' | 'FAIL';
  /** Detail strings the checker should emit. */
  expectedDetail: string[];
  /** Bible source for provenance tracking (optional). */
  expectedProvenance?: string;
}

// ============================================================================
// STATIC CONSTANTS
// ============================================================================

/** Static "recent" timestamp (Nov 2023 in ms) — never Date.now(). */
const STATIC_RECENT_TIMESTAMP = 1700000000000;

// ============================================================================
// NEGATIVE_INPUTS — threat pattern → attack simulation input
// ============================================================================

/** Maps normalized threat patterns to attack-simulation input objects. */
const NEGATIVE_INPUTS: Record<string, Record<string, unknown>> = {
  'theatrical-implementation': { construct: { body: 'return "fake";', name: 'fakeFunction', hasReturn: true, hasSideEffects: false, isAsync: false } },
  'missing-implementation': { construct: { body: '', name: 'missingFunction', hasReturn: false, hasSideEffects: false } },
  'dead-code': { construct: { name: 'unusedFunction', filePath: 'src/unused.ts', isCalled: false } },
  'mismatch-branding-illusion': { construct: { body: 'return "placeholder";', name: 'mismatchedFunction', declaredBehavior: 'validate', actualBehavior: 'log' } },
  'duplicate-implementation': { constructs: [{ name: 'funcA', body: 'return 42;', filePath: 'src/a.ts' }, { name: 'funcB', body: 'return 42;', filePath: 'src/b.ts' }] },
  'spec-gap': { construct: { name: 'missingExport', isExported: false }, specRequirement: 'should export missingExport' },
  // Keep existing entries as fallbacks
  'theatrical-evidence': { evidenceArtifact: { machineGenerated: false, source: 'manual', content: 'fabricated output' } },
  'stale-evidence': { evidenceArtifact: { timestamp: 0, content: 'old evidence' } },
  'empty-shell': { construct: { body: '', name: 'fakeFunction' } },
  'empty-catch': { construct: { hasCatch: true, catchBody: '' } },
  'floating-promise': { construct: { isAsync: true, hasAwait: false, returnValue: 'unresolved' } },
  'torn-state': { stateMachine: { currentState: 'invalid', transition: 'disallowed' } },
  // Spec-aligned CSE attack pattern entries (space-keyed, normalized to hyphen by lookup)
  'theatrical evidence': { rawContent: '{"overallPassed": true, "passRate": 1.0}', parsed: { overallPassed: true, passRate: 1.0 } },
  'stale evidence': { rawContent: '{"overallPassed": true}', parsed: { overallPassed: true }, fileMtime: 0 },
  'empty shell build': { rawContent: 'module.exports = {}', parsed: null },
  'empty catch block': { codeBody: 'try { risky(); } catch(e) { }', constructName: 'riskyOperation' },
  'floating promise': { codeBody: 'async function f() { doAsync(); return "ok"; }', constructName: 'f' },
  'torn state': { codeBody: 'let loading = true; await work(); loading = false;', constructName: 'loadData' },
  'default': { input: 'generic-attack-payload', expectedFailure: true },
};

// ============================================================================
// POSITIVE_INPUTS — defense rule → legitimate case input
// ============================================================================

/** Maps defense rule names to legitimate-scenario input objects. */
const POSITIVE_INPUTS: Record<string, Record<string, unknown>> = {
  'Machine Generation Provenance': { evidenceArtifact: { machineGenerated: true, source: 'container-test', provenanceChain: ['build', 'test', 'verify'] } },
  'Existence Verification': { construct: { body: 'function realImplementation(data: Input): Output { const result = validate(data); if (!result.valid) throw new ValidationError(result.errors); return transform(result); }', name: 'realImplementation', filePath: 'src/impl.ts' } },
  'Dead Code Detection': { construct: { name: 'usedFunction', filePath: 'src/used.ts', callers: ['main.ts:processData'], isCalled: true } },
  'Signature Matching': { construct: { name: 'validateInput', filePath: 'src/validate.ts', params: [{ name: 'data', type: 'InputData' }], returnType: 'ValidationResult', isExported: true } },
  'Duplicate Detection': { constructs: [{ name: 'handlerA', body: 'return processA(input);', filePath: 'src/a.ts' }, { name: 'handlerB', body: 'return processB(input);', filePath: 'src/b.ts' }] },
  // Keep existing entries
  'Timestamp Window': { evidenceArtifact: { timestamp: STATIC_RECENT_TIMESTAMP, content: 'fresh evidence' } },
  'Command Execution Verification': { evidenceArtifact: { commandExecuted: true, outputHash: 'sha256:abc123', verified: true } },
  'Await Presence': { construct: { isAsync: true, hasAwait: true, body: 'await result = fetch()' } },
  'Test Coverage': { testResults: { coverage: 0.95, totalTests: 50, passed: 48, failed: 2 } },
  'default': { input: 'legitimate-input', expectedPass: true },
};

// ============================================================================
// DETAIL_MAP — defense rule → expected detail strings
// ============================================================================

/** Maps defense rule names to detail strings a passing check should emit. */
const DETAIL_MAP: Record<string, string[]> = {
  'Machine Generation Provenance': ['Provenance chain verified: build→test→verify', 'All evidence machine-generated', 'No manual intervention detected'],
  'Existence Verification': ['Construct body is non-trivial (>50 chars)', 'All required functions have real implementations', 'No empty stubs found'],
  'Dead Code Detection': ['All exported functions are called at least once', 'Call graph coverage: 95%+', 'No unreachable code paths'],
  'Signature Matching': ['Function signature matches declared interface', 'Parameter types are consistent', 'Return type matches specification'],
  'Duplicate Detection': ['No duplicate implementations detected', 'AST fingerprint similarity below threshold', 'All functions have unique implementations'],
  // Keep existing
  'Timestamp Window': ['Timestamp within 5-minute window', 'Evidence is fresh', 'No stale artifacts found'],
  'Command Execution Verification': ['Command hash verified', 'Output matches expected', 'No manual editing detected'],
  'Test Coverage': ['Coverage: 95%', '50 total tests', '48 passed, 2 failed', 'Above 90% threshold'],
  // Spec-aligned checker detail entries
  'checkMachineGeneration': ['no tool name references', 'suspiciously sparse fields'],
  'checkTimestampWindow': ['outside session window', 'stale'],
  'checkPassFailBreakdown': ['no granular breakdown', 'theatrical'],
  'checkExportsPresent': ['0 exports found', 'empty shell'],
  'checkEmptyCatch': ['empty catch block'],
  'checkFloatingPromise': ['unhandled promise at function exit'],
  'checkTornState': ['no rollback on error path'],
  'default': ['Check passed', 'No violations detected'],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a threat pattern for NEGATIVE_INPUTS lookup.
 * Converts to lowercase and replaces whitespace with hyphens.
 * Example: "Theatrical Evidence" → "theatrical-evidence"
 */
function normalizePattern(pattern: string): string {
  return pattern.toLowerCase().trim().replace(/[_\s]+/g, '-');
}

/**
 * Check whether a threat pattern and defense threat pattern match.
 * Applies the THREAT_PATTERN_DIRECT_MAP (same as selectDefenses) before
 * falling back to substring containment and keyword overlap.
 */
function patternsMatch(threatPattern: string, defenseThreatPattern: string): boolean {
  const tp = threatPattern.toLowerCase().replace(/_/g, '-');
  const dp = defenseThreatPattern.toLowerCase();

  // Step 1: Check direct map (same as selectDefenses)
  const mapped = THREAT_PATTERN_DIRECT_MAP[threatPattern.toLowerCase()] || tp;

  // Step 2: Substring match (same as before)
  if (mapped === dp || mapped.includes(dp) || dp.includes(mapped)) return true;

  // Step 3: Keyword overlap (same as selectDefenses fallback)
  const tpWords = mapped.split(/[-\s]+/).filter(w => w.length >= 3);
  const dpWords = dp.split(/[-\s]+/).filter(w => w.length >= 3);
  const overlap = tpWords.filter(w => dpWords.includes(w));
  return overlap.length >= 2;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Generate a negative (attack) input for a given threat.  The threat's
 * pattern is normalized and looked up in NEGATIVE_INPUTS.  Falls back to
 * the default attack payload if no specific entry exists.
 *
 * @param threat - The ThreatReport to simulate an attack for.
 * @returns Input object representing the attack vector.
 */
export function generateNegativeInput(threat: ThreatReport): Record<string, unknown> {
  const key = normalizePattern(threat.pattern);
  return { ...(NEGATIVE_INPUTS[key] ?? NEGATIVE_INPUTS['default']) };
}

/**
 * Generate a positive (legitimate) input for a given defense.  The defense's
 * rule name is looked up in POSITIVE_INPUTS.  Falls back to the default
 * legitimate input if no specific entry exists.
 *
 * @param defense - The DefenseSpec to generate a passing case for.
 * @returns Input object representing a legitimate scenario.
 */
export function generatePositiveInput(defense: DefenseSpec): Record<string, unknown> {
  return { ...(POSITIVE_INPUTS[defense.rule] ?? POSITIVE_INPUTS['default']) };
}

/**
 * Generate expected detail strings for a passing defense check.  The defense's
 * rule name is looked up in DETAIL_MAP.  Falls back to a generic message.
 *
 * @param defense - The DefenseSpec to generate expected details for.
 * @returns Array of detail strings the checker should emit on PASS.
 */
export function generateExpectedDetails(defense: DefenseSpec): string[] {
  return [...(DETAIL_MAP[defense.rule] ?? DETAIL_MAP['default'])];
}

/**
 * Generate a complete test suite from threat reports and defense specs.
 *
 * For each (threat, defense) pair where the defense's threatPattern matches
 * the threat's pattern:
 *   - A NEGATIVE test is created (expects FAIL, simulates the attack)
 *   - A POSITIVE test is created (expects PASS, simulates a legitimate case)
 *
 * Threats with no matching defense produce a BLIND-SPOT test, flagging a gap
 * in the defense catalog that should be addressed.
 *
 * @param threats  - Array of ThreatReport entries from Phase 2.
 * @param defenses - Array of DefenseSpec entries from Phase 3.
 * @returns Array of TestSpec entries — negative, positive, and blind-spot.
 */
export function generateTests(
  threats: ThreatReport[],
  defenses: DefenseSpec[],
): TestSpec[] {
  const tests: TestSpec[] = [];
  const matched = new Set<number>();

  for (let ti = 0; ti < threats.length; ti++) {
    const threat = threats[ti];
    let hasMatch = false;

    for (const defense of defenses) {
      if (patternsMatch(threat.pattern, defense.threatPattern)) {
        hasMatch = true;

        // NEGATIVE test — simulates the attack, expects FAIL
        tests.push({
          name: `NEG: ${defense.rule}`,
          category: defense.domain,
          defeatVector: threat.defeatVectors[0] || threat.pattern,
          input: generateNegativeInput(threat),
          expectedResult: 'FAIL',
          expectedDetail: [`Should detect: ${threat.pattern}`],
          expectedProvenance: defense.bibleSource,
        });

        // POSITIVE test — simulates a legitimate case, expects PASS
        tests.push({
          name: `POS: ${defense.rule}`,
          category: defense.domain,
          defeatVector: 'none',
          input: generatePositiveInput(defense),
          expectedResult: 'PASS',
          expectedDetail: generateExpectedDetails(defense),
          expectedProvenance: defense.bibleSource,
        });
      }
    }

    if (hasMatch) matched.add(ti);
  }

  // Blind-spot tests for threats with no matching defense
  for (let ti = 0; ti < threats.length; ti++) {
    if (!matched.has(ti)) {
      const threat = threats[ti];
      tests.push({
        name: `BLIND: ${threat.pattern}`,
        category: 'blind-spot',
        defeatVector: threat.defeatVectors[0] || threat.pattern,
        input: generateNegativeInput(threat),
        expectedResult: 'FAIL',
        expectedDetail: ['No defense catalog entry for this threat'],
      });
    }
  }

  return tests;
}
