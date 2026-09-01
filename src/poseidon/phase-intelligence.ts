// ============================================================
// FILE: src/poseidon/phase-intelligence.ts
// PURPOSE: Decision context generators for model-required phases.
//          Each function takes GodLoopState + findings and produces
//          a rich intelligence context that the model must engage with.
// ============================================================
// 2026-08-19 MERGE: ported from Checkpoints/phase_1_approved_working
// (the Aug-12 proven phase engine). ADAPTED to the live action surface:
// live has NO action=decide/plan/verify/solve — the driver is action=loop.
// The action contract lines were rewritten to the live loop flow.
// PHASE_ACTIONS/validatePhaseAction were NOT ported (live validates actions
// via the zod enum in trident-poseidon.ts — the phase_1 action map is dead).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AuditFinding } from '../audit-engine/types.js';
import type { GodLoopState, WaveAgentSpec } from './god-loop.js';

// ============================================================
// DECIDE — Intelligent Approach Selection
// ============================================================

export function generateDecideContext(state: GodLoopState): string {
  const remaining = state.postAuditFindings.length;
  const resolved = state.preAuditFindings.length - remaining;
  const byFile = groupByFile(state.postAuditFindings);

  let ctx = '[POSEIDON: DECIDE — Engineering Judgment Required]\n\n';

  // Current state
  ctx += 'Current State:\n';
  ctx += '- Score: ' + state.score + '/100 (target: 96)\n';
  ctx += '- Cycle: ' + state.cycle + ' (max: 50)\n';
  ctx += '- Stall counter: ' + state.stalledSince + '/2\n';
  ctx += '- Findings: ' + remaining + ' remaining (down from ' +
    state.preAuditFindings.length + ')\n\n';

  // Remaining findings grouped by file
  if (remaining > 0) {
    ctx += 'Remaining Findings by File:\n';
    for (const [file, findings] of byFile) {
      ctx += '  ' + path.basename(file) + ' (' + findings.length + ' findings):\n';
      for (const f of findings.slice(0, 5)) {
        ctx += '    [' + f.severity + '] ' + (f.layer || '?') + ': ' +
          (f.description || f.category || '').substring(0, 80) + '\n';
      }
      if (findings.length > 5) {
        ctx += '    ... and ' + (findings.length - 5) + ' more\n';
      }
    }
  }

  // Previous wave results
  ctx += '\nPrevious Wave Results:\n';
  ctx += '- Wave ' + state.wave + ': dispatched\n';
  ctx += '- ' + resolved + ' findings resolved, ' + remaining + ' remain\n';
  ctx += '- Last wave result: ' + state.lastWaveResult + '\n';

  // Stall analysis
  if (state.stalledSince >= 2) {
    ctx += '\n⚠️ SCORE HAS BEEN STALLED FOR ' + state.stalledSince + ' CYCLES.\n';
    ctx += 'The previous approach is NOT working. You MUST choose a different strategy.\n';
  }

  // Decision options with consequence hints
  ctx += '\nDecision Required:\n';
  ctx += 'Choose ONE:\n\n';
  ctx += 'A) PLAN — Generate a new remediation wave\n';
  if (state.stalledSince >= 2) {
    ctx += '   ⚠️ Previous approach failed. If choosing PLAN, you MUST specify a DIFFERENT approach.\n';
  }
  ctx += 'B) PROBLEM_SOLVE — Deep diagnosis (read source, identify root cause)\n';
  ctx += 'C) ACCEPT_RISK — Mark remaining findings as acceptable risk\n';
  ctx += '   (requires justification — adversarial verification will scrutinize)\n\n';

  ctx += 'The loop is at DECIDE. Call trident-poseidon action=loop to advance (the phase routes by score/stall state).';

  return ctx;
}

// ============================================================
// PLAN — Intelligent Fix Strategy
// ============================================================

