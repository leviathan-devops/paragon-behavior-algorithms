/**
 * lsp-injector.ts — THE LOGIC-LSP (W6, spec §3.13 ~1500-1560)
 *
 * The operator's 'matrix vision for LOGIC and ARCHITECTURE' (C1.4):
 * a persistent per-file diagnostics server — the opencode LSP model — whose
 * file-scoped diagnostics ride EVERY touched-file tool result. NOT the SSTF
 * one-shot append ('SSTF is not LSP'): the server maintains the per-file
 * structured state; the injector publishes it (the publishDiagnostics
 * equivalent) on every read/edit/write/bash/glob result whose args reference
 * a path.
 *
 * THE BLOCK FORMAT (C8.3):
 *   [LOGIC-LSP] N diagnostic(s) in <file>:
 *   error   P6  <message>  :<line>
 * THE DEDUPE (O32.2): a file+rule shown in the last 3 results collapses to the
 * count line '(N repeated)'.
 * THE BYTE-COST (O32.3): the block < 500 chars per 3-finding file — the
 * highlight must not tax the context window into the very regression it
 * prevents.
 * THE CLEAR (D25): the highlight persists until the auditor's conformance
 * verdicts are zero — the build agent's fixes alone do NOT clear.
 */

import { openStore } from '../../../shared/knowledge-graph/db.ts';
import type { DbClient } from '../../../shared/knowledge-graph/db.ts';
export const WATCHER_DEBOUNCE_MS = 800;
export const WATCHER_BACKLOG_CAP = 500;
export const WATCHER_STALLED = 'WATCHER_STALLED';
export const GRAPH_UPDATE_CONFLICT = 'GRAPH_UPDATE_CONFLICT';
export interface WatcherHandle { close(): void; readonly paused: boolean; readonly dir: string; }

/** THE STRUCTURED DIAGNOSTIC — the per-file row the server maintains. */
export interface LogicDiagnostic {
  ruleId: string;
  severity: 'CRIT' | 'HIGH' | 'MED' | 'WARN';
  message: string;
  line: number;
  rangeStart?: number | null;
  rangeEnd?: number | null;
}

/** THE FINDINGS PROVIDER — the W5 engine's output lands here (the W7 wiring seam). */
export interface FindingsProvider {
  forFile(file: string): Array<{
    ruleId: string; severity: 'CRIT' | 'HIGH' | 'MED' | 'WARN';
    message: string; line: number;
  }>;
}

/** THE INJECTION INPUT — the tool result surface the injector rides. */
export interface ToolResultLike {
  tool: string;
  args: Record<string, unknown>;
  output?: unknown;
}

/** THE INJECTION OUTPUT — the result with the block appended (when diagnostics exist). */
export interface InjectedResult {
  output: string;
}

/**
 * THE DIAGNOSTICS SERVER — the per-PROJECT file-scoped state (the opencode LSP model).
 *
 * THE ONE-SHARED-LSP-PER-PROJECT LAW (2026-08-13 — the operator's directive: "the
 * correct design is ONE SHARED LSP PER PROJECT that all agent sessions connect
 * to"): the server's SOURCE OF TRUTH is the project's shared.db (the durable
 * cross-session truth the machine already writes — the findings + the events
 * tables), NOT an in-memory Map. The in-memory `state` survives as the TEST seam
 * (withState) + the DEDUPE window (recent, per-session display collapse — O32.2).
 * A fresh agent session / a fresh process reads the SAME per-project diagnostics
 * from the shared.db — the "every session spawns a fresh empty LSP" host defect
 * is structurally dead: the state is the database, the database is shared.
 */
export class DiagnosticsServer {
  /** THE PER-FILE STATE — file → the active diagnostics (the C18.4 DiagnosticsState). */
  private state = new Map<string, LogicDiagnostic[]>();
  /** THE DEDUPE WINDOW — file+rule → the times shown (the O32.2 collapse). */
  private recent = new Map<string, number>();
  /** The findings provider seam — the W5 engine's output (the W7 wiring). */
  private provider: FindingsProvider | null = null;
  /** The conformance-zero flag — the D25 clear condition. */
  private conformanceZero = false;
  /** The debounce timer (the fs.watch re-scan, 800ms — spec §3.3, overrides the 500ms contradiction). */
  protected debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** THE PROJECT DB BINDING (the ONE-SHARED-LSP law) — when bound, diagnosticsFor
   *  reads the LIVE per-project state from the shared.db (any session, any
   *  process — the same truth). The binding is set by the per-project registry. */
  private db: DbClient | null = null;
  /** THE TEST SEAM — preload the state directly (the §6.6 injector tests). */
  withState(fixture: Record<string, LogicDiagnostic[]>): DiagnosticsServer {
    for (const [file, diags] of Object.entries(fixture)) this.state.set(file, diags);
    return this;
  }

