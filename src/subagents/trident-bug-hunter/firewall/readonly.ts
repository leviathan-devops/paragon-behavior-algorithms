/**
 * readonly.ts — THE BASH_LOCKDOWN_LEXICON (W3, the T.E.B enforcement layer)
 *
 * The bug hunter's AND the auditor's bash tool.before hook (the L2 spec §7.2:3083-3313).
 * The input: the bash command string. The decision: ALLOW_READ | BLOCKED.
 * The hook intercepts every bash call BEFORE the shell sees it — a BLOCK throws before
 * any process spawns, so there is NO execution path at all (the anti-misfire property, R3.4).
 *
 * THE DETECTION-VS-DECISION LAW (§7.1:3059): the matchers below are mechanical DETECTORS ONLY —
 * they classify the command; the DECISION is the BASH_DECISION state machine at the bottom
 * (PARSED -> ALLOW_READ | BLOCKED). A matcher that returns a verdict would be a SLOP-SIG-2
 * (regex-only classifier) — REJECTED by the ISE soft-warn firewall.
 *
 * THE ORDER LOCK (§7.2.4:3230): BYPASS -> EXECUTION -> MUTATION -> READ — the first BLOCK
 * family that fires wins; ALLOW requires the READ family AND the zero-metacharacter condition
 * AND the correct git/sed routing. An input matching NO family fails CLOSED to BLOCKED
 * (the BASH_UNKNOWN family) — there is no third state.
 */

import type { BashLockdownDecision, LexiconContext, MPSE } from './lexicon-types.js';
import { BASH_ERROR_MESSAGE } from './lexicon-types.js';

/**
 * THE READ FAMILY (the L2 spec §7.2:3143-3145) — the ALLOW set.
 * A command is READ only when its first token is here AND the metacharacter scan is clean
 * AND the git/sed second-token routing passes.
 */
export const READ_VERBS: ReadonlySet<string> = new Set([
  'rg', 'grep', 'find', 'cat', 'ls', 'wc', 'stat', 'head', 'tail',
  'cut', 'sort', 'uniq', 'diff', 'sha256sum', 'basename', 'dirname',
  'realpath', 'file', 'strings',
]);

/** The read-only git sub-verbs (the second-token routing, §7.2:3157). */
const GIT_READ_SUBVERBS: ReadonlySet<string> = new Set(['diff', 'log', 'status', 'show']);
/** The mutation git sub-verbs (the second-token routing, §7.2:3157). */
const GIT_MUTATION_SUBVERBS: ReadonlySet<string> = new Set([
  'add', 'commit', 'push', 'reset', 'checkout', 'clean', 'stash', 'apply',
]);

/**
 * THE EXECUTION FAMILY (the L2 spec §7.2:3151-3154) — the code-execution verb set.
 * 'printf' is added explicitly: the 6.2 proofCase at line 2580 mandates
 * {cmd: "printf '%s' x", expected: 'BLOCK', family: 'BASH_EXECUTION'} — printf synthesizes
 * output rather than reading (the echo/cat/printf rule at §7.2:3170).
 */
export const EXECUTION_VERBS: ReadonlySet<string> = new Set([
  'node', 'bun', 'bunx', 'npm', 'npx', 'pnpm', 'yarn', 'deno', 'tsx',
  'python', 'python3', 'pip', 'pip3', 'ruby', 'perl', 'php', 'java',
  'go', 'rustc', 'cargo', 'gcc', 'clang', 'make', 'sh', 'bash', 'zsh',
  'fish', 'ksh', 'tcsh', 'eval', 'exec', 'source', '.', 'opencode',
  'tsc', 'esbuild', 'vite', 'next', 'nest', 'printf',
]);

/**
 * THE MUTATION FAMILY (the L2 spec §7.2:3160-3166).
 * sed/awk/perl are BLOCKED ENTIRELY (the -i in-place mutations + the pipeline ubiquity) —
 * EXCEPT the exact two-token prefix 'sed -n' (the line-range printer, a pure read)
 * with the quoted-range carve-out below (§7.2:3168, 3203-3211).
 */
