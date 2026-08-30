// src/v2/shared-state.ts — THE NEUTRAL SHARED STATE (HT-BUG-4/6 fix)
//
// THE CIRCULAR-IMPORT KILL (the meta-audit root cause): pipeline.ts imported
// getV2Synapse from event-router while event-router imported onSignals from
// pipeline — a cycle that threw during module init and silently killed every
// downstream gate family. This module owns ALL cross-cutting state so neither
// file imports from the other. Dependency graph after fix:
//
//   pipeline.ts ──→ shared-state.ts ←── event-router.ts
//   pipeline.ts ──→ event-router.ts    (ONE-WAY: getV2Synapse accessor only)
//
// No reverse edges. No cycles. Module init order is deterministic.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { V2Level } from './contracts.js';
import { writeEvidence } from './evidence/ledger-writer.js';

// ── GAP-4: THE DIAL DELIVERY (spec §5) ──────────────────────────────────────
// The env var historically never reached the serving process across restart
// methods. Delivery order: process.env FIRST (explicit launch env wins), the
// persistent ~/.config/opencode/.env SECOND, fail-closed STEER last.
// PURE + exported: the battery pins the precedence mechanically.

/** PURE parser: KEY=VALUE lines; #comments and blanks skipped; quotes stripped. */
export function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key !== '') out[key] = val;
  }
  return out;
}

/** PURE resolver: process-env > dotenv > fail-closed STEER; invalid → STEER. */
export function resolveDialLevel(processLevel: string | undefined, dotenvLevel: string | undefined): V2Level {
  const lv = (String(processLevel ?? '').trim() || String(dotenvLevel ?? '').trim()).toUpperCase();
  return lv === 'OFF' || lv === 'STEER' || lv === 'FULL' ? (lv as V2Level) : 'STEER';
}

// The PRE-dotenv snapshot distinguishes the boot-trace source (spec §5):
// once loadDotEnv injects into process.env the origin is no longer observable.
const PRE_DOTENV_PROCESS_LEVEL = process.env.TRIDENT_V2_LEVEL;
let dotenvProvidedLevel: string | undefined;

function loadDotEnv(): void {
  try {
    const envPath = path.join(os.homedir(), '.config', 'opencode', '.env');
    if (!fs.existsSync(envPath)) return;
    const parsed = parseDotEnv(fs.readFileSync(envPath, 'utf-8'));
    for (const [key, val] of Object.entries(parsed)) {
      if (!(key in process.env)) (process.env as Record<string, string>)[key] = val;
    }
    if (parsed['TRIDENT_V2_LEVEL'] !== undefined) dotenvProvidedLevel = parsed['TRIDENT_V2_LEVEL'];
  } catch (err) {
    console.error('[shared-state] .env load failed:', String((err as Error)?.message ?? err));
  }
}
loadDotEnv();
export function reloadDotEnvForTests(): void { loadDotEnv(); }

// ── THE LEVEL DIAL ──────────────────────────────────────────────────────────
// TRIDENT_V2_LEVEL: process-env override, .env persistence, fail-closed STEER.
const BOOT_LEVEL: V2Level = resolveDialLevel(PRE_DOTENV_PROCESS_LEVEL, dotenvProvidedLevel);

export const TRIDENT_V2_PROBE_VERBOSE: boolean = String(process.env.TRIDENT_V2_PROBE_VERBOSE ?? '').trim() === '1';

let enforcementLevel: V2Level = BOOT_LEVEL;

export function getV2EnforcementLevel(): V2Level {
  return enforcementLevel;
}

export function setV2EnforcementLevel(level: V2Level): void {
  enforcementLevel = level;
}

// THE BOOT-TRACE ROW (spec §5 + AP-07): records WHICH source armed the dial —
// the stale-.env anti-pattern is detectable from evidence, never guessed.
// Plane is 'enforcement' (the dial is enforcement config; V2Plane has no 'boot').
// NOTE: the key is dialSource — writeEvidence reserves `source` for the plane
// discriminator and would overwrite it.
try {
  writeEvidence('enforcement', {
    kind: 'v2-dial-loaded',
    level: BOOT_LEVEL,
    dialSource: PRE_DOTENV_PROCESS_LEVEL !== undefined && String(PRE_DOTENV_PROCESS_LEVEL).trim() !== '' ? 'process-env' : dotenvProvidedLevel !== undefined ? 'dotenv' : 'default-steer',
  });
} catch { /* observer law — boot evidence is best-effort */ }

// ── THE ON-SIGNALS BRIDGE ───────────────────────────────────────────────────
// event-router calls this instead of importing pipeline directly.
// pipeline registers itself here at module init.
type OnSignalsFn = (weighted: readonly any[], seq: number) => void;
let onSignalsImpl: OnSignalsFn | null = null;

export function registerOnSignals(fn: OnSignalsFn): void {
  onSignalsImpl = fn;
}

export function callOnSignals(weighted: readonly unknown[], seq: number): void {
  if (onSignalsImpl) onSignalsImpl(weighted, seq);
}
