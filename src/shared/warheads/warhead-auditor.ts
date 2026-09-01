import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';
import { createHash } from 'crypto';

export const AUDIT_BULLETS: readonly string[] = [
  'AUDIT_BULLET 01: DO enforce conformance-gate before any fix — audit MUST produce a conformance verdict (PASS/FAIL per file:line) before fix-apply is dispatched — no fix without gate.',
  'AUDIT_BULLET 02: DO scope fixes to audited findings only — every fix hunk maps 1:1 to an audit finding id — no out-of-scope mutation — fix-scoped means no drive-by edits.',
  'AUDIT_BULLET 03: DO resolve dispatch via weightClass=tool — auditor operates at tool tier (≥minor) — audit findings feed bug-hunter at subagent tier — weightClass determines escalation.',
  'AUDIT_BULLET 04: DO record battery on every audit cycle — increment batteryCount on init and on each conformance-gate execution — battery tracks audit invocations.',
  'AUDIT_BULLET 05: DO compute sha256 per audit artifact — computeSha256 hashes id+weightClass+batteryCount — every conformance report carries the producing warhead sha256.',
  'AUDIT_BULLET 06: DO emit audit diagnostics with file:line+evidence — every AUDIT_BULLET finding carries file path, line number, evidence excerpt, and weightClass tier.',
  'AUDIT_BULLET 07: DO operate as fresh-agent standalone — auditor behavior program is executable with zero prior context — warhead file plus AUDIT_BULLETS is the complete program.',
  'AUDIT_BULLET 08: DO preserve audit-fix separation — audit surface and fix surface are distinct phases with separate verification — never merge audit verdict and fix apply into one tool call.',
] as const;

class AuditorWarhead implements Warhead {
  id = 'auditor-warhead';
  priority = 11;
  type = 'static' as const;
  weightClass = 'tool' as const;

  private batteryCount = 0;
  private auditCount = 0;
  private conformancePassCount = 0;

  private async computeSha256(): Promise<string> {
    return createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
  }

  async init(): Promise<void> {
    try {
      this.batteryCount++;
      this.auditCount = 0;
      await tridentLog('INFO', 'warhead-auditor', `init weightClass=${this.weightClass} battery=${this.batteryCount} sha256=${await this.computeSha256()}`);
    } catch (e: unknown) {
      tridentLog('WARN', 'warhead-auditor', `init failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    return undefined;
  }

  getT0(): string {
    return `[AUDITOR] weightClass=${this.weightClass} audits=${this.auditCount} conformancePass=${this.conformancePassCount} battery=${this.batteryCount} gate=conformance fixScoped=true`;
  }

  getStatus(): Record<string, number | string> {
    const sha = createHash('sha256').update(`${this.id}:${this.weightClass}:${this.batteryCount}`).digest('hex');
    return {
      weightClass: this.weightClass,
      battery: this.batteryCount,
      audits: this.auditCount,
      conformancePass: this.conformancePassCount,
      sha256: sha,
      bullets: AUDIT_BULLETS.length,
    };
  }
}

export const auditorWarhead = new AuditorWarhead();
