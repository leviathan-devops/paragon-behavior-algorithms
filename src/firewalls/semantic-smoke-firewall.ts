// SSTF v4 — SEMANTIC SMOKE TEST FIREWALL — CLAIM-GATED ENFORCEMENT
// "Block the CLAIM, not the WORK." Information gathering (read/grep on source)
// is ALWAYS allowed. Claims of correctness without container test evidence
// are BLOCKED (Phase A) or gated via output mutation (Phase B).
// REMOVED (the wave-line evidence-tracker — stripped 2026-08-15; the SSTF is DISABLED)

// ─── Types ───

export type FirewallAction = 'ALLOW' | 'BLOCK' | 'WARN';
export type IntentType =
  | 'operation'          // modification workflow (read/edit/write/build)
  | 'inspection'         // information gathering (grep/read for understanding)
  | 'claim_verification' // agent CLAIMS correctness (from its own messages)
  | 'smoke_verification' // direct smoke operation (hash/inline/headless/bundle-inspect)
  | 'unknown';
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
  verificationClaimed: boolean;
  claimTimestamp: number;
  lastClaimText: string;
  containerTestRan: boolean;
  containerTestTimestamp: number;
  lastBlockedCategory: string;
  blockCount: number;
}

export interface SSTFv4Config {
  enabled: boolean;
  blockOnClaimWithoutContainerTest: boolean;
  claimWindowMs: number;
  maxBlocksBeforeEscalate: number;
}

// ─── Context Window (populated from messages.transform hook) ───
// Global-backed storage — same dual-instance hazard as agent-state.
// globalThis guarantees ONE map across plugin instances and hot-reloads.

const gfw = globalThis as Record<string, unknown>;
if (!gfw.__sstfContextWindows) gfw.__sstfContextWindows = new Map<string, MessageEntry[]>();
const contextWindows = gfw.__sstfContextWindows as Map<string, MessageEntry[]>;
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

const CLAIM_WINDOW_MS = 300_000;       // how long a claim stays "fresh"
const MAX_BLOCKS_BEFORE_ESCALATE = 3;  // 3 consecutive smoke blocks → escalate

// ─── Intent Extraction (v4: action-derived, NOT user-word-derived) ───

