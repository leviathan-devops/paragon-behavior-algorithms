// TheatricalCodeBlock — 20+ regex patterns for theatrical code detection
// Adapted from Manta v2.3. Only fires on write/edit tools. 3 severity levels.

import { EnforcementError } from './enforcement-error.js';

export interface TheatricalPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium';
  message: string;
}

// CRITICAL patterns — always block before file reaches disk
var CRITICAL_PATTERNS: TheatricalPattern[] = [
  { name: 'FAKE_SUCCESS_RETURN', regex: /\breturn\s*\{\s*(blocked|valid|passed|success)\s*:\s*(false|true)\s*\}/i, severity: 'critical', message: 'Hardcoded success return without actual check' },
  { name: 'EMPTY_CATCH', regex: /\bcatch\s*\([^)]*\)\s*\{\s*\}/i, severity: 'critical', message: 'Empty catch block — silently swallows errors' },
  { name: 'STUB_RETURN', regex: /\breturn\s+true\s*;?\s*(\/\/|\/\*)/i, severity: 'critical', message: 'Stub return with TODO comment' },
  { name: 'SILENT_EXIT', regex: /\bprocess\.exit\s*\(\s*0\s*\)/i, severity: 'critical', message: 'Silent process exit — use proper error handling' },
  { name: 'I_SAW_IT_WORK', regex: /\bI\s+(saw|watched|observed|verified)\s+(it|this)\s+(work|run|pass|succeed)/i, severity: 'critical', message: 'Subjective claim without evidence' },
  { name: 'FIRE_AND_FORGET', regex: /\b(setTimeout|setInterval)\s*\(\s*[^,]+,\s*0\s*\)/i, severity: 'critical', message: 'Fire-and-forget timer — use proper async patterns' },
  { name: 'PLACEHOLDER_CODE', regex: /\b(todo|fixme|hack|workaround|temporary|placeholder)\b.*\b(return|implement|add)/i, severity: 'critical', message: 'Placeholder code left in production' },
];

// HIGH patterns — log warning
var HIGH_PATTERNS: TheatricalPattern[] = [
  { name: 'TODO_IN_CODE', regex: /\b(TODO|FIXME|HACK|XXX)\b/i, severity: 'high', message: 'TODO/FIXME left in production code' },
  { name: 'CONSOLE_LOG', regex: /\bconsole\.(log|debug|trace)\s*\(/i, severity: 'high', message: 'Console log in production code' },
  { name: 'DEBUGGER', regex: /\bdebugger\s*;?/i, severity: 'high', message: 'Debugger statement in production code' },
  { name: 'EMPTY_FUNCTION_BODY', regex: /\bfunction\s+\w+\s*\([^)]*\)\s*\{\s*\}/i, severity: 'high', message: 'Empty function body' },
  { name: 'DEAD_CODE_AFTER_RETURN', regex: /\breturn\b[^;]*;\s*\n\s*\S+/i, severity: 'high', message: 'Unreachable code after return statement' },
];

// MEDIUM patterns — log for processing
var MEDIUM_PATTERNS: TheatricalPattern[] = [
  { name: 'ANY_AS_CAST', regex: /\b\w+\s+as\s+any\b/i, severity: 'medium', message: 'Unsafe "as any" type cast' },
  { name: 'VAR_DECLARATION', regex: /\bvar\s+\w+/i, severity: 'medium', message: 'Use const/let instead of var' },
  { name: 'TS_IGNORE', regex: /\@ts-?\b(ignore|expect-error|no-check)\b/i, severity: 'medium', message: 'TypeScript compiler directive suppression' },
  { name: 'EVAL_USAGE', regex: /\beval\s*\(/i, severity: 'medium', message: 'eval() usage — security risk' },
];

export class TheatricalCodeBlock {
  private criticalCount = 0;
  private highCount = 0;
  private mediumCount = 0;

  getCriticalCount(): number { return this.criticalCount; }
  getHighCount(): number { return this.highCount; }
  getMediumCount(): number { return this.mediumCount; }

  scan(content: string): TheatricalPattern[] {
    var matches: TheatricalPattern[] = [];

    for (var i = 0; i < CRITICAL_PATTERNS.length; i++) {
      var pattern = CRITICAL_PATTERNS[i];
      if (pattern.regex.test(content)) {
        matches.push(pattern);
        this.criticalCount++;
      }
    }

    for (var j = 0; j < HIGH_PATTERNS.length; j++) {
      var hPattern = HIGH_PATTERNS[j];
      if (hPattern.regex.test(content)) {
        matches.push(hPattern);
        this.highCount++;
      }
    }

    for (var k = 0; k < MEDIUM_PATTERNS.length; k++) {
      var mPattern = MEDIUM_PATTERNS[k];
      if (mPattern.regex.test(content)) {
        matches.push(mPattern);
        this.mediumCount++;
      }
    }

    return matches;
  }

  // Check and throw EnforcementError if critical patterns found
  enforce(content: string, filePath: string): void {
    var matches = this.scan(content);
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      if (match.severity === 'critical') {
        throw new EnforcementError(
          '[THEATRICAL_BLOCK] ' + match.name + ': ' + match.message + ' in ' + filePath,
          match.name,
          'critical'
        );
      }
    }
  }
}
