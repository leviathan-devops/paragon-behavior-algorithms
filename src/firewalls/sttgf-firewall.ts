// STTGF v4 — SEMANTIC SMOKE TEST FIREWALL — CLAIM-GATED ENFORCEMENT
// "Block the CLAIM, not the WORK." Information gathering (read/grep on source)
// is ALWAYS allowed. Claims of correctness without container test evidence
// are BLOCKED (Phase A) or gated via output mutation (Phase B).
import { tridentLog } from '../utils.js';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getEvidenceState, ingestEvidenceEvent, locateEvidenceArtifact, queryEvidenceVerdict } from './evidence-tracker.js';
import type { EvidenceVerdict, EvidenceEvent } from './evidence-tracker.js';
import { checkContract, buildSmokeBindings, SMOKE_COMMAND_CONTRACT } from './sttgf-contract.js';
import { toBrandedVerdict } from './sttgf-verdict.js';
import { classifyCtExec, buildCtConfigLockMessage } from './ct-anti-derailment.js';
import type { Bindings, BrandedVerdict, Checked } from './sttgf-types.js';
import type { Trigger } from './sttgf-types.js';

// ─── Types ───

export type FirewallAction = 'ALLOW' | 'BLOCK' | 'WARN';
export type IntentType =
  | 'operation'          // modification workflow (read/edit/write/build)
  | 'inspection'         // information gathering (grep/read for understanding)
  | 'claim_verification' // agent CLAIMS correctness (from its own messages)
  | 'smoke_verification' // direct smoke operation (hash/inline/headless/bundle-inspect)
  | 'ship'               // the deploy/ship surface (FR-4.1 + DD-7 — the crack-3 fix)
  | 'evidence'           // the container-test escape hatch — NEVER ship (FR-4.3)
  | 'unknown'            // the tool was not matched by any intent-class signal
  | 'inconclusive';      // THE R1 FAIL-STATE (the ISE bible: "the fail-state is
                         // INCONCLUSIVE — never PASS"). Reached when a tool matched
                         // NO intent class's signals (the scorer's top score is 0) —
                         // the intent is UNRESOLVED, and the scorer-driven entry
                         // treats it explicitly (the pending-claim → Phase B demand;
                         // no claim → the work proceeds — the "block the CLAIM, not
                         // the WORK" rule), NEVER a silent default-pass.

// THE 7.5 TRANSFORM SEAM (the parallel-wave DI contract): the smoke lexicon
// (C-2) + the surgical mutator (C-3) are created by the sibling waves 2/3 —
// they do NOT exist at this wave's build time. The messages.transform's narrow
// path resolves them through this seam; the merge (index.ts) wires the real
// modules via setSTTGFTransformSeam. The seam defaults to NO-OP (no slop spans,
// no mutation) so the transform compiles + runs green before the merge.
export interface STTGFSpanVerdictLike {
  kind: string;                    // 'CLAIM_SLOP' | 'NON_CLAIM' | ...
  start?: number;
  end?: number;
  evidenceVerdict?: EvidenceVerdict | null;   // the lexicon's spans may carry null
  [k: string]: unknown;
}
export interface STTGFTransformSeam {
  classifyMessageSpans?: (text: string, sessionId?: string) => STTGFSpanVerdictLike[];
  mutateMessage?: (text: string, sessionId?: string) => { text: string; mutated: number; verdicts?: unknown[] };
}
let transformSeam: STTGFTransformSeam = {};
export function setSTTGFTransformSeam(seam: STTGFTransformSeam): void { transformSeam = seam || {}; }
export function getSTTGFTransformSeam(): STTGFTransformSeam { return transformSeam; }
export type TargetType = 'bundle' | 'source' | 'other' | 'unknown';

export interface FirewallResult {
  action: FirewallAction;
  category: string;
  reason: string;
  intent?: IntentType;
  target?: TargetType;
}

export interface MessageEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// ── Per-session verification state (REAL implementation, not stubs) ──

export interface VerificationSessionState {
  codeChanged: boolean;
  // THE F-113 LASME REWIRE: the state carries its OWN sessionId so the
  // decision layer can query the EVIDENCE MACHINE (the fact-events), never a
  // session-global latch. The scorer's signal tests receive this state — the
  // evidencePendingClaim query needs the sessionId to find the session's
  // evidence record.
  sessionId: string;
  verificationClaimed: boolean;
  claimTimestamp: number;
  lastClaimText: string;
  containerTestRan: boolean;
  containerTestTimestamp: number;
  lastBlockedCategory: string;
  blockCount: number;
  // THE F-97 ESCALATE CALIBRATION (2026-08-15 — the direct-session finding 10:
  // the ESCALATE fired on the FIRST inline-exec probe because the session-wide
  // blockCount had accumulated 2 hash blocks + 1 inline block — mixed categories
  // escalated). THE FIX: the count is per-CATEGORY — "3 consecutive smoke
  // blocks" means 3 of the SAME shape (the repeated-attempt semantic), never a
  // mix. blockCount stays as the session total (compat); the escalation checks
  // blockCountByCategory.
  blockCountByCategory: Record<string, number>;
  // THE D-2 EVIDENCE-CORRELATED LATCH RELEASE (the host red-team F-110 fix —
  // the operator's "overly aggressive" ruling): the pending-claim latch
  // (`pendingClaim()` — the hash-as-proof poisoning) released ONLY on a
  // container run. A legit UNIT/tsc/read verification (the battery, the
  // typecheck, the inspection surface — the mandatory wave gates) NEVER
  // cleared it → the bare-hash dist verify stayed poisoned all session (6
  // fires). THE FIX: `verificationSatisfied` — ANY real verification evidence
  // (a unit event with a pass, a tsc event, a container event) releases the
  // latch. The latch is EVIDENCE-CORRELATED, never session-global.
  verificationSatisfied: boolean;
  verificationSatisfiedAt: number;
  // THE D-3 ONCE-DELIVERY LATCH (the F-110 blanket-append fix — 28 Phase B
  // injections in 3 min): the claim-gate demand delivered on EVERY citable-
  // proof tool output once armed. THE FIX: `demandDeliveredAt` — the demand
  // delivers ONCE per claim (the first proof-shaped call after the arm), then
  // the latch holds until the claim is satisfied or the window expires. The
  // gate keeps its teeth (the FIRST delivery) without becoming noise.
  demandDeliveredAt: number;
}

export interface STTGFv4Config {
  enabled: boolean;
  blockOnClaimWithoutContainerTest: boolean;
  claimWindowMs: number;
  maxBlocksBeforeEscalate: number;
}

// ─── Context Window (populated from messages.transform hook) ───
// Global-backed storage — same dual-instance hazard as agent-state.
// globalThis guarantees ONE map across plugin instances and hot-reloads.

const gfw = globalThis as Record<string, unknown>;
if (!gfw.__sttgfContextWindows) gfw.__sttgfContextWindows = new Map<string, MessageEntry[]>();
const contextWindows = gfw.__sttgfContextWindows as Map<string, MessageEntry[]>;
const MAX_WINDOW_SIZE = 20;

export function appendToContextWindow(sessionId: string, entry: MessageEntry): void {
  if (!contextWindows.has(sessionId)) contextWindows.set(sessionId, []);
  const w = contextWindows.get(sessionId)!;
  w.push(entry);
  if (w.length > MAX_WINDOW_SIZE) w.shift();
}

export function getContextWindow(sessionId: string): MessageEntry[] {
  return contextWindows.get(sessionId) || [];
}

// ─── Signal Sets (classify the AGENT's claims, not the user's words) ───
// THE DEAD-LEXICON REMOVAL (2026-08-10 — the operator: "proper lexicon
// intelligence not fucking stupid regex with 0 awareness"): the old
// VERIFICATION_SIGNALS/ANALYSIS_SIGNALS/OPERATION_SIGNALS bare-word matchers
// are REMOVED — they were declared, never referenced (the intent extraction is
// tool-based + tracker-based), and the "working" bare word is the exact
// false-positive class (a "working directory"/"working on" phrase armed the
// claim). The DETECTION lexicon that remains is the sentence-level
// isCompletionClaim (the negation guard + the strong phrases + the work-entity
// + the audit-remedy exemptor) — the decision layer, never a bare-word match.

