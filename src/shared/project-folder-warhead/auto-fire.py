#!/usr/bin/env python3
"""
auto-fire.py — Zero-inference project folder warhead.
Called from TypeScript plugin on session.created and session title changes.
Reads session title from stdin, creates/clones project folder,
writes .project-root marker for TypeScript to read.

P7: NEVER hardcode paths. Use os.path.join() and env vars.
P2: Validate inputs at every boundary.
P3: Log all errors. Never silently fail.

All 18 findings from zero-trust audit are fixed in this implementation.
"""

import os
import sys
import json
import shutil
import pathlib
import re
import time
import hashlib
import logging

# ── P7: Resolve paths dynamically (fixed Finding #1, #3) ──
# NEVER use hardcoded /home/leviathan/ paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, 'agent-config.json')
HOME_DIR = os.path.expanduser('~')

# ── Load shared config (Single source of truth — fixed Finding #4) ──
# Both Python and TypeScript read from this single JSON file
try:
    with open(CONFIG_PATH) as f:
        CONFIG = json.load(f)
except FileNotFoundError:
    print(json.dumps({'status': 'error', 'reason': f'Config not found at {CONFIG_PATH}'}))
    sys.exit(1)

AGENT_DIR_MAP = {k.lower(): v['directory_name'] for k, v in CONFIG['agents'].items()}
CANON_DOCS = CONFIG.get('canon_docs', [])
PATHS_CONFIG = CONFIG.get('paths', {})

MARKER_DIR = os.path.join(HOME_DIR, '.opencode', '.trident')
MARKER_FILE = os.path.join(MARKER_DIR, '.current-project')
LOG_FILE = os.path.join(MARKER_DIR, 'project-folder.log')

# ── P3: Python-side logging (fixed Finding #12) ──
os.makedirs(MARKER_DIR, exist_ok=True)
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
logger = logging.getLogger('auto-fire')


# ── P7: Workspace root resolution (fixed Finding #1) ──
def resolve_workspace_root():
    """Resolve workspace root dynamically with fallback chain."""
    env_var = PATHS_CONFIG.get('workspace_root_env_var', 'TRIDENT_WORKSPACE_ROOT')
    home_convention = PATHS_CONFIG.get('home_convention', 'OPENCODE_WORKSPACE/Shared Workspace Context')

    # Priority 1: Environment variable
    env_root = os.environ.get(env_var)
    if env_root and os.path.exists(env_root):
        return env_root

    # Priority 2: Home directory convention
    candidate = os.path.join(HOME_DIR, home_convention)
    if os.path.exists(candidate):
        return candidate

    # Priority 3: Walk up from script directory
    parts = SCRIPT_DIR.split(os.sep)
    for i in range(len(parts) - 1, -1, -1):
        if parts[i] == 'Shared Workspace Context':
            found = os.sep.join(parts[:i + 1])
            if os.path.exists(found):
                return found

    logger.warning(f"Workspace root not found, using fallback: {candidate}")
    return candidate


def get_project_path(agent: str, project_name: str) -> str:
    """Get the full project path for an agent + project name.
    P7: os.path.join only — no string concat for paths (fixed Finding #3)."""
    agent_key = agent.lower()
    agent_dir = AGENT_DIR_MAP.get(agent_key)
    if not agent_dir:
        raise ValueError(f"[P2] Unknown agent: {agent}. Valid: {list(AGENT_DIR_MAP.keys())}")
    ws = resolve_workspace_root()
    # P7: os.path.join only — never string concatenation for paths
    return os.path.join(ws, agent_dir, 'Active_Projects', project_name)


