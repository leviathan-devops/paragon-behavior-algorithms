// PlanScopeValidator — Validates that Trident_Build only touches files in the remediation plan
// Extracts FILE:LINE targets from the plan and enforces scope boundaries

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

export interface PlanFinding {
  file: string;
  line: number;
  issue: string;
  fix: string;
}

export interface PlanScope {
  findings: PlanFinding[];
  allowedFiles: string[];
  allowedLines: Map<string, number[]>;
  createdAt: number;
}

export class PlanScopeValidator {
  private scope: PlanScope | null = null;

  loadPlan(planText: string): PlanScope {
    var findings: PlanFinding[] = [];
    var allowedLinesMap = new Map<string, number[]>();
    var lines = planText.split('\n');

    // Parse FILE: path LINE: num ISSUE: desc from plan
    var currentFinding: Partial<PlanFinding> = {};
    var inFindingsSection = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (line.indexOf('CRITICAL FINDINGS') !== -1) {
        inFindingsSection = true;
        continue;
      }
      if (inFindingsSection && (line.indexOf('INSTRUCTIONS') !== -1 || line.indexOf('Previous') !== -1)) {
        inFindingsSection = false;
      }

      if (inFindingsSection && line.length > 0) {
        var fileMatch = line.match(/FILE:\s*(\S+)/i);
        var lineMatch = line.match(/LINE:\s*(\d+)/i);
        var issueMatch = line.match(/ISSUE:\s*(.+)/i);
        var fixMatch = line.match(/FIX:\s*(.+)/i);

        if (fileMatch) currentFinding.file = fileMatch[1];
        if (lineMatch) currentFinding.line = parseInt(lineMatch[1], 10);
        if (issueMatch) currentFinding.issue = issueMatch[1].trim();
        if (fixMatch) currentFinding.fix = fixMatch[1].trim();

        // When we have a file+issue pair, it's a complete finding
        if (currentFinding.file && currentFinding.issue && line.indexOf('FIX:') !== -1) {
          findings.push({
            file: currentFinding.file,
            line: currentFinding.line || 0,
            issue: currentFinding.issue,
            fix: currentFinding.fix || '',
          });

          // Track allowed lines for this file
          if (!allowedLinesMap.has(currentFinding.file)) {
            allowedLinesMap.set(currentFinding.file, []);
          }
          allowedLinesMap.get(currentFinding.file)!.push(currentFinding.line || 0);

          currentFinding = {};
        }
      }
    }

    var allowedFiles = Array.from(allowedLinesMap.keys()).concat(
      // Also include files referenced in any numbered finding line
      planText.match(/FILE:\s*(\S+\.(?:ts|js|tsx|jsx))/gi)?.map(function(m) { return m.replace(/FILE:\s*/i, '').trim(); }) || []
    );

    this.scope = {
      findings,
      allowedFiles: Array.from(new Set(allowedFiles)),
      allowedLines: allowedLinesMap,
      createdAt: Date.now(),
    };

    return this.scope;
  }

  isFileAllowed(filePath: string): boolean {
    // No plan loaded — defensive default: allow writes (no restrictions to enforce)
    if (!this.scope) return true;
    // Empty plan (no findings) — allow writes to any file
    if (this.scope.allowedFiles.length === 0) return true;

    for (var i = 0; i < this.scope.allowedFiles.length; i++) {
      var allowed = this.scope.allowedFiles[i];
      if (filePath.indexOf(allowed) !== -1 || allowed.indexOf(filePath) !== -1) {
        return true;
      }
    }
    return false;
  }

  isLineAllowed(filePath: string, line: number): boolean {
    // No scope loaded or file not in allowedLines map — allow (defensive default)
    if (!this.scope || !this.scope.allowedLines.has(filePath)) return true;
    var allowedLines = this.scope.allowedLines.get(filePath)!;
    for (var i = 0; i < allowedLines.length; i++) {
      if (Math.abs(allowedLines[i] - line) <= 5) return true; // Allow 5 lines of tolerance
    }
    return false;
  }

  validateEdit(filePath: string, editLine?: number): { allowed: boolean; reason?: string } {
    if (!this.scope) return { allowed: true };

    if (!this.isFileAllowed(filePath)) {
      return { allowed: false, reason: `File "${filePath}" is not in the remediation plan scope. Only files listed in the plan may be modified.` };
    }

    if (editLine !== undefined && !this.isLineAllowed(filePath, editLine)) {
      return { allowed: false, reason: `Line ${editLine} in "${filePath}" is outside the plan scope.` };
    }

    return { allowed: true };
  }

  verifyCompleteness(changedFiles: string[]): { complete: boolean; missing: PlanFinding[] } {
    if (!this.scope) return { complete: true, missing: [] };

    var missing: PlanFinding[] = [];
    var changedSet = new Set(changedFiles.map(function(f) { return f.replace(/^.*[\/\\]/, ''); }));

    for (var i = 0; i < this.scope.findings.length; i++) {
      var finding = this.scope.findings[i];
      var findingFile = finding.file.replace(/^.*[\/\\]/, '');
      if (!changedSet.has(findingFile)) {
        missing.push(finding);
      }
    }

    return { complete: missing.length === 0, missing };
  }

  getScope(): PlanScope | null {
    return this.scope;
  }

  // Load plan from the well-known path (written by God Loop)
  loadFromWellKnownPath(): boolean {
    try {
      var planPath = path.join(process.cwd(), '.trident-build', 'plan', 'CURRENT_PLAN.md');
      var content = readFileSync(planPath, 'utf-8');
      if (content && content.length > 10) {
        this.loadPlan(content);
        return true;
      }
    } catch (e: unknown) {
      // Non-fatal — no plan file available yet
      console.warn(`[plan-scope] well-known plan read failed (none available yet): ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }
}