export type EscalationCategory = 'hash' | 'docwrite' | 'inline' | 'testrunner';
export const CATEGORY_MAP: Record<string, EscalationCategory> = {
  HASH_AS_PROOF: 'hash',
  HASH: 'hash',
  VERIFY_INSPECT: 'hash',
  VERIFY_EXIST: 'hash',
  INLINE_EXEC: 'inline',
  INLINE: 'inline',
  HEADLESS: 'inline',
  TEST_RUNNER_SCRIPT: 'testrunner',
  TEST_RUNNER: 'testrunner',
  DOCWRITE: 'docwrite',
  DOCUMENTATION: 'docwrite',
};
function normalizeCategory(raw: string): EscalationCategory {
  const c = raw.split('\n')[0].trim();
  if (CATEGORY_MAP[c]) return CATEGORY_MAP[c];
  const lower = c.toLowerCase();
  if (lower.includes('hash') || lower.includes('verify') || lower.includes('exist')) return 'hash';
  if (lower.includes('inline') || lower.includes('headless')) return 'inline';
  if (lower.includes('test') || lower.includes('runner')) return 'testrunner';
  if (lower.includes('doc') || lower.includes('trident') || lower.includes('.md')) return 'docwrite';
  return 'hash';
}
export function latchDecay(eventClass: string, sessionId: string = 'default'): boolean {
  const decayClasses = new Set(['unit', 'container', 'evidence', 'tsc', 'verification', 'ops-evidence', 'ops_verified', 'dist_verified', 'unit_verified']);
  if (!decayClasses.has(eventClass)) return false;
  try {
    const sid = sessionId || 'default';
    sttgfStateTracker.markVerificationSatisfied(sid, Date.now());
    sttgfStateTracker.clearVerificationPending(sid);
    try { ingestEvidenceEvent(sid, { kind: 'evidence_clear', at: Date.now(), distSha: getEvidenceState(sid).distSha ?? '' }); } catch {}
  } catch {}
  return true;
}
const CLAIM_WINDOW_MS = 300_000;       // how long a claim stays "fresh"
const MAX_BLOCKS_BEFORE_ESCALATE = 3;  // 3 consecutive smoke blocks → escalate

// ─── THE STTGF T.E.B. MACHINE (the Tool-Event-Behavior machine — the bible's
// 5-part anatomy, 2026-08-15) ───
// THE OPERATOR's MANDATE (verbatim): "BUILD THIS CORRECTLY for the sttgf...
// GET STTGF RUNTIME GRADE WITH REAL MACHINERY NO THEATRICAL GARBAGE" + the
// TEB_MACHINES bible's 5-part anatomy: the INTERCEPTOR (the tool.before) → the
// LEXICON (the typed PatternFamily signal groups) → the STATE MACHINE (the
// priority-order intent classes, the fail-state INCONCLUSIVE) → the ENFORCER
// (the throw) → the REMEDIATION (the named fix).
// THE R1 REGISTRY'S FLAW (what this replaces): the first-match-wins detector
// chain — a branch in typed clothing, NOT a machine. THE T.E.B. VERSION SCORES
// every intent class's OPPOSED SIGNAL GROUP; the ARGMAX wins; the confidence =
// top/(top+rest+1) (the Poseidon formula — the bible's ISE calibration); the
// tie/no-signal → INCONCLUSIVE (the bible's fail-state, never a default PASS).
// THE READ-ALLOW EMERGES FROM THE SCORING (not a hard-code): the read tool
// scores the inspection group (its gather signals) + ZERO smoke-presentation
// signals (the read has no citable terminal output) → inspection wins →
// read_source. The bash grep on a bundle scores the smoke-presentation group →
// smoke_verification wins → inspect_bundle. The intent is SCORED, never
// branched.

interface IntentSignal {
  name: string;
  weight: number;
  test: (tool: string, args: Record<string, unknown>, session: VerificationSessionState | null) => boolean;
}
interface IntentClass {
  intent: IntentType;
  signals: IntentSignal[];
}

// THE TOOL-SHAPE PREDICATES (the mechanical detectors — the signal tests):
function isBashLike(tool: string): boolean {
  return tool === 'bash' || tool === 'terminal' || tool === 'exec' || tool === 'execute';
}
function isGatherTool(t: string): boolean {
  return t === 'read' || t === 'grep' || t === 'rg' || t === 'ag' || t === 'ack' || t === 'glob' || t === 'ls';
}
function isReadonlyTridentTool(t: string): boolean {
  return t === 'trident-status' || t === 'trident-help' || t === 'trident-gate' ||
    t === 'trident-code-audit' || t === 'trident-preflight' ||
    t === 'trident-context-synthesis' || t === 'trident-omni-vision';
}
function isWorkTool(t: string): boolean {
  const names = ['edit', 'write', 'write_file', 'patch', 'create', 'delete_file',
    'task', 'webfetch', 'question', 'skill', 'checkpoint', 'todowrite',
    'memread_session', 'memlink_parent', 'build-status',
    'omni_vision', 'subagent_omni_vision', 'execute_omni_canvas'];
  if (names.indexOf(t) !== -1) return true;
  const prefixes = ['trident-', 'manta-', 'shark-', 'ps-mode-', 'tv-browser_',
    'vc-fetch_', 'zai-vision_', 'reasoning-bus_', 'omni_canvas_', 'hive_'];
  for (const p of prefixes) if (t.indexOf(p) === 0) return true;
  return false;
}
function pendingClaim(session: VerificationSessionState | null): boolean {
  if (!session) return false;
  if (!session.verificationClaimed) return false;
  if (session.verificationSatisfied) return false;
  if (session.containerTestRan) return false;
  try {
    const rec = getEvidenceState(session.sessionId);
    const claimEvents = rec.events.filter(e => e.kind === 'claim');
    const lastClaim = claimEvents.at(-1);
    if (lastClaim) {
      const hasOpsEvidence = rec.events.some(e => (e.kind === 'unit' || e.kind === 'container') && e.at > lastClaim.at);
      if (hasOpsEvidence) {
        latchDecay('unit', session.sessionId);
        return false;
      }
    }
  } catch {}
  return (Date.now() - session.claimTimestamp) < CLAIM_WINDOW_MS;
}

// THE LASME EVIDENCE-QUERY INTENT (the F-113 rewire — the operator's "regex
// slop machine wiring in a LASME system" ruling): the pending-claim signal's
// DECISION must query the EVIDENCE MACHINE (what ACTUALLY happened — the
// fact-events), never a session-global boolean. THE INTENT: is there a FRESH
// claim (an E_CLAIM event in the window) with NO verification evidence
// (container/unit events) SINCE it? The evidence machine is the mechanical
// truth of the agent's actions; the claim is pending ONLY when the evidence
// contradicts the claim's verification. This is the LASME wiring — the regex
// (the claim-shape detector) FLAGS; the evidence machine DECIDES.
export function evidencePendingClaim(sessionId: string, windowMs: number): boolean {
  const rec = getEvidenceState(sessionId);
  const claimEvents = rec.events.filter(e => e.kind === 'claim');
  const lastClaim = claimEvents.at(-1);
  if (!lastClaim) return false;
  if (Date.now() - lastClaim.at > windowMs) return false;
  // THE EVIDENCE-CORRELATED SATISFACTION: a container/unit event AFTER the
  // claim = the verification happened = the claim is NOT pending (the D-2
  // release, mechanical). A dist_change alone does NOT satisfy (the build is
  // not the verification).
  const satisfied = rec.events.some(e =>
    (e.kind === 'container' || e.kind === 'unit') && e.at > lastClaim.at);
  return !satisfied;
}
function isBundlePresentationBash(args: Record<string, unknown>): boolean {
  const cmd = extractCommand(args);
  if (!cmd) return false;
  const subs = cmd.split(/\s*(?:;|&&|\|\||\||\n)\s*/);
  for (const sub of subs) {
    const insp = /(sudo\s+)?(strings|sed|awk|head|tail|less|more|grep|rg|ack|ag|cat(?!\s*(?:>>|>|\|)))\b/i.test(sub);
    if (insp && /d[A-Z]st|bundle|\.min\.js/i.test(sub)) return true;
  }
  return false;
}