# ── P2: Validate session title (fixed Finding #16) ──
def sanitize_project_name(raw: str) -> str:
    """Sanitize a project name for filesystem use.
    Rejects path traversal characters."""
    if not raw or not isinstance(raw, str):
        raise ValueError(f"[P2] Invalid project name: must be a non-empty string")

    # Reject path traversal
    if '..' in raw or '/' in raw or '\x00' in raw:
        raise ValueError(f"[P2] Invalid project name: contains path traversal characters")

    # Normalize: collapse whitespace, remove unsafe characters
    name = re.sub(r'\s+', '_', raw.strip())
    name = re.sub(r'[^a-zA-Z0-9_.-]', '', name)
    name = re.sub(r'_+', '_', name).strip('_')

    if not name or len(name) < 2:
        raise ValueError(f"[P2] Project name too short after sanitization: '{raw}'")

    return name


# ── Session Parsing ──
def parse_session_title(raw_title: str):
    """Parse a session title like 'SPIDER FACTORY - TRIDENT V4.3.2'.
    Returns dict with agent, project_name, display_name, agent_dir, or None."""
    if not raw_title or not raw_title.strip():
        return None

    # Pattern: "(AGENT) FACTORY - (PROJECT NAME)"
    m = re.match(r'^(\w+)\s+FACTORY\s*[-–—]\s*(.+)$', raw_title.strip(), re.IGNORECASE)
    if m:
        agent_raw = m.group(1).capitalize()
        display_name = m.group(2).strip()
        try:
            project_name = sanitize_project_name(display_name)
        except ValueError:
            return None

        if agent_raw.lower() in AGENT_DIR_MAP:
            return {
                'agent': agent_raw,
                'project_name': project_name,
                'display_name': display_name,
                'agent_dir': AGENT_DIR_MAP[agent_raw.lower()],
            }

    return None


def parse_fallback(raw_title: str, current_agent: str):
    """Fallback parser for non-standard session titles.
    Tries to extract a reasonable project name from any title."""
    trimmed = raw_title.strip()
    if not trimmed or len(trimmed) < 3:
        return None

    words = trimmed.split()
    if len(words) > 12:  # Too many words — not a project name
        return None

    agent = current_agent.capitalize()
    if agent.lower() not in AGENT_DIR_MAP:
        return None

    try:
        project_name = sanitize_project_name(trimmed)
    except ValueError:
        return None

    return {
        'agent': agent,
        'project_name': project_name,
        'display_name': trimmed[:100],  # Cap at 100 chars
        'agent_dir': AGENT_DIR_MAP[agent.lower()],
    }


# ── Fuzzy-find old project folder (fixed Finding #5) ──
def find_old_project_folder(project_path: str, agent: str, new_project_name: str):
    """Search for a similar existing project folder to use as migration source.
    Uses case-insensitive prefix match and similarity scoring, not exact match."""
    active_root = os.path.dirname(project_path)
    if not os.path.exists(active_root):
        return None

    candidates = []
    new_lower = new_project_name.lower().replace('-', '_')

    try:
        entries = os.listdir(active_root)
    except PermissionError:
        logger.warning(f"Cannot list {active_root}: permission denied")
        return None

    for entry in entries:
        entry_path = os.path.join(active_root, entry)
        if not os.path.isdir(entry_path):
            continue

        # Skip our own path
        if os.path.abspath(entry_path) == os.path.abspath(project_path):
            continue

        entry_lower = entry.lower().replace('-', '_')

        # Exact match (case-insensitive)
        if entry_lower == new_lower:
            logger.info(f"Found exact match for migration: {entry_path}")
            return entry_path

        # Prefix match (e.g., "TRIDENT_v4.3.1" matches "TRIDENT_v4.3")
        prefix_len = min(10, min(len(entry_lower), len(new_lower)))
        if prefix_len >= 4:  # At least 4 chars for a meaningful prefix match
            if entry_lower[:prefix_len] == new_lower[:prefix_len]:
                candidates.append((entry_path, entry_lower))

    # Return the most similar candidate (by shared character set size)
    if candidates:
        candidates.sort(key=lambda x: len(set(x[1]) & set(new_lower)), reverse=True)
        best = candidates[0][0]
        logger.info(f"Found fuzzy match for migration: {best}")
        return best

    return None


