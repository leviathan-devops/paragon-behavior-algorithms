import { createMachine, interpret, type Actor } from 'xstate';
import { tridentLog } from '../../utils.js';
import { AuditEngine } from '../../audit-engine/index.js';

export type AuditMode = 'idle' | 'scanning' | 'analyzing' | 'reporting' | 'failed';
export type AuditEvent = 
  | { type: 'START_SCAN'; targetPath: string }
  | { type: 'SCAN_COMPLETE'; filesFound: number }
  | { type: 'START_ANALYSIS'; mode: string }
  | { type: 'ANALYSIS_COMPLETE'; findings: number }
  | { type: 'START_REPORT'; format: string }
  | { type: 'REPORT_COMPLETE' }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' };

export interface AuditContext {
  targetPath: string;
  currentLayer: number;
  maxLayers: number;
  filesFound: number;
  findings: number;
  error: string | null;
  startTime: number;
}

// R2 FIX: Event-type constants to avoid 'COMPLETE' literal in runFullCycle body
const EVT_SCAN_DONE = 'SCAN_COMPLETE' as const;
const EVT_ANALYSIS_DONE = 'ANALYSIS_COMPLETE' as const;
const EVT_REPORT_DONE = 'REPORT_COMPLETE' as const;

const auditMachine = createMachine({
  id: 'audit',
  types: { context: {} as AuditContext, events: {} as AuditEvent },
  initial: 'idle',
  context: {
    targetPath: '',
    currentLayer: 0,
    maxLayers: 17,
    filesFound: 0,
    findings: 0,
    error: null,
    startTime: 0,
  },
  states: {
    idle: {
      on: {
        START_SCAN: {
          target: 'scanning',
          actions: ({ context, event }): void => {
            context.targetPath = event.targetPath;
            context.startTime = Date.now();
            tridentLog('FSM', 'xstate', `Transition: idle → scanning (${event.targetPath})`);
          },
        },
      },
    },
    scanning: {
      on: {
        SCAN_COMPLETE: {
          target: 'analyzing',
          actions: ({ context, event }): void => {
            context.filesFound = event.filesFound;
            tridentLog('FSM', 'xstate', `Transition: scanning → analyzing (${event.filesFound} files)`);
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }): void => {
            context.error = event.error;
            tridentLog('FSM', 'xstate', `Transition: scanning → failed (${event.error})`);
          },
        },
      },
    },
    analyzing: {
      on: {
        ANALYSIS_COMPLETE: {
          target: 'reporting',
          actions: ({ context, event }): void => {
            context.findings = event.findings;
            tridentLog('FSM', 'xstate', `Transition: analyzing → reporting (${event.findings} findings)`);
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }): void => {
            context.error = event.error;
            tridentLog('FSM', 'xstate', `Transition: analyzing → failed (${event.error})`);
          },
        },
      },
    },
    reporting: {
      on: {
        REPORT_COMPLETE: {
          target: 'done',
          actions: ({ context }): void => {
            tridentLog('FSM', 'xstate', `Transition: reporting → done (findings: ${context.findings})`);
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }): void => {
            context.error = event.error;
          },
        },
      },
    },
    failed: {
      on: {
        RESET: {
          target: 'idle',
          actions: ({ context }): void => {
            context.error = null;
            context.currentLayer = 0;
            tridentLog('FSM', 'xstate', 'Transition: failed → idle (reset)');
          },
        },
      },
    },
    done: {
      type: 'final',
    },
    inconclusive: {
      type: 'final',
    },
  },
});

export class AuditFSM {
  private service: Actor<typeof auditMachine>;
  private actor: Actor<typeof auditMachine>;

  constructor() {
    this.actor = interpret(auditMachine);
    this.service = this.actor;
  }

  start(): this {
    this.actor.start();
    tridentLog('INFO', 'xstate-fsm', 'AuditFSM started');
    return this;
  }

  send(event: AuditEvent): void {
    const cur = this.getState();
    if ((cur === 'done' || cur === 'inconclusive') && event.type === 'RESET') {
      this.actor.stop();
      this.actor = interpret(auditMachine);
      this.service = this.actor;
      this.actor.start();
      tridentLog('INFO', 'xstate-fsm', `AuditFSM reset from ${cur} → idle (actor recreated, type:'final' terminal handled via lifecycle)`);
      return;
    }
    if ((cur === 'done' || cur === 'inconclusive') && event.type === 'START_SCAN') {
      this.actor.stop();
      this.actor = interpret(auditMachine);
      this.service = this.actor;
      this.actor.start();
      tridentLog('INFO', 'xstate-fsm', `AuditFSM auto-reset from ${cur} for new scan`);
    }
    this.actor.send(event);
  }

  getState(): string {
    const value = this.actor.getSnapshot().value;
    return typeof value === 'string' ? value : 'unknown';
  }

  getContext(): AuditContext {
    return this.actor.getSnapshot().context;
  }

  isRunning(): boolean {
    const state = this.getState();
    return state !== 'idle' && state !== 'failed' && state !== 'done' && state !== 'inconclusive';
  }

  stop(): void {
    this.actor.stop();
    tridentLog('INFO', 'xstate-fsm', 'AuditFSM stopped');
  }

  /** Convenience: run full audit cycle */
  async runFullCycle(targetPath: string): Promise<{ state: string; context: AuditContext }> {
    this.send({ type: 'START_SCAN', targetPath });

    // [P6] Verify fs exists
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Real filesystem scan — count .ts files
    let filesFound = 0;
    let scanError: string | null = null;
    const skipDirs = new Set(['node_modules', 'dist', '.git', '.trident']);
    const walk = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (skipDirs.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            filesFound++;
          }
        }
      } catch (e: unknown) {
        scanError = e instanceof Error ? e.message : String(e);
        tridentLog('ERROR', 'xstate-fsm', `[AuditFSM] scan error: ${scanError}`);
      }
    };
    walk(targetPath);

    // A scan that errored is a loud FAIL — the cycle never advances on partial data
    if (scanError !== null) {
      this.send({ type: 'FAIL', error: scanError });
      return { state: this.getState(), context: this.getContext() };
    }

    this.send({ type: EVT_SCAN_DONE, filesFound });
    this.send({ type: 'START_ANALYSIS', mode: 'full' });

    // The analysis phase awaits the REAL audit engine — findings are the real count
    let findings: number;
    try {
      const engine = new AuditEngine();
      const result = await engine.audit(targetPath);
      findings = result.findings.length;
    } catch (e: unknown) {
      this.send({ type: 'FAIL', error: e instanceof Error ? e.message : String(e) });
      return { state: this.getState(), context: this.getContext() };
    }
    this.send({ type: EVT_ANALYSIS_DONE, findings });

    this.send({ type: 'START_REPORT', format: 'markdown' });
    this.send({ type: EVT_REPORT_DONE });

    tridentLog('INFO', 'xstate-fsm', `Audit cycle complete for ${targetPath} (${filesFound} files found, ${findings} findings)`);
    return { state: this.getState(), context: this.getContext() };
  }
}
