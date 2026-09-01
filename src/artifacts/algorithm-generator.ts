/**
 * Algorithm Generation Engine — DP L2 Phase 6
 *
 * Consumes a DefenseSpec list (Phase 3 output) and generates readable
 * pseudocode for each defense rule.  Each defense's `analysisOrder`
 * (1-5) determines which detection method is used:
 *
 *   Order 1: regex       — L0 pre-filter, fast source scanning
 *   Order 2: ast         — TypeScript AST walk via ts.forEachChild
 *   Order 3: typechecker — ts.createProgram + TypeChecker queries
 *   Order 4: cfg         — control flow graph path analysis
 *   Order 5: execution   — runtime command execution + output capture
 *
 * For every defense the engine emits a pseudocode block containing:
 *   1. Signal extraction — what signals to collect from the input
 *   2. Threshold comparison — pass/warn/fail bands from the DefenseSpec
 *   3. Decision logic — if/elif/else returning PASS, WARN, or FAIL
 *
 * Determinism contract: no Date.now(), no Math.random(), stable ordering
 * for a given input.  Output is purely a function of the input DefenseSpec[].
 *
 * Phase 6 input : DefenseSpec[]
 * Phase 6 output: string[] — one pseudocode block per defense
 *
 * @module artifacts/algorithm-generator
 */

import type {DefenseSpec} from './defense-catalog.ts';
import { formatThreshold } from './defense-catalog.ts';

// ============================================================================
// EXPORTED TYPES
// ============================================================================

/** Describes a single signal that a check method extracts from its input. */
export interface SignalDefinition {
  /** Machine-readable signal name (e.g. "patternMatches"). */
  name: string;
  /** Human-readable description of where the signal comes from. */
  source: string;
  /** Signal value type — determines how thresholds are compared. */
  type: 'count' | 'boolean' | 'string' | 'ratio';
  /** Short description of what the signal measures. */
  description: string;
}

/** A check method registered in the CHECK_METHODS registry (one per order). */
export interface CheckMethod {
  /** Analysis order — 1 (regex) through 5 (execution). */
  order: 1 | 2 | 3 | 4 | 5;
  /** Method name used in pseudocode headers. */
  name: string;
  /** Signals this method extracts from its input. */
  signals: SignalDefinition[];
}

// ============================================================================
// CHECK_METHODS REGISTRY — 5 entries, one per analysis order
// ============================================================================

/** Static registry mapping analysis order to its check method definition. */
const CHECK_METHODS: Record<number, CheckMethod> = {
  1: {
    order: 1,
    name: 'regex',
    signals: [
      { name: 'patternMatches', source: 'regex scan of source text', type: 'count', description: 'Number of regex pattern matches found in source.' },
      { name: 'matchDensity', source: 'patternMatches / source.length', type: 'ratio', description: 'Ratio of matches to source length (0..1).' },
    ],
  },
  2: {
    order: 2,
    name: 'ast',
    signals: [
      { name: 'nodeCount', source: 'ts.forEachChild walk of function body', type: 'count', description: 'Total AST nodes in the construct body.' },
      { name: 'hasReturn', source: 'ts.isReturnStatement check during walk', type: 'boolean', description: 'Whether the body contains at least one return statement.' },
      { name: 'hasSideEffects', source: 'CallExpression API analysis during walk', type: 'boolean', description: 'Whether the body contains side-effect API calls.' },
      { name: 'bodyComplexity', source: 'nesting depth + branch count', type: 'count', description: 'Cyclomatic-style complexity score from AST structure.' },
    ],
  },
  3: {
    order: 3,
    name: 'typechecker',
    signals: [
      { name: 'typedParameters', source: 'TypeChecker.getTypeAtLocation on parameters', type: 'count', description: 'Number of parameters with explicit type annotations.' },
      { name: 'typedReturns', source: 'TypeChecker.getReturnTypeOfSymbol', type: 'boolean', description: 'Whether the return type is explicitly annotated.' },
      { name: 'anyUsage', source: 'TypeChecker type flag inspection for any', type: 'count', description: 'Number of usages of the any type.' },
    ],
  },
  4: {
    order: 4,
    name: 'cfg',
    signals: [
      { name: 'pathCount', source: 'CFG path enumeration from entry to exit', type: 'count', description: 'Number of distinct control flow paths.' },
      { name: 'unreachableBlocks', source: 'CFG reachability analysis (BFS from entry)', type: 'count', description: 'Number of basic blocks unreachable from entry.' },
      { name: 'cyclomaticComplexity', source: 'edges - nodes + 2 (McCabe formula)', type: 'count', description: 'McCabe cyclomatic complexity of the control flow graph.' },
    ],
  },
  5: {
    order: 5,
    name: 'execution',
    signals: [
      { name: 'executionTime', source: 'performance measurement around function call', type: 'count', description: 'Wall-clock execution time in milliseconds.' },
      { name: 'outputMatch', source: 'comparison of actual output to expected output', type: 'boolean', description: 'Whether the executed output matches the expected result.' },
      { name: 'sideEffectObserved', source: 'filesystem / process state diff after execution', type: 'boolean', description: 'Whether a real side effect was observed after execution.' },
    ],
  },
};

