# QUALITY — Trident Agent

## Finding Requirements
- Every finding MUST include:
  - File path (relative to project root)
  - Line number (1-indexed)
  - Confidence score (0.0-1.0)
  - Category (R0-R16 layer)
  - Severity (CRITICAL, HIGH, MEDIUM, LOW)
  - Evidence (tool output excerpt, not narration)
- Findings without ALL of these fields are INVALID

## Theatrical Patterns (BLOCKED)
- THEATRICAL_SUGGESTION (v2): agent proposes substituting fakes for real work ("just mock the result", "pretend the test passed", "claim the audit succeeded", "skip the container test for the host") — USE frames (jest.mock, mock servers, stubs in tests) are legitimate engineering and never flagged
- HOST_FALLBACK: Agent claims host testing proves functionality — container required
- MODEL_USAGE: Agent suggests switching to a different model
- SIMULATED_EXECUTION: Results claimed without actual tool execution
- Pre-tool narration: "I would use...", "Let me analyze...", "One approach would be..."
- Phantom results: "The audit found..." without tool call in evidence chain
- Shell simulation: fake terminal output as evidence
- Hallucinated comments: fake code comments as evidence
- These patterns are detected by NLP regex and Merkle chain verification

## Evidence Hierarchy
- Level 1 (Highest): Tool output — raw JSON/string from tool execution
- Level 2: Source analysis — findings from reading actual source files
- Level 3: Merkle chain — cryptographic verification of tool execution sequence
- Level 4 (BLOCKED): Narration — "I found...", "My analysis shows..."
- Level 4 is NEVER acceptable as evidence
- Evidence MUST be backed by tool execution, not narration

## Gate Standards
- Gate chain: PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY
- Each gate has specific blocking criteria:
  - PLAN: Requirements analysis complete, architecture documented
  - BUILD: Runtime-grade implementation, engineering checklist all fields true
  - TEST: Container test passed, ContainerTestResult.json exists
  - VERIFY: Trident code review 0 critical, 0 high findings
  - AUDIT: Spec alignment verified, test authenticity verified
  - DELIVERY: All previous gates passed, changelog generated
- Gates advance ONLY when blocking criteria are met
- Evidence gate: passRate >= 0.96 for delivery advancement

## Evidence Files Required Per Gate
- TEST: ContainerSpawnResult.json, ContainerTestResult.json
- VERIFY: TridentReport.json, EngineeringChecklist.json
- AUDIT: SpecAlignmentReport.json, TestAuthenticityReport.json
- DELIVERY: CHANGELOG.md, DEBUG_LOG.md, BUILD_REPORT.md

## Audit Layers (R0-R16)
- R0: Build chain verification
- R1: Hook contract compliance
- R2: State machine transitions
- R3: Control flow integrity
- R4: Error path completeness (empty catches = CRITICAL)
- R5: Path resolution (no hardcoded machine-specific paths)
- R6: Dependency verification
- R7: Import validation
- R8: Unused exports
- R9: Output contract
- R10: Dead code detection
- R11: Validation patterns
- R12: Agent guards
- R13: Data flow / type-any guards
- R14: Unreachable code
- R15: Resource lifecycle
- R16: Side-effect truth

## TASK_BLOCK RULES
- task tool: ALLOWED unconditionally — dispatch subagents for data gathering as needed

## QUESTION TOOL
- question tool: ALLOWED — use to clarify ambiguous requirements before audit

## Version
- Trident Agent

[END QUALITY.md — v4.4.2]
