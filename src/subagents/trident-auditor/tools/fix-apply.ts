// src/subagents/trident-auditor/tools/fix-apply.ts
// THE SURGICAL FIX DRIVER (W9, K8.10, spec §5.2:2390-2393, §4.12:2218).
//
// THE AUDITOR'S WRITE PATH: the fix-scope check FIRST (a BLOCK throws the named
// error — the write NEVER lands on an undeclared/stale/SPEC_DERIVED file), then
// the ATOMIC WRITE (write to a temp file + rename — a crash mid-write can never
// leave a half-written file), then the sha record (the before/after pair the
// implementations ledger + the conformance battery consume).
//
// THE ATOMICITY (the loud-fail-or-clear-pass law): the temp write + the rename
// are the POSIX-atomic pair; a failure in the temp write throws the named error
// and the target file is UNTOUCHED. No partial content ever lands.

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { classify, type FixScopeOptions } from '../firewall/fix-scope.ts';
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// THE NAMED ERROR (O32.1 FIX_SCOPE_BLOCKED / FIX_APPLY_FAILED)
// ---------------------------------------------------------------------------

/** The fix-apply failure — the loud-fail: the write could not land, the target
 *  is UNTOUCHED. Never a silent skip. */
export class FixApplyError extends Error {
  readonly code: string;
  readonly stage: string;
  readonly detail: string;
  constructor(stage: string, detail: string) {
    super(`FIX_APPLY_FAILED: stage=${stage} detail=${detail}`);
    this.name = 'FIX_APPLY_FAILED';
    this.code = 'FIX_APPLY_FAILED';
    this.stage = stage;
    this.detail = detail;
  }
}

export function fixApplyFailed(stage: string, detail: string): FixApplyError {
  return new FixApplyError(stage, detail);
}

// ---------------------------------------------------------------------------
// THE SHA UTILITIES
// ---------------------------------------------------------------------------

/** The sha256 of a byte string — the mechanical diff evidence (R10.3). */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Read a file's sha256 (or '' when the file does not exist — the before-sha
 *  of a CREATE is the empty string, recorded as such). */
export function sha256File(filePath: string): string {
  try {
    return sha256(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// THE FIX-APPLY
// ---------------------------------------------------------------------------

export interface FixApplyInput {
  file: string;            // the relative path (project-root-relative)
  content: string;         // the full post-fix content
  reason: string;          // the finding id — the provenance the write carries
}

export interface FixApplyResult {
  file: string;
  beforeSha: string;
  afterSha: string;
  reason: string;
  bytes: number;
}

/** THE SURGICAL WRITE (K8.10) — the fix-scope check, then the atomic write.
 *
 * @param declaredFiles the report's declared fix files (the allowlist)
 * @param projectRoot   the project root (the target resolves against it)
 * @param scopeOptions  the fix-scope options (the current-graph resolution)
 *
 * THE ORDER (non-negotiable): the scope check is FIRST — a BLOCK throws
 * FIX_SCOPE_BLOCKED and the write NEVER lands. The write is ATOMIC (temp +
 * rename). The before/after sha are recorded for the implementations ledger. */
export function fixApply(
  input: FixApplyInput,
  opts: { declaredFiles: string[]; projectRoot: string; scopeOptions?: FixScopeOptions },
): FixApplyResult {
  // 1. THE FIX-SCOPE CHECK — the BLOCK throws BEFORE any fs interaction.
  const decision = classify({ file: input.file }, opts.declaredFiles, opts.scopeOptions);
  if (decision.verdict === 'BLOCKED') {
    throw new Error(decision.message);   // FIX_SCOPE_BLOCKED — the named error
  }

  // 2. THE RESOLUTION + THE REALPATH CONTAINMENT (the symlink escape, §7.4.3:7)
  //    — the resolved target must stay inside the project root (the realpath of
  //    a symlinked ancestor is resolved so an escape via a link is blocked).
  const abs = path.resolve(opts.projectRoot, input.file);
  const absParent = path.dirname(abs);
  const realRoot = fs.realpathSync(opts.projectRoot);
  const realParent = fs.realpathSync(absParent);   // throws if the dir is gone
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new Error(`fixes are ONLY allowed to the report's declared fix files — the target ${input.file} resolves outside the project root via a symlink`);
  }

  // 3. THE BEFORE-SHA (the pre-write state — the mechanical evidence).
  const beforeSha = sha256File(abs);

  // 4. THE ATOMIC WRITE — temp + rename. A failure in the temp write throws
  //    and the target is UNTOUCHED (no partial content ever lands).
  const tmpPath = path.join(absParent, `.${path.basename(abs)}.tmp-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(tmpPath, input.content, 'utf-8');
    fs.renameSync(tmpPath, abs);
  } catch (e: unknown) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch (cleanupErr: unknown) {
      // the temp cleanup is best-effort — the LOUD failure is the original
      // write error below; the orphan temp is named, never silently swallowed.
      console.error(`[fix-apply] temp cleanup failed: ${String(cleanupErr)} (tmp=${tmpPath})`);
    }
    throw fixApplyFailed('write', `${String(e)} (target=${abs})`);
  }

  // 5. THE AFTER-SHA + THE RESULT.
  const afterSha = sha256File(abs);
  return {
    file: input.file,
    beforeSha,
    afterSha,
    reason: input.reason,
    bytes: Buffer.byteLength(input.content, 'utf-8'),
  };
}

// THE PLATFORM TOOL WRAPPER (the W9 registration-gap fix 2026-08-12 — the §5.2
// mandate's fix-apply entry): the S6 container scenario's tool. The creator
// wraps the raw fixApply() — the SAME fix-scope fail-closed machine. The
// declaredFiles come from the audit's SPECIFY (the fix-scope locks to the set);
// an absent/empty set blocks every target — the fail-closed contract.
export function createFixApplyTool() {
  return tool({
    description:
      'Apply the surgical fix to a DECLARED fix file: the FIX_SCOPE check (the file must be in the declaredFiles), the atomic temp+rename write, the before/after sha pair. The write NEVER lands outside the declared set.',
    args: {
      file: z.string().describe('Absolute path of the fix target (must be in the declaredFiles)'),
      content: z.string().describe('The full new file content'),
      reason: z.string().describe("The fix reason (the MPSE evidence the fix-scope carries)"),
      projectRoot: z.string().describe('Absolute path of the project root'),
      declaredFiles: z.array(z.string()).describe("The declared fix files (from the audit's SPECIFY — the fix-scope locks to this set)"),
    },
    execute: async (args: FixApplyInput & { projectRoot: string; declaredFiles: string[] }): Promise<string> => {
      const result = fixApply(
        { file: args.file, content: args.content, reason: args.reason },
        { declaredFiles: args.declaredFiles, projectRoot: args.projectRoot },
      );
      return JSON.stringify(result, null, 2);
    },
  });
}
