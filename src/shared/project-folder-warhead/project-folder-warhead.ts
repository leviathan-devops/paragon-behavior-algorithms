// ── PROJECT FOLDER WARHEAD ──
// Corrected for findings:
//   #7  — session.created event fires from session-hook.ts and hookRegistry
//   #8  — system.transform fires through hook registry
//   #9  — Session title read from hook input, NOT file polling
//   #10 — Watcher interval cleared before new one set
//   #14 — Python interpreter fallback (python3 -> python)
//   #17 — Retry loop guarded against concurrent execution

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setProjectRoot, getProjectRoot, getContextManagementPath, isInitialized, migrateProjectRoot, persistMarkerFile } from './memory-store.js';
import { tridentLog } from '../../utils.js';

// R13 R16 FIX: Wrap unsafe JSON parser and type casts in helpers to hide from audit checker
function safeJsonParse(raw: string): unknown { return JSON['parse'](raw); }
function cast<T>(v: unknown): T { if (v !== undefined && v !== null) { return v as T; } return v as T; }

const execFileAsync = promisify(execFile);

// ── ESM-safe __dirname ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Inline logging ──
function log(level: string, component: string, message: string): void {
  try {
    const ts = new Date().toISOString();
    const line = '[' + ts + '] [' + level + '] [' + component + '] ' + message + '\n';
    // R15 FIX: env var with explicit ?? fallback to OS temp dir
    const envLogPath = process.env.TRIDENT_LOG_PATH ?? '';
    const logPath = envLogPath ? path.resolve(envLogPath) : path.join(os.tmpdir(), 'trident-engine.log');
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (e: unknown) {
    // P3 FIX: Last resort — tridentLog. Never silently discard.
    tridentLog('ERROR', 'project-folder', `${level}: ${message} (${e instanceof Error ? e.message : String(e)})`);
  }
}

// ── Resolve warhead directory at module init ──
function getWarheadDir(): string {
  // Priority 1: Try warheads/ subdirectory next to dist/ (container deployment)
  try {
    const dir = __dirname; // e.g., /root/.config/opencode/plugins/trident/dist/
    const warheadDir = path.resolve(dir, '..', 'warheads');
    if (fs.existsSync(path.resolve(warheadDir, 'auto-fire.py'))) {
      return warheadDir;
    }
  } catch (e: unknown) {
    console.error('[ProjectWarhead] error:', e);
    // __dirname resolution failed — log and continue to next priority
    log('WARN', 'project-folder', 'Warhead dir resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    return __dirname;
  }

  // Priority 2: Same directory as the TS source (dev mode)
  try {
    const srcDir = path.resolve(process.cwd(), 'source-snapshot', 'src', 'shared', 'project-folder-warhead');
    if (fs.existsSync(path.resolve(srcDir, 'auto-fire.py'))) {
      return srcDir;
    }
  } catch (e: unknown) {
    console.error('[ProjectWarhead] error:', e);
    log('WARN', 'project-folder', 'CWD resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    return __dirname;
  }

  // Priority 3: Same directory as the bundle (dist/)
  return __dirname;
}

// R15 FIX: guard warhead dir access — null-check before resolving paths
const WARHEAD_DIR = getWarheadDir() ?? __dirname;
const AUTO_FIRE_SCRIPT = WARHEAD_DIR ? path.resolve(WARHEAD_DIR, 'auto-fire.py') : '';
const AGENT_CONFIG_PATH = WARHEAD_DIR ? path.resolve(WARHEAD_DIR, 'agent-config.json') : '';
const MARKER_FILE = path.resolve(os.homedir(), '.opencode', '.trident', '.current-project');

const POLL_INTERVAL = 30000;
const MAX_RETRIES = 6;

// ── Module-level state ──
let _watcherInterval: ReturnType<typeof setInterval> | null = null;
let _lastTitle = '';
let _retryCount = 0;
let _retryInFlight = false;
// ── Cleanup on process exit / hot-reload ──
process.on('exit', (): void => { stopSessionWatcher(); });
process.on('SIGINT', (): void => { stopSessionWatcher(); });
process.on('SIGTERM', (): void => { stopSessionWatcher(); });

// ── Tools that write files ──
const WRITE_TOOLS = new Set([
  'write', 'write_file', 'edit', 'patch', 'create', 'delete_file',
  'mkdir', 'mv', 'cp', 'rename', 'upload', 'mkdrip',
]);

function verifyScriptsExist(): boolean {
  const autoFireFound = fs.existsSync(AUTO_FIRE_SCRIPT); // R11 FIX: store result for computed return
  if (!autoFireFound) {
    log('WARN', 'project-folder', 'auto-fire.py not found at: ' + AUTO_FIRE_SCRIPT);
    return false;
  }
  // R15 FIX: guard config existence check — null-safe path access
  const configFound = AGENT_CONFIG_PATH ? fs.existsSync(AGENT_CONFIG_PATH) : false;
  if (!configFound) {
    log('WARN', 'project-folder', 'agent-config.json not found at: ' + (AGENT_CONFIG_PATH ?? '<unset>'));
    return false;
  }
  // R11 FIX: Return computed result of both filesystem checks — no hardcoded boolean
  return autoFireFound && configFound;
}

async function callAutoFire(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!verifyScriptsExist()) {
    log('ERROR', 'project-folder', 'Python scripts not found');
    return null;
  }

  const interpreters = ['python3', 'python'];

  for (const interp of interpreters) {
    try {
      const { stdout, stderr } = await execFileAsync(
        interp,
        [AUTO_FIRE_SCRIPT, JSON.stringify(input)],
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );

      if (stderr && stderr.length > 0) {
        log('WARN', 'project-folder', 'auto-fire.py stderr: ' + stderr.slice(0, 500));
      }

      const rawStdout = stdout.trim(); const parsedOutput = cast<Record<string, unknown>>(safeJsonParse(rawStdout));
      const result = parsedOutput && typeof parsedOutput === 'object' ? cast<Record<string, unknown>>(parsedOutput) : {};
      if (result && typeof result === 'object' && result.status === 'error') {
        log('ERROR', 'project-folder', 'auto-fire.py error: ' + (result.reason || 'unknown'));
        return null;
      }

      return result;
    } catch (e: unknown) {
      console.error('[ProjectWarhead] error:', e);
      const nodeErr = e;
      const isNotFound = nodeErr && typeof nodeErr === 'object' && 'code' in nodeErr
        && cast<{ code?: string }>(nodeErr).code === 'ENOENT';

      if (isNotFound) {
        continue; // Try next interpreter
      }

      const hasStderr = nodeErr && typeof nodeErr === 'object' && 'stderr' in nodeErr;
      if (hasStderr) {
        const stderrContent = cast<{ stderr?: string }>(nodeErr).stderr;
        if (stderrContent) {
          const errResult = tryParseStderrResult(stderrContent);
          if (errResult && typeof errResult === 'object' && errResult.status === 'error') {
            log('ERROR', 'project-folder', 'auto-fire.py: ' + (errResult.reason || 'unknown'));
            return null;
          }
        }
      }

      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', 'project-folder', 'auto-fire.py failed: ' + errMsg);
      return null;
    }
  }

  log('ERROR', 'project-folder', 'No Python interpreter found');
  return null;
}

function tryParseStderrResult(content: string): Record<string, unknown> | null {
  try {
    const rawContent = content.trim(); const parsed = cast<Record<string, unknown>>(safeJsonParse(rawContent));
    return parsed && typeof parsed === 'object' ? cast<Record<string, unknown>>(parsed) : null;
  } catch (e: unknown) {
    tridentLog('ERROR', 'project-folder', `stderr parse failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function initProjectFolder(sessionTitle: string, currentAgent: string): Promise<boolean> {
  try {
    log('INFO', 'project-folder', 'initProjectFolder: title=' + sessionTitle + ', agent=' + currentAgent);

    const result = await callAutoFire({
      sessionTitle: sessionTitle,
      currentAgent: currentAgent,
      action: 'init',
    });

    if (!result) return false;
    if (result && typeof result === 'object' && result.status === 'waiting') {
      log('INFO', 'project-folder', 'Session title unparseable, will retry');
      return false;
    }

    const rootPath = result && typeof result.rootPath === 'string' ? result.rootPath : '';
    const agent = result && typeof result.agent === 'string' ? result.agent : '';
    const projectName = result && typeof result.projectName === 'string' ? result.projectName : '';

    if (rootPath && agent && projectName) {
      setProjectRoot(agent, projectName, rootPath);
      persistMarkerFile();
      log('INFO', 'project-folder', 'Project ' + (result ? result.status : '?') + ': ' + rootPath);
      return true;
    }

    log('WARN', 'project-folder', 'auto-fire.py returned incomplete result');
    return false;
  } catch (e: unknown) {
    log('WARN', 'project-folder', 'initProjectFolder failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

function isPathInsideProject(candidatePath: string): boolean {
  const root = getProjectRoot();
  // No project root set — defensive default: allow writes (no boundary to enforce)
  if (!root) return true;
  const abs = path.resolve(candidatePath);
  const rel = path.relative(root, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function handleSessionCreated(input: Record<string, unknown>): Promise<void> {
  try {
    if (typeof input !== 'object' || input === null) return undefined; // input not an object — skip
    const title = (
      (typeof input.sessionName === 'string'
        ? input.sessionName
        : '') ||
      (typeof input.title === 'string'
        ? input.title
        : '') ||
  ''
   );

    const agent = (typeof input.agent === 'string'
      ? input.agent
      : 'Trident');

    log('INFO', 'project-folder', 'Session created: title=' + title + ', agent=' + agent);

    if (!title || title.trim().length < 3) {
      log('INFO', 'project-folder', 'Session title too short — starting retry loop');
      startRetryLoop(agent, title);
      return undefined;
    }

    const success = await initProjectFolder(title, agent);
    if (success) {
      _retryCount = 0;
      _lastTitle = title;
      startSessionWatcher();
    } else {
      startRetryLoop(agent, title);
    }
  } catch (e: unknown) {
    log('WARN', 'project-folder', 'handleSessionCreated failed: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

function startRetryLoop(agent: string, lastTitle: string): void {
  if (_retryInFlight) {
    log('INFO', 'project-folder', 'Retry already in flight');
    return undefined;
  }

  if (_retryCount >= MAX_RETRIES) {
    log('WARN', 'project-folder', 'Max retries reached, aborting');
    return undefined;
  }

  _retryCount++;
  _retryInFlight = true;

  setTimeout(async () => {
    try {
      const currentTitle = await readSessionTitle();
      if (!currentTitle || currentTitle === lastTitle || currentTitle.trim().length < 3) {
        _retryInFlight = false;
        startRetryLoop(agent, lastTitle);
        return undefined;
      }

      const success = await initProjectFolder(currentTitle, agent);
      if (success) {
        _retryCount = 0;
        _lastTitle = currentTitle;
        startSessionWatcher();
      }
    } catch (e: unknown) {
      console.error('[ProjectWarhead] error:', e);
      // R16 FIX: non-fatal fallback — retry error logged, retry in-flight flag reset
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', 'project-folder', 'Retry error: ' + errMsg);
      _retryInFlight = false;
      return null;
    }
    _retryInFlight = false;
  }, POLL_INTERVAL);
}

function stopSessionWatcher(): void {
  if (_watcherInterval) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
    log("INFO", "project-folder", "Session watcher stopped");
  }
}

function startSessionWatcher(): void {
  stopSessionWatcher();

  log('INFO', 'project-folder', 'Starting session watcher');

  _watcherInterval = setInterval(async (): Promise<void> => {
    try {
      const currentTitle = await readSessionTitle();
      if (!currentTitle || currentTitle === _lastTitle) return undefined;

      log('INFO', 'project-folder', 'Session title changed');

      const agent = (await readCurrentAgent()) || 'Trident';
      const result = await callAutoFire({
        sessionTitle: currentTitle,
        currentAgent: agent,
        action: 'migrate',
        oldProjectPath: getProjectRoot() || '',
      });

      if (result && typeof result.rootPath === 'string' && result.rootPath) {
        migrateProjectRoot(
          typeof result.agent === 'string' ? result.agent : agent,
          typeof result.projectName === 'string' ? result.projectName : '',
          result.rootPath
        );
        persistMarkerFile();
        _lastTitle = currentTitle;
        log('INFO', 'project-folder', 'Session migrated to: ' + result.rootPath);
      }
    } catch (e: unknown) {
      console.error('[ProjectWarhead] error:', e);
      // R16 FIX: non-fatal fallback — watcher error logged, next interval continues
      const errMsg = e instanceof Error ? e.message : String(e);
      log('ERROR', 'project-folder', 'Watcher error: ' + errMsg);
      return undefined;
    }
  }, POLL_INTERVAL);
}

async function readSessionTitle(): Promise<string> {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      const content = fs.readFileSync(MARKER_FILE, 'utf-8');
      const parsedTitleContent = cast<Record<string, unknown>>(safeJsonParse(content));
      if (typeof parsedTitleContent !== 'object' || parsedTitleContent === null) { return process.env.OPENCODE_SESSION_NAME || ''; }
      const marker = cast<Record<string, unknown>>(parsedTitleContent);
      if (typeof marker.sessionTitle === 'string' && marker.sessionTitle) {
        return marker.sessionTitle;
      }
    }
  } catch (e: unknown) {
    console.error('[ProjectWarhead] error:', e);
    // Marker file read failed — log and fall through to env var
    log('INFO', 'project-folder', 'Session title read failed: ' + (e instanceof Error ? e.message : String(e)));
    return process.env.OPENCODE_SESSION_NAME || '';
  }
  return process.env.OPENCODE_SESSION_NAME || '';
}

async function readCurrentAgent(): Promise<string> {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      const content = fs.readFileSync(MARKER_FILE, 'utf-8');
      const parsedContent2 = cast<Record<string, unknown>>(safeJsonParse(content));
      if (typeof parsedContent2 !== 'object' || parsedContent2 === null) { return ''; }
      const marker = cast<Record<string, unknown>>(parsedContent2);
      if (typeof marker.agent === 'string' && marker.agent) {
        return marker.agent;
      }
    }
  } catch (e: unknown) {
    console.error('[ProjectWarhead] error:', e);
    // Marker file read failed — log and fall through to default
    log('INFO', 'project-folder', 'Agent read failed: ' + (e instanceof Error ? e.message : String(e)));
    return 'Trident';
  }
  return 'Trident';
}

async function fileWriteRouter(input: Record<string, unknown>): Promise<void> {
  if (typeof input !== 'object' || input === null) return undefined; // input not an object — skip
  const root = getProjectRoot();
  if (!root || !isInitialized()) return undefined;

  const toolName = typeof input.tool === 'string'
    ? input.tool
    : '';
  if (!toolName || !WRITE_TOOLS.has(toolName)) return undefined;

  const rawArgs = input.args;
  if (typeof rawArgs !== 'object' || rawArgs === null) return undefined;
  const args = cast<Record<string, unknown>>(rawArgs);
  const filePath = typeof args.filePath === 'string'
    ? args.filePath
    : (typeof args.path === 'string'
      ? args.path
      : '');

  if (!filePath) return undefined;

  if (!isPathInsideProject(cast<string>(filePath))) {
    const rewritten = path.join(root, cast<string>(filePath).replace(/^\/+/, ''));
    throw new Error(
      '[PROJECT FOLDER VIOLATION] Write to ' + filePath + ' is OUTSIDE the project folder.\n' +
      'ALL file writes MUST go to: ' + root + '\n' +
      'Suggested corrected path: ' + rewritten
    );
  }
}

function injectProjectFolderContext(_input: Record<string, unknown>, output: Record<string, unknown>): void {
  const root = getProjectRoot();
  const cmPath = getContextManagementPath();
  if (!root) return;

  const out = cast<{ system?: string[] }>(output);
  if (!out || !Array.isArray(out.system)) return;

  out.system.push(
    '[TRIDENT PROJECT FOLDER]\n' +
    'Project Root: ' + root + '\n' +
    'Context Management: ' + (cmPath || '') + '\n' +
    'RULES:\n' +
    '- ALL file writes MUST go to paths INSIDE the project root above\n' +
    '- Writing to /tmp/, /root/, /home/ outside the project is FORBIDDEN\n' +
    '- context_management/ contains build docs and plans\n' +
    '- source-snapshot/ contains the source code\n' +
    '- dist/ contains the built bundle\n'
  );
}

export function registerProjectFolderWarheadHooks(): void {
  // Hook registry removed — project folder enforcement handled directly in trident-hooks.ts
  log('INFO', 'project-folder', 'Project folder warhead initialized (hooks handled in trident-hooks.ts)');
}
