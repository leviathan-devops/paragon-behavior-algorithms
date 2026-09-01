// PoseidonDetector — Semantic activation/deactivation detection for Poseidon Mode
//
// v4.4.3 rewrite — CLEAR intent reading, no lag, no stupidity:
// - Word-boundary signals (no substring matches: 'on' in "button", 'off' in "offer")
// - Negation checked FIRST ("don't activate", "stop poseidon" → OFF)
// - Generic on/off only valid adjacent to "poseidon" ("poseidon on", "turn poseidon off")
// - Regex-only, synchronous, zero LLM calls — no lag
// - State changes ONLY from user chat messages (auto-deactivation removed)

export interface PoseidonResult {
  detected: boolean;
  action: 'activate' | 'deactivate' | null;
  confidence: number;
}

// Strong ON verbs — word-boundary matched, unambiguous
var ON_SIGNALS: RegExp[] = [
  /\bactivat(e|ion|ing|es|ed)\b/i,
  /\benable[ds]?\b/i,
  /\bengage[ds]?\b/i,
  /\bunlock(ed|ing)?\b/i,
  /\bstart(s|ed|ing)?\b/i,
  /\bbegin(s|ning)?\b/i,
  /\blaunch(ed|ing)?\b/i,
  /\bignite[ds]?\b/i,
  /\bawaken(s|ed|ing)?\b/i,
  /\bsummon(ed|ing|s)?\b/i,
  /\bpower\s+up\b/i,
  /\barm(ed|ing)?\b/i,
];

// Strong OFF verbs — word-boundary matched, unambiguous
var OFF_SIGNALS: RegExp[] = [
  /\bdeactivat(e|ion|ing|es|ed)\b/i,
  /\bdisable[ds]?\b/i,
  /\bdisengage[ds]?\b/i,
  /\brevoke[ds]?\b/i,
  /\block(ed|ing)?\b/i,
  /\bstop(s|ped|ping)?\b/i,
  /\bterminat(e|ion|ing|es|ed)\b/i,
  /\babort(ed|ing|s)?\b/i,
  /\bhalt(ed|ing|s)?\b/i,
  /\bsuspend(ed|ing|s)?\b/i,
  /\bcancel(led|ing|s)?\b/i,
  /\bshut(ting|s)?\s*(down)?\b/i,
  /\bexit(s|ed|ing)?\b/i,
  /\bquit(s|ting)?\b/i,
  /\bsleep(s|ing)?\b/i,
  /\bkill(ed|ing|s)?\b/i,
];

// Generic on/off — ONLY valid when adjacent to "poseidon"
var POSEIDON_ON_FRAME = /\bposeidon\b[^.!?;,\n]{0,20}\bon\b|\bon\b[^.!?;,\n]{0,20}\bposeidon\b/i;
var POSEIDON_OFF_FRAME = /\bposeidon\b[^.!?;,\n]{0,20}\boff\b|\boff\b[^.!?;,\n]{0,20}\bposeidon\b/i;

// Negation — checked FIRST, always wins
var NEGATION_PATTERNS: RegExp[] = [
  // THE 2026-08-10 FIX: the bare "no poseidon" / "not poseidon" patterns are
  // REMOVED — "no poseidon tool" (a command about NOT using the tool) matched
  // /\bno\s+poseidon/i and DEACTIVATED the mode, eating the operator's
  // "Poseidon mode activate ... no poseidon tool" message (the state file
  // proved activate→deactivate 7.6s later). A bare negation of the WORD is
  // not an explicit mode command. ONLY explicit deactivation verbs/frames
  // deactivate: "deactivate/stop/disable poseidon", "turn poseidon off",
  // "don't activate poseidon".
  /\bdon'?t\s+(activate|enable|start|engage|unlock|turn\s+on)/i,
  /\b(do\s+not|never)\s+(activate|enable|start|engage|unlock)/i,
  /\bstop\s+poseidon/i,
  /\bdeactivat(e|ion|ing|es|ed)\s+poseidon/i,
];

