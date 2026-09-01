// l2-adversarial.ts — Adversarial challenge generation for L2 Deep Planning.
// Derives EXACTLY 5 challenges from analysis data using deterministic rules.
// Each challenge type has a specific data source and required defense.

import type { AnalysisResult } from './analysis-engine.ts';
import type { DefenseSpec } from './defense-catalog.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface AdversarialChallenge {
  type: string;
  challenge: string;
  data: Record<string, unknown>;
  requiredDefense: string;
}

// ============================================================================
// FALSE POSITIVE SCENARIOS BY CHECK METHOD
// ============================================================================

export const FALSE_POSITIVE_SCENARIOS: Record<string, string> = {
  // Generic check method categories
  'AST':
    'The AST approach may flag intentional patterns like dead code in conditional exports or platform-specific branches.',
  'callgraph':
    'The callgraph approach misses dynamic dispatch, eval(), and string-based calls.',
  'fingerprint':
    'The fingerprint approach may flag legitimately similar utility functions as duplicates.',
  'type-checker':
    'The type checker approach may produce false positives on intentionally loose typing.',
  'regex':
    'The regex approach has inherent false positive/negative issues on formatted vs minified code.',

  // Specific check method identifiers
  'callgraph-reachability':
    'Dynamic import() and require() calls are invisible to the static call graph. ' +
    'Functions called only through dynamic dispatch (import("./module").then(m => m.func())) ' +
    'will be flagged as dead code even though they are reachable at runtime.',

  'ast-await-detection':
    'Promise.all() and Promise.race() internally await their input promises but do not ' +
    'use the await keyword. Async event handlers (onClick, onMessage) intentionally ' +
    'do not await. These will all be flagged as floating promises.',

  'ast-fingerprint-compare':
    'Two functions with identical structure but different string literals (error messages, ' +
    'log formats, config keys) will have different AST fingerprints and escape detection. ' +
    'Conversely, two functions with the same literals but different logic might match.',

  'signature-match-ast':
    'Function overloads have the same name but different signatures. The matcher may ' +
    'conflate them or miss the overload relationship entirely.',

  'provenance-chain-verify':
    'Evidence written by hand (developer writing JSON manually for a test fixture) ' +
    'will fail the machine-generation check even if the content is correct and useful.',

  'transition-matrix-verify':
    'State transitions triggered by external events (webhooks, timers, signals) are ' +
    'invisible to static transition analysis. The state machine may reject valid ' +
    'transitions that only occur in specific runtime conditions.',

  'token-count-verify':
    'Token counting without a real tokenizer (using character/4 estimate) has 15-20% ' +
    'error rate. Budget violations may be false positives (estimated over but actual under) ' +
    'or false negatives (estimated under but actual over).',

  'write-confirmation-check':
    'File writes through indirect mechanisms (stream piping, child process redirect, ' +
    'database commit) are invisible to the write checker. It only sees fs.writeFile calls.',

  'test-body-analysis':
    'Tests using dynamic assertions (expect(dynamicValue).toBe(otherDynamicValue)) ' +
    'have no static assertion to analyze. They appear to have zero assertions even ' +
    'though they are testing real behavior.',
};

// ============================================================================
// CHECK METHOD LIMITATIONS
// ============================================================================

export const CHECK_METHOD_LIMITATIONS: Record<string, string> = {
  // Generic check method categories
  'AST':
    'Cannot detect dynamic dispatch (obj[methodName]()), eval(), Function() constructor, or callback-based patterns.',
  'callgraph':
    'Cannot see runtime dispatch — dynamic imports, require() with variables, and event-driven flows are invisible.',
  'fingerprint':
    'Cannot detect semantic duplicates — same logic with different variable names may have different fingerprints.',
  'type-checker':
    'Cannot detect runtime type mismatches — TypeScript types are erased at runtime.',
  'regex':
    'Cannot understand code structure — misses violations in any non-standard formatting.',

  // Specific check method identifiers
  'callgraph-reachability':
    'calls through eval(), Function(), dynamic property access (obj[method]()), ' +
    'or runtime-determined module loading. These are runtime constructs that ' +
    'static analysis cannot resolve.',

  'ast-await-detection':
    'floating promises in arrow functions passed as callbacks where the caller ' +
    'is responsible for awaiting but the callee does not enforce it.',

  'ast-fingerprint-compare':
    'semantic duplicates — same logic implemented with different syntax ' +
    '(for loop vs while loop, if-else vs switch, recursive vs iterative).',

  'provenance-chain-verify':
    'the content of the evidence — only its provenance. Manually written evidence ' +
    'with correct content but no machine-generation marker will be rejected.',

  'transition-matrix-verify':
    'state transitions that only occur under specific runtime conditions ' +
    '(timeout, race condition, external signal). The static transition table ' +
    'may not include all valid runtime transitions.',

  'token-count-verify':
    'the actual token count — only an estimate. Without a production tokenizer, ' +
    'the count has 15-20% error.',

  'write-confirmation-check':
    'writes through streams, pipes, child processes, or database operations. ' +
    'Only direct fs API calls are tracked.',

  'test-body-analysis':
    'assertions in dynamically generated tests, parameterized tests with computed ' +
    'expected values, or tests using custom assertion frameworks that wrap expect().',
};

