# FIREWALL CONTEXT — Trident Agent (architecture-current)

## THE ENFORCEMENT STACK (tool.execute.before, in order)

### LAYER 1: BLOCKED TOOLS (Normal Mode)
Blocked unless Poseidon Mode is active:
- edit, write_file, write, patch, create, delete_file
- bash, terminal, execute, exec
- mcp_write_file, mcp_edit, mcp_patch
- Unlock is mechanical: poseidonState.isActive() check in toolBeforeHook

### LAYER 2: ALWAYS BLOCKED (Even in Poseidon)
- spawn_shark_agent, spawn-manta-agent variants, run_parallel_tasks
- Other agents' tools are classified operation (never claim-blocked) but NOT in Trident's execution path

### SSTF v4 — SEMANTIC SMOKE TEST FIREWALL (claim-gated)
Principle: **"Block the CLAIM, not the WORK."** Information gathering is ALWAYS allowed; claims of correctness without container-test evidence are gated.

Phase A (tool.execute.before):
- headless (`opencode run`) → BLOCK HEADLESS
- inline_exec (`node|bun -e|--eval|--print|--evaluate`, `npx -e`) → BLOCK INLINE_EXEC
- inspect_bundle → BLOCK only when a verification claim is pending (<300s, no container test since). Bundle-path WORK during builds (wc/grep/ls on dist as part of a build) is ALLOWED — the smoke path is bundle inspection AS verification.
- classification is PER-SUBCOMMAND: a head/grep in one subcommand cannot poison a bundle path in another (the FORGE derailment fix)
- claim_verification → ALLOW (the gate is Phase B's demand, never a work block)
- work tools (task/webfetch/hive/skill/checkpoint/plugin families) are operation — never claim-blocked
- 3 blocks → [SSTF ESCALATE]

Phase B (tool.execute.after — MUTATION, never throw):
- fresh claim + no container test → the [SSTF: CLAIM GATE] demand is APPENDED to the tool output the model sees
- user chat words NEVER trigger blocking — only the agent's own claims

Escape hatch: trident-container-test setup/run/suite/deploy → clears claim + theatrical state.

### THEATRICAL v2 — substitute-frame detection (replaces the old bare-keyword matcher)
The old \bmock\b / \bstub\b / "on the host" / "switch to deepseek" matcher blocked legit engineering (jest.mock, mock servers, stubs, operator workflows) — it is GONE.

- SUBSTITUTE frames (theatrical — Phase B demand, escalate at 3):
  - (just|simply|only|we can|i'll|let's|we should|you can) (mock|stub|fake|pretend)
  - (mock|stub|fake) (the|this|that) (result|response|output|tool|function|call|test|evidence|verification|audit)
  - pretend (the|this|it) (test|audit|verification|check) (passed|works|succeeded|is done)
  - (say|claim|report|write) (that )?(the|this|it) (test|audit|verification) (passed|works|succeeded)
  - (skip|without|no need for) (the )?(container|docker|container test)...(on the host|host) — the container-dodge frame
- USE frames (legitimate engineering — NEVER blocked):
  - (jest|vi|vitest|sinon).mock(, unmock, mock implementation/function
  - (npm|yarn|pnpm|bun) (i|install|add) *mock*
  - mock (data|server|endpoint|api|service|module|handler|fixture|response|request|object|file|config)
  - stub (api|endpoint|service|function|branch|method|request|handler|out|file)
- Detection: AGENT-ORIGIN only (assistant messages set the state; user words never) + proposal-tool args (write/edit content, send prompt/text, task prompt, bash command). read/grep paths are never proposals.
- Enforcement: Phase B [TRIDENT THEATRICAL GATE] demand; escalation throw at 3; container-test clears state.

### PHANTOM RESULT GATING (evidence-based)
- "The audit found X" / "based on the audit results" → LEGIT when an audit-ish tool (trident-code-audit/trident-gate/trident-status) actually ran this session (auditToolsRan). Tool-less result claims → BLOCKED.
- "trident-x can..." descriptions → suspicious only pre-tool (hasCalledTool false).
- Shell simulation (fake terminal output) → semantic descriptive-vs-suggestive scoring, BLOCKED.

### NARRATION BLOCKING (pre-tool)
- "I would use...", "One approach would be...", "First, I'll..." → BLOCKED (describe → execute)
- "Let me check/inspect/scan..." → NOT blocked (legit lead-ins; only audit|analyze|plan|review|walk through|summarize|outline frames)
- Applies to model responses only, not user input

### F1: Cross-Agent Isolation
- Non-Trident agents cannot call trident-* tools (throw [F1 BLOCKED])

## ALLOWLIST (What Trident CAN Call)
### Trident Tools (prefix trident- — ALL 12)
trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-poseidon, trident-gate, trident-status, trident-help, trident-omni-vision, trident-container-test, trident-ship-package, trident-preflight

### Core Tools
read, glob, grep, webfetch, question, task, todowrite, checkpoint, skill, build-status

### Hive Mind + Memory
hive_* (context/status/remember/scan/forget/restore/trash_list/delete), memread_session, memlink_parent

### Tool Families (classified operation — never claim-blocked)
reasoning-bus_*, visual-cortex_*, zai-vision_*, omni_canvas_*, vc-fetch_*, tv-browser_*, manta-*, shark-*, ps-mode-*, subagent_omni_vision, execute_omni_canvas, omni_vision

## POSEIDON MODE UNLOCK MECHANISM
When poseidonState.isActive(sessionId) returns true:
1. BLOCKED_TOOLS_FOR_TRIDENT filtered to remove bash/write/edit/write_file
2. Allowlist bypass grants these tools
3. trident_build subagent dispatch permitted
4. POSEIDON_UNLOCK_ACTIVE logged
On deactivation: tools re-blocked, session state preserved

## SUBAGENT GATE
- trident_explore: ALWAYS allowed (read-only research)
- trident_build: ONLY when poseidonState.isActive()
- trident_planner: L3 parallel L2 spec generation (calls trident-deep-planning layer=2)
- Any other subagent_type: BLOCKED

## WebFetch BAN
- Identity questions NEVER resolved via WebFetch; per-turn override bans WebFetch for identity

## Version
- Trident Agent — enforcement stack current as of dist 54baed0c

[END FIREWALL_CONTEXT.md — v4.4.2]