export class PoseidonDetector {
  detect(message: string): PoseidonResult {
    if (!message || typeof message !== 'string') {
      return { detected: false, action: null, confidence: 0 };
    }

    // Direct god-loop trigger — "god loop" anywhere = activation
    // UNLESS negation word nearby (abort, stop, cancel, deactivate, end, exit)
    if (/\bgod[\s-]*loop/i.test(message) && !/\b(abort|stop|cancel|deactivate|end|exit|kill|halt|close|shut)\b/i.test(message)) {
      return { detected: true, action: 'activate', confidence: 0.95 };
    }

    // Gate: "poseidon" must be mentioned as a word
    if (!/\bposeidon\b/i.test(message)) {
      return { detected: false, action: null, confidence: 0 };
    }

    // Priority 1: Negation — always OFF
    for (var n = 0; n < NEGATION_PATTERNS.length; n++) {
      if (NEGATION_PATTERNS[n].test(message)) {
        return { detected: true, action: 'deactivate', confidence: 0.9 };
      }
    }

    // Priority 2: Score word-boundary signals — THE PROXIMITY GATE (HT-BUG-3a,
    // the 2026-08-23 host test): a bare verb ANYWHERE in diagnostic prose ("the
    // abort handler never writes", "bash is blocked") must NEVER flip the mode.
    // A signal counts only when its match sits within SIGNAL_PROXIMITY chars of
    // a \bposeidon\b mention — the verb has to be TALKING ABOUT the mode.
    var SIGNAL_PROXIMITY = 60;
    var poseidonAt = message.search(/\bposeidon\b/i);
    var onScore = 0;
    var offScore = 0;
    for (var i = 0; i < ON_SIGNALS.length; i++) {
      var onM = ON_SIGNALS[i].exec(message);
      if (onM && Math.abs((onM.index || 0) - poseidonAt) <= SIGNAL_PROXIMITY) onScore++;
    }
    for (var j = 0; j < OFF_SIGNALS.length; j++) {
      var offM = OFF_SIGNALS[j].exec(message);
      if (offM && Math.abs((offM.index || 0) - poseidonAt) <= SIGNAL_PROXIMITY) offScore++;
    }

    // Priority 3: Poseidon-adjacent on/off frames
    if (POSEIDON_ON_FRAME.test(message)) onScore += 2;
    if (POSEIDON_OFF_FRAME.test(message)) offScore += 2;

    // Decision
    if (onScore > offScore) {
      return { detected: true, action: 'activate', confidence: onScore / (onScore + offScore + 1) };
    }
    if (offScore > onScore) {
      return { detected: true, action: 'deactivate', confidence: offScore / (onScore + offScore + 1) };
    }
    // Tie or no signals — no state change. Never guess.
    return { detected: false, action: null, confidence: 0 };
  }
}

// ── ACTIVATION INTENT CLASSIFIER (verb-frame lexicon) ────────────────
// Distinguishes WHY the user activated Poseidon:
//   PERMISSIONS — "poseidon mode activate" = unlock tools for direct work.
//                 Agent must NOT call trident-poseidon action=start.
//   GOD_LOOP    — "start the god loop" = autonomous build orchestration.
//                 Agent SHOULD call trident-poseidon action=start.
//   NONE        — no poseidon activation context.
//
// GOD_LOOP is checked first — an explicit loop mention wins over a bare
// activation phrase in the same message.

export type PoseidonIntent = 'GOD_LOOP' | 'PERMISSIONS' | 'NONE';

var GOD_LOOP_FRAMES: RegExp[] = [
  /\bgod[\s-]*loop/i,
  /\bautonomous\s+build/i,
  /\b(start|run|begin|drive|kick\s*off)\s+(the\s+)?loop/i,
  /\bloop\s+(start|run|begin)/i,
  /\bposeidon\s+(loop|build|drive|orchestrat|god)/i,
  /\b(begin|start|drive)\s+(the\s+)?build\s+(loop|cycle|orchestration)/i,
];

var PERMISSIONS_FRAMES: RegExp[] = [
  /\bposeidon\s+(mode\s+)?activat/i,
  /\bactivat\w*\s+(the\s+)?poseidon/i,
  /\bposeidon\s+mode\b/i,
  /\bposeidon\s+(unlock|permissions|tools?)/i,
  /\b(unlock|enable)\s+poseidon/i,
];

// Continuation signals — presence of a direct task in the same message
// strengthens PERMISSIONS classification (user wants tools, not orchestration).
var CONTINUATION_SIGNALS: RegExp[] = [
  /\btest(ing)?\b/i, /\bfix\b/i, /\bdeploy/i, /\bcontinu/i,
  /\bthis\s+session/i, /\bdirectly\b/i, /\beverything\b/i,
  /\bclean\b/i, /\bverify\b/i, /\baudit\b/i,
];

// ON-signal frames for the continuation check (word-boundary)
var ACTIVATION_ON_FRAMES: RegExp[] = [
  /\bactivat(e|ion|ing|es|ed)\b/i,
  /\benable[ds]?\b/i,
  /\bengage[ds]?\b/i,
  /\bunlock(ed|ing)?\b/i,
  /\bstart(s|ed|ing)?\b/i,
];

export function classifyActivationIntent(message: string): PoseidonIntent {
  if (!message || typeof message !== 'string') return 'NONE';
  if (!/\bposeidon\b/i.test(message)) return 'NONE';

  // Priority 1: explicit God Loop frames
  for (var i = 0; i < GOD_LOOP_FRAMES.length; i++) {
    if (GOD_LOOP_FRAMES[i].test(message)) return 'GOD_LOOP';
  }

  // Priority 2: explicit permissions frames
  for (var j = 0; j < PERMISSIONS_FRAMES.length; j++) {
    if (PERMISSIONS_FRAMES[j].test(message)) return 'PERMISSIONS';
  }

  // Priority 3: "poseidon" + activation signal + continuation context → permissions
  var hasOnSignal = false;
  for (var k = 0; k < ACTIVATION_ON_FRAMES.length; k++) {
    if (ACTIVATION_ON_FRAMES[k].test(message)) { hasOnSignal = true; break; }
  }
  if (hasOnSignal) {
    var hasContinuation = false;
    for (var m = 0; m < CONTINUATION_SIGNALS.length; m++) {
      if (CONTINUATION_SIGNALS[m].test(message)) { hasContinuation = true; break; }
    }
    if (hasContinuation) return 'PERMISSIONS';
  }

  return 'NONE';
}
