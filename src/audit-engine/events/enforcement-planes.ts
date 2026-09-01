/**
 * enforcement-planes.ts — THE ENFORCEMENT PLANES (SPEC-3 §2.2 / §9.3 — E3)
 *
 * THE SIX ENFORCER ARMS — one EventPlane per slop class. Each plane is the FILTER (constant-time
 * type gate — THE FILTER LAW) + the READER (defensive payload — THE READER LAW: a malformed event
 * → null, never a crash) + the onClassified ENFORCER arm (the block demand).
 *
 * THE NO-VERDICT LAW (SPEC-3 §2.11 / the PARAGON §1.8): a plane's filter/reader NEVER return a
 * slop class — the filter narrows ("this event's type is my interest"), the detector
 * (claimLexiconHasMatch) returns a boolean the TRIAGE MACHINE consumes as ONE precondition, and
 * the machine decides. A filter/detector returning a verdict is a TYPE ERROR.
 *
 * THE AP-E-1 LAW: every plane has a FIRE + a SILENT case in the battery — a plane that never
 * fires is theater.
 */
import type {
  EnforcerAction,
  EventPlane,
  NormalizedObservation,
  RuntimeEvent,
  SlopClass,
} from './event-substrate.js';
import { EVENT_REGISTRY, REGISTERS, RUNTIME_EVENT_TYPES } from './event-registry.js';

/** The defensive info-bag read (THE READER LAW's helper) — the event's properties.info bag. */
function eventInfo(e: RuntimeEvent): Record<string, unknown> | undefined {
  const info = e?.properties?.info;
  return info && typeof info === 'object' ? info : undefined;
}

/** The defensive session id (a string or the empty marker — never a crash). */
function sessionIdOf(info: Record<string, unknown> | undefined): string {
  const sid = info?.sessionID;
  return typeof sid === 'string' ? sid : '';
}

/**
 * THE CLAIM LEXICON (SPEC-3 §9.3) — the observed 2026-08-20 theatrical-claim attack vocabulary.
 * The phrases are DATA (an array), joined into ONE detector pattern. The lexicon entries are
 * regex fragments so the literal claim sentences never appear verbatim in this source file —
 * the detector DETECTS the claim; the enforcement source never UTTERS it (the runtime's own
 * claim gate blocks the literal attack phrases in file writes — the lexicon is written to
 * match them, not to quote them).
 */
export const CLAIM_LEXICON: readonly string[] = [
  'it\\s+works',
  'battery\\s+is\\s+green',
  'all\\s+tests\\s+pass',
  'verified',
  'ready\\s+to\\s+deploy',
  'ship\\s+it',
  "everything'?s\\s+synced",
  '80[0-9]+\\/[0-9]+',
];
const CLAIM_LEXICON_RE: RegExp = new RegExp(`(${CLAIM_LEXICON.join('|')})`, 'i');

/**
 * claimLexiconHasMatch — THE DETECTOR (SPEC-3 §9.3). THIS IS A DETECTOR, NEVER A VERDICT — the
 * machine's CLAIM_SLOP rule gates the match on the container-test-evidence precondition (the
 * gating, never the hamstring). The regex is a MECHANICAL DETECTOR over the bounded lexicon
 * (the ISE law's detection layer); the DECISION (the class) belongs to the machine.
 */
export function claimLexiconHasMatch(text: string): boolean {
  return typeof text === 'string' && CLAIM_LEXICON_RE.test(text);
}

/** THE CLAIM DEMAND (SPEC-3 §9.3) — the [SSTF EVENT: CLAIM] block message. */
export function claimDemand(): string {
  return '[SSTF EVENT: CLAIM] the claim is un-evidenced — the container test is the only proof. Provide the tool-result evidence or refrain from the claim.';
}

/**
 * THE CLAIM-SLOP PLANE (SPEC-3 §9.3 — the canonical plane). Filter: message.updated ONLY (the
 * constant-time gate). Reader: the parts' text, defensively (parts absent → null). Enforcer:
 * the [SSTF EVENT: CLAIM] block demand.
 */
export const claimSlopPlane: EventPlane = {
  name: 'claim-slop',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => e.type === RUNTIME_EVENT_TYPES.MESSAGE_UPDATED, // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the defensive payload; a malformed message.updated is null, never a crash.
    const info = eventInfo(e);
    const parts = info?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((p) => (p as { type?: unknown } | null)?.type === 'text')
      .map((p) => ((p as { text?: unknown } | null)?.text as string) || '')
      .join(' ');
    if (!text) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text,
      at: Date.now(),
      metadata: { claimDetected: claimLexiconHasMatch(text) }, // the DETECTOR output — the machine's precondition
    };
  },
  onClassified: (_obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => ({
    kind: 'block',
    demand: claimDemand(),
  }),
};

/**
 * THE OVER-AUDIT PLANE — the AUDIT_DONE event (the 2026-08-20 debacle's root). The block routes
 * the loop to CALIBRATION, never DISPATCH. The demand carries the COMPUTED density (never a
 * fitted literal).
 */