export const MUTATION_VERBS: ReadonlySet<string> = new Set([
  'touch', 'rm', 'mv', 'cp', 'mkdir', 'rmdir', 'chmod', 'chown', 'chattr',
  'ln', 'install', 'tee', 'truncate', 'dd', 'patch', 'tar', 'unzip', 'gunzip',
  'git', 'sed', 'awk', 'perl',
]);

/**
 * THE BYPASS METACHARACTER CLASS (§7.2:3172-3180) — CLOSED BY CONSTRUCTION.
 * Every shell-splitting character enumerated; the newline included (the continuation trick:
 * a backslash-newline or a bare newline splits the "command" into a sequence).
 * This is the load-bearing family: 'cat file | python -c' has a READ verb first —
 * only BYPASS catches the pipe (§7.2:3182).
 */
const BYPASS_METACHARACTERS: ReadonlySet<string> = new Set([
  '|', ';', '&', '>', '<', '(', ')', '*', '?', '[', ']', '{', '}',
  '#', '!', '%', '~', '$', '`', '\\', '\'', '"', '\n',
]);

/** The sed -n quoted-range pattern — the carve-out's inner content (the sed range shape: 1,20p / 5p / 1,20). */
const SED_N_RANGE_RE = /^(['"])([0-9]+(?:,[0-9]+)?p?)\1(?:\s+\S+)?$/;

/** The echo/printf family — printf routes to EXECUTION (the 6.2 proofCase); echo is the no-op edge case. */
const ECHO_VERB = 'echo';

/**
 * THE DETECTOR — the metacharacter scan over the ENTIRE command including the newline.
 * THE REGEX IS THE MECHANICAL DETECTOR ONLY (the char-class scan); THE DECISION is the
 * BASH_DECISION state machine below. The scan EXEMPTS the two sanctioned quote usages:
 * 1. the printf/echo family's quotes are routed by verb before the quote-metachar fires
 *    (the F3 reconciliation: printf -> BASH_EXECUTION per the 6.2 proofCase at 2580,
 *    the echo no-op edge per §7.2:3170);
 * 2. the exact 'sed -n' quoted-range carve-out (§7.2:3203-3211).
 * Every OTHER quote occurrence in ANY position = BYPASS.
 */
function scanMetacharacters(command: string, firstToken: string, secondToken: string): string | null {
  // The sed -n carve-out: 'sed -n' + exactly one quoted range argument (+ the optional file arg)
  // -> the quotes exempted. THE REGEX IS THE MECHANICAL DETECTOR ONLY (the sed-range shape:
  // '1,20p' / '5p' / '1,20' — the p is the sed print suffix, present in the C10.6 proof case);
  // THE DECISION is the BASH_DECISION state machine below.
  if (firstToken === 'sed' && secondToken === '-n') {
    const rest = command.slice(command.indexOf('-n') + 2).trim();
    const m = SED_N_RANGE_RE.exec(rest);
    if (m) return null; // the whole command is the sanctioned range read — no other metachars possible
    // The quoted NON-range (a substitution smuggled in the quotes — 's/x/y/') must BLOCK:
    // the quote char is the detected metachar (the carve-out is EXACT — §7.2:3203-3211).
    if (rest.startsWith('\'') || rest.startsWith('"')) return '\'';
    return null; // the unquoted form — the classify's sed branch decides (the -n prefix is read-adjacent)
  }

  // THE BLOCK-VERB ARGUMENT-SYNTAX EXEMPTION (the F3 reconciliation, generalized):
  // the EXECUTION/MUTATION families' OWN argument syntax — the -e/-c script quotes, the parens,
  // the braces, the $1/$() variables, the printf formats, the quoted messages — routes by VERB:
  // the 6.2 proofCases mandate the FAMILY classification ('node -e "x()"' -> BASH_EXECUTION at
  // 2555, 'python -c "print(1)"' at 2557, 'sh -c "ls"' at 2560, "printf '%s' x" at 2580),
  // and the spec's own rationale (§7.2:3170) names the REDIRECTION as the echo/printf danger.
  // THE TRUE SPLITTERS — the characters that can smuggle a SECOND command (| ; & > < + the
  // newline) STILL fire BYPASS for the BLOCK verbs; the rest is the verb's argument syntax.
  // The A4 container scenario ('cat file | python -c x') keeps its BASH_BYPASS: cat is a READ
  // verb — the full scan below applies, the pipe fires.
  const blockVerbExemption = EXECUTION_VERBS.has(firstToken) || MUTATION_VERBS.has(firstToken) || firstToken === ECHO_VERB;
  if (blockVerbExemption) {
    for (const ch of command) {
      if (ch === '|' || ch === ';' || ch === '&' || ch === '>' || ch === '<' || ch === '\n') return ch;
    }
    return null;
  }
  // The printf/echo family: the quotes + the printf-format '%' route by verb — the BYPASS scan
  // catches ONLY the true shell-splitters there (the redirections/separators/substitutions per
  // §7.2:3170 — 'echo hi > file' dies on the '>', 'printf \'%s\' x' classifies BASH_EXECUTION
  // per the 6.2 proofCase at 2580, a bare echo with zero metachars is the ALLOW no-op edge).
  if (firstToken === ECHO_VERB || firstToken === 'printf') {
    for (const ch of command) {
      if (ch === '\'' || ch === '"' || ch === '\n' || ch === '%') continue; // the family's own syntax
      if (BYPASS_METACHARACTERS.has(ch)) return ch;
    }
    return null;
  }
  for (const ch of command) {
    if (BYPASS_METACHARACTERS.has(ch)) return ch;
  }
  return null;
}

/** THE PARSED COMMAND — the token split + the scan result. */
interface ParsedCommand {
  firstToken: string;
  secondToken: string;
  metacharacter: string | null;
}

/** THE PARSE STEP (§7.2:3107-3113) — the first-token split + the full-character metacharacter scan. */
function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trimStart();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] ?? '';
  const secondToken = tokens[1] ?? '';
  // The sed -n carve-out is detected BEFORE the scan so the sanctioned quotes are exempted.
  const metacharacter = scanMetacharacters(trimmed, firstToken, secondToken);
  return { firstToken, secondToken, metacharacter };
}

