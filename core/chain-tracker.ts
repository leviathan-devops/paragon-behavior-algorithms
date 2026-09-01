import type { CallRecord, ChainRule, ChainViolation } from './types.js';
export type { CallRecord, ChainRule, ChainViolation, ViolationType } from './types.js';

const HISTORY_CAP = 100;
const OUTPUT_CAP = 500;

export class ChainTracker {
  private sessions = new Map<string, CallRecord[]>();

  private getOrCreate(sessionId: string): CallRecord[] {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('ChainTracker: sessionId must be non-empty string');
    }
    let h = this.sessions.get(sessionId);
    if (!h) {
      h = [];
      this.sessions.set(sessionId, h);
    }
    return h;
  }

  recordCall(sessionId: string, toolName: string, args: Record<string, unknown>): void {
    if (!toolName || typeof toolName !== 'string') throw new Error('ChainTracker.recordCall: toolName required');
    if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('ChainTracker.recordCall: args must be object');
    const history = this.getOrCreate(sessionId);
    history.push({ tool: toolName, at: Date.now(), args });
    if (history.length > HISTORY_CAP) history.shift();
  }

  recordResult(sessionId: string, toolName: string, exitCode: number, output: string): void {
    if (!toolName || typeof toolName !== 'string') throw new Error('ChainTracker.recordResult: toolName required');
    if (typeof exitCode !== 'number' || !Number.isFinite(exitCode)) throw new Error('ChainTracker.recordResult: exitCode must be finite number');
    if (typeof output !== 'string') throw new Error('ChainTracker.recordResult: output must be string');
    const history = this.sessions.get(sessionId);
    if (!history || history.length === 0) return;
    const capped = output.length > OUTPUT_CAP ? output.substring(0, OUTPUT_CAP) : output;
    for (let i = history.length - 1; i >= 0; i--) {
      const rec = history[i]!;
      if (rec.tool === toolName && rec.exitCode === undefined) {
        rec.exitCode = exitCode;
        rec.output = capped;
        break;
      }
    }
  }

  wasCalled(sessionId: string, tool: string | RegExp, withinMs?: number): boolean {
    const history = this.sessions.get(sessionId);
    if (!history || history.length === 0) return false;
    const ms = withinMs ?? 0;
    const cutoff = ms > 0 ? Date.now() - ms : 0;
    const isReg = tool instanceof RegExp;
    for (const call of history) {
      if (call.at < cutoff) continue;
      if (isReg) {
        try {
          if ((tool as RegExp).test(call.tool)) return true;
        } catch (e) { void e; }
      } else {
        if (call.tool === tool) return true;
      }
    }
    return false;
  }

  recentTools(sessionId: string, limit: number): Array<{ tool: string; at: number; exitCode?: number }> {
    if (!Number.isFinite(limit) || limit < 0) throw new Error('ChainTracker.recentTools: limit must be non-negative number');
    const history = this.sessions.get(sessionId);
    if (!history) return [];
    return history.slice(-limit).map(r => ({ tool: r.tool, at: r.at, exitCode: r.exitCode }));
  }

  detectLoop(sessionId: string, windowSize: number = 10): boolean {
    if (!Number.isFinite(windowSize) || windowSize <= 0) throw new Error('ChainTracker.detectLoop: windowSize must be positive');
    const history = this.sessions.get(sessionId);
    if (!history) return false;
    const recent = history.slice(-windowSize);
    if (recent.length < 3) return false;
    const counts: Record<string, number> = {};
    for (const c of recent) counts[c.tool] = (counts[c.tool] ?? 0) + 1;
    for (const [tool, count] of Object.entries(counts)) {
      if (count >= 3) {
        const results = recent.filter(c => c.tool === tool && c.output !== undefined);
        const unique = new Set(results.map(r => r.output));
        if (unique.size <= 1) return true;
      }
    }
    return false;
  }

  evaluateRules(sessionId: string, currentTool: string, currentArgs: Record<string, unknown>, rules: ChainRule[]): ChainViolation[] {
    if (!currentTool || typeof currentTool !== 'string') throw new Error('ChainTracker.evaluateRules: currentTool required');
    if (currentArgs === null || typeof currentArgs !== 'object') throw new Error('ChainTracker.evaluateRules: currentArgs must be object');
    if (!Array.isArray(rules)) throw new Error('ChainTracker.evaluateRules: rules must be array');
    const violations: ChainViolation[] = [];
    for (const rule of rules) {
      if (!rule.name || !rule.violation?.layerId) throw new Error(`ChainTracker.evaluateRules: rule missing name or violation.layerId: ${JSON.stringify(rule)}`);
      if (rule.requires && rule.requires.length > 0) {
        for (const req of rule.requires) {
          let satisfied = false;
          try {
            satisfied = this.wasCalled(sessionId, req.tool, req.withinMs);
            if (satisfied && req.args) {
              const history = this.sessions.get(sessionId) ?? [];
              const cutoff = req.withinMs ? Date.now() - req.withinMs : 0;
              const candidates = history.filter(c => {
                if (c.at < cutoff) return false;
                if (typeof req.tool === 'string') return c.tool === req.tool;
                try { return (req.tool as RegExp).test(c.tool); } catch { return false; }
              });
              let argsMatched = false;
              for (const c of candidates) {
                if (!c.args) continue;
                let allMatch = true;
                for (const [k, v] of Object.entries(req.args)) {
                  const actual = c.args[k];
                  if (v instanceof RegExp) {
                    try { if (typeof actual !== 'string' || !v.test(actual)) allMatch = false; } catch { allMatch = false; }
                  } else {
                    if (String(actual) !== String(v)) allMatch = false;
                  }
                  if (!allMatch) break;
                }
                if (allMatch) { argsMatched = true; break; }
              }
              satisfied = argsMatched;
            }
          } catch (e) { void e; satisfied = false; }
          if (!satisfied) {
            violations.push({
              ruleName: rule.name,
              violationType: 'MISSING_PREREQUISITE',
              expectedTool: String(req.tool),
              actualContext: `${currentTool} called without prerequisite ${String(req.tool)}`,
              layerId: rule.violation.layerId,
            });
          }
        }
      }
      if (rule.forbids && rule.forbids.length > 0) {
        for (const forbid of rule.forbids) {
          let called = false;
          try { called = this.wasCalled(sessionId, forbid.tool, forbid.withinMs); } catch (e) { void e; }
          if (called) {
            violations.push({
              ruleName: rule.name,
              violationType: 'FORBIDDEN_PRECEDENT',
              expectedTool: 'none',
              actualContext: `${String(forbid.tool)} was called before ${currentTool}`,
              layerId: rule.violation.layerId,
            });
          }
        }
      }
    }
    return violations;
  }

  _getHistoryLength(sessionId: string): number {
    return this.sessions.get(sessionId)?.length ?? 0;
  }

  _getHistory(sessionId: string): CallRecord[] {
    return [...(this.sessions.get(sessionId) ?? [])];
  }
}
