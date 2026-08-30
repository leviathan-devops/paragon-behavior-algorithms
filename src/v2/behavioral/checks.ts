import * as fs from 'node:fs';
import type { WeightedViolation, ViolationFamily } from '../contracts.js';
export interface BehavioralState {
  claims: number;
  results: number;
  claimedPaths: string[];
  narrationTurns: number;
  toolCalls: number;
  completionClaims: number;
  verificationCalls: number;
  seq: number;
  sessionID: string;
}
export interface BehavioralSignal extends WeightedViolation {}
function makeViolation(memberId: string, family: ViolationFamily, weight: number, excerpt: string, st: BehavioralState): WeightedViolation {
  return { memberId, family, weight, excerpt: excerpt.slice(0, 200), anchor: { seq: st.seq, ts: Date.now(), sessionID: st.sessionID }, plane: 'reasoning' };
}
export function checkClaimEvidenceGap(st: BehavioralState): WeightedViolation | null {
  if (st.claims <= 3) return null;
  if (st.results <= 0) {
    const ratio = st.claims;
    return makeViolation('BEHAVIORAL.claim-evidence-gap', 'THEATRICAL_PLANNING', Math.min(2.0, ratio - 1), `claim-evidence-gap claims=${st.claims} results=${st.results} ratio=${ratio.toFixed(2)}`, st);
  }
  const ratio = st.claims / st.results;
  if (ratio <= 2.0) return null;
  return makeViolation('BEHAVIORAL.claim-evidence-gap', 'THEATRICAL_PLANNING', Math.min(2.0, ratio - 1), `claim-evidence-gap claims=${st.claims} results=${st.results} ratio=${ratio.toFixed(2)}`, st);
}
export function checkFileGhosting(st: BehavioralState): WeightedViolation | null {
  if (!st.claimedPaths || st.claimedPaths.length === 0) return null;
  for (const p of st.claimedPaths) {
    try {
      if (!fs.existsSync(p)) return makeViolation('BEHAVIORAL.file-ghosting', 'FORGERY_INTENT', 1.5, `file-ghosting missing=${p}`, st);
    } catch (err) {
      return makeViolation('BEHAVIORAL.file-ghosting', 'FORGERY_INTENT', 1.5, `file-ghosting missing=${p} err=${String((err as Error)?.message ?? err)}`, st);
    }
  }
  return null;
}
export function checkToolCallAnomaly(st: BehavioralState): WeightedViolation | null {
  if (st.narrationTurns > 4 && st.toolCalls === 0) return makeViolation('BEHAVIORAL.tool-call-anomaly', 'TEST_EVASION', 1.5, `tool-call-anomaly narration=${st.narrationTurns} toolCalls=${st.toolCalls}`, st);
  return null;
}
export function checkCompletionWithoutVerification(st: BehavioralState): WeightedViolation | null {
  if (st.completionClaims > 0 && st.verificationCalls === 0) return makeViolation('BEHAVIORAL.completion-without-verification', 'TEST_EVASION', 2.0, `completion-without-verification completions=${st.completionClaims} verifications=${st.verificationCalls}`, st);
  return null;
}
export function runBehavioralChecks(st: BehavioralState): WeightedViolation[] {
  const out: WeightedViolation[] = [];
  try { const v = checkClaimEvidenceGap(st); if (v) out.push(v); } catch (err) { console.error('[behavioral] gap failed', String((err as Error)?.message ?? err)); }
  try { const v = checkFileGhosting(st); if (v) out.push(v); } catch (err) { console.error('[behavioral] ghosting failed', String((err as Error)?.message ?? err)); }
  try { const v = checkToolCallAnomaly(st); if (v) out.push(v); } catch (err) { console.error('[behavioral] anomaly failed', String((err as Error)?.message ?? err)); }
  try { const v = checkCompletionWithoutVerification(st); if (v) out.push(v); } catch (err) { console.error('[behavioral] completion failed', String((err as Error)?.message ?? err)); }
  return out;
}
export function runBehavioralChecksIntoSynapse(st: BehavioralState, synapse?: { accumulate(w: WeightedViolation, atSeq: number): void }): WeightedViolation[] {
  const violations = runBehavioralChecks(st);
  if (synapse) {
    for (const v of violations) {
      try { synapse.accumulate(v, st.seq); } catch (err) { console.error('[behavioral] synapse accumulate failed', String((err as Error)?.message ?? err)); }
    }
  }
  return violations;
}
// ══ GAP-2 WIRING — THE SESSION TRACKER (the behavioral state's data source) ══
// The pipeline (event-router.processBatch + the tool-cadence fan-out) FEEDS this
// tracker; getBehavioralSignals EVALUATES it via runBehavioralChecks. The regexes
// below are DETECTORS only (the ISE law): they count claim/completion/path shapes
// in narration text — the check functions above own every DECISION.
interface TrackerEntry {
  claims: number;
  results: number;
  claimedPaths: string[];
  narrationTurns: number;
  toolCalls: number;
  completionClaims: number;
  verificationCalls: number;
  lastSeq: number;
}
const TRACKER_CAP = 256; // session hygiene: oldest-evicted Map, never unbounded
const PATHS_CAP = 20;
const trackers = new Map<string, TrackerEntry>();
function trackerFor(sessionID: string): TrackerEntry {
  let entry = trackers.get(sessionID);
  if (!entry) {
    if (trackers.size >= TRACKER_CAP) {
      const oldest = trackers.keys().next().value;
      if (typeof oldest === 'string') trackers.delete(oldest);
    }
    entry = { claims: 0, results: 0, claimedPaths: [], narrationTurns: 0, toolCalls: 0, completionClaims: 0, verificationCalls: 0, lastSeq: 0 };
    trackers.set(sessionID, entry);
  }
  return entry;
}
// DETECTOR: narration claim shapes (fixed/implemented/done/works/…) — counting only.
const CLAIM_PHRASE_RE = /\b(fixed|implemented|completed|all tests? pass(?:ing|ed)?|works now|should work|done|shipped|delivered|ready)\b/gi;
// DETECTOR: completion-claim shapes (the completion-without-verification numerator).
const COMPLETION_PHRASE_RE = /\b(complete[ds]?|finished|done|shipped|delivered)\b/gi;
// DETECTOR: claimed file writes — "written/created/updated/saved/wrote <path>" — path capture only.
const CLAIMED_PATH_RE = /(?:writ(?:e|ten)|creat(?:e|ed)|updat(?:e|ed)|sav(?:e|ed)|wrote)\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,5})/gi;
// DETECTOR: verification-tool invocation shape inside a bash command (mirrors
// tool-cadence-plane's TEST_TOOL_PATTERN — the same lexicon, single source there;
// duplicated here ONLY because the tracker must not import the capture plane).
const VERIFY_COMMAND_RE = /\bbun test\b|\bnpx vitest\b|\bnpx tsc\b|\btsc\b|\bbun run build\b/;