export function extractIntent(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: VerificationSessionState | null,
): IntentType {
  const tool = (toolName || '').toLowerCase();

  // 1. Direct smoke operations are classified in classifyVerb; here we only
  //    mark the intent the TOOL itself implies.

  // 2. Grep/read/glob for gathering → 'inspection' (information gathering ALWAYS allowed)
  if (tool === 'grep' || tool === 'rg' || tool === 'ag' || tool === 'ack') return 'inspection';
  if (tool === 'read' || tool === 'glob' || tool === 'ls') return 'inspection';
  // 2b. Read-only trident tools are inspection too — never claim_verification.
  //     They query state; they don't present proof. (Bug: without this, a fresh
  //     claim + no container test misclassified them as claim_verification and
  //     BLOCKED legitimate status/help/gate/audit calls.)
  if (tool === 'trident-status' || tool === 'trident-help' || tool === 'trident-gate' ||
      tool === 'trident-code-audit' || tool === 'trident-preflight' ||
      tool === 'trident-context-synthesis' || tool === 'trident-omni-vision') return 'inspection';

  // 3. Edit/write/bash-build → 'operation'
  if (tool === 'edit' || tool === 'write' || tool === 'write_file' ||
      tool === 'patch' || tool === 'create' || tool === 'delete_file') return 'operation';
  if (tool === 'bash' || tool === 'terminal' || tool === 'exec' || tool === 'execute') return 'operation';
  // 3a. trident GENERATION/ORCHESTRATION tools are 'operation' too — they DO work,
  //     they don't present proof. Without this, a fresh claim + no container test
  //     misclassified them as claim_verification and BLOCKED legitimate
  //     deep-planning/poseidon/problem-solving/ship-package calls (the same class
  //     of bug as the read-only tools).
  if (tool === 'trident-deep-planning' || tool === 'trident-poseidon' ||
      tool === 'trident-problem-solving' || tool === 'trident-ship-package') return 'operation';
  // 3a2. GENERIC CATCH-ALL: any other trident-* tool is the plugin's own — it
  //      executes the agent's work, it never presents verification proof by
  //      itself. Classifying it 'operation' prevents claim-gate false blocks.
  //      (Claim gating of RESULTS still happens in Phase B via output mutation.)
  if (tool.indexOf('trident-') === 0) return 'operation';
  // 3a3. Common WORK tools (derailment fix): subagent dispatch, web research,
  //      hive queries and operator questions are legit build work — a pending
  //      claim must never block them (they are not verification presentations).
  if (tool === 'task' || tool === 'webfetch' || tool === 'question' ||
      tool === 'skill' || tool === 'checkpoint' || tool === 'todowrite' ||
      tool === 'memread_session' || tool === 'memlink_parent' || tool === 'build-status' ||
      tool === 'omni_vision' || tool === 'subagent_omni_vision' || tool === 'execute_omni_canvas' ||
      tool.indexOf('manta-') === 0 || tool.indexOf('shark-') === 0 ||
      tool.indexOf('ps-mode-') === 0 || tool.indexOf('tv-browser_') === 0 ||
      tool.indexOf('vc-fetch_') === 0 || tool.indexOf('zai-vision_') === 0 ||
      tool.indexOf('reasoning-bus_') === 0 || tool.indexOf('omni_canvas_') === 0 ||
      tool.indexOf('hive_') === 0) return 'operation';

  // 3b. trident-container-test is the ESCAPE HATCH — it must NEVER be classified
  //     claim_verification, or the claim gate deadlocks: the gate demands a
  //     container test but blocks the tool that provides the evidence.
  if (tool === 'trident-container-test') return 'operation';

  // 4. The agent's RECENT claim (from its own assistant messages) with no
  //    container test since → 'claim_verification'
  // DISABLED (pending 4.4.2 overhaul merge — the operator 2026-08-14: "disable
  // the verify inspect branch on sstf firewall"): the claim-verification branch
  // fired the [SSTF: CLAIM GATE] blocks on every verify/inspect action — the
  // gate deadlocked the legit container work (the evidence-gathering tools
  // misclassified as claims). The branch now degrades to 'operation' (the
  // container test path — never a claim block); the overhaul session restores
  // the refined gate.
  if (sessionState?.verificationClaimed &&
      !sessionState.containerTestRan &&
      Date.now() - sessionState.claimTimestamp < CLAIM_WINDOW_MS) {
    return 'operation';   // was 'claim_verification' — DISABLED pending 4.4.2
  }

  return 'unknown';
}

// ─── Verb Classification (extended to read/grep tools) ───

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

