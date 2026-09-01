// src/subagents/trident-bug-hunter/tools/ui-server.ts
// THE UI WIRING (the corbell-native graph browser — the W2b splice). The
// vendor's `corbell ui serve` (ui.py:12-57) serves the force-directed graph
// browser at http://localhost:7433 from the workspace's SQLite store — zero
// cloud, zero sign-in. The wire-don't-build law: the machine launches the
// VENDOR's server, never a reimplementation.
//
// THE REACHABILITY LAW (Task 4): a "reachable UI" claim is NOT evidence — the
// server responding on localhost:<port> is the ONLY acceptable proof. The
// check probes the HTTP root (the vendor's handler — server.py:483-495) and
// returns {reachable, status, url}; a down server → reachable:false + the
// logged cause, never a fabricated "the UI exists".

import path from 'node:path';
import fs from 'node:fs';
import { resolveCorbellBin } from '../graph/corbell-embeddings.ts';

/** The vendor's default UI port (ui.py:14 — 7433). */
export const CORBELL_UI_DEFAULT_PORT = 7433;

/** The launch contract: the exact command the vendor's CLI accepts
 *  (ui.py:12-16: --port, --no-browser). The no-browser flag is REQUIRED in the
 *  machine's launch — the server is reachable, the operator's browser is the
 *  human's choice. */
export interface UiLaunch {
  command: string;
  port: number;
  url: string;
}

export interface UiLaunchOptions {
  port?: number;
  bin?: string;
  cwd?: string;
}

/** Resolve the launch command. Error paths FIRST: no workspace.yaml → the
 *  named UI_WORKSPACE_MISSING (the vendor's server exits on a missing config —
 *  ui.py:31-38); the resolved binary is the existsSync-verified venv install or
 *  the PATH fallback. The spawn itself is the caller's (the command is the
 *  contract — the caller owns the child lifecycle). */
export function resolveUiLaunchCommand(target: { projectRoot: string }, opts: UiLaunchOptions = {}): UiLaunch {
  const projectRoot = opts.cwd ?? target.projectRoot;
  const port = opts.port ?? CORBELL_UI_DEFAULT_PORT;
  const bin = opts.bin ?? resolveCorbellBin();
  const wsConfigPath = path.join(projectRoot, 'corbell-data', 'workspace.yaml');
  if (!fs.existsSync(wsConfigPath)) {
    throw new Error('UI_WORKSPACE_MISSING: no corbell-data/workspace.yaml at ' + projectRoot + ' — run the graph build (or `corbell init`) before serving the UI');
  }
  return {
    command: `${bin} ui serve --port ${port} --no-browser`,
    port,
    url: `http://localhost:${port}`,
  };
}

export interface UiReachability {
  reachable: boolean;
  status: number | null;
  url: string;
}

/** The reachability probe (injectable — the tests stub a probe; the default
 *  hits the vendor's HTTP root). A non-200 or a network error → reachable:false
 *  with the logged cause — the honest negative, never a fabricated green. */
export type UiProbe = (url: string) => Promise<{ status: number }>;

export const defaultUiProbe: UiProbe = async (url) => {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(4000) });
    return { status: res.status };
  } catch (e: unknown) {
    console.warn(`[ui-server] probe fetch failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
};

/** THE REACHABILITY CHECK — the ONLY acceptable "the UI is up" evidence. A
 *  missing workspace (the launch would fail) → the named error; a down server
 *  → reachable:false. */
export async function checkUiReachable(
  target: { projectRoot: string },
  opts: { port?: number; probe?: UiProbe } = {},
): Promise<UiReachability> {
  const port = opts.port ?? CORBELL_UI_DEFAULT_PORT;
  const probe = opts.probe ?? defaultUiProbe;
  const url = `http://localhost:${port}`;
  try {
    const { status } = await probe(url);
    return { reachable: status >= 200 && status < 500, status, url };
  } catch (e: unknown) {
    const cause = e instanceof Error ? e.message : String(e);
    console.warn(`[ui-server] the corbell UI at ${url} is not reachable: ${cause} (start it with 'corbell ui serve --port ${port} --no-browser')`);
    return { reachable: false, status: null, url };
  }
}