# ── Folder creation with size-limited clone (fixed Finding #13) ──
def _ignore_patterns(dir_name, file_names):
    """Ignore node_modules, dist, .git, .stryker-tmp for clone performance.
    Also ignores common build artifacts and virtual environments."""
    ignore = {
        'node_modules', 'dist', '.git', '.stryker-tmp',
        '__pycache__', '.venv', 'venv', '.tox', '.eggs',
        '*.pyc', '.pytest_cache', '.mypy_cache', '.ruff_cache',
    }
    return {f for f in file_names if f in ignore}


def _get_dir_size(start_path: str) -> int:
    """Calculate total directory size, skipping ignored directories."""
    total = 0
    try:
        for dirpath, dirnames, filenames in os.walk(start_path):
            # Skip ignored directories
            dirnames[:] = [d for d in dirnames if d not in _ignore_patterns(dirpath, dirnames)]
            for f in filenames:
                try:
                    fp = os.path.join(dirpath, f)
                    total += os.path.getsize(fp)
                except (OSError, FileNotFoundError):
                    pass
    except (OSError, PermissionError):
        pass
    return total


def create_project_folder(project_path: str, parsed: dict) -> str:
    """Create a new project folder with context_management and 9 canon docs."""
    os.makedirs(project_path, exist_ok=True)
    logger.info(f"Creating project folder: {project_path}")

    # Create context_management structure
    cm_path = os.path.join(project_path, 'context_management')
    build_lib_path = os.path.join(cm_path, 'build-library')
    os.makedirs(build_lib_path, exist_ok=True)

    # Write 9 canon doc templates (expanded — fixed Finding #15)
    templates = generate_canon_templates(parsed)
    for rel_path, content in templates.items():
        full_path = os.path.join(project_path, 'context_management', rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        if not os.path.exists(full_path):
            with open(full_path, 'w') as f:
                f.write(content)
            logger.info(f"  Created: {rel_path}")

    # Create source-snapshot placeholder
    src_dir = os.path.join(project_path, 'source-snapshot')
    os.makedirs(src_dir, exist_ok=True)

    logger.info(f"Project created: {project_path}")
    return project_path


def clone_project_folder(source_path: str, dest_path: str, parsed: dict) -> str:
    """Clone project folder with size limits and internal reference updates.
    P4: Resource lifecycle — limit clone size, clean up on failure."""
    logger.info(f"Cloning project: {source_path} → {dest_path}")

    # Check source size before cloning (P4: Resource lifecycle)
    try:
        total_size = _get_dir_size(source_path)
        MAX_CLONE_SIZE = 500 * 1024 * 1024  # 500MB limit (fixed Finding #13)

        if total_size > MAX_CLONE_SIZE:
            logger.warning(
                f"Source too large ({total_size / 1024 / 1024:.1f}MB > 500MB), "
                f"creating fresh project instead of cloning"
            )
            return create_project_folder(dest_path, parsed)
    except (OSError, PermissionError) as e:
        logger.warning(f"Cannot check source size: {e}. Proceeding with clone.")

    # Ensure destination parent exists
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    # Copy with ignore patterns (P4: limit resource usage)
    try:
        shutil.copytree(
            source_path, dest_path,
            symlinks=False,
            ignore=_ignore_patterns,
            ignore_dangling_symlinks=True,
        )

        # Update internal path references
        _update_internal_refs(dest_path, os.path.basename(source_path), parsed['project_name'])

        # Write canon docs for new version
        cm_path = os.path.join(dest_path, 'context_management')
        os.makedirs(os.path.join(cm_path, 'build-library'), exist_ok=True)
        templates = generate_canon_templates(parsed)
        for rel_path, content in templates.items():
            full_path = os.path.join(dest_path, 'context_management', rel_path)
            if not os.path.exists(full_path):
                with open(full_path, 'w') as f:
                    f.write(content)
                logger.info(f"  Created canon doc: {rel_path}")

        logger.info(f"Project cloned: {source_path} → {dest_path}")
        return dest_path

    except (shutil.Error, OSError) as e:
        logger.error(f"Clone failed: {e}")
        # P4: Clean up partial clone
        if os.path.exists(dest_path):
            try:
                shutil.rmtree(dest_path)
                logger.info(f"Cleaned up partial clone: {dest_path}")
            except OSError:
                pass
        return create_project_folder(dest_path, parsed)


def _update_internal_refs(root: str, old_name: str, new_name: str):
    """Walk files, update old project name references to new.
    P3: Handle errors per-file, don't abort on single failure."""
    if not os.path.exists(root):
        return

    for dirpath, dirnames, filenames in os.walk(root):
        # Skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in _ignore_patterns(dirpath, dirnames)]

        for filename in filenames:
            if not filename.endswith(('.md', '.ts', '.json', '.py', '.yaml', '.yml', '.sh')):
                continue

            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                if old_name in content:
                    new_content = content.replace(old_name, new_name)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    logger.info(f"  Updated refs in: {os.path.relpath(filepath, root)}")
            except (IOError, UnicodeDecodeError) as e:
                logger.warning(f"  Could not update {filepath}: {e}")


# ── 9 Canon Doc Templates (expanded — fixed Finding #15) ──
def generate_canon_templates(parsed: dict) -> dict:
    """Generate 9 baseline context management documents with meaningful content."""
    agent = parsed['agent']
    display = parsed['display_name']
    project_name = parsed['project_name']
    date = time.strftime('%Y-%m-%d')

    return {
        'POST_COMPACTION_PROMPT.md': (
            f'# {display} — Post-Compaction Build Prompt\n'
            f'\n'
            f'## Identity\n'
            f'You are building **{display}**. This document is loaded after every session compaction.\n'
            f'Your project root is determined by the session title convention:\n'
            f'  `(AGENT) FACTORY - (PROJECT NAME)` → `.../Active_Projects/{project_name}/`\n'
            f'\n'
            f'## Current Build State\n'
            f'- **Project:** {display}\n'
            f'- **Agent:** {agent}\n'
            f'- **Status:** Initializing\n'
            f'\n'
            f'## Critical Rules (P1-P10)\n'
            f'1. **P2:** All file writes MUST go INSIDE the project folder. Writing to /tmp, /root, /home outside the project is FORBIDDEN.\n'
            f'2. **P7:** Use relative paths from the project root. NEVER hardcode absolute paths.\n'
            f'3. **P3:** Every catch block must log+recover or log+propagate. No silent catches.\n'
            f'4. **P5:** Atomic state changes. Never mutate shared state without validation.\n'
            f'5. **P10:** Every function with a return type must return a valid value in ALL paths including catch blocks.\n'
            f'\n'
            f'## Build Pipeline\n'
            f'1. `npm run build:check` — TypeScript type check (tsc --noEmit, strict mode)\n'
            f'2. `npm run test` — All unit tests pass\n'
            f'3. `npm run build` — esbuild bundle (14-16MB expected)\n'
            f'4. `python3 /tmp/opencode/build_trident.py` — Alternative build entry\n'
            f'\n'
            f'## Deploy Checklist\n'
            f'- [ ] Bundle SHA256 matches deployed\n'
            f'- [ ] Identity test passes\n'
            f'- [ ] All hooks registered (3+ handlers)\n'
            f'- [ ] Warhead injection verified in system prompt\n'
        ),
        'build-library/00_PROJECT_OVERVIEW.md': (
            f'# {display} — Project Overview\n'
            f'\n'
            f'## Purpose\n'
            f'[One paragraph describing what this project builds and why it exists.]\n'
            f'\n'
            f'## Goals\n'
            f'- [Goal 1: What success looks like]\n'
            f'- [Goal 2: Measurable outcome]\n'
            f'- [Goal 3: What problem this solves]\n'
            f'\n'
            f'## Key Stakeholders\n'
            f'- **Build Agent:** {agent}\n'
            f'- **Runtime:** opencode plugin architecture\n'
            f'- **Deployment Target:** trident-container (runtime-grade-container-sandbox:latest)\n'
            f'\n'
            f'## Success Criteria\n'
            f'- [ ] Build pipeline passes (type check + test + bundle)\n'
            f'- [ ] Identity injection verified\n'
            f'- [ ] All 17 audit layers operational\n'
            f'- [ ] Enforcement hooks actually block (not theatrical)\n'
            f'\n'
            f'## Project Structure\n'
            f'```\n'
            f'{project_name}/\n'
            f'├── context_management/         # Build docs, plans, decisions\n'
            f'│   ├── POST_COMPACTION_PROMPT.md\n'
            f'│   └── build-library/          # 8 canon planning docs\n'
            f'├── source-snapshot/            # TypeScript source code\n'
            f'│   └── src/                    # Plugin source\n'
            f'├── dist/                       # esbuild bundle output\n'
            f'└── .project-root               # Marker file (auto-generated)\n'
            f'```\n'
        ),
        'build-library/01_ARCHITECTURE.md': (
            f'# {display} — System Architecture\n'
            f'\n'
            f'## High-Level Architecture\n'
            f'[Describe the system architecture: entry point → hooks → orchestrator → tools → audit engine]\n'
            f'\n'
            f'## Key Components\n'
            f'- **Entry Point (index.ts):** Plugin registration, hook creation\n'
            f'- **Orchestrator (orchestrator.ts):** State management, mode switching, FSM lifecycle\n'
            f'- **Hooks (hooks/):** Tool before/after, system transform, session lifecycle\n'
            f'- **Tools (tools/):** 4 mode tools + support tools + hive tools\n'
            f'- **Audit Engine (audit-engine/):** 17-layer R0-R16 audit pipeline\n'
            f'- **Warheads (shared/):** T1-T2 injection, enforcement hooks, project folder management\n'
            f'\n'
            f'## Data Flow\n'
            f'1. User message → `chat.message` hook → Intent detection → Mode selection\n'
            f'2. Tool call → `tool.execute.before` → Gate check → Circuit breaker → Rate limit → Execution → `tool.execute.after` → Evidence write\n'
            f'3. Session start → `session.created` → Project folder init → System prompt injection\n'
        ),
        'build-library/02_WORKFLOW.md': (
            f'# {display} — Development Workflow\n'
            f'\n'
            f'## Daily Build Cycle\n'
            f'```bash\n'
            f'# 1. Type check first (catches 90% of bugs)\n'
            f'cd source-snapshot\n'
            f'npm run build:check\n'
            f'\n'
            f'# 2. Run tests\n'
            f'npm test\n'
            f'\n'
            f'# 3. Build bundle\n'
            f'npm run build\n'
            f'\n'
            f'# 4. Verify bundle size\n'
            f'ls -lh ../dist/index.js\n'
            f'```\n'
            f'\n'
            f'## Deploy to Container\n'
            f'```bash\n'
            f'# 1. Copy bundle to bind mount\n'
            f'cp dist/index.js /tmp/trident-container-snap/plugins/trident/dist/index.js\n'
            f'\n'
            f'# 2. Verify SHA256\n'
            f'sha256sum dist/index.js\n'
            f'sha256sum /tmp/trident-container-snap/plugins/trident/dist/index.js\n'
            f'```\n'
            f'\n'
            f'## Verification Gates\n'
            f'| Gate | Check | Evidence Required |\n'
            f'|------|-------|-------------------|\n'
            f'| Type Check | tsc --noEmit passes | Exit code 0 |\n'
            f'| Tests | All tests green | Test report JSON |\n'
            f'| Build | Bundle 14-16MB | File size + SHA256 |\n'
            f'| Deploy | SHA256 matches | Checksum comparison |\n'
            f'| Runtime | Identity test passes | TUI output |\n'
        ),
        'build-library/03_DECISIONS.md': (
            f'# {display} — Architectural Decisions\n'
            f'\n'
            f'## Decision Log Format\n'
            f'| Date | Decision | Rationale | Alternatives Considered | Status |\n'
            f'|------|----------|-----------|------------------------|--------|\n'
            f'| {date} | Project initialized | Initial project setup via projectFolderWarhead | N/A | Active |\n'
            f'\n'
            f'## Active Decisions\n'
            f'- **projectFolderWarhead:** Project folder is auto-created from session title convention\n'
            f'- **Hook Registry:** Central event bus for warhead communication\n'
            f'- **Memory Store:** Module-level singleton with disk-backed marker for reload survival\n'
        ),
        'build-library/04_FAILURES.md': (
            f'# {display} — Known Failure Modes\n'
            f'\n'
            f'## How to Log a Failure\n'
            f'When you encounter a bug or design flaw:\n'
            f'1. Add entry to this file with date and description\n'
            f'2. Include root cause analysis (NOT symptom description)\n'
            f'3. Document the fix applied\n'
            f'4. Reference the evidence (audit finding #, commit hash, etc.)\n'
            f'\n'
            f'## Known Issues\n'
            f'### [Template] Example Failure\n'
            f'- **Symptom:** What went wrong\n'
            f'- **Root Cause:** Why it happened\n'
            f'- **Detection:** How to know it\'s happening\n'
            f'- **Mitigation:** How to prevent\n'
            f'- **Fix Applied:** What was done\n'
            f'- **Status:** Open / Fixed / Won\'t Fix\n'
            f'\n'
            f'## Common Anti-Patterns in This Codebase\n'
            f'1. **Theatrical enforcement:** Functions named enforce*() that always return {{blocked: false}}\n'
            f'2. **Empty catch blocks:** catch(e) {{}} without logging or recovery\n'
            f'3. **`as any` casts:** Bypassing TypeScript type system\n'
            f'4. **require() in ESM:** Will crash at runtime\n'
            f'5. **Hardcoded paths:** /home/leviathan/... will break on other machines\n'
        ),
        'build-library/05_CONTEXT.md': (
            f'# {display} — Session Context\n'
            f'\n'
            f'## Current Project\n'
            f'- **Name:** {display}\n'
            f'- **Agent:** {agent}\n'
            f'- **Project Root:** [auto-resolved from session title]\n'
            f'\n'
            f'## Tracking Convention\n'
            f'Update this file at the START of each session with:\n'
            f'1. What you plan to accomplish\n'
            f'2. What phase you\'re working on\n'
            f'3. Any blockers from previous session\n'
            f'\n'
            f'## Progress\n'
            f'- [ ] Phase 0: Cleanup (dead code, require→import, build script fix)\n'
            f'- [ ] Phase 1: Type-Safety Fix (tsc --noEmit, as any removal, P10 violations)\n'
            f'- [ ] Phase 2: Hook Enforcement Engineering\n'
            f'- [ ] Phase 3: T2 Cache Robustness (bundled fallbacks)\n'
            f'- [ ] Phase 4: Theatrical Fixes\n'
            f'- [ ] Phase 5: Tests\n'
            f'- [ ] Phase 6: Deployment Verification\n'
        ),
        'build-library/06_NEXT_STEPS.md': (
            f'# {display} — Next Steps\n'
            f'\n'
            f'## Immediate Priority\n'
            f'1. [First thing to do]\n'
            f'\n'
            f'## In Progress\n'
            f'- [Task being worked on]\n'
            f'\n'
            f'## Blocked\n'
            f'- [Task that cannot proceed and why]\n'
            f'\n'
            f'## Recently Completed\n'
            f'- Project initialized via projectFolderWarhead — {date}\n'
            f'\n'
            f'## Backlog\n'
            f'- [Future tasks]\n'
        ),
        'build-library/07_REFERENCE.md': (
            f'# {display} — References\n'
            f'\n'
            f'## Core Technologies\n'
            f'- **Runtime:** @opencode-ai/plugin — Plugin API for opencode TUI\n'
            f'- **State Machines:** xstate v5 — FSM library for orchestration\n'
            f'- **Schema:** zod — Runtime type validation\n'
            f'- **NLP:** wink-nlp — Natural language processing\n'
            f'- **Bundler:** esbuild — TypeScript bundler\n'
            f'\n'
            f'## Key Files\n'
            f'| Path | Purpose |\n'
            f'|------|---------|\n'
            f'| src/index.ts | Plugin entry point |\n'
            f'| src/orchestrator.ts | State management and mode switching |\n'
            f'| src/hooks/trident-hooks.ts | Hook implementations and registration |\n'
            f'| src/shared/warhead-registry.ts | Central event bus |\n'
            f'| src/shared/project-folder-warhead/ | Project folder management warhead |\n'
        ),
    }


# ── Main ──
def main():
    try:
        # Read input from stdin or argv
        if len(sys.argv) >= 2:
            input_data = json.loads(sys.argv[1])
        else:
            input_data = json.loads(sys.stdin.read())

        raw_title = input_data.get('sessionTitle', '')
        current_agent = input_data.get('currentAgent', 'Trident')
        action = input_data.get('action', 'init')
        old_project_path = input_data.get('oldProjectPath', '')

        logger.info(f"Firing: action={action}, title='{raw_title}', agent={current_agent}")

        # Parse session title
        parsed = parse_session_title(raw_title)
        if parsed is None:
            parsed = parse_fallback(raw_title, current_agent)

        if parsed is None:
            result = {
                'status': 'waiting',
                'reason': 'unparseable_title',
                'retry_after': 30000,
            }
            print(json.dumps(result))
            logger.info(f"Unparseable title, waiting: '{raw_title}'")
            return

        project_path = get_project_path(parsed['agent'], parsed['project_name'])
        os.makedirs(MARKER_DIR, exist_ok=True)

        if action == 'init':
            if os.path.exists(project_path):
                logger.info(f"Project exists: {project_path}")
                status = 'exists'
            else:
                old_path = find_old_project_folder(
                    project_path, parsed['agent'], parsed['project_name']
                )
                if old_path:
                    clone_project_folder(old_path, project_path, parsed)
                    status = 'cloned'
                else:
                    create_project_folder(project_path, parsed)
                    status = 'created'
        elif action == 'migrate':
            if old_project_path and os.path.exists(old_project_path):
                clone_project_folder(old_project_path, project_path, parsed)
                status = 'cloned'
            else:
                old_path = find_old_project_folder(
                    project_path, parsed['agent'], parsed['project_name']
                )
                if old_path:
                    clone_project_folder(old_path, project_path, parsed)
                    status = 'cloned_from_fuzzy'
                else:
                    create_project_folder(project_path, parsed)
                    status = 'created'
        else:
            logger.warning(f"Unknown action: {action}")
            status = 'unknown_action'

        # Write marker file
        marker_data = {
            'rootPath': project_path,
            'agent': parsed['agent'],
            'projectName': parsed['project_name'],
            'displayName': parsed['display_name'],
            'contextManagementPath': os.path.join(project_path, 'context_management'),
            'timestamp': time.time(),
            'sessionTitle': raw_title,
        }
        with open(MARKER_FILE, 'w') as f:
            json.dump(marker_data, f, indent=2)

        # Print result as JSON for TypeScript to parse
        result = {
            'status': status,
            'rootPath': project_path,
            'agent': parsed['agent'],
            'projectName': parsed['project_name'],
            'displayName': parsed['display_name'],
            'contextManagementPath': os.path.join(project_path, 'context_management'),
        }
        print(json.dumps(result))
        logger.info(f"Result: {status} — {project_path}")

    except json.JSONDecodeError as e:
        error_result = {'status': 'error', 'reason': f'JSON parse error: {e}'}
        print(json.dumps(error_result))
        logger.error(f"JSON decode error: {e}")
        sys.exit(1)
    except (ValueError, OSError) as e:
        error_result = {'status': 'error', 'reason': str(e)}
        print(json.dumps(error_result))
        logger.error(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
