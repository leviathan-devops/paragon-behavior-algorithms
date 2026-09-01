# TOOLS — Trident Agent (architecture-current)

## Mode Tools (5)

### 1. trident-code-audit
- 18-layer audit pipeline (R0-R16 + preflight), AST-based, zero regex false positives on prose
- Input: targetPath (project directory); action: full | quick | preflight-only
- Output: CODE_REVIEW .md artifact with findings table, fix code, verification checklist
- Every claim of audit correctness must be backed by the artifact — summaries after the tool ran are legitimate (phantom gating is evidence-based)

### 2. trident-deep-planning
- 3-layer planning pipeline: L1 Initial Plan, L2 Detailed Workflow (build spec), L3 Context Library
- **layer is REQUIRED — NO DEFAULT.** Pass layer=1|2|3 explicitly and consciously. There is no auto-detect and no fallback. Passing layer=1 when you mean 2 silently produces the wrong artifact.
- **L2 mandate: 3000+ lines.** Both generation paths mechanically enforce this (line gate with surgical-expansion retry; the artifact path appends an ## L2 LINE TARGET DEMAND when short). Never accept a short spec.
- TEST-PLAN-FIRST: L1 and L2 outputs MUST include the container test plan section (5+ adversarial angles from the 12-angle library) — planning defines the tests, tests define done.
- Input: targetPath, layer, requirements (4000+ chars for L2), architecture, contextFiles, structured fields (components/constraints/designDecisions/knownGaps/sourceLineage/fileInventory)
- Output: BUILD_SPEC + Context Library Manifest; L2 = 3000+ line implementation spec

### 3. trident-problem-solving
- 6-layer problem-solving pipeline with 6 mental frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven)
- Input: targetPath, problem (500+), reasoning (3+), workingPlan (3+), context (2000+)
- Output: Plan artifact with reasoning chain, RCA, working plan

### 4. trident-context-synthesis
- 4-layer context synthesis pipeline
- Input: projectName, outputMode T1|T2, keyFacts (3+ T1 / 5+ T2), structured fields, context, requirements
- Output: T1 Injectable or T2 standalone knowledge file

### 5. trident-poseidon (God Loop Orchestrator)
- 13-phase God Loop: INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY → AUDIT_RECHECK → PROBLEM_SOLVE → CONTAINER_TEST → PASS/FAILED. Old name LOCKED = PASS (load-time alias).
- Input: targetPath, action (start/status/abort/verify/phase/deactivate/revoke)
- Dispatches trident_build subagents to implement changes; loops until 96%+ runtime grade, container tests, then LOCKED
- Poseidon Mode unlocks bash/write/edit + trident_build dispatch mechanically

## Container Testing & Ship Tools (the canonical verification path)

### 6. trident-container-test — THE single sanctioned container interface
- Action-based API (setup | deploy | send | read | check | key | exec | cp | screenshot | export | clear | stop | alive | connect | host-pipeline | restart | suite | report | switch-model | switch-agent | verify-model | verify-agent)
- **setup** brings the TUI up (bounded status-bar readiness, ~15-30s, never hangs); the caller steers with the other actions
- **send** with waitForCompletion=true returns completed:true + responseSlice when the reply renders (capture-pane detection); the timeout path returns clean JSON
- **read** is PURELY LINE/OFFSET (offset/limit) — byte params (fromByte/sincePos/maxBytes) were REMOVED; content is lexicon-filtered (TUI chrome dropped)
- **check** uses a persistent cursor (second call scans only new bytes)
- **switch-model / switch-agent** type DISPLAY names (what the TUI shows), split sends with a beat, Escape-first, and verify via the status bar (parseStatusBar — ground truth)
- **verify-model / verify-agent** return the [agent] · [model] [provider] triple from the TUI status bar
- **suite** dispatches tests (send+check per test); **report** generates the summary
- **testPlan** for setup: 2000+ chars, exact sections (OBJECTIVE / TOOLS UNDER TEST / TEST SCENARIOS 3+ with Prompt+Pass/Fail+Max wait+Evidence / ADVERSARIAL 1+ / EVIDENCE / PASS CRITERIA); probe-only plans are REJECTED
- Running setup/run/suite/deploy CLEARS the claim gate and theatrical state (escape hatch)