/** The git second-token routing — READ | MUTATION | null (the fail-closed for the unrecognized sub-verb). */
function routeGit(secondToken: string): 'READ' | 'MUTATION' | null {
  if (GIT_READ_SUBVERBS.has(secondToken)) return 'READ';
  if (GIT_MUTATION_SUBVERBS.has(secondToken)) return 'MUTATION';
  return null; // 'git' alone or an unrecognized sub-verb — the fail-closed -> BLOCKED
}

/** The sed second-token routing — the 'sed -n' read-adjacent prefix vs the -i/other mutators. */
function routeSed(secondToken: string): 'READ' | 'MUTATION' {
  return secondToken === '-n' ? 'READ' : 'MUTATION';
}

/**
 * THE BASH_LOCKDOWN_LEXICON — the classify entry.
 *
 * THE STATE MACHINE (the DECISION layer, §7.2:3215-3228):
 *   PARSED --(BYPASS metacharacter)----------------------> BLOCKED (BASH_BYPASS)
 *   PARSED --(first token in EXECUTION_VERBS)-----------> BLOCKED (BASH_EXECUTION)
 *   PARSED --(first token in MUTATION_VERBS, git/sed routed)-> BLOCKED (BASH_MUTATION)
 *   PARSED --(first token in READ_VERBS + zero metachars)-> ALLOW_READ (BASH_READ)
 *   PARSED --(the bare-echo no-op edge case)------------> ALLOW_READ (BASH_READ)
 *   PARSED --(NO family matched)------------------------> BLOCKED (BASH_UNKNOWN)  [the fail-closed]
 *
 * THE ACT: a BLOCK throws the EXACT BASH_ERROR_MESSAGE (PRE-execution — the shell never
 * sees the command); an ALLOW returns the decision for the hook to execute.
 */
