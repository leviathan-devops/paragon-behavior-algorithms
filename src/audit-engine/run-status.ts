import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { tridentLog } from '../utils.js';

// ── THE RUN-STATUS SCHEMA — SINGLE SOURCE OF TRUTH ──
// Hardcode ban: schema + transition labels defined ONCE here, imported everywhere.
export const RUN_STATUS_FILENAME = 'run-status.json';
export const NOTIFICATION_FILENAME = 'notifications.jsonl';
export const NO_ACTIVE_RUN = 'NO_ACTIVE_RUN' as const;

export const PRELIMINARY_LABEL = '[PRELIMINARY]';
export const LASME_LABEL = '[LASME-ADJUDICATED]';
export const MPSE_LABEL = '[MPSE-VERIFIED]';
export const FINAL_LABEL = '[FINAL]';
export const GATES_RUNNING_LABEL = '[GATES-RUNNING]';

export type RunGate = 'PRELIMINARY' | 'GRAPH_LOGIC' | 'LASME' | 'MPSE' | 'SRO' | 'GATES_RUNNING' | 'PROBE_FAILED' | 'FINAL';
export type RunPhase = 'start' | 'done';

export interface RunStatusSnapshot {
  runId: string;
  gate: RunGate;
  phase: RunPhase;
  huntersFulfilled: number;
  huntersRejected: number;
  candidatesSoFar: number;
  artifactLabel: string;
  updatedAt: number;
  targetRoot: string;
  gates?: Partial<Record<'LASME' | 'MPSE' | 'SRO', { phase: RunPhase; huntersFulfilled: number; huntersRejected: number }>>;
  headline?: string;
  selfDefectCount?: number;
  topFindings?: string[];
  graphState?: { macro?: { substrate: string; nodes: number; edges: number }; micro?: { nodes: number; edges: number; graphJson: string | null } };
}

// ── PATH DERIVATIONS ──
export function aetherLedgerRootFor(targetRoot: string): string {
  return path.join(path.resolve(targetRoot), '.trident', 'aether-ledger');
}

export function runStatusPath(ledgerRoot: string): string {
  return path.join(ledgerRoot, RUN_STATUS_FILENAME);
}

export function notificationPath(ledgerRoot: string): string {
  return path.join(ledgerRoot, NOTIFICATION_FILENAME);
}

export function artifactPathFor(targetRoot: string, label: string): string {
  const sanitized = label.replace(/[^A-Z]/g, '');
  return path.join(path.resolve(targetRoot), '.trident', `audit-report-${sanitized}.md`);
}

export function preliminaryArtifactPath(targetRoot: string): string {
  return artifactPathFor(targetRoot, PRELIMINARY_LABEL);
}

