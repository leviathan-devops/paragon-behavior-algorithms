// src/tools/trident-preflight.ts
// trident-preflight — Mechanical input validation BEFORE calling LLM tools.
//
// Workflow for agents:
//   1. Write all args to /tmp/preflight-{tool}.json
//   2. Call trident-preflight with tool + inputFile + layer/mode
//   3. If FAIL — expand short fields in the file, re-call preflight
//   4. When READY — call the actual tool with inputFile/blocksFile
//
// This tool calls the SAME validators as the real tools. If preflight
// says READY, the tool WILL accept the input. Zero estimation. Zero waste.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as fs from 'fs';

import { validateDeepPlanningInput, validateContextSynthesisInput, validateProblemSolvingInput, validateTestPlan } from './input-validation.ts';

// ── SPG validation (not in input-validation.ts, has its own rules) ──

const SPG_MIN = 8000;
const SPG_FIELDS = ['whatWasBuilt', 'bugsFound', 'architectureDecisions', 'filesChanged', 'testResults'];

/** THE R16 TYPE_CERTAINTY GUARDED READ — an unknown value is typeof-checked in
 *  an if-guard block BEFORE the string assertion: the type certainty is earned
 *  by the runtime check, never a bare `as string` inside a ternary (which the
 *  R16 guard detector does not recognize). */
function stringLength(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }
  return 0;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the args' string field is
 *  typeof-guarded before the assertion. */
function asStringArg(args: Record<string, unknown>, field: string): string {
  const v = args[field];
  if (typeof v === 'string') {
    return v;
  }
  return '';
}

function validateSPG(args: Record<string, unknown>): { passed: boolean; fields: Array<{ name: string; actual: number; min: number; pass: boolean }> } {
  const blocks = ['whatWasBuilt', 'bugsFound', 'architectureDecisions', 'filesChanged', 'testResults'];
  const MIN = 8000;
  const fields = blocks.map((b) => {
    const actual = stringLength(args[b]);
    return { name: b, actual, min: MIN, pass: actual >= MIN };
  });
  return { passed: fields.every((f) => f.pass), fields };
}