// ============================================================================
// ADVERSARIAL CHALLENGE GENERATION
// ============================================================================

/**
 * Generate adversarial challenges from SPECIFIC ANALYSIS DATA using
 * deterministic derivation rules. Each challenge type has a specific data
 * source and a specific required defense.
 *
 * Produces up to 5 challenges:
 *   1. FALSE_POSITIVE — from highest-weight defense's checkMethod
 *   2. THRESHOLD_CALIBRATION — from finding count x threshold
 *   3. SCALING — from construct count x algorithm complexity (only if constructs > 1000)
 *   4. INTERACTION — from defense rules in same pipeline phase
 *   5. BLIND_SPOT — from checkMethod's known limitations
 */
export function generateAdversarialChallenges(
  analysis: AnalysisResult,
  complexity: { tier: string; constructs: number },
): AdversarialChallenge[] {
  const challenges: AdversarialChallenge[] = [];

  // === CHALLENGE 1: FALSE POSITIVE SURFACE ===
  // Derived from the highest-weight defense rule's checkMethod
  const highestWeight = [...analysis.defenses].sort(
    (a, b) => b.weight - a.weight
  )[0];

  if (highestWeight) {
    const method = highestWeight.checkMethod || '';
    const fpScenario = FALSE_POSITIVE_SCENARIOS[method] ||
      `The ${method} approach has edge cases where legitimate code matches the defect pattern.`;

    challenges.push({
      type: 'FALSE_POSITIVE',
      challenge: `Your "${highestWeight.rule}" uses ${method}. ${fpScenario} ` +
        `How does the spec handle this false positive surface?`,
      data: { rule: highestWeight.rule, checkMethod: method, weight: highestWeight.weight },
      requiredDefense: `The spec MUST include a false positive suppression mechanism ` +
        `for this rule. This can be: a whitelist, a naming convention exemption, ` +
        `a confidence threshold below which findings are suppressed, or a manual ` +
        `review queue. The spec must document which approach is used and why.`,
    });
  }

  // === CHALLENGE 2: THRESHOLD CALIBRATION ===
  // Derived from finding count x threshold for the dominant threat
  const dominantThreat = [...analysis.threats].sort(
    (a, b) => (b.findings?.length || 0) - (a.findings?.length || 0)
  )[0];

  if (dominantThreat) {
    const findingCount = dominantThreat.findings?.length || 0;
    const matchingDefense = analysis.defenses.find((d: DefenseSpec) => {
      const dRule = d.rule?.toLowerCase() || '';
      const tPattern = dominantThreat.pattern?.toLowerCase() || '';
      return dRule.includes(tPattern.split('_')[0]) || tPattern.includes(d.domain?.toLowerCase());
    });

    if (matchingDefense) {
      const failValue = matchingDefense.thresholds?.failThreshold?.value;
      const passValue = matchingDefense.thresholds?.passThreshold?.value;

      let computedResult: string;
      if (failValue !== undefined && findingCount > failValue) {
        computedResult = `${findingCount} FAIL findings — overwhelming on an unfixed codebase`;
      } else if (passValue !== undefined && findingCount < passValue) {
        computedResult = `0 findings — check is too lenient for this codebase`;
      } else {
        computedResult = `${findingCount} WARN findings — tolerable but not zero`;
      }

      challenges.push({
        type: 'THRESHOLD_CALIBRATION',
        challenge: `Your "${matchingDefense.rule}" FAIL threshold is ` +
          `${matchingDefense.thresholds.failThreshold.operator} ${failValue}. ` +
          `Analysis found ${findingCount} instances. On the UNFIXED codebase, ` +
          `this check produces ${computedResult}. Is this the intended first-run experience?`,
        data: {
          rule: matchingDefense.rule,
          failThreshold: failValue,
          passThreshold: passValue,
          findingCount,
        },
        requiredDefense: `The spec MUST address threshold calibration. Options: ` +
          `(a) scale threshold by project size, (b) use percentage-based threshold, ` +
          `(c) document that first-run produces N findings and recommend batch-fix approach, ` +
          `(d) provide a "ramp-up" mode that starts lenient and tightens over time. ` +
          `The spec must choose one and explain why.`,
      });
    }
  }

  // === CHALLENGE 3: SCALING LIMIT ===
  // Derived from construct count x algorithm complexity
  const constructCount = complexity.constructs;
  const fingerprintDefense = analysis.defenses.find(
    (d: DefenseSpec) => d.checkMethod?.includes('fingerprint') || d.checkMethod?.includes('jaccard')
  );

  if (fingerprintDefense && constructCount > 1000) {
    const comparisons = constructCount * (constructCount - 1) / 2;
    const projectedMs = Math.round(comparisons * 0.001); // 1us per comparison

    challenges.push({
      type: 'SCALING',
      challenge: `Your "${fingerprintDefense.rule}" uses ${fingerprintDefense.checkMethod} ` +
        `which requires pairwise comparison: O(n^2). With ${constructCount} constructs, ` +
        `that's ${comparisons.toLocaleString()} comparisons. At 1us each: ${projectedMs}ms. ` +
        `At 10x scale (${constructCount * 10} constructs): ` +
        `${Math.round(projectedMs * 100)}ms. Is there a scaling cliff?`,
      data: {
        rule: fingerprintDefense.rule,
        constructCount,
        comparisons,
        projectedMs,
        projectedMs10x: projectedMs * 100,
      },
      requiredDefense: `The spec MUST include a scaling mitigation. Options: ` +
        `(a) bucketing by AST node count before comparison, (b) hash-based pre-filtering, ` +
        `(c) sampling for large codebases, (d) documented performance budget with ` +
        `maximum supported codebase size. The spec must choose one and estimate ` +
        `the performance improvement.`,
    });
  }

  // === CHALLENGE 4: INTERACTION CONFLICT ===
  // Derived from defense rules in the same pipeline phase
  for (const phase of analysis.pipeline?.phases || []) {
    const ph = phase;
    if (ph.defenses && ph.defenses.length >= 2) {
      const ruleA = ph.defenses[0];
      const ruleB = ph.defenses[1];

      challenges.push({
        type: 'INTERACTION',
        challenge: `Rules "${ruleA}" and "${ruleB}" both execute in the ${ph.domain} ` +
          `phase (${ph.executionModel}). If a construct triggers BOTH rules ` +
          `with different severities, which finding wins? Does the spec define priority?`,
        data: {
          ruleA,
          ruleB,
          domain: ph.domain,
          executionModel: ph.executionModel,
        },
        requiredDefense: `The spec MUST define finding priority when multiple rules ` +
          `fire on the same construct. Priority rules: (a) higher severity wins, ` +
          `(b) if equal severity, higher weight wins, (c) if equal weight, ` +
          `both findings are emitted but cross-referenced. The spec must document ` +
          `which rule applies and provide a worked example.`,
      });
      break; // Only generate one interaction challenge
    }
  }

  // === CHALLENGE 5: BLIND SPOT HONESTY ===
  // Derived from the checkMethod's known limitations
  const checkMethod = highestWeight?.checkMethod || '';
  const limitation = CHECK_METHOD_LIMITATIONS[checkMethod] ||
    `The ${checkMethod} approach has inherent limitations in what it can detect.`;

  challenges.push({
    type: 'BLIND_SPOT',
    challenge: `${checkMethod} cannot detect ${limitation} The spec must acknowledge ` +
      `this as a blind spot with a conservative fallback. What is the fallback?`,
    data: { checkMethod, limitation },
    requiredDefense: `The spec MUST include a blind spots section that enumerates ` +
      `what this analysis approach CANNOT detect. Each blind spot must have: ` +
      `(a) what we cannot see, (b) why we cannot see it, (c) conservative fallback ` +
      `(what the system does instead of detecting). The spec must not claim ` +
      `completeness it doesn't have.`,
  });

  return challenges;
}
