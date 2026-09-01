// PoseidonIntentEngine — the LASME-style poseidon intent classifier
//
// v4.4.4 — THE LASME OVERHAUL (the operator's "this is retarded" ruling):
// the OLD poseidon-detector was a regex-slop tower: flat regex lists decided
// the state, ANY 'poseidon' + an OFF-signal word ('stop' in "trident-poseidon
// action=loop ... continue the drive") flipped the mode OFF. THE LASME FIX:
// the Lexicon (PatternFamily members) is the DETECTION layer, the STATE MACHINE
// is the DECISION layer, the MPSE triplets are the EVIDENCE — a regex NEVER
// decides alone. The fail-state is INCONCLUSIVE (no state change), never a guess.
//
// THE CORE FIX (the operator's complaint):
//   The classifier distinguishes a USER COMMAND ("deactivate poseidon",
//   "stop the loop") from a SYSTEM/TOOL REFERENCE ("trident-poseidon
//   action=loop", "the God Loop", "the drive continues"). A tool-reference
//   is NEVER a deactivation. The PARSED stage strips the tool/command
//   references before the signal scoring.
//
// THE SESSION-AWARENESS: only a USER message (the primary session, the
// non-leaf agent) can flip the shared 'default' key. A subagent's echo
// never touches the primary's mode.

export interface PoseidonIntentResult {
  detected: boolean;
  action: 'activate' | 'deactivate' | null;
  confidence: number;
  intent: 'GOD_LOOP' | 'PERMISSIONS' | 'NONE';
  evidence: Array<{ pattern: string; state: string; evidence: string }>;
}

// ── THE LEXICON (the PatternFamily — the DETECTION layer) ──────────────
// THE ISE LAW: the regex is a mechanical DETECTOR ONLY (the detection layer,
// never the decision layer). The matchers are Order-2 structural matchers —
// they parse the message's SENTENCE STRUCTURE (the subject/verb/frame), not
// bare word presence. The state machine decides; the regex flags candidates.

export interface IntentLexiconMember {
  id: string;
  kind: 'intent' | 'guard';
  /** The Order-2 structural matcher — parses the sentence structure. */
  matcher: RegExp;
  /** The structural parse it performs (WHY the regex is the detector). */
  structure: string;
  triggerCondition: string;
  severity: 'INFO' | 'WARN';
  messageTemplate: string;
  polarity: 'ON' | 'OFF' | 'NEUTRAL';
}

