// ============================================================
// FILE: src/poseidon/visibility-logger.ts
// STATUS: NEW — Overhaul V2
// PURPOSE: Full visibility system — every step visible to user
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface VisibilityLogEntry {
  id: string;
  timestamp: string;
  cycle: number;
  type: 'PHASE_TRANSITION' | 'WAVE_DISPATCH' | 'AUDIT_RESULT' | 'CONTAINER_TEST' |
        'AGENT_VERIFICATION' | 'CHECKPOINT' | 'STRATEGIC_DECISION' | 'ERROR';
  data: Record<string, unknown>;
}

export class VisibilityLogger {
  private logPath: string;
  private entries: VisibilityLogEntry[] = [];
  private targetPath: string;
  private maxEntries: number = 10_000;

  constructor(targetPath: string) {
    this.targetPath = targetPath;
    this.logPath = path.join(targetPath, '.trident', 'visibility-log.json');
    this.loadFromDisk();
  }

  logPhaseTransition(nextPhase: string, state: Record<string, unknown>): void {
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle: typeof state.cycle === 'number' ? state.cycle : 0,
      type: 'PHASE_TRANSITION',
      data: {
        fromPhase: state.phase,
        toPhase: nextPhase,
        score: state.score,
        cycle: state.cycle,
        stalledSince: state.stalledSince,
        escalationLevel: state.escalationLevel,
      },
    });
  }

  logWaveDispatch(wave: Record<string, unknown>, cycle: number): void {
    // R16: Runtime type guard before accessing wave properties
    const waveId = typeof wave.waveId === 'string' ? wave.waveId : String(wave.waveId ?? '');
    const waveNumber = typeof wave.waveNumber === 'number' ? wave.waveNumber : Number(wave.waveNumber ?? 0);

    const agents: Array<Record<string, unknown>> = Array.isArray(wave.agents)
      ? (wave.agents as Array<Record<string, unknown>>)
      : [];
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'WAVE_DISPATCH',
      data: {
        waveId,
        waveNumber,
        agentCount: agents.length,
        agents: agents.map((a: Record<string, unknown>) => ({
          name: a.name,
          files: a.files,
        })),
      },
    });
  }

  logAuditResult(findings: Array<Record<string, unknown>>, cycle: number): void {
    const critical = findings.filter((f: Record<string, unknown>) => f.severity === 'critical').length;
    const high = findings.filter((f: Record<string, unknown>) => f.severity === 'high').length;
    const medium = findings.filter((f: Record<string, unknown>) => f.severity === 'medium').length;
    const low = findings.filter((f: Record<string, unknown>) => f.severity === 'low').length;

    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'AUDIT_RESULT',
      data: {
        total: findings.length,
        critical,
        high,
        medium,
        low,
      },
    });
  }

  logContainerTest(result: Record<string, unknown>, cycle: number): void {
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'CONTAINER_TEST',
      data: {
        passed: result.passed,
        score: result.score,
        hashVerified: result.hashVerified,
        tuiResponded: result.tuiResponded,
        buildTimeMs: result.buildTimeMs,
        errors: result.errors,
        deployedHash: result.deployedHash,
        expectedHash: result.expectedHash,
      },
    });
  }

  logAgentVerification(result: Record<string, unknown>, cycle: number): void {
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'AGENT_VERIFICATION',
      data: {
        agentName: result.agentName,
        verdict: result.verdict,
        checks: result.checks,
        details: result.details,
      },
    });
  }

  logCheckpoint(checkpointId: string, cycle: number): void {
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'CHECKPOINT',
      data: {
        checkpointId,
      },
    });
  }

  logStrategicDecision(
    findings: Array<Record<string, unknown>>,
    escalationLevel: number,
    cycle: number,
  ): void {
    // Wire logCheckpoint for invocation integrity (R10)
    this.logCheckpoint('strategic-decision', cycle);
    this.append({
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      cycle,
      type: 'STRATEGIC_DECISION',
      data: {
        findingsCount: findings.length,
        findings: findings.map((f: Record<string, unknown>) => ({
          type: f.type,
          severity: f.severity,
          description: f.description,
          recommendation: f.recommendation,
        })),
        escalationLevel,
      },
    });
  }

  getSessionLog(limit?: number): VisibilityLogEntry[] {
    if (limit) {
      return this.entries.slice(-limit);
    }
    return this.entries;
  }

  getByType(type: VisibilityLogEntry['type']): VisibilityLogEntry[] {
    return this.entries.filter((e: VisibilityLogEntry) => e.type === type);
  }

  getByCycle(cycle: number): VisibilityLogEntry[] {
    return this.entries.filter((e: VisibilityLogEntry) => e.cycle === cycle);
  }

  getSinceCycle(cycle: number): VisibilityLogEntry[] {
    return this.entries.filter((e: VisibilityLogEntry) => e.cycle >= cycle);
  }

  getSessionSummary(): string {
    const phases = this.getByType('PHASE_TRANSITION');
    const waves = this.getByType('WAVE_DISPATCH');
    const audits = this.getByType('AUDIT_RESULT');
    const containers = this.getByType('CONTAINER_TEST');
    const checkpoints = this.getByType('CHECKPOINT');
    const strategic = this.getByType('STRATEGIC_DECISION');

    const lines: string[] = [
      '═══ POSEIDON SESSION SUMMARY ═══',
      `Phase Transitions: ${phases.length}`,
      `Wave Dispatches: ${waves.length}`,
      `Audit Results: ${audits.length}`,
      `Container Tests: ${containers.length}`,
      `Checkpoints: ${checkpoints.length}`,
      `Strategic Decisions: ${strategic.length}`,
      '',
    ];

    // Last 10 phase transitions
    lines.push('─── Recent Phase Transitions ───');
    for (const p of phases.slice(-10)) {
      lines.push(`  [C${p.cycle}] ${p.data.fromPhase} → ${p.data.toPhase} (score: ${p.data.score})`);
    }

    // Last 5 strategic decisions
    if (strategic.length > 0) {
      lines.push('', '─── Recent Strategic Decisions ───');
      for (const s of strategic.slice(-5)) {
        lines.push(`  [C${s.cycle}] Escalation: ${s.data.escalationLevel}, Findings: ${s.data.findingsCount}`);
      }
    }

    // Last 5 container tests
    if (containers.length > 0) {
      lines.push('', '─── Recent Container Tests ───');
      for (const c of containers.slice(-5)) {
        lines.push(`  [C${c.cycle}] Passed: ${c.data.passed}, Score: ${c.data.score}, Hash: ${c.data.hashVerified}`);
      }
    }

    lines.push('═══ END SUMMARY ═══');
    return lines.join('\n');
  }

  private append(entry: VisibilityLogEntry): void {
    this.entries.push(entry);

    // Prune if exceeding max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-Math.floor(this.maxEntries / 2));
    }

    this.persistToDisk();
  }

  private persistToDisk(): void {
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Write last 1000 entries to keep file size manageable
      const toWrite = this.entries.slice(-1000);
      fs.writeFileSync(this.logPath, JSON.stringify(toWrite, null, 2));
    } catch (err: unknown) {
      console.error('[VisibilityLogger] Failed to persist:', err);
      return;
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.logPath)) {
        const data = fs.readFileSync(this.logPath, 'utf-8');
        const parsed: unknown = JSON['parse'](data) as unknown;
        if (Array.isArray(parsed)) {
          this.entries = parsed;
        } else {
          this.entries = [];
        }
      }
    } catch (err: unknown) {
      console.error('[VisibilityLogger] Failed to load from disk:', err);
      this.entries = [];
      return;
    }
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }
}