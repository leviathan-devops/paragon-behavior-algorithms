/**
 * event-registry.ts — THE MEASURED EVENT-TYPE REGISTRY (SPEC-3 Appendix C — the log-first probe)
 *
 * THE LOG-FIRST PROBE (AP-12, SPEC-3 §16.1): the registry is written against the MEASURED
 * runtime vocabulary, never an assumed schema. THE PROBE was the FIRST task of the E-PB1 wave:
 * the runtime's own SDK event union (`@opencode-ai/sdk` `Event` — the ground truth of what the
 * runtime EMITS) was read + the `sessionHook` dispatch paths (`trident-hooks.ts`) were verified.
 * THE MEASURED TYPES below are the constants the filters import from — the code mirror of
 * Appendix C (SPEC-3 §16.2: the registry is the single source the filters import from).
 *
 * THE THREE SOURCE-TRUTH CLASSES (the honest probe record):
 *   - RUNTIME:  a type present in the runtime's SDK `Event` union (emitted by the runtime)
 *   - INTERNAL: a type the SPEC-3 machinery writes itself (the AUDIT_DONE / the loop.plan —
 *               NOT a runtime event; the substrate's own planes / the loop write these)
 *   - HYPOTHESIS: a type the SPEC-3 spec assumed but the probe could NOT confirm on this
 *               SDK runtime (flagged per the LIVING-DOC clause, §16.1 STEP 2) — NEVER treated
 *               as truth; the E-PB5 container probe confirms or removes it.
 *
 * THE LIVING-DOC LAW (§16.2): a NEW observed type is ADDED to this registry + a NEW filter/plane
 * IF it carries a slop class; a type carrying NO slop class → the BENIGN observer-arm + a note.
 * THE SUBSTRATE NEVER filters on a type NOT in this registry — an unregistered type is ignored
 * (the FILTER law) + logged as the registry gap.
 */

/** THE MEASURED RUNTIME EVENT TYPES — the SDK `Event` union discriminator values. */
export const RUNTIME_EVENT_TYPES = {
  // ── the session lifecycle ──
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_STATUS: 'session.status',
  SESSION_IDLE: 'session.idle',
  SESSION_DIFF: 'session.diff',
  SESSION_ERROR: 'session.error',
  SESSION_DELETED: 'session.deleted',
  SESSION_COMPACTED: 'session.compacted',
  // the session.next.<*> streaming spine (the step/text/reasoning/tool progress)
  SESSION_NEXT_STEP_STARTED: 'session.next.step.started',
  SESSION_NEXT_STEP_ENDED: 'session.next.step.ended',
  SESSION_NEXT_STEP_FAILED: 'session.next.step.failed',
  SESSION_NEXT_TEXT_DELTA: 'session.next.text.delta',
  SESSION_NEXT_TEXT_ENDED: 'session.next.text.ended',
  SESSION_NEXT_REASONING_DELTA: 'session.next.reasoning.delta',
  SESSION_NEXT_REASONING_ENDED: 'session.next.reasoning.ended',
  SESSION_NEXT_TOOL_CALLED: 'session.next.tool.called',
  SESSION_NEXT_TOOL_SUCCESS: 'session.next.tool.success',
  SESSION_NEXT_TOOL_FAILED: 'session.next.tool.failed',
  SESSION_NEXT_TOOL_INPUT_DELTA: 'session.next.tool.input.delta',
  SESSION_NEXT_TOOL_INPUT_STARTED: 'session.next.tool.input.started',
  SESSION_NEXT_TOOL_INPUT_ENDED: 'session.next.tool.input.ended',
  SESSION_NEXT_TOOL_PROGRESS: 'session.next.tool.progress',

  // ── the message / part lifecycle ──
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_REMOVED: 'message.removed',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  MESSAGE_PART_DELTA: 'message.part.delta',
  MESSAGE_PART_REMOVED: 'message.part.removed',

  // ── the todo / task-tracker surface ──
  TODO_UPDATED: 'todo.updated',
} as const;

/**
 * THE INTERNAL + HYPOTHESIS EVENT TYPES — the SPEC-3 slop-class feeds that are NOT runtime
 * events on this SDK runtime. THE HYPOTHESIS FLAG is the probe's honest record (§16.1): these
 * are the SPEC's assumed types, confirmed only when the E-PB5 container probe drives them
 * through the substrate. A HYPOTHESIS filter is written but its MATCH is the container's job.
 */