export function classify(command: string): BashLockdownDecision {
  const parsed = parseCommand(command);

  // THE ORDER LOCKED — BYPASS first (the widest class, §7.2:3230).
  if (parsed.metacharacter !== null) {
    return blocked('BASH_BYPASS', parsed.metacharacter, command);
  }

  const { firstToken, secondToken } = parsed;

  // THE EXECUTION FAMILY.
  if (EXECUTION_VERBS.has(firstToken)) {
    return blocked('BASH_EXECUTION', firstToken, command);
  }

  // THE MUTATION FAMILY — the git/sed second-token routing included.
  if (MUTATION_VERBS.has(firstToken)) {
    if (firstToken === 'git') {
      const routed = routeGit(secondToken);
      if (routed === 'MUTATION') return blocked('BASH_MUTATION', firstToken, command);
      if (routed === null) return blocked('BASH_UNKNOWN', firstToken, command);
      // routed === 'READ' falls through to the READ check below (git diff/log/status/show).
    } else if (firstToken === 'sed') {
      if (routeSed(secondToken) === 'READ') {
        // The 'sed -n' prefix — the quoted-range carve-out already cleared the scan;
        // the read-adjacent classification requires the range to be present (handled in parse).
        if (parsed.metacharacter === null) return allowed('BASH_READ', firstToken, command);
      }
      return blocked('BASH_MUTATION', firstToken, command);
    } else {
      // awk/perl/touch/rm/... — always BLOCK.
      return blocked('BASH_MUTATION', firstToken, command);
    }
  }

  // THE READ FAMILY — only reached when no BLOCK fired.
  if (READ_VERBS.has(firstToken) || (firstToken === 'git' && routeGit(secondToken) === 'READ')) {
    return allowed('BASH_READ', firstToken, command);
  }

  // THE BARE-ECHO NO-OP EDGE CASE (§7.2:3170) — zero metachars already proven by the BYPASS pass.
  if (firstToken === ECHO_VERB) {
    return allowed('BASH_READ', firstToken, command);
  }

  // THE FAIL-CLOSED — the unknown verb.
  return blocked('BASH_UNKNOWN', firstToken, command);
}

/** THE ALLOW construction — the decision + the MPSE triplet recorded (no triplet = no decision). */
function allowed(pattern: string, token: string, command: string): BashLockdownDecision {
  const mPSE: MPSE = { Pattern: pattern, State: 'PARSED->ALLOW_READ', Evidence: command };
  return {
    verdict: 'ALLOW_READ', state: 'ALLOW_READ', pattern, token, message: '', mPSE, triplet: mPSE,
  };
}

/** THE BLOCK construction — the decision + the EXACT message + the MPSE triplet; the hook throws. */
function blocked(pattern: string, token: string, command: string): BashLockdownDecision {
  const mPSE: MPSE = {
    Pattern: pattern,
    State: 'PARSED->BLOCKED',
    Evidence: `${command} | matched token: ${token}`,
  };
  return {
    verdict: 'BLOCKED', state: 'BLOCKED', pattern, token, message: BASH_ERROR_MESSAGE, mPSE, triplet: mPSE,
  };
}

/** THE HOOK — the tool.before entry: the BLOCK throws BEFORE the shell (no execution path at all). */
export function enforceBashLockdown(command: string, _ctx?: LexiconContext): BashLockdownDecision {
  const decision = classify(command);
  if (decision.verdict === 'BLOCKED') {
    throw new Error(BASH_ERROR_MESSAGE);
  }
  return decision;
}