export function classifyVerb(toolName: string, args: Record<string, unknown>): string {
  const tool = (toolName || '').toLowerCase();

  // Tool-level verbs (covers non-bash tools)
  if (tool === 'grep' || tool === 'rg' || tool === 'ag' || tool === 'ack') {
    const path = extractPath(args);
    const target = classifyTarget(path);
    return target === 'bundle' ? 'inspect_bundle' : 'grep_source';
  }
  if (tool === 'read') {
    const path = extractPath(args);
    const target = classifyTarget(path);
    return target === 'bundle' ? 'inspect_bundle' : 'read_source';
  }
  if (tool === 'bash' || tool === 'terminal' || tool === 'execute' || tool === 'exec') {
    const cmd = extractCommand(args);
    if (!cmd) return 'other';
    if (/\bopencode[\s-]+run\b/i.test(cmd)) return 'headless';
    if (/\b(bun|npm|yarn|pnpm)\s+(build|run\s+build)\b/i.test(cmd) || /\btsc\b/i.test(cmd)) return 'build';
    if (/\b(sha256sum|md5sum|shasum)\b/i.test(cmd)) return 'hash';
    if (/\b(node|bun)[\\\s]+(?:-[ex]\b|--eval\b|--print\b|--evaluate\b)/i.test(cmd) || /\bnpx\s+-e\b/i.test(cmd)) return 'inline_exec';
    // PER-SUBCOMMAND evaluation (derailment fix): a head/grep in one subcommand
    // must NOT poison an unrelated bundle-path reference in another. Batched
    // build commands like "ls ... | head -10; wc -l .../forge-bundle.js" were
    // wrongly blocked as VERIFY_INSPECT — the smoke path is inspection OF the
    // bundle as verification, not any command string that mentions both words.
    const subcommands = cmd.split(/\s*(?:;|&&|\|\||\||\n)\s*/);
    for (const sub of subcommands) {
      // THE APPEND-CAT EXCLUSION (2026-08-09 — the operator's live catch: the
      // DEBUG_LOG heredoc-append "cat >> DEBUG_LOG_V3.md <<'EOF' ... bundle ..."
      // was misclassified as the bundle-inspection — the cat's READ-form only
      // inspects; the append/redirect form WRITES (the running-build-docs law's
      // legit append!). The negative lookahead excludes the redirect/pipe forms
      // from the inspect classification — a doc append mentioning the word
      // "bundle" is a WRITE, never an inspection.)
      if (/(sudo\s+)?(strings|sed|awk|head|tail|less|more|grep|rg|ack|ag)\b/i.test(sub) && /d[A-Z]st|bundle|\.min\.js/i.test(sub)) return 'inspect_bundle';
      if (/(sudo\s+)?cat\b(?!\s*(?:>>|>|\|))/i.test(sub) && /d[A-Z]st|bundle|\.min\.js/i.test(sub)) return 'inspect_bundle';
      if (/(sudo\s+)?(grep|rg|ack|ag)\b/i.test(sub)) return 'grep_source';
      if (/(sudo\s+)?(ls|stat|file|test\s+-[fd])\b/i.test(sub) && /d[A-Z]st|bundle|\.min\.js/i.test(sub)) return 'existence';
    }
    return 'other';
  }
  return 'other';
}

// ─── Target Classification ───

function classifyTarget(p: string): TargetType {
  if (!p) return 'unknown';
  const l = p.toLowerCase();
  if (/(^|[\/\\])d[A-Z]st([\/\\]|$)/i.test(l) || /\.min\.js$/i.test(l)) return 'bundle';
  if (/(^|[\/\\])src([\/\\]|$)/i.test(l) || (/\.(ts|tsx)$/i.test(l) && !/node_modules/i.test(l))) return 'source';
  return 'other';
}

// ─── Decision Matrix (v4: block the CLAIM, allow the WORK) ───