export const EVENT_REGISTRY = {
  /** THE MEASURED runtime vocabulary — the confirmed set. */
  runtime: RUNTIME_EVENT_TYPES,
  /**
   * THE AUDIT-DONE marker — the audit's OWN event-writing (the shared.db events row), NOT a
   * runtime event. THE OVER_AUDIT class feed. CONFIRMED as the audit's internal event.
   */
  AUDIT_DONE: 'AUDIT_DONE' as const,
  /**
   * THE LOOP-PLAN marker — the god loop's DECIDE/PLAN phase event (the state.json writes).
   * NOT a runtime event — the loop writes it. THE DESTRUCTIVE_PLAN class feed.
   */
  LOOP_PLAN: 'loop.plan' as const,
  /**
   * THE GOLDEN-STATE marker — the audit's D17 calibration run event. NOT a runtime event.
   * THE CALIB_STALE class feed.
   */
  AUDIT_GOLDEN_STATE: 'audit.golden-state' as const,
  /**
   * THE HOOK-REGISTRATION marker — a plugin hook registration event. NOT a runtime event on
   * this SDK (the plugin registers hooks via the returned `Hooks` object, not an event).
   * THE TEA_NOT_TEB class feed.
   */
  HOOK_REGISTRATION: 'hook.registration' as const,
  /**
   * THE HYPOTHESIS TYPES — the SPEC's assumed event types NOT present in this SDK's runtime
   * `Event` union. Each is FLAGGGED (the LIVING-DOC clause, §16.1): the E-PB5 container probe
   * confirms or removes it. THE FILTERS may reference them; the substrate IGNORES a type
   * neither in the registry nor observed — the registry-gap is logged, never a crash.
   */
  hypotheses: {
    /** `tool.call.*` — the SPEC's FAKE_RETURN feed. NOT emitted by this SDK runtime (it emits
     *  `session.next.tool.*` + the tool.execute hooks instead). FLAGGED: the E-PB5 probe. */
    TOOL_CALL: 'tool.call.' as const,
  },
} as const;

/** THE SLOP-CLASS → SOURCE-TYPE BINDING (SPEC-3 Appendix C lines 1500-1510 — the DETECTION layer). */
export const SLOP_TYPE_BINDING = {
  CLAIM_SLOP: [
    RUNTIME_EVENT_TYPES.MESSAGE_UPDATED,
    RUNTIME_EVENT_TYPES.MESSAGE_PART_DELTA,
    RUNTIME_EVENT_TYPES.MESSAGE_PART_UPDATED,
  ],
  OVER_AUDIT: [EVENT_REGISTRY.AUDIT_DONE],
  DESTRUCTIVE_PLAN: [EVENT_REGISTRY.LOOP_PLAN],
  FAKE_RETURN: [EVENT_REGISTRY.hypotheses.TOOL_CALL],
  CALIB_STALE: [EVENT_REGISTRY.AUDIT_GOLDEN_STATE],
  TEA_NOT_TEB: [EVENT_REGISTRY.HOOK_REGISTRATION],
} as const;

/**
 * THE REGISTERED-TYPE SET — the single data source the membership check reads. The registry is
 * DATA (SPEC-3 §16.2 — the single source the filters import from), so membership is a Set.lookup
 * over the declared constants — a data query, NEVER a decision-branch tower. The set is built
 * once at module load from the registry constants; a NEW registry type is ADDED to the constants
 * + this set grows with it (the LIVING-DOC law).
 */
const REGISTERED_TYPES: ReadonlySet<string> = new Set([
  ...Object.values(RUNTIME_EVENT_TYPES),
  EVENT_REGISTRY.AUDIT_DONE,
  EVENT_REGISTRY.LOOP_PLAN,
  EVENT_REGISTRY.AUDIT_GOLDEN_STATE,
  EVENT_REGISTRY.HOOK_REGISTRATION,
]);

/** THE REGISTRY-GAP CHECK — is a type registered (in the runtime OR the internal set)? */
export function isRegisteredEventType(type: string): boolean {
  return typeof type === 'string' && type.length > 0 && REGISTERED_TYPES.has(type);
}

/** THE REGISTRY-GAP — a type observed but NOT in the registry (the LIVING-DOC trigger). */
export function checkRegistryType(type: string): { registered: boolean; hypothesis: boolean } {
  if (!type) return { registered: false, hypothesis: false };
  if (isRegisteredEventType(type)) return { registered: true, hypothesis: false };
  return { registered: false, hypothesis: true };
}

/**
 * THE CALIBRATION-THRESHOLD REGISTERS (SPEC-3 §9.7 — the named values as DATA, never a
 * magic-literal ladder in the classifier body). BECAUSE each threshold carries its justification.
 */
export const REGISTERS = {
  /** THE OVER_AUDIT bar (findings > files × OVER_AUDIT_RATIO). 3.0 BECAUSE a healthy 70K-LOC
   *  audit is ≤ 50 real findings ≈ 1.4/file; × 3 is a generous ceiling that still catches the
   *  2,614/247 = 10.6 FP-flood ratio while never flagging a genuinely dense audit. */
  OVER_AUDIT_RATIO: 3.0,
  /** THE CLAIM-REFractory (ms) — the sentinel's ONE-barrage-per-episode window. */
  CLAIM_REFRACTORY_MS: 5 * 60 * 1000,
  /** THE CLAIM threshold — 3 un-evidenced claims / window before the ONE demand. */
  CLAIM_THRESHOLD: 3,
  /** THE OVER-AUDIT threshold — 2 over-fires / window = a calibration crisis. */
  OVER_AUDIT_THRESHOLD: 2,
  /** THE CALIB-STALE threshold — 2 false-fires / window = the matcher is systematically broken. */
  CALIB_STALE_THRESHOLD: 2,
  /** THE DESTRUCTIVE-PLAN threshold (SPEC-3 §2.7) — ONE contradiction IS the episode: a plan that
   *  contradicts the working architecture never boards, so a single signal fires the demand. */
  DESTRUCTIVE_PLAN_THRESHOLD: 1,
  /** THE TEA-NOT-TEB threshold (SPEC-3 §2.7) — ONE non-before enforcement registration IS the
   *  episode: it cannot block (tea, not teb), so a single registration fires the demand. */
  TEA_NOT_TEB_THRESHOLD: 1,
} as const;