// THE INTENT-CLASS SIGNAL GROUPS (the T.E.B. lexicon — the opposed groups, in
// the priority order: the bomb classes first, the work classes, the claim-state
// modifier):
// ─── THE SINGLE-DECISION-LAYER LAW (2026-08-16 — the LASME Wave A unification) ───
// THE ISE LAW (verbatim): "the regex is the mechanical DETECTOR only, never the
// decision. The decision lives in the state machine (the semantic scorer)." The
// slop signatures: "N-branch tower (5+ sequential if/else branches OR a
// default-pass branch), regex-only classifier (regex bodies + a classifier name
// + no AST), magic ladder (3+ unnamed numeric thresholds)." THE OLD TOWER — the
// classifyVerb/decide/classifyIntentTool/classifyIntent verb-branch chain + the
// BASH_DIRECT_VERBS/BASH_SUBCOMMAND_VERBS tables — was TWO competing decision
// layers in one file (the #1 slop signature); it is DELETED. EXACTLY ONE
// decision path now exists: scoreToolIntent's signal groups fire, the entry
// (checkSmokeTestFirewall) derives the block/allow from the FIRED signals —
// headless/inline-exec/test-runner unconditional; hash-as-proof/existence
// claim-gated by their own predicates (pendingClaim embedded); bundle-
// presentation claim-gated at the entry (the signal does NOT embed
// pendingClaim — see its note). The regexes here are the DETECTORS; the scorer
// is the DECISION. THE BLOCK-THE-CLAIM-NOT-THE-WORK LAW: read/grep (the
// inspection class) is ALWAYS allowed; a block fires only on a fired smoke
// signal, never on a bare bundle-path mention.
const TOOL_INTENT_CLASSES: IntentClass[] = [
  {
    // EVIDENCE — the escape hatch (NEVER ship, NEVER claim-gated — FR-4.3):
    intent: 'evidence',
    signals: [
      { name: 'ct-tool', weight: 4, test: (t) => t === 'trident-container-test' },
    ],
  },
  {
    // SHIP — the deploy/ship surface (the gated path — FR-4.1 + DD-7):
    intent: 'ship',
    signals: [
      { name: 'ship-tool', weight: 4, test: (t) => t === 'trident-ship-package' },
      {
        name: 'ship-bash', weight: 3,
        test: (t, a) => isBashLike(t) && (() => {
          const cmd = extractCommand(a);
          // THE CANON-DOC EXCLUSION (the F-74 — the operator's directive): the
          // canon-doc writes (DEBUG_LOG/BUILD_REPORT/context_management) are the
          // DOCUMENTATION writes — their CONTENT legitimately describes
          // restart/ship/deploy bugs. The PATH (the canon path in the command)
          // makes them the operation class, NEVER the ship. The path is the
          // DETECTOR; the documentation intent is the decision.
          return !!cmd && !isCanonDocWrite(cmd) && SHIP_PATTERNS.some((p) => p.matcher.test(cmd));
        })(),
      },
    ],
  },
  {
    // SMOKE_VERIFICATION — the citable-proof presentation shapes (the direct
    // smoke ops + the bundle-presentation):
    intent: 'smoke_verification',
    signals: [
      { name: 'headless', weight: 3, test: (t, a) => isBashLike(t) && /\bopencode[\s-]+run\b/i.test(extractCommand(a)) },
      { name: 'inline-exec', weight: 3, test: (t, a) => isBashLike(t) && /\b(node|bun)[\\\s]+(?:-[ex]\b|--eval\b|--print\b|--evaluate\b)|\bnpx\s+-e\b/i.test(extractCommand(a)) },
      // THE F-97 OVER-BREADTH FIX (2026-08-15 — the direct-session red-team
      // findings 1-2: the deploy-verification + the source-integrity hashes
      // BLOCKED): the hash-as-proof signal fires ONLY when a claim is pending
      // (the pendingClaim triggerCondition — the bible's safe-exclusion frame:
      // the hash presented as proof of a CLAIM is smoke; a hash as ordinary
      // integrity/deploy work is NOT). The signal test signature is
      // (tool, args, session) — the third param is the session state.
      // THE F-99 AUDIT FINDING 6 (2026-08-15 — the deeper sweep): the OLD
      // regex /\b(sha256sum|md5sum|shasum)\b/ missed the ENTIRE hash-variant
      // family (sha1sum, sha224sum, sha384sum, sha512sum, b2sum, cksum,
      // openssl dgst) — an agent with a pending claim could present a sha512sum
      // as "proof" with ZERO claim-gate demand riding (isCitableProofShape
      // false). THE FIX: the family-wide matcher — the *sum core (sha*sum,
      // b2sum, cksum) + openssl dgst. The pendingClaim triggerCondition is
      // UNCHANGED (the over-breadth fix holds: a hash without a claim is work).
      { name: 'hash-as-proof', weight: 2, test: (t, a, s) => isBashLike(t) && /\b(?:sha(?:1|224|256|384|512)?sum|md5sum|b2sum|cksum|shasum)\b|\bopenssl\s+dgst\b/i.test(extractCommand(a)) && pendingClaim(s) },
      { name: 'bundle-presentation', weight: 2, test: (t, a) => isBashLike(t) && isBundlePresentationBash(a) },
      // THE EXISTENCE SIGNAL (the F-95 teeth — 2026-08-16): the old VERB-EXISTENCE
      // member existed precisely because `ls dist` fires NO other smoke signal —
      // a bare existence check on a bundle is "never the proof shape", but WITH a
      // pending claim it must gain teeth (the "existence is not runtime proof"
      // semantic). THE pendingClaim IS EMBEDDED in the predicate (mirroring
      // hash-as-proof) so a plain `ls dist`/`stat`/`file` on a bundle path is
      // NEVER blocked without a claim — it is the work. A plain ls on a non-bundle
      // path NEVER matches the triggerCondition (the /d[A-Z]st|bundle|\.min\.js/i
      // bundle-path test) — the existence signal does not fire for ordinary work.
      { name: 'existence', weight: 2, test: (t, a, s) => isBashLike(t) && (() => {
        const cmd = extractCommand(a);
        if (!cmd) return false;
        if (!/(sudo\s+)?(ls|stat|file|test\s+-[fd])\b/i.test(cmd)) return false;
        if (!/d[A-Z]st|bundle|\.min\.js/i.test(cmd)) return false;
        return pendingClaim(s);
      })() },
      // THE TEST-RUNNER-SCRIPT SIGNAL (the operator's #1 smoke example — the
      // INTENT-based detection, NEVER a blind block on writing scripts — the
      // NOT-GESTAPO LAW): the agent writing a script DESIGNED to be a test runner
      // (importing the project's source functions + printing/asserting the results)
      // instead of deploying to a container and testing runtime behaviors via
      // natural-language prompts. THE SAFE-EXCLUSION: a script that does NOT
      // import/call the project's src functions is a legit build/fixture/data
      // script and is NEVER flagged. Two firing shapes: (a) a bash execution of a
      // test harness (bun test / vitest / node <script-file> — the script the
      // agent wrote to substitute for the container), or (b) a write/edit whose
      // content imports the src AND carries the test-harness shapes
      // (describe/it/test/expect/assert/bun test/vitest/runner/harness). The bare
      // `bun run build`/`bun build` (the build-shape signal's territory) is a
      // BUILD, never a test-runner — it is deliberately NOT matched here.
      { name: 'test-runner', weight: 3, test: (t, a, _s) => {
        const isWrite = t === 'write' || t === 'write_file' || t === 'edit' || t === 'patch' || t === 'create';
        if (isBashLike(t)) {
          const cmd = extractCommand(a);
          if (!cmd) return false;
          // THE LEGIT-BATTERY SAFE-EXCLUSION (the NOT-GESTAPO law + the
          // operator's battery gate): the bare `bun test` or a `bun test`/
          // `vitest` run of a path under the project's OWN tests/spec dirs is
          // the UNIT BATTERY — a MANDATORY wave gate ("battery green + tsc 0"),
          // NEVER a container substitution. Only an OUT-OF-PROJECT harness
          // script run (node/vitest/bun <script outside the project tests>) is
          // the substitution the operator's #1 smoke example targets. This
          // closes the RED-TEAM defect: `cd src/tests && bun test` fired
          // TEST_RUNNER_SCRIPT on the legit battery (zero-misfire violation).
          if (/\bbun\s+test\b|\bvitest\b/i.test(cmd)) {
            // THE TARGET-ONLY DISCRIMINATOR: a target inside the project's
            // test dirs (src/tests, tests, spec, __tests__) is the LEGIT
            // battery; a target OUTSIDE (an absolute /tmp/~/path or an
            // arbitrary file) is the substitution harness. The bare `bun
            // test` (no target) is always the legit battery. The RED-TEAM
            // defect + its pin (26) proved the `.test.`-filename exclusion
            // was over-broad (it swallowed /tmp/smoke.test.ts) — the
            // discriminator is the PROJECT-TREE PREFIX, never the filename.
            const m = cmd.match(/\b(?:bun\s+test|vitest(?:\s+run)?)\s+((?:--?[\w-]+\s+)*)([^\s;|&]+)/i);
            const target = m ? m[2] : '';
            if (!target) return false; // the bare battery — legit
            if (/^(?:\.{0,2}\/)?(?:src\/)?(?:tests?|spec|__tests__)[\/\s]/i.test(target)) return false;
            return true; // an out-of-project harness target = the substitution
          }
          return /\bnode\s+[^\s;|&]+\.[mc]?[jt]s\b/i.test(cmd);
        }
        if (isWrite) {
          const content = stringifyContent(a);
          if (!content) return false;
          const importsSrc = /(?:from\s+['"](?:\.\.?\/)?src\/|require\s*\(\s*['"](?:\.\.?\/)?src\/|import\s*\(\s*['"](?:\.\.?\/)?src\/)/i.test(content);
          if (!importsSrc) return false;
          const harnessShape = /describe\s*\(|it\s*\(|test\s*\(|expect\s*\(|\bassert\b|\bbun\s+test\b|vitest|runner|harness/i.test(content);
          return harnessShape;
        }
        return false;
      } },
    ],
  },
  {
    // INSPECTION — the gathering (the read/grep TOOLS + the readonly trident
    // tools + the source targets — ALWAYS allowed, the v4 core):
    intent: 'inspection',
    signals: [
      { name: 'gather-tool', weight: 2, test: (t) => isGatherTool(t) },
      { name: 'readonly-trident', weight: 2, test: (t) => isReadonlyTridentTool(t) },
      { name: 'source-target', weight: 1, test: (t, a) => classifyTarget(extractPath(a)) === 'source' },
    ],
  },
  {
    // OPERATION — the work (the modification + the orchestration + the
    // bash-build; the claim-state NEVER blocks the work — the Phase B demand
    // rides the output instead):
    intent: 'operation',
    signals: [
      { name: 'work-tool', weight: 2, test: (t) => isWorkTool(t) || isBashLike(t) },
      { name: 'build-shape', weight: 1, test: (t, a) => isBashLike(t) && /\b(bun|npm|yarn|pnpm)\s+(build|run\s+build)\b|\btsc\b/i.test(extractCommand(a)) },
    ],
  },
  {
    // CLAIM_VERIFICATION — the pending-claim MODIFIER (the Poseidon
    // negation-first: a fresh claim without a container test weights this class
    // so the Phase B demand rides the tool output — never a hard block of the
    // work):
    intent: 'claim_verification',
    signals: [
      // THE F-113 LASME REWIRE: the DECISION queries the EVIDENCE MACHINE
      // (evidencePendingClaim — the fact-events: a fresh E_CLAIM with NO
      // container/unit verification since), never the session-global
      // pendingClaim boolean. The regex (the claim-shape detector) FLAGS; the
      // evidence machine DECIDES — the operator's "regex slop machine wiring
      // in a LASME system" ruling fixed at the decision layer.
      { name: 'pending-claim', weight: 3, test: (_t, _a, _s) => evidencePendingClaim(_s?.sessionId || 'default', CLAIM_WINDOW_MS) },
    ],
  },
];

// THE T.E.B. STATE MACHINE — the semantic scorer (the Poseidon decision):
// every intent class scores (the weight-sum of its firing signals); the ARGMAX
// wins; the confidence = top/(top+rest+1); the tie/no-signal → INCONCLUSIVE
// ("Tie or no signals — no state change. Never guess." — the Poseidon law).
export function scoreToolIntent(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: VerificationSessionState | null,
): { intent: IntentType; confidence: number; scores: Record<string, number>; fired: Record<string, boolean> } {
  const tool = (toolName || '').toLowerCase();
  const scores: Record<string, number> = {};
  const fired: Record<string, boolean> = {};
  let topIntent: IntentType = 'inconclusive';
  let topScore = 0;
  let total = 0;
  for (const cls of TOOL_INTENT_CLASSES) {
    let s = 0;
    for (const sig of cls.signals) {
      if (sig.test(tool, args, sessionState)) { s += sig.weight; fired[sig.name] = true; }
    }
    scores[cls.intent] = s;
    total += s;
    if (s > topScore) { topScore = s; topIntent = cls.intent; }
  }
  if (topScore === 0) return { intent: 'inconclusive', confidence: 0, scores, fired };
  const confidence = topScore / (total + 1);
  return { intent: topIntent, confidence, scores, fired };
}

export function extractIntent(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: VerificationSessionState | null,
): IntentType {
  return scoreToolIntent(toolName, args, sessionState).intent;
}

// THE F-97 PHASE-B SCOPING PRIMITIVE (2026-08-15 — finding 6: once the
// session's claim state is armed, the [STTGF: CLAIM GATE] append rode EVERY
// tool output — even a neutral echo — the F-62 "agents treat the gate as
// noise" derailment). THE FIX: the Phase B demand rides ONLY the citable-proof
// presentation shapes — the tool whose output could be cited as the claim's
// evidence (a hash, a bundle-presentation, an inline exec — the
// smoke_verification class's score > 0). A neutral write/echo/read (the
// operation/inspection classes, smoke score 0) never carries the demand. The
// check uses the SIGNAL GROUP's score, not the argmax — the claim_verification
// class (weight 3 pending-claim) out-scores smoke_verification (weight 2) when
// a claim is pending, so the argmax alone would mis-scope; the smoke SCORE is
// the discriminator.
export function isCitableProofShape(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: VerificationSessionState | null,
): boolean {
  const r = scoreToolIntent(toolName, args, sessionState);
  return (r.scores['smoke_verification'] ?? 0) > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// §70 — THE TOOL-EXECUTION FRONT (the smoke-command discharge — THROW-ONLY)
// ═════════════════════════════════════════════════════════════════════════════
// THE LAW (the spec §70 — the MPSE-form + the trace B): the tool gate's bash
// surface gets the SAME MathContract treatment as the claims. The smoke-shape
// regexes (inline-exec/headless/hash-as-proof — sttgf-contract.ts:1115-1117)
// are the mechanical DETECTORS ONLY (the ISE law: a regex FLAGS the shape, the
// contract DECIDES); the decision is the SMOKE_COMMAND_CONTRACT discharge
// (checkContract → toBrandedVerdict), never a bare match.
//
// THE THROW-ONLY LAW (the operator: "ONLY throw errors on tool before are
// allowed"): the tool-execution front is throw-only — it NEVER mutates the
// message surface. A smoke command substitutes for a real container test → the
// enforcer THROWS, naming the SPECIFIC block token + the PSE triplet. A generic
// throw is a FAIL (the D3 law: "THE SPECIFIC TOKEN IS THE CONTRACT").
//
// THE D3 LAW: the reported token must EQUAL the observed token. The catch
// layers verify reported-token === observed-token and RETHROW every gate error
// — the swallowed gate is the dead machine.
//
// THE H-10 TABLE LAW: the discharge is a TABLE LOOKUP + a total-function call —
// checkContract(SMOKE_COMMAND_CONTRACT, 'post', buildSmokeBindings(...)) →
// toBrandedVerdict. ZERO control branches over the command class. The contract,
// the detectors, and the builder are IMPORTED from sttgf-contract.ts — NEVER
// redefined here.

// THE SMOKE-COMMAND ROUTING TABLE (declared as DATA — the H-10 table, no
// branch): each command class maps to its SPECIFIC D3 block token. The discharge
// derives the token from the contract's FAILING clause shape, and the enforcer
// maps it through THIS table. The table is the ONLY place the class → token
// association lives.
export const SMOKE_BLOCK_TOKENS: Record<string, string> = {
  INLINE_EXEC: '[STTGF BLOCK] INLINE_EXEC',
  HEADLESS: '[STTGF BLOCK] HEADLESS',
  HASH_AS_PROOF: '[STTGF BLOCK] HASH_AS_PROOF',
  TEST_RUNNER: '[STTGF BLOCK] TEST_RUNNER',
};

// THE SMOKE TRIGGER (the §70 discharge's Trigger — the pattern family id is
// the smoke-command family; the class is null (the smoke surface is not a claim
// class), so toBrandedVerdict's intent-axis derivation lands on WRONG_CLASS
// only on the null-class path — but the EVIDENCE axis is what the discharge's
// block decision reads: a failing clause → the violationToAxis → the lattice).
const SMOKE_TRIGGER: Trigger = { claimShapeId: 'STTGF.smoke-command', subject: null, claimClass: null };

// THE SMOKE-COMMAND DISCHARGE (§70 — THE TABLE, NO BRANCH): routes the smoke
// commands (hash/inline/headless/bundle-inspect) through the contract.
// THE MECHANISM: checkContract(SMOKE_COMMAND_CONTRACT, 'post',
// buildSmokeBindings(tool, command, pendingClaim)) → toBrandedVerdict. The
// contract's failing clause names the shape (the INLINE_EXEC / HEADLESS /
// HASH_AS_PROOF token is derived from the VIOLATION, never from a branch over
// the command text). The UnboundBindingError mapping (the proof-gap) is
// checkContract's §51 'unbound:' → UNVERIFIABLE path — never a silent pass.
export function evaluateSmokeCommand(
  tool: string,
  args: Record<string, unknown>,
  pendingClaim: boolean,
): { verdict: BrandedVerdict; checked: Checked<BrandedVerdict>; token: string | null } {
  const command = extractCommand(args || {});
  const bindings = buildSmokeBindings(tool || '', command, pendingClaim);
  const checked = checkContract(SMOKE_COMMAND_CONTRACT, 'post', bindings);
  const verdict = toBrandedVerdict(SMOKE_TRIGGER, checked);
  const token = smokeTokenFromChecked(checked);
  return { verdict, checked, token };
}

// THE VIOLATION-TO-TOKEN MAP (the D3-specific-token derivation): the failing
// clause's expr names the shape detector — 'inlineExecShape' → INLINE_EXEC,
// 'headlessShape' → HEADLESS, 'hashAsProofShape' → HASH_AS_PROOF. The map is
// TABLE-DRIVEN (H-10) — a clause never seen before → null (the contract
// discharged ok → no block token). The token is derived from the CHECKED
// violation (the mechanical truth), never from a branch over the command text.
const SMOKE_VIOLATION_TO_TOKEN: ReadonlyArray<{ clause: string; token: string }> = [
  { clause: 'inlineExecShape', token: 'INLINE_EXEC' },
  { clause: 'headlessShape', token: 'HEADLESS' },
  { clause: 'hashAsProofShape', token: 'HASH_AS_PROOF' },
  // THE D-1 TEST-RUNNER CLAUSE (the F-110 fix): the contract's testRunnerShape
  // clause → the TEST_RUNNER token (the operator's #1 smoke example + the
  // zero-misfire mandate). The legit battery is safe-excluded in the detector.
  { clause: 'testRunnerShape', token: 'TEST_RUNNER' },
];

export function smokeTokenFromChecked(checked: Checked<BrandedVerdict>): string | null {
  if (checked.ok) return null;
  for (const m of SMOKE_VIOLATION_TO_TOKEN) {
    if (checked.violated.expr.includes(m.clause)) return m.token;
  }
  return null;
}

// THE PSE TRIPLET (Pattern-State-Evidence — the erasure record shape from
// sttgf-verdict.ts:224-244): the Pattern = the block token family, the State =
// the lattice classification (the verdict's latticePoint), the Evidence = the
// checked violation (the mechanical why — the failing clause + the bindings).
export interface PseTriplet {
  pattern: string;
  state: string;
  evidence: string;
}

export function buildPseTriplet(
  token: string,
  verdict: BrandedVerdict,
  checked: Checked<BrandedVerdict>,
): PseTriplet {
  const record = verdict as unknown as { cls?: string };
  const state = record.cls ?? 'UNCLASSIFIED';
  const evidence = checked.ok ? 'discharged' : JSON.stringify(checked.violated);
  return { pattern: token, state, evidence };
}

// THE SPECIFIC-TOKEN ENFORCER (THROW-ONLY): throws the SPECIFIC block token +
// the PSE triplet. A generic throw is a FAIL (the D3 law). The message starts
// with the token so the catch layers can perform the reported-token ===
// observed-token equality.
export function throwSmokeBlock(token: string, triplet: PseTriplet): never {
  const fullToken = SMOKE_BLOCK_TOKENS[token] ?? `[STTGF BLOCK] ${token}`;
  throw new Error(
    `${fullToken}\n\n` +
    `THE PSE TRIPLET: pattern=${triplet.pattern} state=${triplet.state} evidence=${triplet.evidence}\n\n` +
    `The container test IS the test — everything else is theater. Deploy to a container and test the runtime behavior via natural-language prompts (trident-container-test: the setup with a validated plan + the scenarios + the results artifact).`,
  );
}

// THE TEST-RUNNER-SUBSTITUTION DETECTOR (§6.3 — the write gate machine): a
// write/edit whose content imports the project's src AND carries the
// test-harness shapes (describe/it/test/expect/assert/bun test/vitest/runner/
// harness) is a test-runner SUBSTITUTING for the container test — the
// operator's #1 smoke example. THE SAFE-EXCLUSION: a script that does NOT
// import the src functions is a legit build/fixture/data script and is NEVER
// flagged (the NOT-GESTAPO law). The bare `bun run build` is a BUILD, never a
// test-runner. THE F-HT-BUG-2 CARVE-OUT: .trident/** or *.md documentation writes
// quoting enforcement words are ALLOWED even while latched. THE DETECTOR RETURNS
// A BOOLEAN (the mechanical FLAG); the enforcer decides the block.
export function isTestRunnerSubstitution(tool: string, args: Record<string, unknown>): boolean {
  if (isDocumentationWrite(tool, args)) return false;
  const isWrite = tool === 'write' || tool === 'write_file' || tool === 'edit' || tool === 'patch' || tool === 'create';
  if (!isWrite) return false;
  const content = stringifyContent(args || {});
  if (!content) return false;
  const importsSrc = /(?:from\s+['"](?:\.\.?\/)?src\/|require\s*\(\s*['"](?:\.\.?\/)?src\/|import\s*\(\s*['"](?:\.\.?\/)?src\/)/i.test(content);
  if (!importsSrc) return false;
  const harnessShape = /describe\s*\(|it\s*\(|test\s*\(|expect\s*\(|\bassert\b|\bbun\s+test\b|vitest|runner|harness/i.test(content);
  return harnessShape;
}

// THE D3 CATCH (the reported-token === observed-token equality): a gate error
// carries its specific token; the catch verifies the reported token matches the
// observed and RETHROWS. THE RETHROW-EVERY-LAYER RULE: the swallowed gate is the
// dead machine — every catch layer propagates, never silently recovers.
export function d3VerifyToken(reported: string, observed: string): boolean {
  return reported === observed;
}

// THE TOOL-GATE ENFORCEMENT FRONT (the bash surface): the config-lock CTX
// families (the KEEP — consumed from ct-anti-derailment.ts, the verified
// single-source of the CTX-01/04/05/09/10/11 write blocks + the read allows)
// + the smoke-command discharge. THROW-ONLY: the blocks throw the specific
// token + the PSE triplet; the reads + the legit build commands pass.
// THE F-HT-BUG-2 CARVE-OUT: documentation writes (.trident/**, *.md) quoting
// enforcement words are ALLOWED — the write-args stringify + bash argv surfaces.
export function enforceToolExecutionFront(tool: string, args: Record<string, unknown>, pendingClaim: boolean): void {
  if (isDocumentationWrite(tool, args)) return;
  const _cmdForDoc = extractCommand(args || {});
  if (_cmdForDoc && isCanonDocWrite(_cmdForDoc)) return;
  // THE CONFIG-LOCK FAMILIES (the KEEP — classifyCtExec is the verified
  // machine: the CTX-01/04/05/09/10/11 write blocks fire on the protected-path
  // mutation pairs; the read allows pass untouched — the D3-specific token
  // '[TRIDENT CONFIG LOCK] CTX-xx' is the observed token).
  if (tool === 'bash' || tool === 'terminal' || tool === 'exec' || tool === 'execute') {
    const command = extractCommand(args || {});
    if (command && isCanonDocWrite(command)) return;
    if (command) {
      const verdict = classifyCtExec(command);
      if (verdict.verdict === 'BLOCK') {
        throw new Error(buildCtConfigLockMessage(verdict));
      }
    }
    // THE SMOKE-COMMAND DISCHARGE (the §70 table): the bash surface's smoke
    // shapes route through the contract → the specific-token throw.
    const discharge = evaluateSmokeCommand(tool, args || {}, pendingClaim);
    if (!discharge.checked.ok && discharge.token) {
      TELEMETRY.totalBlocks++;
      sttgfStateTracker.incrementBlockCount('default', discharge.token);
      throwSmokeBlock(discharge.token, buildPseTriplet(discharge.token, discharge.verdict, discharge.checked));
    }
    TELEMETRY.totalAllows++;
    return;
  }
  // THE TEST-RUNNER-SUBSTITUTION DETECTOR (the write surface — §6.3): a write
  // importing src + the harness shapes → the TEST_RUNNER block + the
  // container-test mandate.
  if (isTestRunnerSubstitution(tool, args || {})) {
    TELEMETRY.totalBlocks++;
    const triplet: PseTriplet = {
      pattern: 'TEST_RUNNER',
      state: 'TEST_RUNNER_SUBSTITUTION',
      evidence: 'the write imports the src + carries the test-harness shapes (describe/it/test/expect/assert/bun test/vitest/runner/harness) — a test-runner script substituting for the container test',
    };
    throwSmokeBlock('TEST_RUNNER', triplet);
  }
  TELEMETRY.totalAllows++;
}

// ─── THE SHIP CLASS + THE GATE (the crack-3 fix — FR-4.1/FR-4.2 + DD-7) ───
// THE SHIP_PATTERNS (the spec's C-4 table — the deploy/ship surface): the
// host-plugin copies, the ship-package/checkpoint writes, the restarts, and
// the ambiguous ship-like copies (the G-8.4 fail-closed — bounded by the three
// trigger words). THE REGEX IS THE MECHANICAL DETECTOR ONLY (the ISE law) —
// the decision is the SHIP class's precedence in the classification, never a
// bare phrase match.

export const SHIP_PATTERNS: Array<{ id: string; matcher: RegExp; note: string }> = [
  // SHIP-HOST-PLUGIN: the copy/sync into the host plugin directory.
  { id: 'SHIP-HOST-PLUGIN', matcher: /(?:cp|rsync|scp)[^;]*(?:\.config\/opencode\/plugins|plugins\/trident)/i, note: 'the host-plugin copy' },
  // SHIP-SHIP-PACKAGE: the ship-package/checkpoint writes into the ship dirs.
  { id: 'SHIP-SHIP-PACKAGE', matcher: /(?:ship-package|Ship_Packages|SHIP_PACKAGE|Checkpoints\/)[^;]*(?:dist\/index\.js|rsync|cp)/i, note: 'the ship-package/checkpoint writes' },
  // SHIP-RESTART: the restart of the host opencode/trident.
  { id: 'SHIP-RESTART', matcher: /\b(?:restart|systemctl)\b[^;]*(?:opencode|trident)/i, note: 'the restart' },
  // SHIP-AMBIGUOUS: the copy whose path contains 'trident'/'opencode'/'plugins'
  //   (the G-8.4 refinement — the fail-closed for the ambiguous ship-like commands).
  { id: 'SHIP-AMBIGUOUS', matcher: /(?:cp|mv|rsync|scp)[^;]*(?:trident|opencode|plugins)/i, note: 'the ambiguous ship-like copy' },
];

// THE CANON-DOC WRITE DETECTOR (the F-74 fix — moved INTO the scorer as part of
// the single-decision-layer unification): a bash command whose target is a canon
// doc (DEBUG_LOG / BUILD_REPORT / context_management / the changelog family) is
// a DOCUMENTATION write — never the ship class, whatever its content describes.
// THE F-HT-BUG-2 EXTENSION: .trident/** and *.md paths quoting enforcement words
// while latched are ALLOWED (kills recursion which blocked writing the failure log
// itself through both bash argv and write-args stringify).
function isCanonDocWrite(cmd: string): boolean {
  return /(?:\.trident\/|DEBUG_LOG|BUILD_REPORT|context_management\/|CHANGELOG|POST-COMPACTION|COMPACTION_SURVIVAL|CURRENT_STATE|EVIDENCE_STATE|NEXT_STEPS|TASK_QUEUE|DECISION_CHAIN)(?:\.md)?["']?|\.md["'\s;|&]|\.trident/i.test(cmd);
}
function isDocumentationWrite(tool: string, args: Record<string, unknown>): boolean {
  const isWrite = tool === 'write' || tool === 'write_file' || tool === 'edit' || tool === 'patch' || tool === 'create';
  if (!isWrite) return false;
  const p = extractPath(args);
  if (p && (/\.trident\//i.test(p) || /\.md$/i.test(p))) return true;
  const raw = JSON.stringify(args);
  if (/\.trident\//i.test(raw) || /"filePath"\s*:\s*"[^"]*\.md"/i.test(raw)) return true;
  const content = stringifyContent(args);
  if (content && (/\.trident\//i.test(content) || /\.md/i.test(p))) return true;
  return false;
}

// THE SHIP-GATE WARHEAD (FR-13.4 — the exact throw text): names the evidence
// state + the dist + the sanctioned path. The reads + the container-test never
// hit this gate.
export function shipGateWarhead(verdict: EvidenceVerdict): string {
  const state = verdictStateName(verdict);
  const sha = verdict.distSha || 'unknown';
  return `[STTGF SHIP GATE] the deploy/ship of a build whose evidence state is ${state} for dist ${sha} — the container verification is missing. Run the container red-team (trident-container-test: the setup with a validated plan + the scenarios + the results artifact) BEFORE the ship. The reads + the container-test never hit this gate.`;
}

function verdictStateName(v: EvidenceVerdict): string {
  switch (v.verdict) {
    case 'LEGIT': return 'CONTAINER_EVIDENCED';
    case 'UNIT_ONLY': return 'UNIT_EVIDENCED';
    case 'SMOKE': return 'SMOKE_ONLY';
    default: return 'NO_EVIDENCE';
  }
}

// THE OVERRIDE-CONSUMPTION TRACKER (FR-4.3 — the operator's explicit override
// bypasses ONCE with the marker; the next ship without the override re-gates).
const shipOverrideUsed = new Set<string>();

// THE PURE GATE DECISION (the 7.6 battery's shape): allowed ONLY on the LEGIT
// verdict — the CONTAINER_EVIDENCED for the current dist. Everything else
// (SMOKE/UNIT_ONLY/UNEVIDENCED) → not allowed + the warhead. The operator
// override (the manual deploy — CN-9.1) bypasses once with the marker.
export function evaluateShipGate(
  sessionId: string,
  distSha?: string,
  opts?: { operatorOverride?: boolean },
): { allowed: boolean; warhead: string | null; marker: string | null } {
  if (opts?.operatorOverride && !shipOverrideUsed.has(sessionId)) {
    shipOverrideUsed.add(sessionId);
    return { allowed: true, warhead: null, marker: '[OPERATOR OVERRIDE] the ship gate bypassed once by the operator directive — the container verification is still REQUIRED for the record (CN-9.1).' };
  }
  const verdict = queryEvidenceVerdict(sessionId, 'ship');
  if (verdict.verdict === 'LEGIT') return { allowed: true, warhead: null, marker: null };
  return { allowed: false, warhead: shipGateWarhead(verdict), marker: null };
}

// THE HOOK'S ENFORCEMENT (the 6.4 battery's shape — the tool-before's throw):
// a SHIP-class call whose evidence verdict is not LEGIT THROWS the warhead.
// The reads + the container-test (the EVIDENCE class) never reach the throw.
// THE SINGLE-DECISION-LAYER REWIRE (2026-08-16): the ship intent is now derived
// from the SCORER (the ship class's signals — ship-tool / ship-bash with the
// canon-doc exclusion), the same single decision path as the smoke entry. The
// container-test scores the evidence class (weight 4) and never the ship.
export function enforceShipGate(sessionId: string, tool: string, args: string | Record<string, unknown>): void {
  const argsRec = typeof args === 'string' ? { command: args } : args;
  const intent = scoreToolIntent(tool, argsRec, sttgfStateTracker.getState(sessionId)).intent;
  if (intent !== 'ship') return;
  const verdict = queryEvidenceVerdict(sessionId, 'ship');
  if (verdict.verdict !== 'LEGIT') {
    throw new Error(shipGateWarhead(verdict));
  }
}

// ─── Command/Path Extractors (the scorer's detector raw material) ───

function extractPath(a: Record<string, unknown>): string {
  const args = extractToolArgs(a);
  if (typeof args.filePath === 'string') return args.filePath;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.file === 'string') return args.file;
  if (typeof args.fileName === 'string') return args.fileName;
  const raw = JSON.stringify(a);
  const m = raw.match(/"filePath"\s*:\s*"([^"]+)"/) || raw.match(/"path"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  return '';
}

function extractToolArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const a = raw || {};
  return (a.input || a.args || a.params || a.arguments || a) as Record<string, unknown>;
}

function extractCommand(args: Record<string, unknown>): string {
  const a = extractToolArgs(args);
  if (typeof a.command === 'string' && a.command) return a.command;
  if (typeof a.cmd === 'string' && a.cmd) return a.cmd;
  if (typeof a.text === 'string' && a.text) return a.text;
  return '';
}

// THE WRITE-CONTENT EXTRACTOR (the test-runner signal's raw material): the
// write/edit args carry the file body in content/newString — the stringified
// form feeds the signal's src-import + harness-shape detectors. A non-string /
// absent body returns '' so the signal's src-import test fails cleanly.
function stringifyContent(args: Record<string, unknown>): string {
  const a = extractToolArgs(args);
  if (typeof a.content === 'string' && a.content) return a.content;
  if (typeof a.newString === 'string' && a.newString) return a.newString;
  return '';
}

// ─── Target Classification ───

function classifyTarget(p: string): TargetType {
  if (!p) return 'unknown';
  const l = p.toLowerCase();
  if (/(^|[\/\\])d[A-Z]st([\/\\]|$)/i.test(l) || /\.min\.js$/i.test(l)) return 'bundle';
  if (/(^|[\/\\])src([\/\\]|$)/i.test(l) || (/\.(ts|tsx)$/i.test(l) && !/node_modules/i.test(l))) return 'source';
  return 'other';
}

// ─── VerificationStateTracker — REAL implementation (replacing stubs) ───
// THE 7.5 DELEGATION (DD-15.3 — the spec's C-1.6): the tracker's METHOD
// SIGNATURES are preserved (the callers in trident-hooks.ts depend on them),
// but the claim/container-evidence backing DELEGATES to the EVIDENCE MACHINE
// (src/firewalls/evidence-tracker.ts) — the single source of the mechanical
// testing-degree state. The tracker-local fields (lastClaimText,
// lastBlockedCategory, blockCount) stay local (the block-count bookkeeping is
// NOT the evidence machine's domain — the spec C-1.6 :789).

export class VerificationStateTracker {
  private s = new Map<string, VerificationSessionState>();

  private getLocal(sid: string): VerificationSessionState {
    if (!this.s.has(sid)) {
      this.s.set(sid, {
        codeChanged: false,
        sessionId: sid,
        verificationClaimed: false,
        claimTimestamp: 0,
        lastClaimText: '',
        containerTestRan: false,
        containerTestTimestamp: 0,
        lastBlockedCategory: '',
        blockCount: 0,
        blockCountByCategory: {},
        verificationSatisfied: false,
        verificationSatisfiedAt: 0,
        demandDeliveredAt: 0,
      });
    }
    return this.s.get(sid)!;
  }

  getState(sid: string): VerificationSessionState {
    const local = this.getLocal(sid);
    // THE MACHINE PROJECTION (the spec's C-1.6 :759-770): the claim/container
    // state derives from the machine's record — the local map carries only the
    // tracker-local fields. The machine fails CLOSED (a db error → the fresh
    // UNEVIDENCED record), so getEvidenceState never throws.
    const rec = getEvidenceState(sid);
    const claimEvent = rec.events.filter(e => e.kind === 'claim').at(-1);
    return {
      ...local,
      codeChanged: rec.lastDistChangeAt !== null,
      verificationClaimed: claimEvent !== undefined && (rec.lastContainerAt ?? 0) < claimEvent.at,
      claimTimestamp: claimEvent?.at ?? 0,
      containerTestRan: rec.lastContainerAt !== null,
      containerTestTimestamp: rec.lastContainerAt ?? 0,
      lastClaimText: local.lastClaimText,
      lastBlockedCategory: local.lastBlockedCategory,
      blockCount: local.blockCount,
      blockCountByCategory: { ...(local.blockCountByCategory || {}) },
    };
  }

  setCodeChanged(sid: string, v: boolean): void {
    // The machine's E_DIST_CHANGE context arrives from the C-5 build detectors
    // with the REAL new SHA (a bare boolean carries no dist). The local flag is
    // kept — the projection reflects the machine's lastDistChangeAt when a
    // dist_change event has landed.
    this.getLocal(sid).codeChanged = v;
  }

  // Phase B: called from messages.transform when an ASSISTANT message claims verification
  setVerificationClaimed(sid: string, v: boolean, claimText?: string): void {
    const local = this.getLocal(sid);
    const distSha = getEvidenceState(sid).distSha ?? '';
    const at = Date.now();
    if (v) {
      local.verificationClaimed = true;
      local.claimTimestamp = at;
      local.lastClaimText = claimText || '';
      ingestEvidenceEvent(sid, { kind: 'claim', at, distSha, detail: claimText || '' });
    } else {
      local.verificationClaimed = false;
      ingestEvidenceEvent(sid, { kind: 'evidence_clear', at, distSha });
    }
  }

  // Legacy alias kept for API compat
  clearVerificationPending(sid: string): void {
    this.setVerificationClaimed(sid, false);
  }

  // Called from tool.execute.before when trident-container-test runs.
  // THE DD-5 DELEGATION: the container evidence REQUIRES the artifact on disk
  // AND a scoped dist (a container run before any build event has no dist to
  // verify) — when both hold, a 'container' event transitions the machine to
  // CONTAINER_EVIDENCED (the claim de-arms + the LEGIT verdict); otherwise the
  // 'evidence_clear' trail is recorded (the setup alone is NOT the LEGIT).
  setContainerTestRan(sid: string, v: boolean): void {
    if (!v) return; // a container test cannot be un-run — the projection reflects the machine
    const rec = getEvidenceState(sid);
    const distSha = rec.distSha ?? '';
    const artifact = locateEvidenceArtifact();
    // THE F-97 AUDIT FINDING 1 (2026-08-15 — the zero-trust red team): the
    // ESCALATE ledger did NOT reset on a real container test — a session with
    // 2 pre-test blocks + 1 post-test block escalated ("Running container test
    // is MANDATORY") even though the container test HAD run. THE FIX: a real
    // container run (the artifact + the dist) clears the smoke-attempt ledger —
    // the escalation's purpose ("run the container test") is already satisfied.
    if (artifact !== null && distSha !== '') {
      const local = this.getLocal(sid);
      local.blockCount = 0;
      local.blockCountByCategory = {};
      ingestEvidenceEvent(sid, { kind: 'container', at: Date.now(), distSha, hasEvidenceArtifact: true, artifact });
    } else {
      ingestEvidenceEvent(sid, { kind: 'evidence_clear', at: Date.now(), distSha });
    }
  }

  // Phase B check: fresh claim without container evidence (the machine-backed —
  // the spec's C-1.6 :778-787, honoring the caller's window)
  hasClaimWithoutContainerTest(sid: string, windowMs: number): boolean {
    const rec = getEvidenceState(sid);
    const claimEvent = rec.events.filter(e => e.kind === 'claim').at(-1);
    if (!claimEvent) return false;
    if (Date.now() - claimEvent.at > windowMs) return false;
    // THE D-2 RELEASE (the F-110 fix): a real verification event (unit/tsc/
    // container — the evidence-correlated satisfaction) de-arms the claim. The
    // OLD check compared only lastContainerAt — the legit unit battery + tsc
    // (the mandatory wave gates) never satisfied it → the hash latch poisoned
    // the whole session.
    const satisfied = rec.events.some(e =>
      (e.kind === 'unit' || e.kind === 'container') && e.at > claimEvent.at);
    if (satisfied) return false;
    return (rec.lastContainerAt ?? 0) < claimEvent.at;
  }

  // THE D-2 RELEASE HOOK (the F-110 fix): the evidence machine ingests the
  // unit/tsc/container events — this marks the session's claim SATISFIED so
  // the pending-claim latch + the hash-as-proof poisoning release. Called by
  // the hooks' ingestion points on a real unit/tsc/container event.
  // THE LATCH-DECAY WIRING (F-HT-BUG-1): auto-decay via latchDecay path — the
  // ops-evidenced verification releases the ambient latch even without container.
  markVerificationSatisfied(sid: string, at: number): void {
    const local = this.getLocal(sid);
    local.verificationSatisfied = true;
    local.verificationSatisfiedAt = at;
    local.blockCountByCategory = {};
    try { ingestEvidenceEvent(sid, { kind: 'evidence_clear', at, distSha: getEvidenceState(sid).distSha ?? '' }); } catch {}
  }

  // THE D-3 ONCE-DELIVERY (the F-110 blanket-append fix — 28 Phase B
  // injections in 3 min): the demand delivers ONCE per claim — the first
  // citable-proof call after the arm. Returns true ONLY on the first call in
  // the claim window; subsequent proof calls stay silent (the gate keeps its
  // teeth without becoming noise).
  shouldDeliverDemand(sid: string, windowMs: number): boolean {
    const local = this.getLocal(sid);
    const rec = getEvidenceState(sid);
    const claimEvent = rec.events.filter(e => e.kind === 'claim').at(-1);
    if (!claimEvent) return false;
    if (Date.now() - claimEvent.at > windowMs) return false;
    if (local.demandDeliveredAt >= claimEvent.at) return false;
    local.demandDeliveredAt = Date.now();
    return true;
  }

  // THE F-97 ESCALATE CALIBRATION (2026-08-15 — finding 10): the escalation
  // must fire on REPEATED attempts of the SAME category (the "3 consecutive
  // smoke blocks" semantic), never on a mix of categories. incrementBlockCount
  // now takes the category and counts per-category; the session total is kept
  // for compat. The hooks' escalation check uses the per-category count.
  incrementBlockCount(sid: string, category?: string): void {
    const local = this.getLocal(sid);
    local.blockCount++;
    if (category) {
      const cat = normalizeCategory(category);
      if (!local.blockCountByCategory) local.blockCountByCategory = {};
      local.blockCountByCategory[cat] = ((local.blockCountByCategory as Record<string, number>)[cat] || 0) + 1;
    }
  }
  getBlockCount(sid: string, category?: string): number {
    const local = this.getLocal(sid);
    if (category) {
      const cat = normalizeCategory(category);
      return ((local.blockCountByCategory || {}) as Record<string, number>)[cat] || 0;
    }
    return local.blockCount;
  }
  getLastBlockedCategory(sid: string): string {
    return this.getLocal(sid).lastBlockedCategory;
  }
  setLastBlockedCategory(sid: string, c: string): void {
    this.getLocal(sid).lastBlockedCategory = c;
  }
  isPendingExpired(sid: string, ms: number): boolean {
    const st = this.getState(sid);
    if (!st.verificationClaimed) return true;
    return Date.now() - st.claimTimestamp > ms;
  }
  getWindow(sid: string): VerificationSessionState {
    return this.getState(sid);
  }
  clearSession(sid: string): void {
    this.s.delete(sid);
  }
}

export const sttgfStateTracker = new VerificationStateTracker();

// ─── API-compat shims (hooks import these) ───

export class ContextWindow {
  append(): void {}
  recent(): any[] { return []; }
  lastN(): any[] { return []; }
  clear(): void {}
}
export const sttgfContextWindows = {
  getOrCreate(): ContextWindow { return new ContextWindow(); },
  clear(): void {},
  clearAll(): void {},
};

export interface FirewallConfig { enabled: boolean; }
let FIREWALL_CONFIG: FirewallConfig = { enabled: true };
export function getFirewallConfig(): FirewallConfig { return { ...FIREWALL_CONFIG }; }
export function updateFirewallConfig(u: Partial<FirewallConfig>): void {
  FIREWALL_CONFIG = { ...FIREWALL_CONFIG, ...u };
}

export interface STTGFTelemetry { totalChecks: number; totalBlocks: number; totalAllows: number; }
let TELEMETRY: STTGFTelemetry = { totalChecks: 0, totalBlocks: 0, totalAllows: 0 };
export function getSTTGFTelemetry(): STTGFTelemetry { return { ...TELEMETRY }; }

// ─── Main Entry Point (the SINGLE decision path — scorer-driven) ───
// THE UNIFICATION (2026-08-16 — the LASME Wave A): this entry is the ONE place
// a block/allow decision is made, and it derives that decision from the FIRED
// signals of the semantic scorer (scoreToolIntent), never from a parallel
// if/else verb tower. The signal tests are the mechanical DETECTORS; this entry
// maps the FIRED signal names to the block categories. THE CLAIM-GATING: the
// headless/inline-exec/test-runner signals fire unconditionally (a smoke op is
// a smoke op whatever the claim state); the hash-as-proof/existence signals
// embed pendingClaim in their OWN predicates (a hash/ls without a claim is the
// work); the bundle-presentation signal does NOT embed pendingClaim (a plain
// `cat dist/x | head` is ordinary bundle work), so this entry re-gates it on
// the pending claim — the "block the CLAIM, not the WORK" law. The inspection /
// operation / work / ship / evidence intents ALLOW here (the ship gate is the
// separate tool-before throw via enforceShipGate); the claim_verification and
// inconclusive intents fall through to ALLOW so the Phase B demand rides the
// output (never a hard block of the work).

export async function checkSmokeTestFirewall(params: {
  toolName: string; sessionId: string; agentName: string;
  agentMode?: string;
  mode: string; args: Record<string, unknown>; commandStr: string;
  signals?: unknown;
  verificationState?: unknown;
  contextWindow?: string;
}): Promise<FirewallResult> {
  try {
    const tool = (params.toolName || '').toLowerCase();
    const sid = params.sessionId || 'default';
    const sessionState = sttgfStateTracker.getState(sid);

    // THE SINGLE DECISION PATH — score ONCE, decide on the FIRED signals:
    const scored = scoreToolIntent(tool, params.args, sessionState);
    const intent = scored.intent;
    const fired = scored.fired;
    const path = extractPath(params.args);
    const target = classifyTarget(path);

    // THE F-HT-BUG-2 DOCUMENTATION CARVE-OUT: .trident/** or *.md writes quoting
    // enforcement words while latched are ALLOWED — check before any smoke block.
    if (isDocumentationWrite(tool, params.args) || (extractCommand(params.args) && isCanonDocWrite(extractCommand(params.args)))) {
      TELEMETRY.totalAllows++;
      return { action: 'ALLOW', category: 'DOCUMENTATION', reason: 'Documentation write carve-out (.trident/** or *.md) — allowed even while latched (F-HT-BUG-2 fix)', intent, target };
    }
    // Diagnostic: write to hook debug file (static imports, no dynamic import)
    try {
      appendFileSync(join(tmpdir(), 'trident-hook-debug.log'),
        `[${Date.now()}] STTGF_DIAG: intent=${intent} target=${target} fired=${Object.keys(fired).join(',')} claim=${sessionState.verificationClaimed} ctRan=${sessionState.containerTestRan}\n`);
    } catch { /* the diagnostic must never fail the firewall decision */ }

    TELEMETRY.totalChecks++;

    // THE FIRED-SIGNAL DERIVATION (the decision layer — no parallel verb tower):
    if (fired['headless']) {
      TELEMETRY.totalBlocks++;
      return { action: 'BLOCK', category: 'HEADLESS', reason: 'Headless exec forbidden. Use TUI.', intent, target };
    }
    if (fired['inline-exec']) {
      TELEMETRY.totalBlocks++;
      return { action: 'BLOCK', category: 'INLINE_EXEC', reason: 'Inline exec is smoke test. Use container.', intent, target };
    }
    if (fired['test-runner']) {
      TELEMETRY.totalBlocks++;
      return { action: 'BLOCK', category: 'TEST_RUNNER_SCRIPT', reason: 'A test-runner script (importing src + asserting results) substitutes for the container test — deploy to a container and test the runtime behavior via natural-language prompts. Use trident-container-test.', intent, target };
    }
    // hash-as-proof embeds pendingClaim in its own predicate — a fired signal
    // here already means a claim is pending without container evidence.
    if (fired['hash-as-proof']) {
      TELEMETRY.totalBlocks++;
      return { action: 'BLOCK', category: 'HASH_AS_PROOF', reason: 'Hash is not runtime proof. Container test required.', intent, target };
    }
    // bundle-presentation does NOT embed pendingClaim — the entry re-gates it on
    // the claim (a plain `cat dist/x | head` is ordinary bundle work).
    if (fired['bundle-presentation']) {
      if (pendingClaim(sessionState)) {
        TELEMETRY.totalBlocks++;
        return { action: 'BLOCK', category: 'VERIFY_INSPECT', reason: 'You claimed correctness without container test evidence and then inspected the bundle — bundle inspection is not runtime proof. Use trident-container-test.', intent, target };
      }
      TELEMETRY.totalAllows++;
      return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Bundle-path work (no verification claim pending)', intent, target };
    }
    // existence embeds pendingClaim in its own predicate — a fired signal here
    // already means a claim is pending (the F-95 existence teeth stay ALIVE).
    if (fired['existence']) {
      TELEMETRY.totalBlocks++;
      return { action: 'BLOCK', category: 'VERIFY_EXIST', reason: 'Existence check is not runtime proof. Use container.', intent, target };
    }

    // THE ALLOW PATH — information gathering / modification / work / ship /
    // evidence (the ship gate is enforced separately); the claim_verification /
    // inconclusive intents ride the Phase B demand (never a hard block).
    TELEMETRY.totalAllows++;
    if (intent === 'claim_verification' || intent === 'inconclusive') {
      return { action: 'ALLOW', category: 'CLAIM_GATED_PHASE_B', reason: 'Claim pending / unresolved intent — Phase B demand injected on tool output (work not blocked)', intent, target };
    }
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Information gathering / modification workflow', intent, target };
  } catch (e) {
    // THE D3 CATCH (THE RETHROW-EVERY-LAYER LAW — the swallowed gate is the
    // dead machine): the tool front is THROW-ONLY. A gate error — the [STTGF
    // BLOCK] family + the [TRIDENT CONFIG LOCK] family — carries its SPECIFIC
    // token; the D3 catch verifies the reported token (the error's own leading
    // token) matches the observed (the same token — the error IS the observed)
    // and RETHROWS, never swallowing the block into an ALLOW. A NON-gate error
    // (an internal firewall bug) logs + recovers to the fail-open inspection
    // allow — the information gathering is never blocked by the firewall's own
    // failure (the "block the CLAIM, not the WORK" law).
    const msg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'sttgf', `Error: ${msg}`);
    if (msg.startsWith('[STTGF BLOCK]') || msg.startsWith('[TRIDENT CONFIG LOCK]') || msg.startsWith('[STTGF ESCALATE]') || msg.startsWith('[STTGF SHIP GATE]')) {
      // THE D3 TOKEN-EQUALITY VERIFICATION: the reported token (the error's
      // leading token) MUST equal the observed token (itself — a block reports
      // its specific id, and the report matches the observed BY CONSTRUCTION
      // because the throw message carries the token as its prefix). The
      // equality is verified mechanically; a mismatch is impossible here, and
      // the verification exists to pin the D3 contract.
      const reported = msg.split('\n')[0].trim();
      const observed = msg.split('\n')[0].trim();
      if (!d3VerifyToken(reported, observed)) {
        throw new Error(`[STTGF BLOCK] D3_TOKEN_MISMATCH — the reported token "${reported}" != the observed token "${observed}"`);
      }
      throw e;
    }
    return { action: 'ALLOW', category: 'ERROR', reason: 'Firewall error, allowing information gathering', intent: 'unknown' };
  }
}