// ── THE TASK-PROMPT LINES MODE (2026-08-06 — the operator's mandate: the SAME
// mechanical preflight the LLM tools get, applied to DISPATCH PROMPTS) ──
// The TASK FIREWALL enforces the line floors + the structural checks on every
// task dispatch — this validator mirrors those EXACT checks so the orchestrator
// can preflight a dispatch prompt BEFORE the wasted round. Chars for the LLM
// tools; LINES for the task tool. Input: { "prompt": "<the full prompt text>" }.
export function validateTaskPromptLines(prompt: string): { passed: boolean; lines: string[] } {
  const out: string[] = [];
  let passed = true;
  const totalLines = prompt.split('\n').length;
  const markers = [
    { re: /mission|objective/i, name: 'mission/objective' },
    { re: /reading order|read.*before/i, name: 'reading order' },
    { re: /what|how|why/i, name: 'WHAT/HOW/WHY' },
    { re: /constraint|do not touch|frozen/i, name: 'constraints/do-not-touch' },
    { re: /verification|verify/i, name: 'verification protocol' },
    { re: /return format|report/i, name: 'return format' },
  ];
  let present = 0;
  const missing: string[] = [];
  for (const m of markers) {
    if (m.re.test(prompt)) present++; else missing.push(m.name);
  }
  // the structural checks (the firewall mirror)
  const structural: string[] = [];
  if (/\[FILL/.test(prompt)) structural.push('the prompt still contains [FILL] markers — the template was NOT filled');
  const absPaths = (prompt.match(/(?:\/home\/|\/root\/|\/tmp\/|\/var\/|\/usr\/|\/etc\/|\/opt\/|\/workspace\/|\/app\/|\/mnt\/|C:\\|\/Users\/)/g) || []).length;
  if (absPaths < 3) structural.push('fewer than 3 absolute file paths');
  const what = (prompt.match(/\bWHAT:/g) || []).length;
  const why = (prompt.match(/\bWHY:/g) || []).length;
  const expected = (prompt.match(/\bEXPECTED:/g) || []).length;
  const debugEscape = /THE SYMPTOM/.test(prompt) && /THE SUSPECTS/.test(prompt) && /THE A\/B TESTS/.test(prompt) && /THE FIX SPEC/.test(prompt);
  const expansionOk = (what >= 3 && expected >= 3 && why >= 2) || debugEscape;
  if (!expansionOk) structural.push('no per-task WHAT/HOW/WHY/EXPECTED expansion (3+ tasks each with the 4-part block)');
  const cmd = /(\b(?:bun|npm|npx|node|vitest|tsc|pytest|git|sha256sum)\s|\bgrep\s|\brg\s|\bread\s+\/|\bglob\s+)/.test(prompt);
  if (!cmd) structural.push('no concrete verification commands (grep/read/bun/sha256sum — a command, not "run the tests")');
  const nonEmpty = prompt.split('\n').filter((l: string) => l.trim().length > 0);
  const uniq = new Set(nonEmpty.map((l: string) => l.trim().toLowerCase().replace(/\s+/g, ' ')));
  const ratio = nonEmpty.length > 0 ? uniq.size / nonEmpty.length : 0;
  if (ratio < 0.55) structural.push('repetition detected — only ' + Math.round(ratio * 100) + '% of the lines are unique');
  const structureOk = structural.length === 0;
  const floor = structureOk ? 125 : 150;
  out.push(`  [${totalLines >= floor ? 'PASS' : 'FAIL'}] lines: ${totalLines} (min ${floor} — ${structureOk ? '125 with the DPL1 structure complete' : '150 — the structural checks failed'})`);
  if (totalLines < floor) passed = false;
  if (present < 4) {
    passed = false;
    out.push(`  [FAIL] section markers: ${present}/6 — missing: ${missing.join(', ')}`);
  } else {
    out.push(`  [PASS] section markers: ${present}/6`);
  }
  if (!structureOk) {
    passed = false;
    out.push('  [FAIL] STRUCTURAL: ' + structural.join('; '));
  } else {
    out.push('  [PASS] structural checks (paths, per-task expansion, commands, uniqueness)');
  }
  if (!cmd) out.push('  [FAIL] verification commands: add concrete command lines (read /path, grep pattern file, bun test ...)');
  return { passed, lines: out };
}

// ── Tool registration ──

export function createPreflightTool() {
  return tool({
    description: `Mechanical pre-flight input validator. Call BEFORE trident-deep-planning, trident-context-synthesis, trident-problem-solving, trident-container-test, trident-ship-package, OR ANY task dispatch. Write all args to a JSON file, then call this tool with target=<tool> inputFile=<path>. CHARS for the LLM tools (dp/cs/ps/ct/spg — the exact validators the real tools use); LINES for target=task (the dispatch-prompt validation — the line floor 125/150 + the 6 section markers + the structural checks: [FILL] absence, 3+ absolute paths, per-task WHAT/HOW/WHY/EXPECTED, concrete verification commands, the unique-line ratio — the EXACT same checks as the TASK FIREWALL). If preflight says READY, the tool WILL accept. Zero estimation, zero wasted tokens, zero wasted dispatch rounds.`,
    args: {
      target: z.enum(['dp', 'cs', 'ps', 'ct', 'spg', 'task']).describe('Which tool to validate for: dp=deep-planning (chars), cs=context-synthesis (chars), ps=problem-solving (chars), ct=container-test (chars), spg=ship-package (chars), task=the dispatch prompt (LINES mode — the line floor + the section markers + the structural checks)'),
      inputFile: z.string().describe('Path to JSON file containing all tool args — for target=task: {"prompt": "<the full dispatch prompt text>"}'),
      layer: z.number().optional().describe('DP layer (1, 2, or 3). Required for dp.'),
      mode: z.string().optional().describe('CS mode (T1 or T2). Required for cs.'),
    },
    execute: async (args: { target?: string; tool?: string; inputFile?: string; layer?: number; mode?: string }) => {
      // DEFENSIVE VALIDATION: missing args must produce a clear usage error,
      // never a crash (fs.readFileSync(undefined) -> 'Cannot read undefined').
      const toolName = args.target || args.tool || '';
      if (!toolName) {
        return 'PREFLIGHT ERROR: target is required — pass target=dp|cs|ps|ct|spg (which tool to validate for).';
      }
      if (!args.inputFile) {
        return 'PREFLIGHT ERROR: inputFile is required — write ALL tool args to /tmp/preflight-{tool}.json first, then pass the path. See the workflow in the tool description.';
      }
      // Read the JSON file
      let data: Record<string, unknown>;
      try {
        const content = fs.readFileSync(asStringArg(args, 'inputFile'), 'utf-8');
        data = JSON.parse(content);
      } catch (e: unknown) {
        return `PREFLIGHT ERROR: Cannot read ${args.inputFile}: ${e instanceof Error ? e.message : String(e)}`;
      }

      const toolKey = toolName.toUpperCase();
      const lines: string[] = [];
      let allPass = true;

      if (toolName === 'dp') {
        const layer = args.layer || 1;
        data.layer = layer;
        const error = validateDeepPlanningInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        // Also show field-by-field status
        const rules = layer === 2
          ? { requirements: 4000, context: 16000, components: 8000, constraints: 8000, designDecisions: 8000, knownGaps: 8000, sourceLineage: 8000, fileInventory: 8000 }
          : { requirements: 500, context: 2000 };
        for (const [field, min] of Object.entries(rules)) {
          const actual = stringLength(data[field]);
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
      } else if (toolName === 'cs') {
        const mode = args.mode || 'T1';
        data.outputMode = mode;
        const error = validateContextSynthesisInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        // Field-by-field
        const stringRules = mode === 'T2'
          ? { context: 4000, requirements: 500, components: 1000, constraints: 1000, designDecisions: 1000, knownGaps: 1000, sourceLineage: 1000 }
          : {};
        for (const [field, min] of Object.entries(stringRules)) {
          const actual = stringLength(data[field]);
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
        // keyFacts check
        const facts = data.keyFacts;
        const minItems = mode === 'T2' ? 5 : 3;
        const actualItems = Array.isArray(facts) ? facts.length : 0;
        const passItems = actualItems >= minItems;
        const status = passItems ? 'PASS' : 'FAIL';
        const deficit = Math.max(0, minItems - actualItems);
        const extra = deficit > 0 ? ` — add ${deficit} more` : '';
        lines.push(`  [${status}] keyFacts: ${actualItems} items need ${minItems}${extra}`);
        if (!passItems) allPass = false;

        if (mode === 'T2') {
          const totalChars = Array.isArray(facts) ? facts.reduce((s: number, f) => s + String(f).length, 0) : 0;
          const passTotal = totalChars >= 2000;
          const deficitTotal = Math.max(0, 2000 - totalChars);
          const statusT = passTotal ? 'PASS' : 'FAIL';
          const extraT = deficitTotal > 0 ? ` — add ${deficitTotal}c more` : '';
          lines.push(`  [${statusT}] keyFacts total: ${totalChars}c need 2000c${extraT}`);
          if (!passTotal) allPass = false;
        }
      } else if (toolName === 'ps') {
        const error = validateProblemSolvingInput(data);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        const rules: Record<string, number> = { problem: 500, context: 2000, components: 500, knownGaps: 500 };
        for (const [field, min] of Object.entries(rules)) {
          const actual = stringLength(data[field]);
          const pass = actual >= min;
          const deficit = Math.max(0, min - actual);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${field}: ${actual}c need ${min}c${extra}`);
          if (!pass) allPass = false;
        }
        // Array checks
        for (const field of ['reasoning', 'workingPlan']) {
          const arr = data[field];
          const count = Array.isArray(arr) ? arr.length : 0;
          const pass = count >= 3;
          const deficit = Math.max(0, 3 - count);
          const status = pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit} more` : '';
          lines.push(`  [${status}] ${field}: ${count} items need 3${extra}`);
          if (!pass) allPass = false;
        }
      } else if (toolName === 'ct') {
        const plan = data.testPlan || '';
        const error = validateTestPlan(plan);
        if (error) {
          allPass = false;
          lines.push(error);
        }
        const actual = typeof plan === 'string' ? plan.length : 0;
        const pass = actual >= 2000;
        const deficit = Math.max(0, 2000 - actual);
        const status = pass ? 'PASS' : 'FAIL';
        const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
        lines.push(`  [${status}] testPlan: ${actual}c need 2000c${extra}`);
      } else if (toolName === 'spg') {
        const result = validateSPG(data);
        for (const f of result.fields) {
          const deficit = Math.max(0, f.min - f.actual);
          const status = f.pass ? 'PASS' : 'FAIL';
          const extra = deficit > 0 ? ` — add ${deficit}c more` : '';
          lines.push(`  [${status}] ${f.name}: ${f.actual}c need ${f.min}c${extra}`);
        }
        allPass = result.passed;
      } else if (toolName === 'task') {
        // ── THE LINES MODE (2026-08-06 — the operator's mandate): the dispatch
        // prompt preflight — the line floor (125/150 conditional) + the 6
        // section markers + the structural checks. The EXACT same checks as the
        // TASK FIREWALL — READY means the dispatch WILL NOT be blocked.
        const promptText = typeof data.prompt === 'string' ? data.prompt
          : (typeof data.text === 'string' ? data.text : '');
        if (!promptText) {
          allPass = false;
          lines.push('  [FAIL] prompt: the JSON must carry the dispatch prompt — {"prompt": "<the FULL prompt text>"}');
        } else {
          const v = validateTaskPromptLines(promptText);
          lines.push(...v.lines);
          if (!v.passed) allPass = false;
        }
      }

      // Summary
      const header = `\nPreflight: ${toolKey}${args.layer ? ' L' + args.layer : ''}${args.mode ? ' ' + args.mode : ''}`;
      const footer = allPass
        ? `\nREADY — call ${toolName} with inputFile=${args.inputFile}\n`
        : `\nFIX SHORT FIELDS in ${args.inputFile}, then re-call preflight\n`;

      return header + '\n' + lines.join('\n') + footer;
    },
  });
}
