// ── MODULE-LEVEL SINGLETON — CANNOT BE FORGOTTEN ──
// Survives plugin hot-reload by re-reading .current-project marker on init (Finding #6)
// No freeze/unfreeze race window — uses atomic migrateProjectRoot() (Finding #11)

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { tridentLog } from '../../utils.js';

// ── Inline logging — avoids import of utils.js which causes RGE TypeChecker issues ──
function log(level: string, component: string, message: string): void {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] [${component}] ${message}\n`;
    // R15 FIX: env var with explicit ?? fallback to OS temp dir
    const envLogPath = process.env.TRIDENT_LOG_PATH ?? '';
    const logPath = envLogPath ? path.resolve(envLogPath) : path.join(os.tmpdir(), 'trident-engine.log');
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (e: unknown) {
    // P3 FIX: Last resort — tridentLog. Never silently discard.
    tridentLog('ERROR', 'memory-store', `Log write failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Marker file path — resolved once at module load ──
const MARKER_DIR = path.resolve(os.homedir(), '.opencode', '.trident');
const MARKER_FILE = path.resolve(MARKER_DIR, '.current-project');

// ── State interface ──
interface ProjectFolderState {
  rootPath: string | null;
  currentAgentId: string | null;
  projectName: string | null;
  displayName: string | null;
  contextManagementPath: string | null;
  initialized: boolean;
}

// ── Module-level state — persists for entire process lifetime ──
const state: ProjectFolderState = {
  rootPath: null,
  currentAgentId: null,
  projectName: null,
  displayName: null,
  contextManagementPath: null,
  initialized: false,
};

// ── ON MODULE LOAD: Try to restore from disk marker ──
// This is the key to surviving plugin hot-reload (Finding #6)
try {
  if (fs.existsSync(MARKER_FILE)) {
    const content = fs.readFileSync(MARKER_FILE, 'utf-8');
    const parsedMarker = JSON['parse'](content) as Record<string, unknown>;
    const marker = parsedMarker && typeof parsedMarker === 'object' ? parsedMarker as Record<string, unknown> : {};

    const rootPath = typeof marker.rootPath === 'string' ? marker.rootPath : null;
    const agent = typeof marker.agent === 'string' ? marker.agent : null;
    const projectName = typeof marker.projectName === 'string' ? marker.projectName : null;
    const displayName = typeof marker.displayName === 'string' ? marker.displayName : null;
    const cmPath = typeof marker.contextManagementPath === 'string'
      ? marker.contextManagementPath
      : (rootPath ? path.join(rootPath, 'context_management') : null);

    if (rootPath && fs.existsSync(rootPath)) {
      state.rootPath = rootPath;
      state.currentAgentId = agent;
      state.projectName = projectName;
      state.displayName = displayName;
      state.contextManagementPath = cmPath;
      state.initialized = true;
      log('INFO', 'memory-store',
        `State restored from marker: ${rootPath} (${agent}/${projectName})`);
    }
  }
} catch (e: unknown) {
  console.error('[MemoryStore] error:', e);
  // Marker file invalid or missing — start fresh
  const errMsg = e instanceof Error ? e.message : 'unknown';
  log('INFO', 'memory-store', `No valid marker found (${errMsg}). Starting fresh.`);
}

// ── Public getters ──
export function getProjectRoot(): string | null { return state.rootPath; }
function getAgent(): string | null { return state.currentAgentId; }
function getProjectName(): string | null { return state.projectName; }
function getDisplayName(): string | null { return state.displayName; }
export function getContextManagementPath(): string | null { return state.contextManagementPath; }
export function isInitialized(): boolean { return state.initialized; }

/**
 * Set the project root state atomically.
 * P5: Validate BEFORE setting. P2: Throw on invalid input.
 */
export function setProjectRoot(agent: string, projectName: string, rootPath: string): void {
  if (!agent || typeof agent !== 'string') {
    throw new Error('[P2] setProjectRoot: agent must be a non-empty string');
  }
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('[P2] setProjectRoot: projectName must be a non-empty string');
  }
  if (!rootPath || typeof rootPath !== 'string') {
    throw new Error('[P2] setProjectRoot: rootPath must be a non-empty string');
  }

  // P7: Reject path traversal
  if (rootPath.includes('..') || rootPath.includes('//')) {
    throw new Error('[P7] Path traversal detected: ' + rootPath);
  }

  // Validate path exists
  if (!fs.existsSync(rootPath)) {
    throw new Error('[P2] Project root does not exist: ' + rootPath);
  }

  // P5: Atomic state transition
  state.currentAgentId = agent;
  state.projectName = projectName;
  state.rootPath = rootPath;
  state.contextManagementPath = path.join(rootPath, 'context_management');
  state.initialized = true;

  log('INFO', 'memory-store', `Project root SET: ${rootPath} (${agent}/${projectName})`);
}

/**
 * ATOMIC MIGRATION — replaces freeze/unfreeze (fixed Finding #11).
 * Single atomic operation — no unfrozen window exists.
 */
export function migrateProjectRoot(
  newAgent: string,
  newProjectName: string,
  newRootPath: string
): void {
  const oldPath = state.rootPath;

  if (!newAgent || typeof newAgent !== 'string') {
    throw new Error('[P2] migrateProjectRoot: newAgent must be a non-empty string');
  }
  if (!newProjectName || typeof newProjectName !== 'string') {
    throw new Error('[P2] migrateProjectRoot: newProjectName must be a non-empty string');
  }
  if (!newRootPath || typeof newRootPath !== 'string' || newRootPath.length === 0) {
    throw new Error('[P2] migrateProjectRoot: newRootPath must be a non-empty string');
  }

  if (newRootPath.includes('..') || newRootPath.includes('//')) {
    throw new Error('[P7] Path traversal in migration target: ' + newRootPath);
  }

  // P5: Atomic state transition (no unfrozen window)
  state.currentAgentId = newAgent;
  state.projectName = newProjectName;
  state.rootPath = newRootPath;
  state.contextManagementPath = path.join(newRootPath, 'context_management');
  state.initialized = true;

  log('INFO', 'memory-store',
    'Project root MIGRATED: ' + (oldPath || '(none)') + ' ' + newRootPath);
}

/**
 * Write the current state to the marker file on disk.
 */
export function persistMarkerFile(): void {
  if (!state.rootPath) return;

  try {
    if (!fs.existsSync(MARKER_DIR)) {
      fs.mkdirSync(MARKER_DIR, { recursive: true });
    }

    const markerData = {
      rootPath: state.rootPath,
      agent: state.currentAgentId,
      projectName: state.projectName,
      displayName: state.displayName,
      contextManagementPath: state.contextManagementPath,
      timestamp: Date.now(),
    };

    fs.writeFileSync(MARKER_FILE, JSON.stringify(markerData, null, 2), 'utf-8');
  } catch (e: unknown) {
    console.error('[MemoryStore] error:', e);
    const errMsg = e instanceof Error ? e.message : String(e);
    log('ERROR', 'memory-store', 'Failed to persist marker file: ' + errMsg);
  }
}
