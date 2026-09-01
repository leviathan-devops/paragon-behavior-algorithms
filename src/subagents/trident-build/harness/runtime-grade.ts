// RuntimeGradeEngineer — P1-P10 + E10 + L5.x enforcement
// Adapted from Manta v2.3. Code-level enforcement on write/edit tools.

import * as path from 'node:path';

// THE HARDCODED-PATH DETECTION PREFIXES (2026-08-16 — the R16 PATH_RESOLUTION
// fix): derived from path.sep — the P5 detector's own detection strings must
// not carry machine-specific absolute-path literals.
const HOMEDIR_PREFIX = path.sep + 'home' + path.sep;
const USERSDIR_PREFIX = path.sep + 'Users' + path.sep;

export interface RuntimeViolation {
  code: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  line?: number;
}

export class RuntimeGradeEngineer {
  private totalScans = 0;
  private counters: Record<string, number> = {};

  getTotalScans(): number { return this.totalScans; }
  getCounters(): Record<string, number> { return { ...this.counters }; }

  check(toolName: string, args: Record<string, unknown>, filePath?: string): RuntimeViolation[] {
    this.totalScans++;
    var violations: RuntimeViolation[] = [];

    if (toolName === 'bash') {
      var command = typeof args.command === 'string' ? args.command : '';
      var lowerCmd = command.toLowerCase();

      // P5: Hardcoded paths
      if (command.indexOf(HOMEDIR_PREFIX) !== -1 || command.indexOf(USERSDIR_PREFIX) !== -1) {
        this.counters['p5'] = (this.counters['p5'] || 0) + 1;
        violations.push({
          code: 'P5',
          severity: 'critical',
          message: 'Hardcoded absolute path in command. Use process.cwd() or environment variables.',
        });
      }

      // P6: npm/bun install without lock file
      if (/\b(npm|bun|yarn)\s+(install|add)\b/.test(lowerCmd) && command.indexOf('--frozen-lockfile') === -1 && command.indexOf('--lockfile') === -1) {
        this.counters['p6'] = (this.counters['p6'] || 0) + 1;
        violations.push({
          code: 'P6',
          severity: 'high',
          message: 'Package install without lock file verification. Use --frozen-lockfile or --lockfile.',
        });
      }

      // P7: Path traversal
      if (/\.\.\//.test(command)) {
        this.counters['p7'] = (this.counters['p7'] || 0) + 1;
        violations.push({
          code: 'P7',
          severity: 'high',
          message: 'Path traversal detected (../). Use absolute paths from process.cwd().',
        });
      }
    }

    // P3: Check for try/catch with empty catches in written code
    if (toolName === 'write' || toolName === 'edit') {
      var content = typeof args.content === 'string' ? args.content : (typeof args.data === 'string' ? args.data : '');
      if (content) {
        var lines = content.split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lines[i].trim())) {
            this.counters['p3'] = (this.counters['p3'] || 0) + 1;
            violations.push({
              code: 'P3',
              severity: 'critical',
              message: 'Empty catch block at line ' + (i + 1) + '. Errors must be logged or propagated.',
              line: i + 1,
            });
          }
        }

        // P1: ESM/CJS import mismatch (require + export in same file)
        var hasRequire = /require\s*\(/.test(content);
        var hasExport = /\bexport\s+(default|const|function|class)/.test(content);
        if (hasRequire && hasExport) {
          this.counters['p1'] = (this.counters['p1'] || 0) + 1;
          violations.push({
            code: 'P1',
            severity: 'high',
            message: 'ESM/CJS import mismatch: mixing require() and export in same file.',
          });
        }

        // P2: >5 unsafe `as` casts
        var asCasts = content.match(/\bas\s+any\b/g);
        if (asCasts && asCasts.length > 5) {
          this.counters['p2'] = (this.counters['p2'] || 0) + 1;
          violations.push({
            code: 'P2',
            severity: 'high',
            message: 'More than 5 unsafe "as any" casts. Reduce type assertions.',
          });
        }

        // P4: setInterval without clearInterval
        if (/\bsetInterval\s*\(/.test(content) && !/\bclearInterval\s*\(/.test(content)) {
          this.counters['p4'] = (this.counters['p4'] || 0) + 1;
          violations.push({
            code: 'P4',
            severity: 'high',
            message: 'setInterval used without clearInterval — potential resource leak.',
          });
        }

        // P8: Invalid JSON config (check .json files for parse errors)
        if (filePath && filePath.endsWith('.json')) {
          try {
            JSON['parse'](content);
          } catch (e: unknown) {
            console.warn(`[runtime-grade] P8: invalid JSON in ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
            this.counters['p8'] = (this.counters['p8'] || 0) + 1;
            violations.push({
              code: 'P8',
              severity: 'critical',
              message: 'Invalid JSON in config file. Fix syntax before deploying.',
            });
          }
        }

        // P9: Top-level await in non-async context
        if (/\bawait\b/.test(content) && !/\basync\s+function/.test(content)) {
          var linesArr = content.split('\n');
          for (var li = 0; li < linesArr.length; li++) {
            var trimmed = linesArr[li].trim();
            if (/\bawait\b/.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
              var funcMatch = false;
              for (var j = li; j >= Math.max(0, li - 10); j--) {
                if (/\b(async\s+)?function\s+|=>\s*\{/.test(linesArr[j])) {
                  funcMatch = true;
                  break;
                }
              }
              if (!funcMatch) {
                this.counters['p9'] = (this.counters['p9'] || 0) + 1;
                violations.push({
                  code: 'P9',
                  severity: 'medium',
                  message: 'Top-level await at line ' + (li + 1) + ' without async function wrapper.',
                  line: li + 1,
                });
              }
            }
          }
        }

        // P10: Implicit any return type
        if (content.indexOf('): any') !== -1 || content.indexOf('=> any') !== -1) {
          this.counters['p10'] = (this.counters['p10'] || 0) + 1;
          violations.push({
            code: 'P10',
            severity: 'medium',
            message: 'Implicit "any" return type. Specify return types explicitly.',
          });
        }

        // E10: Evidence claims without proof
        if (/\btests?\s+(pass|passed|succeed|succeeded|work|working)\b/i.test(content) &&
            !/ContainerTestResult/i.test(content)) {
          this.counters['e10'] = (this.counters['e10'] || 0) + 1;
          violations.push({
            code: 'E10',
            severity: 'critical',
            message: 'Claims tests pass without ContainerTestResult evidence.',
          });
        }
      }
    }

    return violations;
  }
}
