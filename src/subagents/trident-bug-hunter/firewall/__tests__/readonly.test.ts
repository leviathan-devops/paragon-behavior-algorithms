/**
 * readonly.test.ts — THE BASH_LOCKDOWN PROOF-CASE BATTERY (W3)
 *
 * The L2 spec §6.2:2536-2607 transcribed: the proofCase array at 2545-2582 (the C10.6 cases
 * + the adversarial additions), the never-lets-a-blocked-command-reach-the-shell test at
 * 2598-2607, plus the adversarial extensions (the ANSI quotes, the tilde paths, the hash
 * comments, the continuation). A test that cannot fail is a defect — every case is asserted
 * against the EXACT expected verdict, family, and error message.
 */

import { describe, it, expect } from 'bun:test';
import { classify, enforceBashLockdown, READ_VERBS, EXECUTION_VERBS, MUTATION_VERBS } from '../readonly.js';
import { BASH_ERROR_MESSAGE } from '../lexicon-types.js';

const ERROR = BASH_ERROR_MESSAGE;

interface ProofCase {
  cmd: string;
  expected: 'ALLOW' | 'BLOCK';
  family?: string;
}

// THE PROOFCASE ARRAY — transcribed from the L2 spec §6.2:2545-2582 (the C10.6 battery).
const proofCases: ProofCase[] = [
  // THE ALLOW state (C10.6 — the single-command, no-metacharacter reads)
  { cmd: 'rg pattern src/', expected: 'ALLOW' },
  { cmd: 'cat file', expected: 'ALLOW' },
  { cmd: "sed -n '1,20p' file", expected: 'ALLOW' }, // the exact sed -n prefix (O14.2)
  { cmd: 'ls -la', expected: 'ALLOW' },
  { cmd: 'git status', expected: 'ALLOW' },
  { cmd: 'git diff', expected: 'ALLOW' }, // the read-only git verbs
  { cmd: 'git log --oneline --graph', expected: 'ALLOW' }, // the -- flags are tokens, not metacharacters
  // THE EXECUTION family (the FULL verb set)
  { cmd: 'node -e "x()"', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'bun -e "x"', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'python -c "print(1)"', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'npm run build', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'make', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'sh -c "ls"', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'tsc --noEmit', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  { cmd: 'opencode run', expected: 'BLOCK', family: 'BASH_EXECUTION' },
  // THE MUTATION family
  { cmd: 'touch file', expected: 'BLOCK', family: 'BASH_MUTATION' },
  { cmd: 'rm -rf src', expected: 'BLOCK', family: 'BASH_MUTATION' },
  { cmd: 'git commit -m x', expected: 'BLOCK', family: 'BASH_MUTATION' },
  { cmd: 'git checkout -f main', expected: 'BLOCK', family: 'BASH_MUTATION' },
  { cmd: "sed -i s/a/b/ file", expected: 'BLOCK', family: 'BASH_MUTATION' }, // sed NOT followed by -n
  // THE BYPASS family (ANY metacharacter, regardless of the verb)
  { cmd: 'cat file | grep x', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the pipe
  { cmd: 'echo hi > file', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the redirect
  { cmd: 'rg a; rg b', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the separator
  { cmd: 'ls $(pwd)', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the substitution
  { cmd: 'rg `pwd`', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the backtick
  { cmd: 'cat a && cat b', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the &&
  { cmd: 'cat a > /tmp/x < file', expected: 'BLOCK', family: 'BASH_BYPASS' },
  { cmd: 'ls *', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the glob
  // the adversarial additions (G22.2 — the hostile attempts)
  { cmd: 'rm \\\n -rf src', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the backslash-newline continuation
  { cmd: "printf '%s' x", expected: 'BLOCK', family: 'BASH_EXECUTION' }, // printf is not a read verb (fail-closed)
  { cmd: 'unknowncmd src', expected: 'BLOCK', family: 'BASH_UNKNOWN' }, // the fail-closed unknown verb (O14.2)
  // THE ADVERSARIAL EXTENSIONS (the anti-misfire + the smuggling vectors)
  { cmd: 'cat ~/.ssh/id_rsa', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the tilde expansion (O28.1: block)
  { cmd: 'rg "pattern" src/', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the quotes on a NON-sed verb (3205)
  { cmd: 'cat file # comment', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the hash comment-start
  { cmd: 'cat a && cat b && cat c', expected: 'BLOCK', family: 'BASH_BYPASS' }, // the && chain
  { cmd: 'echo hi', expected: 'ALLOW' }, // the bare-echo no-op edge case (§7.2:3170)
  { cmd: 'git log -1', expected: 'ALLOW' }, // the read-only git verb with a flag
  { cmd: 'git', expected: 'BLOCK', family: 'BASH_UNKNOWN' }, // 'git' alone is neither (3157)
  { cmd: 'git rebase main', expected: 'BLOCK', family: 'BASH_UNKNOWN' }, // the unrecognized git sub-verb (fail-closed)
  { cmd: 'sed s/a/b/ file', expected: 'BLOCK', family: 'BASH_MUTATION' }, // sed NOT -n (3168)
  { cmd: 'awk \'{print $1}\' file', expected: 'BLOCK', family: 'BASH_MUTATION' }, // awk always BLOCK (3168)
];

describe('BASH_LOCKDOWN_LEXICON', () => {
  it('classifies every proofCase -> the expected verdict', () => {
    for (const { cmd, expected, family } of proofCases) {
      const d = classify(cmd);
      if (expected === 'ALLOW') {
        expect(d.state).toBe('ALLOW_READ');
        expect(d.triplet.Pattern).toBe('BASH_READ');
        expect(d.triplet.Evidence).toContain(cmd); // the MPSE records the full command
        expect(d.message).toBe('');
      } else {
        expect(d.state).toBe('BLOCKED');
        expect(d.triplet.Pattern).toBe(family); // the named family
        expect(d.message).toBe(ERROR); // the EXACT error message (R3.3)
      }
    }
  });

  it('never lets a BLOCKED command reach the shell — the throw is pre-execution', () => {
    let executed = false;
    const shell = (_c: string) => { executed = true; };
    for (const { cmd, expected } of proofCases) {
      executed = false;
      try {
        if (classify(cmd).state === 'ALLOW_READ') shell(cmd);
      } catch (e: unknown) { console.warn('[readonly.test] classify threw for ' + cmd + ': ' + (e instanceof Error ? e.message : String(e))); }
      expect(executed).toBe(expected === 'ALLOW'); // BLOCKED -> the shell never saw the command
    }
  });

  it('the enforce hook THROWS the exact error on a BLOCKED command', () => {
    expect(() => enforceBashLockdown('rm -rf src')).toThrow(ERROR);
    expect(() => enforceBashLockdown('node -e "x()"')).toThrow(ERROR);
    expect(() => enforceBashLockdown('cat file | grep x')).toThrow(ERROR);
  });

  it('the enforce hook returns the decision on an ALLOWED command (the side effect precedes the claim)', () => {
    const d = enforceBashLockdown('rg pattern src/');
    expect(d.state).toBe('ALLOW_READ');
    expect(d.triplet.Pattern).toBe('BASH_READ');
  });

  it('the verb sets are the frozen spec sets (the closed-verb integrity)', () => {
    expect(READ_VERBS.has('rg')).toBe(true);
    expect(READ_VERBS.has('cat')).toBe(true);
    expect(EXECUTION_VERBS.has('node')).toBe(true);
    expect(EXECUTION_VERBS.has('python')).toBe(true);
    expect(EXECUTION_VERBS.has('tsc')).toBe(true);
    expect(MUTATION_VERBS.has('rm')).toBe(true);
    expect(MUTATION_VERBS.has('touch')).toBe(true);
    expect(MUTATION_VERBS.has('sed')).toBe(true);
    // the invariant: no verb is in BOTH a BLOCK family and the READ family
    for (const v of EXECUTION_VERBS) expect(READ_VERBS.has(v)).toBe(false);
    for (const v of MUTATION_VERBS) expect(READ_VERBS.has(v)).toBe(false);
  });

  it('the sed -n quoted-range carve-out is EXACT — only the range pattern passes', () => {
    expect(classify("sed -n '1,20p' file").state).toBe('ALLOW_READ');
    expect(classify('sed -n 1,20p file').state).toBe('ALLOW_READ'); // the unquoted range too
    expect(classify("sed -n '1,20p;2p' file").state).toBe('BLOCKED'); // the ; inside the range -> BYPASS
    expect(classify("sed -n 's/x/y/' file").state).toBe('BLOCKED'); // a substitution in the quote -> not a range
    expect(classify("sed -n '1p' file > out").state).toBe('BLOCKED'); // the redirect still dies
  });

  it('the newline continuation is scanned like any other metacharacter', () => {
    expect(classify('rm \\\n-rf src').state).toBe('BLOCKED');
    expect(classify('cat file\nrm -rf src').state).toBe('BLOCKED');
  });

  it('an empty command fails closed to BLOCKED (the fail-closed, no third state)', () => {
    expect(classify('').state).toBe('BLOCKED');
    expect(classify('   ').state).toBe('BLOCKED');
  });
});
