/**
 * lsp-injector.test.ts — THE LOGIC-LSP INJECTOR BATTERY (W6, spec §6.6:2905-2946)
 *
 * The block format '[LOGIC-LSP] N diagnostic(s) in <file>:' + the per-line
 * severity/code/message/range; the injection on EVERY touching tool; the dedupe
 * (O32.2); the clear at the conformance zero (D25); the byte-cost < 500 (O32.3).
 */

import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DiagnosticsServer, inject, getSharedDiagnosticsServer, resolveDiagnosticsServer,
  resolveDiagnosticsServerForFile, resolveProjectRoot, getProjectDiagnosticsServer,
  type LogicDiagnostic,
} from '../lsp-injector.ts';
import { openStore } from '../../../../shared/knowledge-graph/db.ts';

const diag = (ruleId: string, message: string, line: number, severity: LogicDiagnostic['severity'] = 'CRIT'): LogicDiagnostic => ({
  ruleId, severity, message, line,
});

const d1 = diag('P6', 'price-anchored comparator', 1616);
const d2 = diag('P21', 'dayOpenSpot never advances', 1616, 'HIGH');
const d3 = diag('P8', 'SL ceiling drift', 200, 'WARN');

describe('THE LOGIC-LSP INJECTOR (C8)', () => {
  it('publishes the file-scoped diagnostics on a touched file — the block format matches C8.3', () => {
    const server = new DiagnosticsServer().withState({ 'src/mdve/shape-brain.ts': [d1] });
    const result = inject({ tool: 'read', args: { path: 'src/mdve/shape-brain.ts' }, output: '...' }, server);
    expect(result.output).toContain('[LOGIC-LSP] 1 diagnostic(s) in src/mdve/shape-brain.ts:');
    expect(result.output).toContain('error   P6  price-anchored comparator  :1616');
  });

  it('injects on EVERY touching tool — read/edit/write/bash/glob (the un-ignorable law)', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d1] });
    const cases: Array<[string, Record<string, unknown>]> = [
      ['read', { path: 'src/x.ts' }],
      ['edit', { filePath: 'src/x.ts' }],
      ['write', { targetPath: 'src/x.ts' }],
      ['bash', { command: 'rg thing src/x.ts' }],
      ['glob', { pattern: 'src/x*' }],
    ];
    for (const [tool, args] of cases) {
      const result = inject({ tool, args, output: '' }, server);
      expect(result.output).toContain('[LOGIC-LSP]');
    }
  });

  it('dedupes — a file+rule shown in the last 3 results collapses to a count line (O32.2)', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d1, d2, d3] });
    const r1 = inject({ tool: 'read', args: { path: 'src/x.ts' }, output: '' }, server);
    expect((r1.output.match(/error/g) ?? []).length).toBe(2); // the CRIT + HIGH lines (WARN → 'warn')
    const r2 = inject({ tool: 'read', args: { path: 'src/x.ts' }, output: '' }, server);
    expect(r2.output).toContain('(3 repeated)'); // the subsequent: collapsed
  });

  it('clears when the conformance verdicts reach zero (D25)', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d1] });
    server.onAuditDone({ conformanceZero: true });
    const result = inject({ tool: 'read', args: { path: 'src/x.ts' }, output: '...' }, server);
    expect(result.output).not.toContain('[LOGIC-LSP]'); // the highlight dies at the verified zero
  });

  it('stays under the byte-cost budget — < 500 chars on a 3-finding file (O32.3)', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d1, d2, d3] });
    const result = inject({ tool: 'read', args: { path: 'src/x.ts' }, output: '' }, server);
    expect(result.output.length < 500).toBe(true);
  });

  it('a clean file gets NO block — the empty state rides nothing', () => {
    const server = new DiagnosticsServer();
    const result = inject({ tool: 'read', args: { path: 'src/clean.ts' }, output: 'ok' }, server);
    expect(result.output).toBe('ok');
  });

  it('an unknown path arg does not crash — the output passes through', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d1] });
    const result = inject({ tool: 'weird', args: { something: 'else' }, output: 'out' }, server);
    expect(result.output).toBe('out');
  });

  it('the WARN severity maps to the warn prefix', () => {
    const server = new DiagnosticsServer().withState({ 'src/x.ts': [d3] });
    const result = inject({ tool: 'read', args: { path: 'src/x.ts' }, output: '' }, server);
    expect(result.output).toContain('warn   P8');
  });

  it('resolves the read tool\'s filePath arg (the opencode surface — the 2026-08-13 S5 runtime gap: args.path-only left the read results uninjected)', () => {
    const server = new DiagnosticsServer().withState({ 'src/engine.ts': [d1] });
    // the opencode read tool passes filePath, never path
    const result = inject({ tool: 'read', args: { filePath: 'src/engine.ts' }, output: '...' }, server);
    expect(result.output).toContain('[LOGIC-LSP] 1 diagnostic(s) in src/engine.ts:');
    expect(result.output).toContain('error   P6  price-anchored comparator  :1616');
  });
});