export const POSEIDON_INTENT_LEXICON: IntentLexiconMember[] = [
  // ── THE USER-COMMAND DETECTORS (the ONLY things that flip the mode) ──
  {
    id: 'PI-CMD-ACTIVATE',
    kind: 'intent',
    // The structural parse: a USER COMMAND verb frame — the verb is the
    // sentence's imperative subject ("activate poseidon", "please enable the
    // poseidon mode"). The regex is the DETECTOR of the verb frame; the
    // state machine decides.
    matcher: /\b(?:please\s+)?(?:poseidon\s+(?:mode\s+)?)?(?:activate|enable|engage|unlock|start|begin|launch|awaken|summon|ignite|power\s+up|arm)\b(?:\s+(?:poseidon|the\s+poseidon|mode|it|the\s+mode))?/i,
    structure: 'the imperative verb-frame parse — the activation command verb',
    triggerCondition: 'a USER message with an explicit activation command verb',
    severity: 'INFO',
    messageTemplate: 'Poseidon Mode ACTIVATED by the user command',
    polarity: 'ON',
  },
  {
    id: 'PI-CMD-DEACTIVATE',
    kind: 'intent',
    // The structural parse: the DEACTIVATION verb frame — the command verb.
    matcher: /\b(?:please\s+)?(?:poseidon\s+(?:mode\s+)?)?(?:deactivate|disable|disengage|revoke|lock|terminate|abort|halt|suspend|cancel|shut\s*down|exit|quit|kill|sleep)\b(?:\s+(?:poseidon|the\s+poseidon|mode|it|the\s+mode|the\s+loop))?/i,
    structure: 'the imperative verb-frame parse — the deactivation command verb',
    triggerCondition: 'a USER message with an explicit deactivation command verb',
    severity: 'INFO',
    messageTemplate: 'Poseidon Mode DEACTIVATED by the user command',
    polarity: 'OFF',
  },
  {
    id: 'PI-TURN-ON',
    kind: 'intent',
    // The structural parse: the turn-X-on phrasal frame.
    matcher: /\b(?:turn|switch|put|set)\s+(?:poseidon|it|the\s+mode|the\s+loop)\s+on\b/i,
    structure: 'the phrasal-verb parse — the turn-X-on frame',
    triggerCondition: 'the turn-X-on frame',
    severity: 'INFO',
    messageTemplate: 'Poseidon Mode ACTIVATED by the turn-on frame',
    polarity: 'ON',
  },
  {
    id: 'PI-TURN-OFF',
    kind: 'intent',
    // The structural parse: the turn-X-off phrasal frame.
    matcher: /\b(?:turn|switch|put|set)\s+(?:poseidon|it|the\s+mode|the\s+loop)\s+off\b/i,
    structure: 'the phrasal-verb parse — the turn-X-off frame',
    triggerCondition: 'the turn-X-off frame',
    severity: 'INFO',
    messageTemplate: 'Poseidon Mode DEACTIVATED by the turn-off frame',
    polarity: 'OFF',
  },
  {
    id: 'PI-NEGATION-GUARD',
    kind: 'guard',
    // The structural parse: the negated-command frame — "don't activate".
    matcher: /\b(?:don'?t|do\s+not|never)\s+(?:activate|enable|start|engage|unlock|turn\s+on)\b/i,
    structure: 'the negation parse — the negated activation command',
    triggerCondition: 'an explicit don\'t-activate negation',
    severity: 'WARN',
    messageTemplate: 'the activation is negated — no state change',
    polarity: 'NEUTRAL',
  },
  // ── THE GOD-LOOP INTENT DETECTORS ──────────────────────────────────
  {
    id: 'PI-GOD-LOOP-FRAME',
    kind: 'intent',
    // The structural parse: the god-loop/build/drive mention frames.
    matcher: /\b(?:god[\s-]*loop|autonomous\s+build|(?:start|run|begin|drive)\s+(?:the\s+)?loop|loop\s+(?:start|run|begin)|poseidon\s+(?:loop|build|drive|orchestrat|god))\b/i,
    structure: 'the god-loop frame parse — the autonomous build orchestration mention',
    triggerCondition: 'an explicit god-loop/build/drive mention',
    severity: 'INFO',
    messageTemplate: 'GOD_LOOP intent — the autonomous build orchestration',
    polarity: 'ON',
  },
  {
    id: 'PI-PERMISSIONS-FRAME',
    kind: 'intent',
    // The structural parse: the permissions frame — "poseidon mode activate".
    matcher: /\b(?:poseidon\s+(?:mode\s+)?activate|activate\s+(?:the\s+)?poseidon|poseidon\s+(?:unlock|permissions|tools?)|(?:unlock|enable)\s+poseidon)\b/i,
    structure: 'the permissions frame parse — the tools-unlock mention',
    triggerCondition: 'an explicit permissions-frame',
    severity: 'INFO',
    messageTemplate: 'PERMISSIONS intent — tools unlocked for direct work',
    polarity: 'ON',
  },
];

// ── THE STATE MACHINE (the DECISION layer) ────────────────────────────
//   IDLE → PARSED (the tool/command references stripped)
//        → ANALYZED (the lexicon matched, the signals scored)
//        → CLASSIFIED (ACTIVATE | DEACTIVATE | NONE)
//        → EVIDENCED (the matched members + the MPSE triplets)
//        → EMITTED (the action + the confidence)
//   fail-state: INCONCLUSIVE (ambiguous → no state change)

type IntentMachineState =
  | 'IDLE' | 'PARSED' | 'ANALYZED' | 'CLASSIFIED' | 'EVIDENCED' | 'EMITTED'
  | 'INCONCLUSIVE';

// THE TOOL-REFERENCE STRIPPER (the core fix): removes the tool/command
// references that contain 'poseidon' + OFF-signals but are NOT user commands.
const TOOL_REFERENCE_PATTERNS: RegExp[] = [
  /\btrident-poseidon\b[^.!?;,\n]{0,60}/gi,      // 'trident-poseidon action=loop ...'
  /\bposeidon\s+state\b[^.!?;,\n]{0,60}/gi,       // 'the poseidon state machine ...'
  /\bposeidon\s+mode\s+(?:remains|is|stays)\b[^.!?;,\n]{0,60}/gi, // 'Poseidon Mode remains ACTIVE'
  /\bposeidon\s+drive\b[^.!?;,\n]{0,60}/gi,       // 'the poseidon drive ...'
];

function stripToolReferences(message: string): string {
  let stripped = message;
  for (const p of TOOL_REFERENCE_PATTERNS) {
    stripped = stripped.replace(p, ' ');
  }
  return stripped;
}

export class PoseidonIntentEngine {
  private state: IntentMachineState = 'IDLE';
  private matchedMembers: IntentLexiconMember[] = [];
  private evidence: Array<{ pattern: string; state: string; evidence: string }> = [];

  /** The ISE-mandated classifier: the lexicon detects, the machine decides. */
  classify(message: string): PoseidonIntentResult {
    // ── IDLE → PARSED ──
    this.state = 'PARSED';
    if (!message || typeof message !== 'string') {
      return this.emitInconclusive('EMPTY_MESSAGE');
    }
    if (!/\bposeidon\b/i.test(message) && !/\bgod[\s-]*loop\b/i.test(message)) {
      return this.emitInconclusive('NO_POSEIDON_MENTION');
    }
    const stripped = stripToolReferences(message);
    const isToolRefOnly = stripped.trim().length === 0 || !/\b(poseidon|god[\s-]*loop)\b/i.test(stripped);
    if (isToolRefOnly) {
      // The message was ONLY a tool/command reference (the drive instructions,
      // the kick's echo) — NEVER a user command. No state change.
      return this.emitInconclusive('TOOL_REFERENCE_ONLY');
    }

    // ── PARSED → ANALYZED ──
    this.state = 'ANALYZED';
    this.matchedMembers = [];
    this.evidence = [];
    let onScore = 0;
    let offScore = 0;
    for (const member of POSEIDON_INTENT_LEXICON) {
      if (member.matcher.test(stripped)) {
        this.matchedMembers.push(member);
        this.evidence.push({
          pattern: member.id,
          state: 'ANALYZED',
          evidence: 'matched: ' + member.messageTemplate,
        });
        if (member.polarity === 'ON') onScore += 2;
        if (member.polarity === 'OFF') offScore += 2;
      }
    }

    // ── ANALYZED → CLASSIFIED ──
    this.state = 'CLASSIFIED';
    // The negation guard wins — an explicit don't-activate is never an activation
    const negated = this.matchedMembers.some((m) => m.id === 'PI-NEGATION-GUARD');
    if (negated && onScore > 0) {
      return this.emitInconclusive('NEGATED_ACTIVATION');
    }
    if (onScore === 0 && offScore === 0) {
      return this.emitInconclusive('NO_SIGNAL');
    }
    if (onScore > offScore) {
      return this.emitClassified('activate', onScore, stripped);
    }
    if (offScore > onScore) {
      return this.emitClassified('deactivate', offScore, stripped);
    }
    return this.emitInconclusive('SIGNAL_TIE');
  }

  private emitClassified(action: 'activate' | 'deactivate', score: number, message: string): PoseidonIntentResult {
    // ── CLASSIFIED → EVIDENCED → EMITTED ──
    this.state = 'EMITTED';
    // The intent classification rides the same lexicon
    let intent: 'GOD_LOOP' | 'PERMISSIONS' | 'NONE' = 'NONE';
    if (this.matchedMembers.some((m) => m.id === 'PI-GOD-LOOP-FRAME')) intent = 'GOD_LOOP';
    else if (this.matchedMembers.some((m) => m.id === 'PI-PERMISSIONS-FRAME')) intent = 'PERMISSIONS';
    const confidence = score / (score + 1);
    return {
      detected: true,
      action,
      confidence,
      intent,
      evidence: this.evidence,
    };
  }

  private emitInconclusive(reason: string): PoseidonIntentResult {
    // The fail-state — INCONCLUSIVE is NEVER a state change
    this.state = 'INCONCLUSIVE';
    return {
      detected: false,
      action: null,
      confidence: 0,
      intent: 'NONE',
      evidence: [{ pattern: 'PI-INCONCLUSIVE', state: 'INCONCLUSIVE', evidence: reason }],
    };
  }

  getState(): IntentMachineState { return this.state; }
}

// THE SINGLETON
export const poseidonIntentEngine = new PoseidonIntentEngine();

// ── THE BACKWARD-COMPAT WRAPPER (the chat hook's existing call) ────────
// The old PoseidonDetector.detect returned { detected, action, confidence }.
// The wrapper maps the new engine's result + the intent.
export class PoseidonDetector {
  detect(message: string): { detected: boolean; action: 'activate' | 'deactivate' | null; confidence: number } {
    const r = poseidonIntentEngine.classify(message);
    return { detected: r.detected, action: r.action, confidence: r.confidence };
  }
}

export const poseidonDetector = new PoseidonDetector();

// ── THE INTENT CLASSIFIER (the wrapper for the chat hook's intent) ────
export function classifyActivationIntent(message: string): 'GOD_LOOP' | 'PERMISSIONS' | 'NONE' {
  const r = poseidonIntentEngine.classify(message);
  return r.intent;
}