export function generatePlanContext(
  state: GodLoopState,
  targetPath: string,
  decideReasoning?: string,
): string {
  const byFile = groupByFile(state.postAuditFindings);

  let ctx = '[POSEIDON: PLAN — Fix Strategy Required]\n\n';

  // Include decide reasoning if available
  if (decideReasoning) {
    ctx += 'Decision Context: ' + decideReasoning + '\n\n';
  }

  ctx += 'Files with findings (' + byFile.size + ' files, ' +
    state.postAuditFindings.length + ' total findings):\n';
  ctx += 'Each file gets ONE agent. That agent handles ALL findings in its file.\n\n';

  // Per-file source context
  for (const [file, findings] of byFile) {
    ctx += '### ' + path.basename(file) + ' (' + findings.length + ' findings)\n';

    for (const f of findings.slice(0, 8)) {
      const sourceContext = readSourceContext(targetPath, f.file, f.line, 3);
      ctx += '[' + f.severity + '] ' + (f.layer || '?') + ' at line ' + f.line + ':\n';
      ctx += '  Description: ' + (f.description || f.category || 'Unknown') + '\n';
      if (sourceContext && sourceContext !== 'source context not accessible') {
        ctx += '  >>> ' + sourceContext.split('\n').join('\n  >>> ') + '\n';
      }
      if (f.correction) {
        ctx += '  Suggested fix: ' + f.correction.substring(0, 120) + '\n';
      }
      ctx += '\n';
    }

    if (findings.length > 8) {
      ctx += '  ... and ' + (findings.length - 8) + ' more findings in this file\n\n';
    }
  }

  ctx += 'Strategy Required:\n';
  ctx += 'For each file, provide:\n';
  ctx += '1. Root cause (WHY do these findings exist? Not just WHAT is wrong)\n';
  ctx += '2. Approach (HOW to fix — address root cause, not symptoms)\n';
  ctx += '3. Blast radius (WHAT ELSE is affected by this change?)\n';
  ctx += '4. Depth level (surface/medium/deep/root — match to severity)\n\n';

  ctx += 'The loop is at PLAN. Call trident-poseidon action=loop to get the DISPATCH instructions.';

  return ctx;
}

// ============================================================
// VERIFY — Intelligent Trust Determination
// ============================================================

export function generateVerifyContext(
  state: GodLoopState,
  agentOutputs: Record<string, unknown>,
): string {
  let ctx = '[POSEIDON: VERIFY — Trust Judgment Required]\n\n';

  ctx += 'Wave ' + state.wave + ' Results:\n';

  // Mechanical check summary
  ctx += '- Mechanical checks: ';
  if (state.lastWaveResult === 'TRUSTED') {
    ctx += 'ALL PASS\n';
  } else if (state.lastWaveResult === 'THEATRICAL') {
    ctx += 'THEATRICAL DETECTED — agents may have returned fake results\n';
  } else {
    ctx += state.lastWaveResult + '\n';
  }

  // Agent output summaries
  const agentNames = Object.keys(agentOutputs);
  ctx += '- ' + agentNames.length + ' agents returned\n\n';

  if (agentNames.length > 0) {
    ctx += 'Agent Outputs for Review:\n';
    for (const [agentName, output] of Object.entries(agentOutputs)) {
      const out = output as Record<string, unknown>;
      ctx += '\nAgent: ' + agentName + '\n';
      ctx += '  Files changed: ' +
        (Array.isArray(out.filesChanged) ? out.filesChanged.join(', ') : 'none') + '\n';
      ctx += '  SHA256: ' +
        (out.claimedSha256 ? 'provided' : 'not provided') + '\n';
      const outputText = typeof out.output === 'string' ? out.output : '';
      ctx += '  Claims: ' + outputText.substring(0, 150) + '\n';
    }
  }

  // Verification prompts
  ctx += '\nReview each agent\'s work:\n';
  ctx += '1. Does the fix ACTUALLY address the finding? (not just silence it)\n';
  ctx += '2. Is the fix REAL CODE or theatrical? (stubs, returns-hardcoded-success)\n';
  ctx += '3. Did the agent introduce NEW issues?\n';
  ctx += '4. CONSTRUCTION CHECK: Does the new code add real discriminative power,\n';
  ctx += '   or is it tautologically true by construction?\n';
  ctx += '5. SNIFF TEST: Would an adversarial reviewer accept this?\n\n';

  ctx += 'Write the verification report (.trident/verify/wave-' + state.wave + '.md) with per-agent verdicts:\n';
  ctx += '  TRUSTED — fix is real and addresses the finding\n';
  ctx += '  QUARANTINED — fix has issues but partial value\n';
  ctx += '  REJECTED — fix is theatrical or introduces new problems\n';
  ctx += 'Then call trident-poseidon action=loop to advance (the verify-report gate enforces the report).';

  return ctx;
}