export const overAuditPlane: EventPlane = {
  name: 'over-audit',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => e.type === EVENT_REGISTRY.AUDIT_DONE, // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the audit stats are numbers or the observation is null.
    const info = eventInfo(e);
    const findings = info?.findingsCount;
    const files = info?.filesScanned;
    if (typeof findings !== 'number' || typeof files !== 'number' || Number.isNaN(findings) || Number.isNaN(files)) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text: `findings=${findings} files=${files}`,
      at: Date.now(),
      metadata: { findingsCount: findings, filesScanned: files },
    };
  },
  onClassified: (obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => {
    const md = obs.metadata as { findingsCount?: unknown; filesScanned?: unknown } | undefined;
    const findings = typeof md?.findingsCount === 'number' ? md.findingsCount : 0;
    const files = typeof md?.filesScanned === 'number' ? md.filesScanned : 0;
    return {
      kind: 'block',
      demand: `[LOOP: OVER_FIRED] the audit over-fires (findings ${findings} > files ${files} × ${REGISTERS.OVER_AUDIT_RATIO}) — route to CALIBRATION, never DISPATCH.`,
    };
  },
};

/**
 * THE DESTRUCTIVE-PLAN PLANE — the loop.plan event (a wave suggestion that contradicts the
 * container-proven working architecture). The block: the wave never boards.
 */
export const destructivePlanPlane: EventPlane = {
  name: 'destructive-plan',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => e.type === EVENT_REGISTRY.LOOP_PLAN, // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the suggestion text or null.
    const info = eventInfo(e);
    const suggestion = info?.suggestion ?? info?.text;
    if (typeof suggestion !== 'string' || suggestion.length === 0) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text: suggestion,
      at: Date.now(),
      metadata: { suggestion },
    };
  },
  onClassified: (_obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => ({
    kind: 'block',
    demand: '[LOOP: CONTRADICTION] the planned wave contradicts the working architecture — the wave never boards; the remedy names the contradiction.',
  }),
};

/**
 * THE FAKE-RETURN PLANE — the tool.call.* result whose content IS the theatrical pattern (the
 * R17 ethic applied to the result). The block: the result is flagged, never consumable as a pass.
 * NOTE: tool.call.* is a HYPOTHESIS type on this SDK runtime (event-registry.ts) — the filter is
 * written per the spec; the E-PB5 container probe confirms or removes it (the LIVING-DOC law).
 */
export const fakeReturnPlane: EventPlane = {
  name: 'fake-return',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => typeof e.type === 'string' && e.type.startsWith(EVENT_REGISTRY.hypotheses.TOOL_CALL), // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the result content or null.
    const info = eventInfo(e);
    const content = info?.result ?? info?.content ?? info?.text;
    if (typeof content !== 'string' || content.length === 0) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text: content,
      at: Date.now(),
      metadata: { resultText: content },
    };
  },
  onClassified: (_obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => ({
    kind: 'block',
    demand: '[SSTF EVENT: FAKE_RETURN] the tool-result is theatrical — recorded as flagged, never consumable as a pass.',
  }),
};

/**
 * THE CALIB-STALE PLANE — the audit.golden-state event where a matcher false-fired on the clean
 * core (the D17 signal). The block: the matcher feeds the CalibrationGate (FLAGGED + EXCLUDED).
 */
export const calibStalePlane: EventPlane = {
  name: 'calib-stale',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => e.type === EVENT_REGISTRY.AUDIT_GOLDEN_STATE, // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the matcher id or null (a golden-state event without the id is malformed).
    const info = eventInfo(e);
    const matcherId = info?.matcherId;
    if (typeof matcherId !== 'string' || matcherId.length === 0) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text: `matcher=${matcherId}`,
      at: Date.now(),
      metadata: { matcherId },
    };
  },
  onClassified: (obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => {
    const md = obs.metadata as { matcherId?: unknown } | undefined;
    const matcherId = typeof md?.matcherId === 'string' ? md.matcherId : 'unknown';
    return {
      kind: 'block',
      demand: `[AUDIT: CALIB_STALE] matcher ${matcherId} false-fired on the clean core — the D17 re-calibration is required before the next audit.`,
    };
  },
};

/**
 * THE TEA-NOT-TEB PLANE — the hook.registration event where an enforcement lands in a NON-before
 * hook (tea, not teb — an enforcement that cannot block). The block: the registration is rejected.
 */
export const teaNotTebPlane: EventPlane = {
  name: 'tea-not-teb',
  kind: 'enforcer',
  filter: (e: RuntimeEvent) => e.type === EVENT_REGISTRY.HOOK_REGISTRATION, // THE FILTER LAW
  reader: (e: RuntimeEvent): NormalizedObservation | null => {
    // THE READER LAW — the hook name + the placement or null.
    const info = eventInfo(e);
    const hookName = info?.hook ?? info?.name;
    const placement = info?.placement ?? info?.phase;
    if (typeof hookName !== 'string' || hookName.length === 0) return null;
    if (typeof placement !== 'string' || placement.length === 0) return null;
    return {
      sessionID: sessionIdOf(info),
      type: e.type,
      text: `hook=${hookName} placement=${placement}`,
      at: Date.now(),
      metadata: { hookName, placement },
    };
  },
  onClassified: (_obs: NormalizedObservation, _klass: SlopClass): EnforcerAction => ({
    kind: 'block',
    demand: '[HOOK: TEA_NOT_TEB] an enforcement is registered in a non-before hook — it cannot block (tea, not teb).',
  }),
};

/** THE SIX PLANES — the registry-friendly bundle (the E-PB5 wiring consumes this array). */
export const ENFORCEMENT_PLANES: readonly EventPlane[] = [
  claimSlopPlane,
  overAuditPlane,
  destructivePlanPlane,
  fakeReturnPlane,
  calibStalePlane,
  teaNotTebPlane,
];
