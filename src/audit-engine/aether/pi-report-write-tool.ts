// ═══ REPORT-WRITE TOOL — THE JUDGMENT DELIVERABLE WRITER ═══
// The Step-X aether agent's ONLY write surface. Force-path-pinned to the
// judgment.md path (ANTI_PATTERN #5 — cross-file contamination is
// mechanically impossible). Validates the required section markers BEFORE
// accepting the write (the loud-fail law: a malformed judgment is rejected
// with the missing sections NAMED, never silently stored).
//
// THE OUTPUT ANATOMY the tool enforces (the CST1 T1 writer's section
// discipline, adapted to the adjudication contract):
//   # STEP-X JUDGMENT
//   ## 1. THE EXECUTIVE SUMMARY
//   ## 2. THE FINDING BLOCKS        ← ### FINDING n blocks inside
//   ## 3. THE RED-HERRINGS
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'path';
import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const REQUIRED_MARKERS = [
  '# STEP-X JUDGMENT',
  '## 1. THE EXECUTIVE SUMMARY',
  '## 2. THE FINDING BLOCKS',
  '## 3. THE RED-HERRINGS',
] as const;

const WRITE_SCHEMA = Type.Object({
  content: Type.String({ description: 'The COMPLETE judgment markdown document, including every required section and one ### FINDING n block per finding.' }),
});

export function createReportWriteTool(judgmentPath: string): AgentTool {
  return {
    name: 'report_write',
    label: 'report-write',
    description: `Write the COMPLETE judgment document to ${judgmentPath} (the ONLY writable path — mechanically enforced). Required sections, in order: '# STEP-X JUDGMENT', '## 1. THE EXECUTIVE SUMMARY', '## 2. THE FINDING BLOCKS' (containing one '### FINDING n' machine block per finding: ADJUDICATION / DEEPER ROOT / CONCRETE FIX / CONSEQUENCE RANK), '## 3. THE RED-HERRINGS'. Write the WHOLE document in ONE call.`,
    parameters: WRITE_SCHEMA as never,
    execute: async (_toolCallId: string, params: unknown, _signal: AbortSignal | undefined) => {
      const p = (params ?? {}) as { content?: unknown };
      const content = typeof p.content === 'string' ? p.content : '';
      // ERROR PATHS FIRST — every rejection names the defect:
      if (content.trim().length === 0) {
        return { content: [{ type: 'text' as const, text: 'REPORT_WRITE_REJECTED: empty content is not a judgment' }], details: null };
      }
      const missing = REQUIRED_MARKERS.filter((m) => !content.includes(m));
      if (missing.length > 0) {
        return {
          content: [{ type: 'text' as const, text: `REPORT_WRITE_REJECTED: missing required section(s): ${missing.join(' | ')}` }],
          details: null,
        };
      }
      const findingBlocks = (content.match(/^#{0,4}\s*\**FINDING\s+\d+/gim) ?? []).length;
      if (findingBlocks === 0) {
        return {
          content: [{ type: 'text' as const, text: 'REPORT_WRITE_REJECTED: zero FINDING blocks — every finding needs its ### FINDING n verdict block' }],
          details: null,
        };
      }
      try {
        mkdirSync(path.dirname(judgmentPath), { recursive: true });
        writeFileSync(judgmentPath, content, 'utf-8');
      } catch (err: unknown) {
        return {
          content: [{ type: 'text' as const, text: `REPORT_WRITE_FAILED: ${err instanceof Error ? err.message : String(err)}` }],
          details: null,
        };
      }
      return {
        content: [{ type: 'text' as const, text: `JUDGMENT WRITTEN: ${judgmentPath} (${content.split('\n').length} lines, ${findingBlocks} finding blocks)` }],
        details: null,
      };
    },
  } as unknown as AgentTool;
}
