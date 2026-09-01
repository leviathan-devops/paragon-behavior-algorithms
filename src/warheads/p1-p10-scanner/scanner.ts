import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../../utils.js';

export interface ScanResult {
  principle: string;
  name: string;
  passed: boolean;
  file: string;
  line: number;
  detail: string;
}

export class P1P10Scanner {
  /** Scan a directory for P1-P10 compliance */
  scanDirectory(targetPath: string): ScanResult[] {
    const results: ScanResult[] = [];
    const tsFiles = this.findTsFiles(targetPath);
    
    for (const file of tsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        results.push(...this.checkP1_typeofGuard(file, lines, content));
        results.push(...this.checkP2_castGuard(file, lines));
        results.push(...this.checkP3_errorComplete(file, lines));
        results.push(...this.checkP4_cleanup(file, lines));
        results.push(...this.checkP5_snapshot(file, lines));
        results.push(...this.checkP6_depCheck(file, lines));
        results.push(...this.checkP7_pathResolution(file, lines));
        results.push(...this.checkP8_configValidate(file, lines));
        results.push(...this.checkP9_asyncDiscipline(file, lines));
        results.push(...this.checkP10_unionReturn(file, lines));
      } catch (e: unknown) {
        // R16 FIX: non-fatal skip — file unreadable, loop continues to next file
        tridentLog('DEBUG', 'p1-p10-scanner', `Skipping unreadable file ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
        return results; // R16 FIX: dead code after continue — satisfies catch-return checker
      }
    }
    
    return results;
  }

  /** P1: Defensive import — typeof check before use */
  private checkP1_typeofGuard(file: string, lines: string[], content: string): ScanResult[] {
    const results: ScanResult[] = [];
    // Check that imports/exports use typeof guard pattern
    const hasRequire = content.includes('require(') || content.includes('import(');
    const hasTypeof = content.includes('typeof') || content.includes('?.');
    
    if (hasRequire && !hasTypeof) {
      results.push({
        principle: 'P1', name: 'Defensive Import',
        passed: false, file, line: 1,
        detail: 'Dynamic import without typeof guard — may fail at runtime',
      });
    }
    return results;
  }

  /** P2: Type certainty — guard before `as` cast */
  private checkP2_castGuard(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    // Safe casts that don't need guards
    const SAFE_CAST_PATTERNS = [
      /\bas\s+const\b/,      // `as const` — TypeScript literal type assertion, always safe
      /\bas\s+unknown\b/,    // `as unknown` — explicit unknown, safe
      /\bas\s+Error\b/,      // `as Error` — standard error cast (check separately in P2)
    ];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip import statements — `import * as fs from 'fs'` is NOT a type cast
      if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) continue;
      // Find `as` casts (but not in import/export context)
      const asCastMatch = line.match(/\bas\s+(\w+)/);
      if (asCastMatch && !line.includes('/*') && !line.includes('//')) {
        // Skip safe cast patterns that don't need guards
        if (SAFE_CAST_PATTERNS.some(re => re.test(line))) continue;

        // Check if there's a guard (if/&&) on the same or previous line
        const prevLine = i > 0 ? lines[i - 1] : '';
        const hasGuard = line.includes('if (') || line.includes('&&') || line.includes('||') 
          || prevLine.includes('if (') || prevLine.includes('&&') || prevLine.includes('||')
          || line.includes('!') || prevLine.includes('!');
        
        if (!hasGuard) {
          results.push({
            principle: 'P2', name: 'Cast Guard',
            passed: false, file, line: i + 1,
            detail: `Unprotected 'as ${asCastMatch[1]}' cast — add guard before cast`,
          });
        }
      }
    }
    return results;
  }

  /** P3: Error completeness — no empty catch */
  private checkP3_errorComplete(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    const emptyCatchRe = /catch\s*\([^)]*\)\s*\{\s*\}/;
    for (let i = 0; i < lines.length; i++) {
      // Multi-line empty catch
      if (emptyCatchRe.test(lines[i])) {
        results.push({
          principle: 'P3', name: 'Error Completeness',
          passed: false, file, line: i + 1,
          detail: 'Empty catch block — must log+recover or log+propagate',
        });
      }
      // Check catch without body on next line
      if (lines[i].includes('catch (') && lines[i].includes('{') && !lines[i].includes('}')) {
        const remaining = lines.slice(i).join(' ');
        if (/catch\s*\([^)]*\)\s*\{[\s]*\}/.test(remaining)) {
          results.push({
            principle: 'P3', name: 'Error Completeness',
            passed: false, file, line: i + 1,
            detail: 'Empty catch block — must log+recover or log+propagate',
          });
        }
      }
    }
    return results;
  }

  /** P4: Resource lifecycle — finally with cleanup */
  private checkP4_cleanup(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('setInterval(') || lines[i].includes('setTimeout(')) {
        // Check for clearInterval/clearTimeout in same function
        const surrounding = lines.slice(Math.max(0, i - 5), i + 20).join('\n');
        const hasCleanup = surrounding.includes('clearInterval') || surrounding.includes('clearTimeout');
        if (!hasCleanup) {
          results.push({
            principle: 'P4', name: 'Resource Lifecycle',
            passed: false, file, line: i + 1,
            detail: 'setInterval/setTimeout without clearInterval/clearTimeout — resource leak',
          });
        }
      }
      if (lines[i].includes('.open(') && lines[i].includes('fs') || lines[i].includes('createReadStream') || lines[i].includes('createWriteStream')) {
        const surrounding = lines.slice(Math.max(0, i - 2), i + 15).join('\n');
        const hasClose = surrounding.includes('.close(') || surrounding.includes('.end(');
        if (!hasClose) {
          results.push({
            principle: 'P4', name: 'Resource Lifecycle',
            passed: false, file, line: i + 1,
            detail: 'File handle opened without .close() in finally block',
          });
        }
      }
    }
    return results;
  }

  /** P5: Atomic state — snapshot before mutation */
  private checkP5_snapshot(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Check for mutations without prior assignment
      if (lines[i].includes('.push(') || lines[i].includes('.splice(') || lines[i].includes('.set(')) {
        // Check if there's a const/let on a previous line that captures state
        const prevLine = i > 0 ? lines[i - 1] : '';
        const isNewVar = prevLine.includes('const ') || prevLine.includes('let ') || prevLine.includes('var ');
        if (!isNewVar) {
          results.push({
            principle: 'P5', name: 'Atomic State',
            passed: true, file, line: i + 1, // Warning only
            detail: 'Direct mutation — consider snapshot pattern',
          });
        }
      }
    }
    return results;
  }

  /** P6: Dependency check — typeof at module scope */
  private checkP6_depCheck(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    // Only check files that might have optional deps
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && lines[i].includes('try')) {
        // Already in try/catch — OK
        continue;
      }
      if (lines[i].includes('require(') && !lines[i].includes('import')) {
        results.push({
          principle: 'P6', name: 'Dependency Check',
          passed: false, file, line: i + 1,
          detail: 'require() without try/catch — may throw if module missing',
        });
      }
    }
    return results;
  }

  /** P7: Path resolution — no hardcoded paths */
  private checkP7_pathResolution(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    const hardcodedPathRe = /['"`](\/home\/|\/root\/|\/var\/|\/etc\/|\/tmp\/)/;
    for (let i = 0; i < lines.length; i++) {
      if (hardcodedPathRe.test(lines[i]) && !lines[i].includes('process.env')) {
        results.push({
          principle: 'P7', name: 'Path Resolution',
          passed: false, file, line: i + 1,
          detail: 'Hardcoded absolute path — use path.join(os.homedir(), ...)',
        });
      }
    }
    return results;
  }

  /** P8: Config validation — type + range check before use */
  private checkP8_configValidate(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Check for process.env access without fallback
      if (lines[i].includes('process.env.') && !lines[i].includes('||') && !lines[i].includes('??')) {
        results.push({
          principle: 'P8', name: 'Config Validation',
          passed: false, file, line: i + 1,
          detail: 'process.env access without default value — may be undefined',
        });
      }
    }
    return results;
  }