describe('THE SHARED SERVER SINGLETON (the 2026-08-13 S5 runtime gap — the hunt and the injector must share ONE state)', () => {
  it('resolveDiagnosticsServer without an explicit server + without a file returns THE SAME instance across calls', () => {
    const a = resolveDiagnosticsServer(undefined, null);
    const b = resolveDiagnosticsServer(undefined, null);
    expect(a).toBe(b);                    // the SAME object — the hunt's refresh reaches the injector
    expect(getSharedDiagnosticsServer()).toBe(a);
  });

  it('an explicit server still wins (the test isolation path)', () => {
    const mine = new DiagnosticsServer();
    const resolved = resolveDiagnosticsServer(mine, null);
    expect(resolved).toBe(mine);
  });

  it('the shared server carries the injected state across tool calls (the runtime flow: hunt refreshes → read injects)', () => {
    const server = getSharedDiagnosticsServer();
    server.withState({ 'src/engine.ts': [d1] });
    const result = inject({ tool: 'read', args: { path: 'src/engine.ts' }, output: '' }, server);
    expect(result.output).toContain('[LOGIC-LSP] 1 diagnostic(s) in src/engine.ts:');
  });
});

describe('THE ONE-SHARED-LSP-PER-PROJECT LAW (2026-08-13 — the operator: "ONE SHARED LSP PER PROJECT that all agent sessions connect to")', () => {
  it('resolveProjectRoot walks UP from a touched file to the project .trident marker', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lsp-proj-'));
    fs.mkdirSync(path.join(root, '.trident', 'knowledge-graph'), { recursive: true });
    fs.writeFileSync(path.join(root, '.trident', 'knowledge-graph', 'shared.db'), '');
    const touched = path.join(root, 'src', 'engine.ts');
    expect(resolveProjectRoot(touched)).toBe(root);
    // a file OUTSIDE the project → null (no per-project LSP)
    expect(resolveProjectRoot(path.join(os.tmpdir(), 'unrelated', 'file.ts'))).toBe(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolveDiagnosticsServerForFile returns THE SAME per-project server for files in the SAME project', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lsp-proj2-'));
    fs.mkdirSync(path.join(root, '.trident', 'knowledge-graph'), { recursive: true });
    fs.writeFileSync(path.join(root, '.trident', 'knowledge-graph', 'shared.db'), '');
    const a = resolveDiagnosticsServerForFile(path.join(root, 'src', 'a.ts'));
    const b = resolveDiagnosticsServerForFile(path.join(root, 'src', 'b.ts'));
    expect(a).toBe(b);                    // ONE server per project — every session connects to the SAME state
    expect(getProjectDiagnosticsServer(root)).toBe(a);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the DB-BACKED read: the server bound to the shared.db reads the LATEST run\'s VIOLATION findings (the cross-session truth)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-lsp-db-'));
    fs.mkdirSync(path.join(root, '.trident', 'knowledge-graph'), { recursive: true });
    const dbPath = path.join(root, '.trident', 'knowledge-graph', 'shared.db');
    const db = openStore(dbPath);
    const file = path.join(root, 'src', 'engine.ts');
    db.appendFinding({
      ruleId: 'domain.numeric-threshold:fd868a9958b9', severity: 'HIGH', file,
      line: 3, evidence: 'selectZone.comparator = 101.296 violates the declared gt 1 ceiling',
      verdict: 'VIOLATION',
    }, 'fixture-profile-hunt-20260813-1');
    db.appendEvent('HUNT_DONE', { runId: 'fixture-profile-hunt-20260813-1', findingsCount: 1 });
    const server = new DiagnosticsServer().bindDb(db);
    const diags = server.diagnosticsFor(file);
    expect(diags.length).toBe(1);
    expect(diags[0].ruleId).toBe('domain.numeric-threshold:fd868a9958b9');
    // the D25 clear: the AUDIT_DONE with conformanceZero:true empties the highlight (cross-session)
    db.appendEvent('AUDIT_DONE', { runId: 'fixture-profile-hunt-20260813-1', verdicts: [], conformanceZero: true });
    expect(server.diagnosticsFor(file).length).toBe(0);
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