// ============================================================
// CONTAINER_TEST — Fully Manual, Adversarial Quality Gates
// ============================================================

export function generateContainerTestContext(
  state: GodLoopState,
  targetPath: string,
): string {
  let ctx = '[POSEIDON: CONTAINER_TEST — FULLY MANUAL, PRIMARY AGENT OWNED]\n\n';

  ctx += 'CRITICAL: This phase is NOT automated. You OWN the entire process.\n';
  ctx += 'The God Loop will NOT advance until you produce mechanical evidence\n';
  ctx += 'from 5+ adversarial angles.\n\n';

  ctx += 'What You Must Do:\n';
  ctx += '1. Design a container test plan with 5+ DIFFERENT adversarial scenarios.\n';
  ctx += '   Not 5 variations of the same test — 5 genuinely different attack vectors.\n';
  ctx += '2. Execute each test via the trident-container-test tool manually.\n';
  ctx += '3. Analyze every failure mode — root cause, not symptom.\n';
  ctx += '4. Only declare PASS when ALL angles pass with mechanical evidence.\n\n';

  // 2026-08-19 MERGE: the operational contract is adapted to the LIVE action
  // surface (send/check/results + the LASME artifact). The phase_1 recipe
  // (grep offsets + action=start declaration) is the OLD 12-step flow.
  ctx += 'THE CONTAINER TEST OPERATIONAL CONTRACT (the live flow — use EXACTLY these):\n';
  ctx += '  - The container is driven via trident-container-test: action=setup (if needed),\n';
  ctx += '    action=deploy (the dist bundle), action=send (the natural-language prompt),\n';
  ctx += '    action=check (passToken/failToken per scenario), action=results (finalizes\n';
  ctx += '    the LASME artifact .trident/container-test-results.json).\n';
  ctx += '  - You CANNOT hand-write the results artifact — it is protected\n';
  ctx += '    ([CONTAINER RESULTS GATE]). The tool writes it.\n';
  ctx += '  - PASS requires the artifact overallVerdict=PASS with mechanical evidence\n';
  ctx += '    (the passToken in a tool-result context, the failToken absent).\n\n';

  ctx += 'Required Attack Vectors (minimum 5, each must be genuinely different):\n';
  ctx += '  - Identity injection (does the agent know it\'s Trident?)\n';
  ctx += '  - Tool availability (are all tools registered and callable?)\n';
  ctx += '  - Firewall enforcement (are writes blocked without Poseidon?)\n';
  ctx += '  - Audit accuracy (does the audit find real defects, not phantom ones?)\n';
  ctx += '  - Poseidon lifecycle (activation, tool unlock, deactivation)\n\n';

  ctx += 'Optional Additional Vectors:\n';
  ctx += '  - Error propagation (what happens when a tool throws?)\n';
  ctx += '  - Boundary conditions (empty input, max-size input, malformed data)\n';
  ctx += '  - Permission bypass (can a subagent call trident-poseidon?)\n';
  ctx += '  - State corruption (what if state.json is invalid?)\n';
  ctx += '  - Configuration drift (what if env vars are missing?)\n\n';

  ctx += 'Quality Gates (mechanically enforced — will REJECT inadequate plans):\n';
  ctx += '  Gate 1: Minimum 5 scenarios\n';
  ctx += '  Gate 2: Each scenario tests a DIFFERENT attack vector\n';
  ctx += '  Gate 3: Each scenario has MECHANICAL evidence (stream, SHA256, artifact)\n';
  ctx += '  Gate 4: Each scenario is ADVERSARIAL (tries to break, not confirm)\n';
  ctx += '  Gate 5: Coverage includes identity, tools, firewall, audit, poseidon\n\n';

  ctx += 'Target: ' + targetPath + '\n';
  ctx += 'Current Score: ' + state.score + '/100\n\n';

  ctx += 'Design your test plan, execute it, and report results.\n';
  ctx += 'If ALL scenarios pass with evidence → the God Loop advances to PASS.\n';
  ctx += 'If ANY scenario fails → call trident-poseidon action=loop (the phase routes to PROBLEM_SOLVE).';

  return ctx;
}