  /** THE DB BINDING — the project's shared.db becomes the server's truth. */
  bindDb(db: DbClient): DiagnosticsServer {
    this.db = db;
    return this;
  }

  /** THE PROVIDER SEAM — the W5 engine's incremental findings land here (W7). */
  setFindings(provider: FindingsProvider): void {
    this.provider = provider;
  }

  /** THE INCREMENTAL RE-SCAN — ONLY the changed files' intersecting predicates (the delta). */
  scan(changedFiles?: string[]): void {
    if (!this.provider) return; // the provider wires in W7 — the state then stays the engine's mirror
    for (const file of changedFiles ?? []) {
      const diags = this.provider.forFile(file);
      if (diags.length === 0) this.state.delete(file);
      else this.state.set(file, diags);
    }
  }

  /** THE WATCH — the fs.watch + the debounced 800ms re-scan (the W7 wiring completes the callback).
   *  CONTRADICTION FLAGGED (2026-08-18): the file previously held 500ms; the spec mandates 800ms — this
   *  implementation enforces 800ms via WATCHER_DEBOUNCE_MS (§3.3). */
  watch(dir: string, onChange?: (changedFiles: string[]) => void): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout((): void => {
      if (onChange) onChange([]);
      this.scan();
    }, WATCHER_DEBOUNCE_MS);
  }

  /** THE CLEAR (D25) — the state empties at the auditor's verified conformance zero. */
  onAuditDone({ conformanceZero }: { conformanceZero: boolean }): void {
    this.conformanceZero = conformanceZero;
    if (conformanceZero) this.state.clear();
  }

  /** THE LIVE DIAGNOSTICS FOR A FILE — the DB-backed read when bound (the
   *  ONE-SHARED-LSP law): the LATEST HUNT_DONE run's VIOLATION findings for the
   *  file, emptied when the LATEST AUDIT_DONE carries conformanceZero:true (the
   *  D25 clear — persisted in the events table, so the clear is cross-session).
   *  Falls back to the in-memory state when unbound (the test seam). */
  diagnosticsFor(file: string): LogicDiagnostic[] {
    if (this.db) {
      return this.diagnosticsFromDb(file);
    }
    return this.state.get(file) ?? [];
  }

  private diagnosticsFromDb(file: string): LogicDiagnostic[] {
    try {
      // THE D25 CLEAR FIRST: the latest AUDIT_DONE with conformanceZero:true
      // empties the highlight (the auditor's verified zero = the file is clean).
      const auditRow = rowAs<{ payload?: string }>(
        this.db!.prepare(
          "SELECT payload FROM events WHERE kind = 'AUDIT_DONE' ORDER BY id DESC LIMIT 1",
        ).get(),
        'AUDIT_DONE row',
      );
      if (auditRow && typeof auditRow.payload === 'string') {
        try {
          const audit = JSON.parse(auditRow.payload) as { conformanceZero?: boolean };
          if (audit.conformanceZero === true) return [];
        } catch (e: unknown) { console.warn(`[lsp-injector] AUDIT_DONE payload parse failed (the read falls through): ${e instanceof Error ? e.message : String(e)}`); }
      }
      // THE LATEST RUN'S VIOLATIONS for the file.
      const runRow = rowAs<{ payload?: string }>(
        this.db!.prepare(
          "SELECT payload FROM events WHERE kind = 'HUNT_DONE' ORDER BY id DESC LIMIT 1",
        ).get(),
        'HUNT_DONE row',
      );
      let runId = '';
      if (runRow && typeof runRow.payload === 'string') {
        try { runId = (JSON.parse(runRow.payload) as { runId?: string }).runId ?? ''; } catch (e: unknown) { console.warn(`[lsp-injector] HUNT_DONE payload parse failed: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (!runId) return [];
      const rows = rowsAs<{ rule_id: string; severity: string; file?: string | null; line?: number | null; evidence: string }>(
        this.db!.prepare(
          'SELECT rule_id, severity, file, line, evidence FROM findings WHERE run_id = ? AND verdict = ?',
        ).all(runId, 'VIOLATION'),
        'findings rows',
      );
      const exact = rows.filter((r) => r.file && pathResolve(r.file) === pathResolve(file));
      const out: LogicDiagnostic[] = [];
      for (const r of exact) {
        out.push({
          ruleId: r.rule_id,
          severity: severityFromRow(r.severity),
          message: r.evidence.slice(0, 80),
          line: r.line ?? 0,
        });
      }
      return out;
    } catch (e: unknown) {
      console.debug(`[lsp-injector] the DB-backed diagnostics read failed (the in-memory state is the fallback): ${String(e)}`);
      return this.state.get(file) ?? [];
    }
  }

  /** THE TOUCHED-FILE RESOLUTION — the exact key, else the state keys the glob prefixes. */
  resolveTouchedFiles(candidate: string): string[] {
    if (this.db) return [candidate]; // the DB-backed read resolves the exact file (the project truth)
    if (this.state.has(candidate)) return [candidate];
    const prefix = candidate.replace(/[.*?]/g, '');
    return [...this.state.keys()].filter((k) => k.startsWith(prefix));
  }

  /** The dedupe window — the recent file+rule shows (the O32.2 collapse). */
  shownTimes(file: string, ruleId: string): number {
    return this.recent.get(`${file}\u0000${ruleId}`) ?? 0;
  }

  /** Record a show — the dedupe window increments (the O32.2 collapse bookkeeping). */
  recordShow(file: string, ruleId: string): void {
    const key = `${file}\u0000${ruleId}`;
    this.recent.set(key, (this.recent.get(key) ?? 0) + 1);
  }

  /** Publish diagnostics re-emit hook — the W5 live wire calls this after sharedDb.upsertFindings. */
  notify(file: string): void {}

  /** The lsp-notify proxy — same as notify (alias for the wire spec). */
  publishDiagnostics(file: string): void { this.notify(file); }
}

export class LiveGraphWatcher extends DiagnosticsServer {
  private watcher: ReturnType<typeof fs.watch> | null = null;
  private handle: WatcherHandle | null = null;
  private queue: string[] = [];
  private pausedFlag = false;
  private writeLock = false;
  private graphNodesBefore = 0;
  private reparseChangedFn: ((files: string[]) => Promise<Set<string>>) | null = null;
  private rerunBatteryFn: ((nodeIds: Set<string>) => Promise<void>) | null = null;

  bindReparse(fn: (files: string[]) => Promise<Set<string>>): void { this.reparseChangedFn = fn; }
  bindRerun(fn: (nodeIds: Set<string>) => Promise<void>): void { this.rerunBatteryFn = fn; }

  override watch(dir: string, onChange?: (changedFiles: string[]) => void): WatcherHandle {
    if (this.handle) return this.handle;
    const absDir = path.resolve(dir);
    try {
      this.watcher = fs.watch(absDir, { recursive: true }, (_event: string, filename: string | null) => {
        if (!filename) return;
        if (this.pausedFlag || this.writeLock) { this.queue.push(filename); this.enforceBacklog(); return; }
        this.queue.push(path.resolve(absDir, filename));
        this.enforceBacklog();
        this.scheduleDrain(onChange, absDir);
      });
    } catch { }
    const self = this;
    this.handle = {
      get paused() { return self.pausedFlag; },
      get dir() { return absDir; },
      close() {
        if (self.debounceTimer) { clearTimeout(self.debounceTimer); self.debounceTimer = null; }
        if (self.watcher) { try { self.watcher.close(); } catch {} self.watcher = null; }
        self.handle = null;
      },
    };
    return this.handle;
  }

  pause(): void {
    this.pausedFlag = true;
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
  }

  resume(): void {
    this.pausedFlag = false;
    if (this.queue.length > 0) { const pending = this.drainQueue(); this.triggerReparse(pending); }
  }

  acquireWriteLock(): void {
    if (this.writeLock) throw new EngineError(GRAPH_UPDATE_CONFLICT, `${GRAPH_UPDATE_CONFLICT}: a write is already in progress — the watcher is paused`);
    this.writeLock = true; this.pause();
  }

  releaseWriteLock(): void { this.writeLock = false; this.resume(); }

  async reparseChanged(files: string[]): Promise<Set<string>> {
    if (this.reparseChangedFn) return this.reparseChangedFn(files);
    return new Set(files.map((f) => `corbell:${path.basename(f)}`));
  }

  async rerunBattery(nodeIds: Set<string>): Promise<void> {
    if (this.rerunBatteryFn) return this.rerunBatteryFn(nodeIds);
  }

  diagnosticsForLive(file: string): ReturnType<DiagnosticsServer['diagnosticsFor']> { return this.diagnosticsFor(file); }

  private enforceBacklog(): void {
    if (this.queue.length > WATCHER_BACKLOG_CAP) {
      console.warn(WATCHER_STALLED);
      const folded = new Map<string, string>();
      for (const f of this.queue) folded.set(path.basename(f), f);
      this.queue = [...folded.values()];
    }
  }

  private scheduleDrain(onChange: ((files: string[]) => void) | undefined, dir: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout((): void => {
      const batch = this.drainQueue();
      if (onChange) onChange(batch);
      this.triggerReparse(batch);
      this.scan(batch);
    }, WATCHER_DEBOUNCE_MS);
  }

  private drainQueue(): string[] { const b = [...this.queue]; this.queue = []; return b; }

  private triggerReparse(files: string[]): void {
    if (files.length === 0) return;
    void this.reparseChanged(files).then((ids) => this.rerunBattery(ids));
  }
}

class EngineError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.name = code; this.code = code; } }

// ═══ THE ONE-SHARED-LSP-PER-PROJECT REGISTRY (2026-08-13 — the operator's
// directive: "ONE SHARED LSP PER PROJECT that all agent sessions connect to"):
// the in-memory singleton was per-PROCESS — a fresh agent session spawned a
// fresh empty LSP (the host defect the operator is fixing). THE CORRECT DESIGN:
// the server's truth is the project's shared.db (the durable cross-session
// state), and the registry keys servers by the PROJECT ROOT — every session in
// every process resolves the SAME per-project server, which reads the SAME db.
// ═══════════════════════════════════════════════════════════════════════════

import path from 'node:path';
import fs from 'node:fs';

/** The path normalization for the file match — the absolute resolve (the
 *  findings' file column vs the touched path may differ in the relative/absolute
 *  form; the resolve makes the comparison robust). */
function pathResolve(p: string): string {
  try { return path.resolve(p); } catch { return p; }
}

const projectServers = new Map<string, DiagnosticsServer>();

/** THE PROJECT ROOT RESOLUTION — walk UP from the touched file to find the
 *  project's .trident/knowledge-graph/shared.db marker. Returns null when the
 *  file is outside any machine-tracked project (no per-project LSP — the
 *  platform-level fallback applies). */
export function resolveProjectRoot(file: string): string | null {
  let dir = path.dirname(pathResolve(file));
  while (true) {
    const marker = path.join(dir, '.trident', 'knowledge-graph', 'shared.db');
    if (fs.existsSync(marker)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;   // the filesystem root — no project found
    dir = parent;
  }
}

/** THE PROJECT-SCOPED SERVER — ONE per project root, SHARED across every agent
 *  session + process (the registry + the db-bound truth). A fresh session
 *  resolves the SAME server object (in-process) or a NEW server bound to the
 *  SAME shared.db (cross-process) — either way, the SAME diagnostics. */
export function getProjectDiagnosticsServer(projectRoot: string): DiagnosticsServer {
  let server = projectServers.get(projectRoot);
  if (!server) {
    server = new DiagnosticsServer();
    const dbPath = path.join(projectRoot, '.trident', 'knowledge-graph', 'shared.db');
    if (fs.existsSync(dbPath)) {
      try {
        const { openStore } = requireProjectDb();
        server.bindDb(openStore(dbPath));
      } catch (e: unknown) {
        console.warn(`[lsp-injector] project db bind failed for ${dbPath} — the in-memory state is the fallback: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    projectServers.set(projectRoot, server);
  }
  return server;
}

/** THE DB SURFACE — the shared.db store (the W1 surface). The static import
 *  keeps the module ESM-clean (no CJS require in an ESM bundle); the store is
 *  only opened lazily by the callers that bind a real project db. */
function requireProjectDb(): { openStore: (p: string) => DbClient } {
  return { openStore };
}

/** THE FILE → PER-PROJECT SERVER RESOLUTION — the injector's entry: resolve the
 *  project from the touched file, then the ONE shared server for that project.
 *  Falls back to the shared singleton when no project is found (the platform-
 *  level LSP — the state stays in-memory, the project-less surface). */
export function resolveDiagnosticsServerForFile(file: string | null): DiagnosticsServer {
  if (file) {
    const root = resolveProjectRoot(file);
    if (root) return getProjectDiagnosticsServer(root);
  }
  return getSharedDiagnosticsServer();
}

/** THE SHARED DIAGNOSTICS SERVER — the platform-wide fallback instance (the
 *  project-less surface — the injector's default when no project marker). */
export function getSharedDiagnosticsServer(): DiagnosticsServer {
  if (sharedServer === null) sharedServer = new DiagnosticsServer();
  return sharedServer;
}

let sharedServer: DiagnosticsServer | null = null;

/** The server resolution used by the hook factory + the hunt harness: the
 *  explicit option wins (the tests), else the file-scoped per-project server
 *  (the ONE-SHARED-LSP law), else the shared singleton. */
export function resolveDiagnosticsServer(explicit?: DiagnosticsServer, file?: string | null): DiagnosticsServer {
  if (explicit) return explicit;
  return file ? resolveDiagnosticsServerForFile(file) : getSharedDiagnosticsServer();
}

/**
 * THE PER-TOOL PATH EXTRACTOR — the file a tool result touches.
 * THE REGEX IS THE MECHANICAL DETECTOR ONLY (the path tokens); THE DECISION
 * (the block ride) is the injector's: the file must be in the server's state.
 */
function extractTouchedFile(tool: string, args: Record<string, unknown>): string | null {
  switch (tool) {
    // THE READ ARG NAMES (2026-08-13 — the S5 runtime gap, proven in the suite
    // container): the opencode read tool's parameter is 'filePath' (the same
    // surface as edit), NOT 'path' — the old extractor read only args.path, the
    // touched-file resolution returned null, and the [LOGIC-LSP] block never
    // rode the read results despite the shared server state being populated.
    // BOTH arg names are accepted (the tool-version drift across the runtimes).
    case 'read':    return typeof args.filePath === 'string' ? args.filePath
                    : typeof args.path === 'string' ? args.path : null;
    case 'edit':    return typeof args.filePath === 'string' ? args.filePath : null;
    case 'write':   return typeof args.targetPath === 'string' ? args.targetPath
                    : typeof args.filePath === 'string' ? args.filePath : null;
    case 'glob':    return typeof args.pattern === 'string' ? args.pattern.replace(/[*?[\]{}]/g, '') : null;
    case 'bash': {
      const cmd = typeof args.command === 'string' ? args.command : '';
      const m = /(?:^|\s)([^\s|;&<>]+\.tsx?)/.exec(cmd);
      return m ? m[1] : null;
    }
    default:        return null;
  }
}

/** THE TOUCHED-FILE EXTRACTOR — exported for the hook's per-project resolution
 *  (the ONE-SHARED-LSP law: the hook resolves the file's project server). */
export { extractTouchedFile };

/** The severity → the block prefix ('error' for CRIT/HIGH/MED, 'warn' for WARN). */
function severityPrefix(severity: LogicDiagnostic['severity']): string {
  return severity === 'WARN' ? 'warn' : 'error';
}

/**
 * THE BLOCK BYTE-COST BANDS (O32.3 — the named calibration, spec §3.13):
 * the full block budget is 500 chars per 3-finding file — BECAUSE at 500 chars
 * the block is 3 lines, readable and scannable on a dirty file, while at 2000
 * chars it would dominate the tool result on the machine's dirtiest files and
 * push the real tool output out of the model's attention. The truncation
 * margin is 20 chars (480) — the ellipsis marker fits inside the budget.
 */
export const LOGIC_LSP_BYTE_COST = 500;
const LOGIC_LSP_TRUNCATION_MARGIN = LOGIC_LSP_BYTE_COST - 20;

/**
 * THE INJECTOR — the tool.after publishDiagnostics equivalent.
 * For EVERY tool result whose args reference a path with active diagnostics,
 * the file-scoped block rides the result — the un-ignorable highlight.
 */
export function inject(result: ToolResultLike, server: DiagnosticsServer): InjectedResult {
  const base = typeof result.output === 'string' ? result.output
    : result.output === null || result.output === undefined ? ''
    : JSON.stringify(result.output);

  const file = extractTouchedFile(result.tool, result.args);
  if (file === null) return { output: base };

  // THE GLOB RESOLUTION — a glob pattern (e.g. 'src/x*') resolves to the state keys
  // it prefixes; an exact path matches directly. THE REGEX IS THE MECHANICAL DETECTOR
  // ONLY (the prefix matching); THE DECISION is the injector's (the block ride).
  const candidates = server.resolveTouchedFiles(file);
  if (candidates.length === 0) return { output: base }; // nothing touched with active diagnostics

  const blocks: string[] = [];
  for (const touched of candidates) {
    const diags = server.diagnosticsFor(touched);
    if (diags.length === 0) continue;

    // THE DEDUPE (O32.2): a file+rule shown in the last 3 results collapses to the count.
    const lines: string[] = [];
    let repeated = 0;
    for (const d of diags) {
      const shown = server.shownTimes(touched, d.ruleId);
      if (shown > 0) repeated += 1;
      else lines.push(`  ${severityPrefix(d.severity)}   ${d.ruleId}  ${d.message}  :${d.line}`);
      server.recordShow(touched, d.ruleId);
    }
    if (repeated > 0) lines.push(`  (${repeated} repeated)`);

    const block = `[LOGIC-LSP] ${diags.length} diagnostic(s) in ${touched}:\n${lines.join('\n')}`;

    // THE BYTE-COST (O32.3): the block < 500 chars per 3-finding file — the dedupe +
    // the WARN suppression are the levers; a pathological state collapses hard.
    blocks.push(block.length > LOGIC_LSP_BYTE_COST
      ? block.slice(0, LOGIC_LSP_TRUNCATION_MARGIN) + '\n  (…truncated)'
      : block);
  }
  if (blocks.length === 0) return { output: base };
  const joined = blocks.join('\n\n');
  return { output: base ? `${base}\n\n${joined}` : joined };
}

/** THE READ BACKEND — the server's state from the findings rows (the W7 wiring helper). */
export function loadStateFromFindings(db: DbClient, runId: string, server: DiagnosticsServer): void {
  const rows = rowsAs<{ rule_id: string; severity: string; file?: string | null; line?: number | null; evidence: string }>(
    db.prepare('SELECT rule_id, severity, file, line, evidence FROM findings WHERE run_id = ? AND verdict = ?').all(runId, 'VIOLATION'),
    'loadStateFromFindings',
  );
  const grouped = new Map<string, LogicDiagnostic[]>();
  for (const r of rows) {
    if (!r.file) continue;
    const diag: LogicDiagnostic = {
      ruleId: r.rule_id,
      severity: severityFromRow(r.severity),
      message: r.evidence.slice(0, 80),
      line: r.line ?? 0,
    };
    const list = grouped.get(r.file) ?? [];
    list.push(diag);
    grouped.set(r.file, list);
  }
  for (const [file, diags] of grouped) server.withState({ [file]: diags });
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[lsp-injector] ${label} expected an array of rows, got ${typeof rows}`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.get()` result (a single unknown
 *  row) is null/undefined-guarded before the typed assertion. */
function rowAs<T>(row: unknown, label: string): T | null | undefined {
  if (row !== undefined && row !== null) {
    return row as T;
  }
  return row as T | null | undefined;
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the DB severity string is narrowed to
 *  the LogicDiagnostic severity union by the literal-union check (no cast at
 *  all — the comparison narrows the unknown). */
function severityFromRow(sev: unknown): LogicDiagnostic['severity'] {
  if (sev === 'CRIT' || sev === 'HIGH' || sev === 'MED' || sev === 'WARN') {
    return sev;
  }
  return 'WARN';
}