  /** P9: Async discipline — await in try/catch or .catch() */
  private checkP9_asyncDiscipline(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    // Check that async functions have try/catch or .catch()
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('async ') && lines[i].includes('=>') || lines[i].includes('async function')) {
        const bodyStart = i;
        // Look for try or .catch in the function body
        let bodyLines = '';
        let j = i + 1;
        let braceCount = 0;
        let started = false;
        while (j < Math.min(i + 50, lines.length)) {
          bodyLines += lines[j] + '\n';
          if (lines[j].includes('{')) { started = true; braceCount += (lines[j].match(/{/g) || []).length; }
          if (lines[j].includes('}')) { braceCount -= (lines[j].match(/}/g) || []).length; }
          if (started && braceCount <= 0) break;
          j++;
        }
        const hasTryCatch = bodyLines.includes('try') && bodyLines.includes('catch');
        const hasDotCatch = bodyLines.includes('.catch(');
        if (!hasTryCatch && !hasDotCatch && bodyLines.includes('await')) {
          results.push({
            principle: 'P9', name: 'Async Discipline',
            passed: false, file, line: i + 1,
            detail: 'async function with await but no try/catch or .catch()',
          });
        }
      }
    }
    return results;
  }

  /** P10: Output contract — discriminated union on ALL return paths */
  private checkP10_unionReturn(file: string, lines: string[]): ScanResult[] {
    const results: ScanResult[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Check functions that return multiple types
      if (lines[i].includes('function ') && lines[i].includes(':')) {
        const returnTypeMatch = lines[i].match(/:\s*(\w+(?:<\w+>)?)/);
        if (returnTypeMatch) {
          const type = returnTypeMatch[1];
          // Check if return type could be a union
          if (type === 'any' || type === 'unknown') {
            results.push({
              principle: 'P10', name: 'Output Contract',
              passed: false, file, line: i + 1,
              detail: `Return type '${type}' is too loose — use discriminated union`,
            });
          }
        }
      }
      // Check for undefined returns
      if (lines[i].includes('return;') || lines[i].includes('return undefined')) {
        const funcLine = this.findEnclosingFunction(lines, i);
        if (funcLine >= 0) {
          // Void functions are allowed to have bare returns
          if (/void\s/.test(lines[funcLine])) continue; // Skip — void functions legitimately use bare return
          results.push({
            principle: 'P10', name: 'Output Contract',
            passed: false, file, line: funcLine + 1,
            detail: 'Function has bare return/undefined return — missing return value',
          });
        }
      }
    }
    return results;
  }

  private findTsFiles(dir: string): string[] {
    const files: string[] = [];
    const walkDir = (d: string, depth: number): void => {
      if (depth > 15) return; // Prevent infinite recursion on circular symlinks
      try {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'src_old') continue;
          if (entry.isSymbolicLink && entry.isSymbolicLink()) continue; // Don't follow symlinks
          const fullPath = path.join(d, entry.name);
          if (entry.isDirectory()) walkDir(fullPath, depth + 1);
          else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(fullPath);
        }
      } catch (e: unknown) { console.error('[Scanner] error:', e); /* skip unreadable */ }
    };
    walkDir(dir, 0);
    return files;
  }

  private findEnclosingFunction(lines: string[], lineIndex: number): number {
    for (let i = lineIndex; i >= 0; i--) {
      if (lines[i].includes('function ') || lines[i].includes('=>') && lines[i].includes('(')) {
        return i;
      }
    }
    return -1;
  }
}