// ============================================================
// PROBLEM_SOLVE — Deep Source Analysis
// ============================================================

export function generateProblemSolveContext(
  state: GodLoopState,
  targetPath: string,
  triggerType?: string,
): string {
  let ctx = '[POSEIDON: PROBLEM_SOLVE — Deep Analysis Required]\n\n';

  ctx += 'Context:\n';
  ctx += '- Score: ' + state.score + '/100\n';
  ctx += '- Stalled: ' + state.stalledSince + ' cycles\n';
  ctx += '- Findings: ' + state.postAuditFindings.length + ' remaining\n';
  if (triggerType) {
    ctx += '- Trigger: ' + triggerType + '\n';
  }

  // List findings with file locations
  const byFile = groupByFile(state.postAuditFindings);
  ctx += '\nFindings That Won\'t Resolve:\n';
  for (const [file, findings] of byFile) {
    ctx += '  ' + path.basename(file) + ' (' + findings.length + ' findings):\n';
    for (const f of findings.slice(0, 3)) {
      ctx += '    [' + f.severity + '] ' + (f.description || f.category || '').substring(0, 80) + '\n';
    }
  }

  ctx += '\nRequired Action:\n';
  ctx += 'READ the actual source files. Do NOT generate text without reading code.\n';
  ctx += 'Identify the ROOT CAUSE — not the symptom.\n\n';

  ctx += 'Depth Calibration — choose the right level:\n';
  ctx += '  Surface: "Fix the empty catch" (symptom)\n';
  ctx += '  Medium: "Add error handling pattern" (disease)\n';
  ctx += '  Deep: "Module needs Result<T,E> type" (architecture)\n';
  ctx += '  Root: "Codebase doesn\'t distinguish recoverable errors" (paradigm)\n';
  ctx += 'Match depth to severity. CRITICAL demands root-level thinking.\n\n';

  ctx += 'Frameworks to Apply:\n';
  ctx += '  - First Principles: What is irreducibly true? Strip assumptions.\n';
  ctx += '  - Causal Chain: Trace data flow to exact failure point.\n';
  ctx += '  - Inflection Detection: Is the current approach being invalidated?\n';
  ctx += '  - Derivation: If this is solved, what else does it unlock?\n';
  ctx += '  - Enhancement: How to prevent this class of issue in future?\n\n';

  ctx += 'Write the diagnosis file (.trident/god-loop/problem-solve-' + state.cycle + '.md) with the strategy, then call trident-poseidon action=loop.';

  return ctx;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function groupByFile(findings: AuditFinding[]): Map<string, AuditFinding[]> {
  const groups = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    const fileKey = f.file || 'unknown';
    const arr = groups.get(fileKey) || [];
    arr.push(f);
    groups.set(fileKey, arr);
  }
  return groups;
}

function readSourceContext(
  targetPath: string,
  file: string,
  line: number,
  contextLines: number,
): string {
  try {
    const fullPath = path.resolve(targetPath, file);
    if (!fs.existsSync(fullPath)) return 'source context not accessible';
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);
    return lines.slice(start, end).join('\n').trim();
  } catch {
    return 'source context not accessible';
  }
}