function decide(
  intent: IntentType,
  target: TargetType,
  verb: string | undefined,
  sessionState: VerificationSessionState | null,
): FirewallResult {
  // ── PHASE A: direct smoke operations (still block) ──
  if (verb === 'headless') {
    return { action: 'BLOCK', category: 'HEADLESS', reason: 'Headless exec forbidden. Use TUI.', intent, target };
  }
  if (verb === 'inline_exec') {
    return { action: 'BLOCK', category: 'INLINE_EXEC', reason: 'Inline exec is smoke test. Use container.', intent, target };
  }
  if (verb === 'hash' && intent === 'smoke_verification') {
    return { action: 'BLOCK', category: 'HASH_AS_PROOF', reason: 'Hash is not runtime proof. Container test required.', intent, target };
  }
  if (verb === 'inspect_bundle') {
    // Claim-gated (derailment fix): block ONLY when a verification claim is
    // pending without container evidence — the smoke PRESENTATION. Plain
    // bundle-path work during builds (wc/grep/ls on dist/bundle files as part
    // of a build) is ALLOWED: "Block the CLAIM, not the WORK." Verified live:
    // the FORGE build was derailed by unconditional VERIFY_INSPECT blocks on
    // commands that merely mentioned *-bundle.js / dist paths.
    const claimPending = !!sessionState && sessionState.verificationClaimed &&
      !sessionState.containerTestRan &&
      (Date.now() - sessionState.claimTimestamp) < CLAIM_WINDOW_MS;
    if (claimPending) {
      return { action: 'BLOCK', category: 'VERIFY_INSPECT', reason: 'You claimed correctness without container test evidence and then inspected the bundle — bundle inspection is not runtime proof. Use trident-container-test.', intent, target };
    }
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Bundle-path work (no verification claim pending)', intent, target };
  }
  if (verb === 'existence' && intent === 'smoke_verification') {
    return { action: 'BLOCK', category: 'VERIFY_EXIST', reason: 'Existence check is not runtime proof. Use container.', intent, target };
  }

  // ── PHASE A: INFORMATION GATHERING IS ALWAYS ALLOWED (v4 core change) ──
  if (intent === 'inspection' || intent === 'operation' || intent === 'unknown') {
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Information gathering / modification workflow', intent, target };
  }

  // ── claim_verification → ALLOW (misfire fix, round 2) ──
  // Phase A no longer hard-blocks claims: a pending claim must never derail
  // legitimate work (task dispatch, webfetch, hive, skill loads, plugin tools).
  // The gate is enforced by Phase B (tool.execute.after) which INJECTS the
  // [SSTF: CLAIM GATE] demand into tool outputs — the model sees it, the build
  // is not blocked. The escape hatch (trident-container-test) is 'operation'.
  if (intent === 'claim_verification') {
    return { action: 'ALLOW', category: 'CLAIM_GATED_PHASE_B', reason: 'Claim pending — Phase B demand injected on tool output (work not blocked)', intent, target };
  }

  return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Default allow', intent, target };
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
        verificationClaimed: false,
        claimTimestamp: 0,
        lastClaimText: '',
        containerTestRan: false,
        containerTestTimestamp: 0,
        lastBlockedCategory: '',
        blockCount: 0,
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
    // THE EVIDENCE-TRACKER STRIPPED (2026-08-15): the machine's evidence
    // record is gone — the projection derives from the tracker-local state
    // only (the SSTF is DISABLED; the 4.4.2 overhaul restores the refined gate).
    const claimEvent = local.lastClaimText ? { at: local.claimTimestamp } : undefined;
    return {
      ...local,
      codeChanged: local.codeChanged,
      verificationClaimed: local.verificationClaimed,
      claimTimestamp: local.claimTimestamp ?? 0,
      containerTestRan: local.containerTestRan,
      containerTestTimestamp: local.containerTestTimestamp ?? 0,
      lastClaimText: local.lastClaimText,
      lastBlockedCategory: local.lastBlockedCategory,
      blockCount: local.blockCount,
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
    const distSha = '';   // the evidence-tracker stripped (2026-08-15)
    const at = Date.now();
    if (v) {
      local.verificationClaimed = true;
      local.claimTimestamp = at;
      local.lastClaimText = claimText || '';
    } else {
      local.verificationClaimed = false;
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
    // THE EVIDENCE-TRACKER STRIPPED (2026-08-15): the container-evidence
    // machine is gone with the SSTF disable — the local flag records the run.
    const local = this.getLocal(sid);
    local.containerTestRan = true;
    local.containerTestTimestamp = Date.now();
  }

  // Phase B check: fresh claim without container evidence (the machine-backed —
  // the spec's C-1.6 :778-787, honoring the caller's window)
  hasClaimWithoutContainerTest(sid: string, windowMs: number): boolean {
    // THE EVIDENCE-TRACKER STRIPPED (2026-08-15): the claim derives from the
    // tracker-local state (the SSTF is DISABLED — the gate never consults this).
    const local = this.getLocal(sid);
    const claimEvent = local.lastClaimText ? { at: local.claimTimestamp ?? 0 } : undefined;
    if (!claimEvent) return false;
    if (Date.now() - claimEvent.at > windowMs) return false;
    return (local.containerTestTimestamp ?? 0) < claimEvent.at;
  }

  incrementBlockCount(sid: string): void {
    this.getLocal(sid).blockCount++;
  }
  getBlockCount(sid: string): number {
    return this.getLocal(sid).blockCount;
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

export const sstfStateTracker = new VerificationStateTracker();

// ─── API-compat shims (hooks import these) ───

export class ContextWindow {
  append(): void {}
  recent(): any[] { return []; }
  lastN(): any[] { return []; }
  clear(): void {}
}
export const sstfContextWindows = {
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

export interface SSTFTelemetry { totalChecks: number; totalBlocks: number; totalAllows: number; }
let TELEMETRY: SSTFTelemetry = { totalChecks: 0, totalBlocks: 0, totalAllows: 0 };
export function getSSTFTelemetry(): SSTFTelemetry { return { ...TELEMETRY }; }

// ─── Main Entry Point (rewired: intent from TOOL + AGENT CLAIMS) ───

export async function checkSmokeTestFirewall(params: {
  toolName: string; sessionId: string; agentName: string;
  agentMode?: string;
  mode: string; args: Record<string, unknown>; commandStr: string;
  signals?: unknown;
  verificationState?: unknown;
  contextWindow?: string;
}): Promise<FirewallResult> {
  // DISABLED (the operator 2026-08-15: "disable the sstf ... so it doesnt get
  // in the way of testing"): the ENTIRE SSTF enforcement is OFF — every call
  // resolves to the ALLOW result (the gate never fires, no claim blocks, no
  // verify/inspect blocks). The 4.4.2 overhaul session re-engineers the
  // refined gate. The evidence-tracker dependency below is dead while this
  // short-circuit is in place (the fold/removal follows).
  return { action: 'ALLOW', category: 'operation', intent: 'unknown', reason: 'DISABLED (the operator 2026-08-15 — pending the 4.4.2 overhaul)' };
  /* THE ORIGINAL BODY — COMMENT-BLOCKED with the disable (the unreachable-try
     TS quirk; the 4.4.2 overhaul session restores the refined gate):
  try {
    const tool = (params.toolName || '').toLowerCase();
    const sid = params.sessionId || 'default';
    const sessionState = sstfStateTracker.getState(sid);

    // v4: intent from TOOL + AGENT CLAIMS (never user chat words)
    const intent = extractIntent(tool, params.args, sessionState);
    const verb = classifyVerb(tool, params.args);
    const path = extractPath(params.args);
    const target = classifyTarget(path);

    // Diagnostic: write to hook debug file (static imports, no dynamic import)
    try {
      appendFileSync(join(tmpdir(), 'trident-hook-debug.log'),
        `[${Date.now()}] SSTF_DIAG: intent=${intent} verb=${verb || 'n/a'} target=${target} claim=${sessionState.verificationClaimed} ctRan=${sessionState.containerTestRan}\n`);
    } catch {}

    TELEMETRY.totalChecks++;
    const result = decide(intent, target, verb, sessionState);
    if (result.action === 'BLOCK') TELEMETRY.totalBlocks++;
    else TELEMETRY.totalAllows++;
    return result;
  } catch (e) {
    tridentLog('ERROR', 'sstf', `Error: ${e instanceof Error ? e.message : String(e)}`);
    return { action: 'ALLOW', category: 'ERROR', reason: 'Firewall error, allowing information gathering', intent: 'unknown' };
  }
  */  // the original body ends — END OF THE DISABLED BLOCK
}