### 7. trident-ship-package
- Validates build, copies ENTIRE project (src/dist/configs), generates SHIP_MANIFEST + DEPLOY.sh + README + BUILD_REPORT + DEBUG_LOG + FULL_BUILD_CONTEXT + MASTER_INDEX
- 5 context blocks MANDATORY ≥8000 chars each (whatWasBuilt, bugsFound, architectureDecisions, filesChanged, testResults)
- 40K+ chars exceed the function-calling payload: pass them via blocksFile (JSON file; file fields override inline args) — never placeholder args

### 8. trident-preflight
- Mechanical input validator BEFORE the LLM tools — write all args to /tmp/preflight-{tool}.json, then call with target=dp|cs|ps|ct|spg + inputFile=<path>
- Uses the EXACT same validators as the real tools: READY means the tool will accept

## Support Tools
- trident-gate: evaluate specific audit layers (R0-R16)
- trident-status: current Trident state
- trident-help: reference for commands, modes, layers
- trident-omni-vision: media processing (image/video/PDF/audio)

## ENFORCEMENT DOCTRINE (how the firewall treats you)
- **SSTF v4 — "Block the CLAIM, not the WORK."** Information gathering (read/grep on source) is ALWAYS allowed. Claims of correctness WITHOUT container-test evidence are gated: Phase B injects the [SSTF: CLAIM GATE] demand into tool outputs (mutation, never blocks the work). Smoke operations are blocked: node/bun -e/--eval/--print (INLINE_EXEC), opencode run (HEADLESS), bundle inspection with a pending claim (VERIFY_INSPECT). 3 blocks → ESCALATE. User chat words never trigger blocking.
- **Theatrical v2 — substitute-frames block, use-frames are engineering.** Proposing "just mock the result", "pretend the test passed", "claim the audit succeeded", or skipping the container test for the host = theatrical (Phase B [TRIDENT THEATRICAL GATE] demand, escalate at 3). Legit USE frames are NEVER blocked: jest.mock(, vi.mock(, sinon.stub(, installing mock libs, mock servers/data/endpoints, stubbing APIs, unmock.
- **Phantom results are evidence-gated.** "The audit found X" is LEGIT after an audit tool actually ran. Only tool-less result claims block.
- **Container tests are the escape hatch.** Running trident-container-test clears claim + theatrical gating.
- Pre-tool narration and shell simulation remain blocked (describe → execute, never narrate-only).

## ALWAYS ALLOWED (Normal Mode)
- All trident-* tools (12: code-audit, deep-planning, problem-solving, context-synthesis, poseidon, gate, status, help, omni-vision, container-test, ship-package, preflight)
- read, glob, grep — filesystem read; webfetch — web; task — subagents; question, todowrite, checkpoint, build-status
- hive_* tools, memread_session, memlink_parent, reasoning-bus_*, visual-cortex_*, zai-vision_*, omni_canvas_*, vc-fetch_*, tv-browser_*
- skill (load skills), manta-*/shark-*/ps-mode-* (other agents' tools — classified operation, never claim-blocked)

## BLOCKED IN NORMAL MODE, UNLOCKED IN POSEIDON MODE ONLY
- bash, terminal, execute, exec; write, write_file; edit, patch; create, delete_file
- Mechanically unlocked when poseidonState.isActive() — toolBeforeHook removes them from the blocklist

## Subagent Dispatch Rules
- `task(subagent_type="trident_explore")` — ALWAYS allowed (read-only research)
- `task(subagent_type="trident_build")` — ONLY in Poseidon Mode
- `task(subagent_type="trident_planner")` — L3 parallel L2 spec generation (calls trident-deep-planning layer=2)
- Any other subagent_type is BLOCKED — go straight to the correct one on the FIRST attempt

## Version
- Trident Agent —  (all tools verified)
