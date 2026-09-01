// match-check-tokens.test.ts — check source=exec token scan
// THE CONTRACT: action=check against last exec stdout (setup basic has no
// TUI pipe-pane). passToken must match in that buffer; failToken presence
// is a failHit. Empty exec buffer cannot stamp a PASS ledger row.

import { describe, it, expect } from 'bun:test';
import { matchCheckTokens } from '../container-test.ts';

describe('matchCheckTokens — exec-ledger source', () => {
  it('matches a passToken in last exec stdout (6/6 bun test)', () => {
    const buf = 'bun test v1.2\n 6 pass\n 0 fail\n';
    const r = matchCheckTokens(buf, ['6 pass'], { failToken: 'fail' });
    expect(r.passTokenMatch).toBe(true);
    expect(r.matches[0]?.pattern).toBe('6 pass');
    // failToken 'fail' also hits the '0 fail' line — caller must pick a
    // failToken that is NOT a substring of the pass evidence.
  });

  it('adversarial: failToken that is a substring of stdout is failHit', () => {
    const buf = '6 pass\n0 fail\n';
    const r = matchCheckTokens(buf, ['6 pass'], { failToken: '0 fail' });
    expect(r.passTokenMatch).toBe(true);
    expect(r.failHit).toBe(true);
  });

  it('adversarial: empty exec buffer cannot match a passToken', () => {
    const r = matchCheckTokens('', ['PLUGIN_ABSENT'], { failToken: 'OPENCODE' });
    expect(r.passTokenMatch).toBe(false);
    expect(r.matches.length).toBe(0);
    expect(r.failHit).toBe(false);
  });

  it('adversarial: missing passToken with failToken absent is not a match', () => {
    const buf = 'hello from fixture-basic-20260817\nPLUGIN_ABSENT\n';
    const r = matchCheckTokens(buf, ['NO_SUCH_TOKEN'], { failToken: 'TUI_UP' });
    expect(r.passTokenMatch).toBe(false);
    expect(r.failHit).toBe(false);
  });

  it('matches PLUGIN_ABSENT / NO_OPENCODE from a basic-setup exec', () => {
    const buf = 'ls /workspace\napp.ts\nPLUGIN_ABSENT=1\nNO_OPENCODE=1\n';
    const r = matchCheckTokens(buf, ['PLUGIN_ABSENT'], { failToken: 'plugin[]' });
    expect(r.passTokenMatch).toBe(true);
    expect(r.failHit).toBe(false);
    expect(r.matches[0]?.line).toContain('PLUGIN_ABSENT');
  });

  it('invalid regex falls back to indexOf (does not throw)', () => {
    const buf = 'literal (unclosed';
    const r = matchCheckTokens(buf, ['(unclosed'], { failToken: '[' });
    expect(r.passTokenMatch).toBe(true);
    expect(r.failHit).toBe(false);
  });

  it('combines stdout+stderr the same way check source=exec does', () => {
    const stdout = 'ok\n';
    const stderr = 'WARN: no TUI\n';
    const buf = stdout + '\n' + stderr;
    const r = matchCheckTokens(buf, ['WARN: no TUI'], { failToken: 'FATAL' });
    expect(r.passTokenMatch).toBe(true);
    expect(r.failHit).toBe(false);
  });

  // THE PASS-TOKEN→PATTERN BRIDGE (2026-08-18 — the live prove-out's
  // check-match bug): the check ACTION must pass the caller's passToken as
  // the matcher's pattern — the live container run recorded pattern:[null]
  // because the action read only params.pattern. The matcher itself is
  // correct (this battery); the action-level bridge (container-test.ts
  // check()) is the fix. The regression is proven at the container.
});
