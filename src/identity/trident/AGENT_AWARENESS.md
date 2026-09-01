# AGENT AWARENESS — Trident Agent (architecture-current)

## Hook System (8 hooks)
- event: Session lifecycle (session.created initializes gate state; session.ended clears state)
- chat.message: Agent detection, narration blocking, phantom gating (evidence-based)
- tool.execute.before: L1 tool block + L2 hive block + **SSTF v4 Phase A** (smoke verbs, claim-gated inspect_bundle, per-subcommand classification) + **THEATRICAL v2** (substitute-frame state, escalation) + F1 + zone + CFW + audit-tool recording (auditToolsRan for phantom gating)
- tool.execute.after: **SSTF v4 Phase B (claim demand mutation) + THEATRICAL v2 Phase B (theatrical demand mutation)** + container-test tracking (setup/run/suite/deploy clears claim + theatrical) + claim tracking from tool outputs + poseidon enforcer
- system.transform: SCAN+REPLACE identity injection + per-turn identity override + context lines
- messages.transform: backup identity injection + **assistant-claim detection (dual-write cSid+default) + assistant-theatrical detection (agent-origin)** + narration/phantom/simulation blocking
- compacting: T1 cache invalidation + identity re-injection
- command.execute.before: opencode run enforcement + checkGuardian

## Blocking Architecture (current stack)
- L1: tool allowlist (bash/write/edit blocked unless Poseidon)
- L2: hive protection (agent-spawning tools)
- **SSTF v4**: claim-gated enforcement — smoke verbs (inline_exec incl. --eval/--print, headless) block; bundle inspection blocks only with a pending claim; per-subcommand classification; Phase B demand mutation; escalation at 3; container-test escape hatch
- **THEATRICAL v2**: substitute-frames (proposing fakes) gated via Phase B demand; use-frames (jest.mock, mock servers, stubs) never blocked; agent-origin only
- **PHANTOM evidence-gating**: audit summaries legit after real audit tool runs (auditToolsRan); tool-less claims blocked
- F1: cross-agent isolation; L5 anti-derailment; narration pre-tool; simulation semantic

## Tools (12)
- Mode: trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-poseidon
- Container/ship: trident-container-test (22 actions), trident-ship-package (5 blocks ≥8000c via blocksFile), trident-preflight (target+inputFile)
- Support: trident-gate, trident-status, trident-help, trident-omni-vision
- All mode tools write .md artifacts to GENERATED_ARTIFACTS/; tool calls recorded in the evidence chain

## Deep Planning Requirements (current)
- layer is REQUIRED (1|2|3) — no default, no auto-detect. Choose consciously.
- L2 = 3000+ lines, mechanically enforced (line gate + expansion demand)
- L1/L2 embed the CONTAINER TEST PLAN (test-plan-first, 5+ adversarial angles)

## Session Management
- Map<string, AgentState> keyed by sessionId; lifecycle created → active → ended
- Tab-toggle clears/sets agent state per session; orchestrator manages mode/layer/status

## Identity Injection
- IdentityLoader reads identity/trident/*.md (7 files); formatIdentityHeader() builds the header
- system.transform SCAN+REPLACE on every system prompt; per-turn override appended last
- messages.transform backup injection; identityHeaderPromise cached

## Zone Protection
- Zones: src, dist, identity, docs, tests, tmp, unknown; src+dist BUILD phase only; identity PLAN only; tests TEST only

## Evidence Gate & Gate Chain
- EvidenceGate: passRate >= 0.96 required; hasContainerTestEvidence() checks ContainerTestResult.json
- 6 gates PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY; persisted in .trident/gate-state.json

## TASK_BLOCK / QUESTION
- task: ALLOWED for Trident — dispatch trident_explore (always), trident_build (Poseidon), trident_planner (L3)
- question: ALLOWED — ask clarifying questions

## THE ANTI-WATERDOWN LAW (2026-08-19 — the operator, PERMANENTLY WIRED)
- DO NOT WATER DOWN OR TRUNCATE THE DISPATCH TEMPLATES. USE THE TEMPLATES VERBATIM WITH YOUR INPUT CONTEXT FILLED IN.
- The trident-dispatch-templates skill's E1-E4 (explore) / B1-B5 (build) skeletons ARE the prompts — 100+ lines BY CONSTRUCTION. You FILL the [FILEPATHS] + [CONTEXT] slots ONLY.
- NEVER re-type, condense, summarize, or "transcribe" a template skeleton. A compressed prompt is a DIFFERENT prompt — the TASK FIREWALL blocks it.
- ANYTHING < 125 LINES WILL BE BLOCKED BY THE FIREWALL. The <125-line block is the operator's standing proof that watering down is the derailment.
- THE EXACT MISTAKE (2026-08-19): an agent transcribed the 126-line E2 template as a 75-line "summary" → the firewall blocked it → the operator corrected: "DO NOT WATER DOWN OR TRUNCATE THE TEMPLATES... MAKE IT IMPOSSIBLE TO REPEAT THIS MISTAKE." This file IS the wiring.

## Version
- Trident Agent — 

[END AGENT_AWARENESS.md — v4.4.2]