/** Feed one reasoning/text batch into the session's behavioral counters. */
export function recordBehavioralText(sessionID: string, text: string, seq: number): void {
  if (typeof sessionID !== 'string' || sessionID === '' || typeof text !== 'string' || text === '') return;
  const entry = trackerFor(sessionID);
  entry.narrationTurns += 1;
  entry.lastSeq = seq;
  const claims = text.match(CLAIM_PHRASE_RE);
  if (claims) entry.claims += claims.length;
  const completions = text.match(COMPLETION_PHRASE_RE);
  if (completions) entry.completionClaims += completions.length;
  if (entry.claimedPaths.length < PATHS_CAP) {
    for (const m of text.matchAll(CLAIMED_PATH_RE)) {
      if (typeof m[1] === 'string' && m[1] !== '' && !entry.claimedPaths.includes(m[1])) entry.claimedPaths.push(m[1]);
      if (entry.claimedPaths.length >= PATHS_CAP) break;
    }
  }
}

/** Feed one completed tool observation (the message.part.updated tool part). */
export function recordBehavioralTool(sessionID: string, tool: string, commandText?: string): void {
  if (typeof sessionID !== 'string' || sessionID === '' || typeof tool !== 'string' || tool === '') return;
  const entry = trackerFor(sessionID);
  entry.toolCalls += 1;
  entry.results += 1; // a completed tool part IS one observed result
  if (tool === 'bash' && typeof commandText === 'string' && VERIFY_COMMAND_RE.test(commandText)) entry.verificationCalls += 1;
}

/** Direct probe — the battery asserts counter accrual through this. */
export function behavioralTrackerSnapshot(sessionID: string): Readonly<TrackerEntry> | undefined {
  const entry = trackers.get(sessionID);
  return entry ? { ...entry, claimedPaths: [...entry.claimedPaths] } : undefined;
}

/** Tracker reset — session-scoped (no arg clears all: the battery's isolation hatch). */
export function resetBehavioralTracker(sessionID?: string): void {
  if (sessionID === undefined) trackers.clear();
  else trackers.delete(sessionID);
}

/**
 * THE ENTRY POINT (GAP-2 — was the orphaned `return []` stub): evaluates the
 * session tracker through runBehavioralChecks and returns the fired violations.
 * Backwards-compatible arg shape: (signals) still works — the session falls back
 * to the first signal's anchor.sessionID, then 'default'.
 */
export function getBehavioralSignals(signals: ReadonlyArray<WeightedViolation>, sessionID?: string, seq?: number): BehavioralSignal[] {
  const sid = sessionID ?? signals[0]?.anchor?.sessionID ?? 'default';
  const entry = trackers.get(sid);
  if (!entry) return [];
  const st: BehavioralState = {
    claims: entry.claims,
    results: entry.results,
    claimedPaths: entry.claimedPaths,
    narrationTurns: entry.narrationTurns,
    toolCalls: entry.toolCalls,
    completionClaims: entry.completionClaims,
    verificationCalls: entry.verificationCalls,
    seq: seq ?? entry.lastSeq,
    sessionID: sid,
  };
  return runBehavioralChecks(st);
}