// ── ATOMIC WRITE (temp + rename) ──
// Pure writer — clock supplied by caller via snapshot.updatedAt (Date.now() at call site).
export function writeRunStatus(ledgerRoot: string, snapshot: RunStatusSnapshot): void {
  fs.mkdirSync(ledgerRoot, { recursive: true });
  const dest = runStatusPath(ledgerRoot);
  const tmp = path.join(ledgerRoot, `${RUN_STATUS_FILENAME}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  const payload = JSON.stringify(snapshot, null, 2);
  try {
    fs.writeFileSync(tmp, payload, 'utf-8');
    fs.renameSync(tmp, dest);
  } catch (e: unknown) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_cleanupErr: unknown) {
      void _cleanupErr;
    }
    throw e;
  }
}

// ── SAFE WRAPPER — FAILURE-TOLERANT (audit never hostage to status file) ──
// Logs LOUD on failure, never throws.
export function safeWriteRunStatus(ledgerRoot: string, snapshot: RunStatusSnapshot): boolean {
  try {
    writeRunStatus(ledgerRoot, snapshot);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      tridentLog('ERROR', 'run-status', `RUN_STATUS_WRITE_FAILED ledger=${ledgerRoot} gate=${snapshot.gate} phase=${snapshot.phase} runId=${snapshot.runId} err=${msg}`);
    } catch (_logErr: unknown) {
      void _logErr;
    }
    return false;
  }
}

// ── READ (NO_ACTIVE_RUN-safe) ──
export function readRunStatus(ledgerRoot: string): { ok: true; snapshot: RunStatusSnapshot } | { ok: false; reason: typeof NO_ACTIVE_RUN | 'CORRUPT'; error?: string; raw?: string } {
  const dest = runStatusPath(ledgerRoot);
  if (!fs.existsSync(dest)) {
    return { ok: false, reason: NO_ACTIVE_RUN };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(dest, 'utf-8');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'CORRUPT', error: `read failed: ${msg}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'CORRUPT', error: `JSON parse failed: ${msg}`, raw };
  }
  const s = parsed as Record<string, unknown>;
  const required = ['runId', 'gate', 'phase', 'huntersFulfilled', 'huntersRejected', 'candidatesSoFar', 'artifactLabel', 'updatedAt', 'targetRoot'];
  for (const k of required) {
    if (!(k in s)) return { ok: false, reason: 'CORRUPT', error: `missing field ${k}`, raw };
  }
  if (typeof s['runId'] !== 'string' || typeof s['gate'] !== 'string' || typeof s['phase'] !== 'string') {
    return { ok: false, reason: 'CORRUPT', error: 'type mismatch on runId/gate/phase', raw };
  }
  return { ok: true, snapshot: s as unknown as RunStatusSnapshot };
}

// ── GATE-COMPLETION NOTIFICATION (named event ledger) ──
// Appends a JSONL row to notifications.jsonl — durable, poll-able, append-safe.
// This is the "named event the hooks layer already listens for" fallback surface:
// - The ledger lives beside run-status.json in the aether-ledger dir.
// - action=status reads it.
// - The existing AUDIT_DONE bus event (graph.appendEvent at FINAL) remains the
//   hooks-layer bus notification at FINAL; per-gate rows live here without
//   violating the frozen EVENT_KINDS contract (db.ts:97 — HUNT_DONE|BUILD_DONE|AUDIT_DONE only).
export interface GateNotification {
  event: 'AUDIT_GATE_DONE';
  runId: string;
  gate: RunGate;
  phase: RunPhase;
  huntersFulfilled: number;
  huntersRejected: number;
  candidatesSoFar: number;
  artifactLabel: string;
  updatedAt: number;
  targetRoot: string;
  headline?: string;
  selfDefectCount?: number;
  topFindings?: string[];
}

export function notifyGateCompletion(ledgerRoot: string, snapshot: RunStatusSnapshot): void {
  fs.mkdirSync(ledgerRoot, { recursive: true });
  const dest = notificationPath(ledgerRoot);
  const row: GateNotification = {
    event: 'AUDIT_GATE_DONE',
    runId: snapshot.runId,
    gate: snapshot.gate,
    phase: snapshot.phase,
    huntersFulfilled: snapshot.huntersFulfilled,
    huntersRejected: snapshot.huntersRejected,
    candidatesSoFar: snapshot.candidatesSoFar,
    artifactLabel: snapshot.artifactLabel,
    updatedAt: snapshot.updatedAt,
    targetRoot: snapshot.targetRoot,
    headline: snapshot.headline,
    selfDefectCount: snapshot.selfDefectCount,
    topFindings: snapshot.topFindings,
  };
  const line = JSON.stringify(row) + '\n';
  fs.appendFileSync(dest, line, 'utf-8');
}

// ── THE IN-SESSION TOAST CHANNEL (the wave-manager v3 promptAsync pattern —
// wave-dispatch.ts:1281-1290, the ONLY viable surface for in-process completions) ──
// The tool handler configures this at dispatch with the owner session ID; each gate
// transition delivers an in-session notification via client.session.promptAsync.
type ToastDeliverFn = (text: string) => void;
let toastDeliver: ToastDeliverFn | null = null;