// ============================================================================
// EXTRACTION TEMPLATES — pseudocode steps per check method
// ============================================================================

/** Extraction template lines for each check method order. */
const EXTRACTION_TEMPLATES: Record<number, string[]> = {
  1: [
    'patternMatches = countMatches(regex, source)',
    'matchDensity   = patternMatches / max(len(source), 1)',
  ],
  2: [
    'sourceFile = ts.createSourceFile(file, source, ScriptTarget.Latest)',
    'walk body with ts.forEachChild:',
    '  nodeCount       = count all visited nodes',
    '  hasReturn       = any node is ts.isReturnStatement',
    '  hasSideEffects  = any CallExpression is a side-effect API',
    '  bodyComplexity  = maxNestingDepth + branchCount',
  ],
  3: [
    'program = ts.createProgram(files, options)',
    'checker = program.getTypeChecker()',
    'for each construct symbol:',
    '  typedParameters = count parameters with explicit type',
    '  typedReturns    = return type is not inferred any',
    '  anyUsage        = count TypeFlags.Any in type positions',
  ],
  4: [
    'cfg = buildCFG(sourceFile)',
    'pathCount            = enumeratePaths(cfg.entry, cfg.exit)',
    'unreachableBlocks    = countBlocksNotReachable(cfg, cfg.entry)',
    'cyclomaticComplexity = cfg.edges - cfg.nodes + 2',
  ],
  5: [
    'startTime = now()',
    'output    = execute(targetFunction, input)',
    'executionTime      = now() - startTime',
    'outputMatch        = deepEqual(output, expectedOutput)',
    'sideEffectObserved = diffState(before, after) is nonEmpty',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Per-defense signal extraction overrides keyed by checkMethod.
 * When a defense has a specific checkMethod, these override the generic
 * per-order EXTRACTION_TEMPLATES signals for more accurate pseudocode.
 */
const DEFENSE_SIGNALS: Record<string, SignalDefinition[]> = {
  'ast-await-detection': [
    { name: 'awaitCount', source: 'AST body', type: 'count', description: 'Number of await expressions in function body' },
    { name: 'hasAwait', source: 'AST body', type: 'boolean', description: 'True if any await expression found' },
  ],
  'catch-block-analysis': [
    { name: 'catchCount', source: 'AST body', type: 'count', description: 'Number of catch clauses' },
    { name: 'emptyCatchCount', source: 'AST body', type: 'count', description: 'Number of empty catch clauses' },
    { name: 'errorPropagated', source: 'AST body', type: 'boolean', description: 'True if error is re-thrown or propagated' },
  ],
  'ast-existence-check': [
    { name: 'bodyLength', source: 'AST body text length', type: 'count', description: 'Length of function body in characters' },
    { name: 'hasRealStatements', source: 'AST body non-trivial statement count', type: 'boolean', description: 'True if body has real (non-comment) statements' },
  ],
  'callgraph-walk': [
    { name: 'callSiteCount', source: 'CallGraph entries', type: 'count', description: 'Number of call sites referencing this construct' },
    { name: 'isCalled', source: 'CallGraph entries', type: 'boolean', description: 'True if construct has at least one call site' },
  ],
  'export-analysis': [
    { name: 'exportedCount', source: 'Module export list', type: 'count', description: 'Number of exported declarations' },
    { name: 'missingExports', source: 'Module export list vs requirements', type: 'count', description: 'Number of required exports not found' },
  ],
  'provenance-chain-verify': [
    { name: 'machineGenerated', source: 'Evidence artifact metadata', type: 'boolean', description: 'True if evidence has machine-generation provenance' },
    { name: 'provenanceChainLength', source: 'Evidence artifact chain', type: 'count', description: 'Length of provenance chain' },
  ],
  'container-test-presence': [
    { name: 'containerTestPresent', source: 'Test results directory', type: 'boolean', description: 'True if container test artifact exists' },
    { name: 'testPassRate', source: 'Container test results', type: 'ratio', description: 'Pass rate of container tests (0..1)' },
  ],
  'negative-test-scan': [
    { name: 'negativeTestCount', source: 'Test suite scan', type: 'count', description: 'Number of negative (attack simulation) tests' },
  ],
  'positive-test-scan': [
    { name: 'positiveTestCount', source: 'Test suite scan', type: 'count', description: 'Number of positive (legitimate case) tests' },
  ],
  'test-body-analysis': [
    { name: 'authenticTestCount', source: 'Test body AST analysis', type: 'count', description: 'Number of tests with real assertions' },
    { name: 'theatricalTestCount', source: 'Test body AST analysis', type: 'count', description: 'Number of tests with trivial/empty bodies' },
  ],
  'coverage-threshold-check': [
    { name: 'coveragePercent', source: 'Coverage report', type: 'ratio', description: 'Code coverage percentage (0..100)' },
  ],
  'timestamp-window-check': [
    { name: 'ageMinutes', source: 'Evidence timestamp vs build time', type: 'count', description: 'Age of evidence in minutes' },
  ],
};

/** Sanitize a rule name into a valid pseudocode function name. */
function sanitizeRuleName(rule: string): string {
  return rule.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

/** Format a threshold entry as a comparison string (e.g. ">= 1"). */
function fmtThreshold(t: { value: number; operator: string }): string {
  return formatThreshold(t);
}

/**
 * Context-aware threshold rendering. For ratio signals, converts decimal
 * thresholds to percentages. For boolean signals, renders true/false.
 */
function formatThresholdForSignal(threshold: { value: number; operator: string }, signalType?: string): string {
  const formatted = formatThreshold(threshold);
  if (signalType === 'ratio') {
    if (threshold.value <= 1 && threshold.operator.startsWith('>=')) return `>= ${(threshold.value * 100).toFixed(0)}%`;
    if (threshold.value <= 1 && threshold.operator.startsWith('<=')) return `<= ${(threshold.value * 100).toFixed(0)}%`;
  }
  if (signalType === 'boolean') {
    if (threshold.value >= 1) return 'true';
    if (threshold.value <= 0) return 'false';
  }
  return formatted;
}

/**
 * Generate per-defense signal extraction pseudocode based on checkMethod.
 * Each checkMethod has specific extraction logic tailored to its analysis type.
 */
function generateExtractionCode(checkMethod: string, signals: SignalDefinition[]): string {
  const TEMPLATES: Record<string, string> = {
    'ast-await-detection': `  // Walk AST body looking for await expressions
  walk body with ts.forEachChild:
    awaitCount = count nodes where ts.isAwaitExpression
    hasAwait = awaitCount > 0`,

    'catch-block-analysis': `  // Walk AST body looking for catch clauses
  walk body with ts.forEachChild:
    catchCount = count ts.isCatchClause nodes
    emptyCatchCount = count catchClauses where block.statements.length === 0
    errorPropagated = any catch contains throw or re-raise`,

    'ast-existence-check': `  // Check if construct has real (non-trivial) body
  bodyLength = construct.body.length after stripping comments
  hasRealStatements = body has statements other than bare return`,

    'ast-signature-compare': `  // Compare function signature against requirements
  declaredParams = construct.parameters
  declaredReturn = construct.returnType
  matchedRequirements = count requirements satisfied by signature`,

    'callgraph-reachability': `  // Walk call graph from entry points
  reachable = BFS from main entry
  deadCount = totalFunctions - reachable.size
  isReachable = function name in reachable set`,

    'ast-fingerprint-compare': `  // Compare AST node type sequences
  fingerprintA = [SyntaxKind names in order for construct A]
  fingerprintB = [SyntaxKind names in order for construct B]
  similarity = Jaccard(fingerprintA, fingerprintB)`,

    'provenance-chain-verify': `  // Verify evidence has machine-generation provenance
  hasToolName = evidence contains tool identifier
  hasTimestamp = evidence has valid timestamp within session window
  hasTestArray = evidence contains structured test results array
  chainLength = count of provenance chain entries`,

    'timestamp-window-check': `  // Compare evidence timestamp against session window
  evidenceTime = parse timestamp from evidence
  sessionStart = session creation time
  ageMinutes = (sessionStart - evidenceTime) / 60000`,

    'command-hash-verify': `  // Verify command was actually executed
  expectedHash = hash of expected command output
  actualHash = hash of evidence output
  hashMatch = expectedHash === actualHash`,

    'output-cross-reference': `  // Cross-reference claimed output against actual
  claimedFields = keys in evidence JSON
  expectedFields = keys in expected schema
  missingFields = expectedFields - claimedFields`,

    'chain-link-verify': `  // Verify evidence chain has no broken links
  for each consecutive pair (A, B) in chain:
    if B.previousHash !== A.currentHash → broken link`,

    'container-test-presence': `  // Check if container test artifact exists and is valid
  artifactExists = fs.existsSync(ContainerTestResult.json)
  artifactParsed = JSON.parse succeeds
  hasPassRate = parsed.passRate is a number`,

    'evidence-source-count': `  // Count independent evidence sources
  sources = unique sources in evidence chain
  sourceCount = sources.length`,

    'promise-resolution-trace': `  // Trace promise resolution paths via CFG
  for each async function:
    hasReturn = function has return statement
    hasReject = function has reject() call
    hasResolve = function has resolve() call`,

    'concurrent-access-scan': `  // Scan for shared mutable state across execution contexts
  sharedVars = variables modified in multiple async contexts
  raceRisk = sharedVars.length > 0`,

    'nesting-depth-analysis': `  // Measure callback nesting depth
  maxDepth = maximum nesting of CallExpression chains
  callbackHellThreshold = maxDepth > 5`,

    'transition-matrix-verify': `  // Verify state machine transitions
  for each transition (from, to):
    isValid = transition exists in allowed transitions
    hasGuard = transition has guard condition`,

    'initial-state-presence': `  // Check if state machine has initial state
  hasInitial = stateMachine.initial is defined
  initialState = stateMachine.initial`,

    'terminal-reachability-analysis': `  // BFS from initial state to terminal states
  reachable = BFS(stateMachine.initial)
  terminalReachable = all terminal states in reachable`,

    'token-count-verify': `  // Count tokens in content vs budget
  tokenCount = count tokens in content
  budgetUtilization = tokenCount / budget`,

    'semantic-similarity-check': `  // Compare semantic similarity between content and reference
  similarity = cosineDistance(embed(content), embed(reference))
  isCoherent = similarity > threshold`,

    'entity-extraction-compare': `  // Extract and compare entities across content
  entities = extractEntities(content)
  consistencyScore = entities matching reference / total entities`,

    'language-identification': `  // Identify language of content
  detectedLanguage = detectLanguage(content)
  isCorrectLanguage = detectedLanguage === expectedLanguage`,

    'write-confirmation-check': `  // Verify write operation succeeded
  writeCalled = fs.writeFileSync or db.exec was called
  writeConfirmed = callback or return value confirms success`,

    'rollback-presence-check': `  // Check if rollback logic exists
  hasRollback = try-finally or try-catch with recovery exists
  rollbackCalled = compensation logic present`,

    'atomicity-analysis': `  // Analyze if operations are atomic
  multiStepWrite = operation modifies multiple fields
  hasTransaction = all-or-nothing pattern present`,

    'idempotency-verification': `  // Check if operation is idempotent
  sameInputSameOutput = calling twice with same input gives same result`,

    'coverage-threshold-check': `  // Measure test coverage
  coverage = coveredLines / totalLines
  meetsThreshold = coverage >= passThreshold`,

    'negative-test-scan': `  // Scan for negative test cases
  negativeCount = tests with expectedResult === 'FAIL'
  hasNegativeTests = negativeCount > 0`,

    'positive-test-scan': `  // Scan for positive test cases
  positiveCount = tests with expectedResult === 'PASS'
  hasPositiveTests = positiveCount > 0`,

    'test-body-analysis': `  // Analyze test function bodies for real assertions
  realAssertions = count of assert/expect calls
  theatricalTests = tests with 0 assertions`,

    'callgraph-walk': `  // Walk call graph to find call sites
  walk callGraph.entries for references to this construct
  callSiteCount = count of references found
  isCalled = callSiteCount > 0`,

    'export-analysis': `  // Check module exports against requirements
  exportedCount = count of exported declarations
  missingExports = required exports not found in module`,
  };

  return TEMPLATES[checkMethod] || `  // Generic signal extraction (${checkMethod})
  // Signals: ${signals.map(s => s.name).join(', ')}`;
}

// ============================================================================
// PSEUDOCODE GENERATION
// ============================================================================

/**
 * Generate a complete pseudocode block for a single defense rule.
 * Includes header, signal extraction, threshold comparison, and decision logic.
 */
function generatePseudocode(defense: DefenseSpec): string {
  const method = CHECK_METHODS[defense.analysisOrder];
  if (!method) {
    return [
      `// ================================================================`,
      `// Rule: ${defense.rule} — UNKNOWN ORDER: ${defense.analysisOrder}`,
      `// ================================================================`,
      `function check_${sanitizeRuleName(defense.rule)}(input):`,
      `  return { result: 'SKIP', reason: 'unregistered order' }`,
    ].join('\n');
  }

  // M7: Check per-defense signal overrides first, fall back to per-order signals
  const defenseSpecificSignals = DEFENSE_SIGNALS[defense.checkMethod];
  const effectiveSignals = defenseSpecificSignals ?? method.signals;
  const primarySignal = effectiveSignals[0]?.name ?? 'signal';
  const fnName = sanitizeRuleName(defense.rule);
  const t = defense.thresholds;
  const L: string[] = [];

  // ── Header ──
  L.push('// ================================================================');
  L.push(`// Rule: ${defense.rule}`);
  L.push(`// Domain: ${defense.domain} | Order: ${defense.analysisOrder} | Method: ${method.name}`);
  L.push(`// Bible: ${defense.bibleSource} | Severity: ${defense.violationSeverity} | Weight: ${defense.weight}`);
  L.push('// ================================================================');
  L.push('');
  L.push(`function check_${fnName}(input):`);
  L.push(`  // Inputs: ${defense.inputs.join(', ') || '(none)'}`);
  L.push(`  // Outputs: ${defense.outputs.join(', ') || '(none)'}`);
  L.push('');

  // ── Signal Extraction (per-defense, context-aware) ──
  const extractionCode = generateExtractionCode(defense.checkMethod, effectiveSignals);
  L.push(`  // ── Signal Extraction ──`);
  L.push(extractionCode);
  // Show signal definitions
  L.push(`  // Signals:`);
  for (const sig of effectiveSignals) {
    L.push(`  //   ${sig.name} (${sig.type}) — ${sig.description}`);
  }
  L.push('');

  // ── Threshold Comparison (context-aware via signal type) ──
  const primarySignalType = effectiveSignals[0]?.type || 'count';
  L.push('  // ── Threshold Comparison ──');
  L.push(`  //   PASS: ${primarySignal} ${formatThresholdForSignal(t.passThreshold, primarySignalType)}`);
  L.push(`  //   WARN: ${primarySignal} ${formatThresholdForSignal(t.warnThreshold, primarySignalType)}`);
  L.push(`  //   FAIL: ${primarySignal} ${formatThresholdForSignal(t.failThreshold, primarySignalType)}`);
  L.push('');

  // ── Decision Logic ──
  L.push('  // ── Decision Logic ──');
  L.push(`  if ${primarySignal} ${formatThresholdForSignal(t.passThreshold, primarySignalType)}:`);
  L.push(`    return { result: 'PASS', severity: '${defense.violationSeverity}' }`);
  L.push(`  elif ${primarySignal} ${formatThresholdForSignal(t.warnThreshold, primarySignalType)}:`);
  L.push(`    return { result: 'WARN', severity: '${defense.violationSeverity}' }`);
  L.push(`  else:`);
  L.push(`    return { result: 'FAIL', severity: '${defense.violationSeverity}' }`);

  return L.join('\n');
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Generate pseudocode strings for an array of defense rules.  Each defense's
 * `analysisOrder` determines which check method (regex, ast, typechecker,
 * cfg, or execution) is used to build the pseudocode block.
 *
 * The output is one pseudocode string per defense, in the same order as the
 * input array.  Each string is a self-contained pseudocode block with signal
 * extraction, threshold comparison, and decision logic.
 *
 * @param defenses - Array of DefenseSpec entries from Phase 3.
 * @returns Array of pseudocode strings, one per defense rule.
 */
export function generateAlgorithms(defenses: DefenseSpec[]): string[] {
  return defenses.map(generatePseudocode);
}
