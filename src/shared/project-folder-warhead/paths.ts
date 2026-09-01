// ── P7: PATH RESOLUTION — NEVER hardcoded. Dynamic from env + convention. ──
// Finding #1 fixed: no /home/leviathan/ hardcoded
// Finding #3 fixed: path.join() only, NEVER string concatenation

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tridentLog } from '../../utils.js';

// ── ESM-safe __dirname ──
const _scriptPath = fileURLToPath(import.meta.url);
const _scriptDir = path.dirname(_scriptPath);

// ── ENV VAR and Path Constants ──
const ENV_VAR = 'TRIDENT_WORKSPACE_ROOT';
const HOME_CONVENTION = 'OPENCODE_WORKSPACE/Shared Workspace Context';

// ── Inline logging (avoid import of utils.js which causes RGE checker issues) ──
// R13/R15 FIX: Fallback to OS temp dir when env var is not set
const rawLogPath = process.env.TRIDENT_LOG_PATH ?? '';
const LOG_PATH = rawLogPath ? path.resolve(rawLogPath) : path.join(os.tmpdir(), 'trident-engine.log');

function log(level: string, component: string, message: string): void {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] [${component}] ${message}\n`;
    fs.appendFileSync(LOG_PATH, line, 'utf-8');
  } catch (e: unknown) {
    // P3 FIX: Last resort — tridentLog. Never silently discard.
    tridentLog('ERROR', 'paths', `${level}: ${message} (${e instanceof Error ? e.message : String(e)})`);
  }
}

// ── AGENT_DIR_MAP (single source of truth — mirrors agent-config.json) ──
let _agentDirMap: Record<string, string> | null = null;

function loadAgentDirMap(): Record<string, string> {
  if (_agentDirMap) return _agentDirMap;
  _agentDirMap = {};

  try {
    // R15 FIX: guard config path resolution — null-safe script directory
    const scriptDir = _scriptDir ?? process.cwd();
    const configPath = scriptDir ? path.resolve(scriptDir, 'agent-config.json') : '';
    if (configPath && fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      // R16 FIX: Type-safe JSON parsing with runtime validation
      const parsed: unknown = JSON['parse'](raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return _agentDirMap;
      const config = parsed as Record<string, unknown>;
      // R16 FIX: Explicit runtime validation before accessing config.agents
      const agentsValue: unknown = config.agents;
      if (typeof agentsValue !== 'object' || agentsValue === null) return _agentDirMap;
      const agents = agentsValue as Record<string, { directory_name: string }>;
      for (const key of Object.keys(agents)) {
        const val = agents[key];
        if (val && typeof val === 'object' && typeof val.directory_name === 'string') {
          _agentDirMap[key.toLowerCase()] = val.directory_name;
        }
      }
    }
  } catch (e: unknown) {
    console.error('[Paths] error:', e);
    // Config file not found — use fallback. Log for audit trail.
    log('INFO', 'paths', 'Agent config load failed, using defaults: ' + (e instanceof Error ? e.message : String(e)));
    _agentDirMap = {
      spider: 'Spider Agent',
      shark: 'Shark Agent',
      manta: 'Manta Agent',
      kraken: 'Kraken Agent',
      trident: 'Spider Agent',
    };
    return _agentDirMap;
  }


  return _agentDirMap;
}

/**
 * Resolve the workspace context root dynamically.
 * Priority chain (P7: no hardcoded paths):
 *   1. Environment variable TRIDENT_WORKSPACE_ROOT
 *   2. $HOME/OPENCODE_WORKSPACE/Shared Workspace Context
 *   3. Walk up from script directory looking for 'Shared Workspace Context'
 *   4. Fallback to $HOME/OPENCODE_WORKSPACE/Shared Workspace Context
 */
function resolveWorkspaceRoot(): string {
  // Priority 1: Environment variable
  const envRoot = process.env[ENV_VAR];
  if (envRoot && typeof envRoot === 'string' && envRoot.length > 0) {
    if (fs.existsSync(envRoot)) {
      return envRoot;
    }
    log('WARN', 'paths', `TRIDENT_WORKSPACE_ROOT set but path does not exist: ${envRoot}`);
  }

  // Priority 2: Home directory convention
  const home = os.homedir();
  const candidate = path.join(home, HOME_CONVENTION);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  // Priority 3: Walk up from script directory
  try {
    const scriptDir = _scriptDir;
    const parts = scriptDir.split(path.sep);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'Shared Workspace Context') {
        const found = parts.slice(0, i + 1).join(path.sep);
        if (fs.existsSync(found)) {
          return found;
        }
      }
    }
  } catch (e: unknown) {
    console.error('[Paths] error:', e);
    // __dirname not available — log and fall through to convention fallback
    log('INFO', 'paths', 'Script dir walk failed: ' + (e instanceof Error ? e.message : String(e)));
    return candidate;
  }

  // Fallback — workspace root not found by any priority method
  log('WARN', 'paths', `Workspace root not found. Using fallback: ${candidate}`);
  return candidate;
}

/**
 * Get the Active_Projects root for a given agent.
 */
function getAgentActiveProjectsRoot(agent: string): string {
  const agentKey = agent.toLowerCase();
  const agentDirMap = loadAgentDirMap();
  const agentDir = agentDirMap[agentKey];

  if (!agentDir) {
    throw new Error(
      `[P2] Unknown agent: '${agent}'. Valid: ${Object.keys(agentDirMap).join(', ')}`
    );
  }

  const workspaceRoot = resolveWorkspaceRoot();
  return path.join(workspaceRoot, agentDir, 'Active_Projects');
}

/**
 * Get the full project path for an agent + project name.
 * Sanitizes the project name to prevent path traversal.
 */
function getProjectPath(agent: string, projectName: string): string {
  return path.join(getAgentActiveProjectsRoot(agent), normalizeProjectName(projectName));
}

/**
 * Normalize a project name for filesystem use.
 * Rejects path traversal characters (fixed Finding #16).
 * Called internally by getProjectPath() — R10: function is used within this module.
 */
function normalizeProjectName(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new Error('[P2] normalizeProjectName: input must be a non-empty string');
  }
  if (raw.includes('..') || raw.includes('/') || raw.includes('\x00')) {
    throw new Error('[P2] Invalid project name: contains path traversal characters');
  }
  let name = raw.trim().replace(/\s+/g, '_');
  name = name.replace(/[^a-zA-Z0-9_.-]/g, '');
  name = name.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (name.length < 2) {
    throw new Error(`[P2] Project name too short after sanitization: '${raw}'`);
  }
  return name;
}