export function configureToastDelivery(fn: ToastDeliverFn | null): void {
  toastDeliver = fn;
}

function deliverGateToast(gate: string, phase: string, candidates: number, fulfilled: number, rejected: number, label: string, runId: string, headline?: string, selfDefectCount?: number, topFindings?: string[]): void {
  if (!toastDeliver) return;
  const base = `[AETHER GATE] ${gate} ${phase} — ${candidates} candidates, ${fulfilled} fulfilled / ${rejected} rejected | artifact: ${label} | runId: ${runId}`;
  const headlinePart = headline ? ` | headline: ${headline}` : '';
  const selfPart = typeof selfDefectCount === 'number' ? ` | self-defects: ${selfDefectCount}` : '';
  const topPart = topFindings && topFindings.length > 0 ? ` | top-3: ${topFindings.join(' || ')}` : '';
  const text = base + headlinePart + selfPart + topPart;
  try {
    toastDeliver(text);
  } catch (_toastErr: unknown) {
    try {
      tridentLog('WARN', 'run-status', `GATE_TOAST_FAILED gate=${gate} phase=${phase} err=${_toastErr instanceof Error ? _toastErr.message : String(_toastErr)}`);
    } catch (_logErr: unknown) {
      void _logErr;
    }
  }
}

export function safeNotifyGateCompletion(ledgerRoot: string, snapshot: RunStatusSnapshot): boolean {
  try {
    notifyGateCompletion(ledgerRoot, snapshot);
    try {
      tridentLog('INFO', 'run-status', `GATE_DONE gate=${snapshot.gate} phase=${snapshot.phase} runId=${snapshot.runId} candidates=${snapshot.candidatesSoFar} hunters=${snapshot.huntersFulfilled}/${snapshot.huntersRejected} artifact=${snapshot.artifactLabel}`);
    } catch (_logErr: unknown) {
      void _logErr;
    }
    deliverGateToast(snapshot.gate, snapshot.phase, snapshot.candidatesSoFar, snapshot.huntersFulfilled, snapshot.huntersRejected, snapshot.artifactLabel, snapshot.runId, snapshot.headline, snapshot.selfDefectCount, snapshot.topFindings);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      tridentLog('ERROR', 'run-status', `NOTIFY_GATE_FAILED ledger=${ledgerRoot} gate=${snapshot.gate} phase=${snapshot.phase} runId=${snapshot.runId} err=${msg}`);
    } catch (_logErr: unknown) {
      void _logErr;
    }
    return false;
  }
}

export function mergeGateState(base: RunStatusSnapshot, gate: 'LASME' | 'MPSE' | 'SRO', phase: RunPhase, fulfilled: number, rejected: number): RunStatusSnapshot {
  const nextGates: NonNullable<RunStatusSnapshot['gates']> = { ...(base.gates ?? {}) };
  nextGates[gate] = { phase, huntersFulfilled: fulfilled, huntersRejected: rejected };
  let totalFulfilled = 0;
  let totalRejected = 0;
  for (const v of Object.values(nextGates)) {
    if (!v) continue;
    totalFulfilled += v.huntersFulfilled;
    totalRejected += v.huntersRejected;
  }
  return { ...base, gates: nextGates, huntersFulfilled: totalFulfilled, huntersRejected: totalRejected };
}

// ── NOTIFICATION READ (for action=status enrichment) ──
export function readNotifications(ledgerRoot: string, limit = 50): GateNotification[] {
  const dest = notificationPath(ledgerRoot);
  if (!fs.existsSync(dest)) return [];
  try {
    const raw = fs.readFileSync(dest, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const out: GateNotification[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        const parsed = JSON.parse(line) as GateNotification;
        if (parsed.event === 'AUDIT_GATE_DONE') out.push(parsed);
      } catch (_parseErr: unknown) {
        void _parseErr;
      }
    }
    return out;
  } catch (_readErr: unknown) {
    void _readErr;
    return [];
  }
}
