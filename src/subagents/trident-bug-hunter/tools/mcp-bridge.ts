// src/subagents/trident-bug-hunter/tools/mcp-bridge.ts
// THE MCP BRIDGE (the corbell-native MCP surface — the W2b splice). The machine
// exposes the graph + the embeddings to the external agents THROUGH the vendor's
// MCP contract — the 4 tools the corbell's FastMCP server registers (server.py:
// 40-104): graph_query / get_architecture_context / code_search / list_services.
// The wire-don't-build law: the vendor's server IS the wired surface; this
// bridge (a) catalogs the 4 tools with the vendor's EXACT names + input
// schemas (models.py:7-25), (b) runs the vendor's `corbell mcp serve` for the
// external clients, and (c) resolves the 4 tool calls against the machine's
// thin-shell reads of the vendor's stores (the graph store + the embedding
// store) — so the same surface serves both the spawned server and the
// machine's own catalog. Zero MCP machinery built from scratch.
//
// THE TOOL CONTRACT (verbatim from the vendor):
//   - graph_query(service_id, include_dependencies=true, include_methods=false)
//   - get_architecture_context(feature_description, top_k_services=10)
//   - code_search(query, service_id="", top_k=10)
//   - list_services()
// THE ERROR CONTRACT: a handler's failure is RETURNED as a text error (the
// vendor's handlers return "Error ...: <msg>" — tools.py:49,81,129,177,207),
// never an uncaught throw into the MCP channel; the bridge ALSO logs it.
//
// THE THRESHOLD CALIBRATION (the ISE naming law): every numeric bound in this
// module is the VENDOR's OWN contract, not a local invention —
//   - top_k default 10 / top_k_services default 10  → server.py:41-104, models.py
//   - the methods cap 30                            → tools.py:73 ("Cap at 30")
//   - the code content cap 1500                     → tools.py:167 ("Truncate... 1500")
//   - the deps filter {method_call, flow_step}      → tools.py:197 (the vendor's skip set)
// A threshold change is a VENDOR-contract change, never a local tweak.

import path from 'node:path';
import fs from 'node:fs';
import { Database } from 'bun:sqlite';
import type { ExecFn } from '../graph/corbell-adapter.ts';
import {
  resolveCorbellBin,
  defaultEmbeddingExec,
  queryEmbeddingIndex,
  embeddingStorePath,
} from '../graph/corbell-embeddings.ts';
import { formatRows, type QueryRow } from '../surface/query-tool.ts';

// ---------------------------------------------------------------------------
// The MCP tool catalog (the vendor's contract — models.py + server.py)
// ---------------------------------------------------------------------------

export interface McpToolArgSchema {
  type: 'string' | 'boolean' | 'integer';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, McpToolArgSchema>;
}

/** THE 4-TOOL CATALOG — the vendor's exact names + input schemas (server.py:
 *  40-104, models.py:7-25). The acceptance: THIS set, no partial, no renamed. */
export const CORBELL_MCP_TOOLS: readonly McpToolDef[] = [
  {
    name: 'graph_query',
    description: 'Query Corbell\u2019s architecture graph for service dependencies and details.',
    inputSchema: {
      service_id: { type: 'string', description: 'The ID of the service to query', required: true },
      include_dependencies: { type: 'boolean', description: 'Whether to include upstream/downstream dependencies', default: true },
      include_methods: { type: 'boolean', description: 'Whether to include code-level extracted methods', default: false },
    },
  },
  {
    name: 'get_architecture_context',
    description: 'Get architecture and code context for a feature without LLM generation.',
    inputSchema: {
      feature_description: { type: 'string', description: 'The feature description to get context for', required: true },
      top_k_services: { type: 'integer', description: 'Maximum number of relevant code chunks to return', default: 10 },
    },
  },
  {
    name: 'code_search',
    description: 'Semantic search across Corbell\u2019s code embedding index. Returns the most relevant code chunks ranked by cosine similarity.',
    inputSchema: {
      query: { type: 'string', description: 'Natural language search query', required: true },
      service_id: { type: 'string', description: 'Optional service ID to restrict search to a single service', default: '' },
      top_k: { type: 'integer', description: 'Maximum number of results to return', default: 10 },
    },
  },
  {
    name: 'list_services',
    description: 'List all services in the current Corbell workspace graph.',
    inputSchema: {},
  },
];

// ---------------------------------------------------------------------------
// The graph-store thin shell (the vendor's SQLiteGraphStore reads — the bridge
// reads what the vendor writes; zero graph machinery built from scratch)
// ---------------------------------------------------------------------------

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.all()` result (an unknown array)
 *  is Array.isArray-checked before the typed row assertion. */
function rowsAs<T>(rows: unknown, label: string): T[] {
  if (Array.isArray(rows)) {
    return rows as T[];
  }
  throw new Error(`[mcp-bridge] ${label} expected an array of rows, got ${typeof rows}`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — a `.get()` result (a single unknown
 *  row) is null/undefined-guarded before the typed assertion. */
function rowAs<T>(row: unknown, label: string): T | null | undefined {
  if (row !== undefined && row !== null) {
    return row as T;
  }
  return row as T | null | undefined;
}

interface ServiceRow { id: string; name: string; language: string; service_type: string; repo: string; tags: string[]; }

function readServices(storePath: string): ServiceRow[] {
  const db = new Database(storePath, { readonly: true });
  try {
    const rows = rowsAs<{ id: string; data: string }>(db.prepare("SELECT id, node_type, data FROM graph_nodes WHERE node_type = 'service'").all(), 'readServices');
    return rows.map((r) => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(String(r.data ?? '{}')) as Record<string, unknown>; } catch (e: unknown) { console.warn(`[mcp-bridge] service '${r.id}' data unparseable — continuing: ${String(e)}`); }
      return {
        id: String(r.id),
        name: typeof data['name'] === 'string' ? data['name'] : r.id,
        language: typeof data['language'] === 'string' ? data['language'] : '',
        service_type: typeof data['service_type'] === 'string' ? data['service_type'] : 'api',
        repo: typeof data['repo'] === 'string' ? data['repo'] : '',
        tags: Array.isArray(data['tags']) ? data['tags'].map((t) => String(t)) : [],
      };
    });
  } finally {
    db.close();
  }
}

function readServiceDeps(storePath: string, serviceId: string): Array<{ target_id: string; kind: string }> {
  const db = new Database(storePath, { readonly: true });
  try {
    return rowsAs<{ target_id: string; kind: string }>(db.prepare('SELECT target_id, kind FROM graph_edges WHERE source_id = ? AND kind != ? AND kind != ?').all(serviceId, 'method_call', 'flow_step'), 'readServiceDeps');
  } finally {
    db.close();
  }
}

function readServiceMethods(storePath: string, serviceId: string, cap = 30): Array<{ name: string; file_path: string; line_start: number; class_name: string | null }> {
  const db = new Database(storePath, { readonly: true });
  try {
    const rows = rowsAs<{ data: string }>(db.prepare("SELECT data FROM graph_nodes WHERE node_type = 'method'").all(), 'readServiceMethods');
    const out: Array<{ name: string; file_path: string; line_start: number; class_name: string | null }> = [];
    for (const r of rows) {
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(String(r.data ?? '{}')) as Record<string, unknown>; } catch (e: unknown) { console.warn(`[mcp-bridge] method data unparseable — skipped: ${String(e)}`); }
      if (String(d['service_id'] ?? '') !== serviceId) continue;
      out.push({
        name: typeof d['method_name'] === 'string' ? d['method_name'] : '',
        file_path: typeof d['file_path'] === 'string' ? d['file_path'] : '',
        line_start: typeof d['line_start'] === 'number' ? d['line_start'] : 0,
        class_name: d['class_name'] == null ? null : String(d['class_name']),
      });
    }
    return out.slice(0, cap);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// The 4 tool handlers (the vendor's text-output contract — tools.py)
// ---------------------------------------------------------------------------

export interface McpToolTarget {
  projectRoot: string;
  exec?: ExecFn;
  /** The encode injection (the hermetic tests stub it; the production wire is
   *  the vendor's venv model — the same EncodeFn contract as the embeddings
   *  adapter). */
  encode?: (texts: string[], target?: { projectRoot: string }) => number[][];
}

/** THE DISPATCHER — the machine's own MCP surface. Each handler returns the
 *  vendor-shaped TEXT; a failure is RETURNED as the "Error ..." text + logged
 *  (the vendor's recover-never-swallow contract — tools.py:80-81). */
export function runMcpTool(name: string, target: McpToolTarget, args: Record<string, unknown> = {}): string {
  try {
    switch (name) {
      case 'graph_query': return graphQueryHandler(target, args);
      case 'get_architecture_context': return architectureContextHandler(target, args);
      case 'code_search': return codeSearchHandler(target, args);
      case 'list_services': return listServicesHandler(target);
      default:
        return `Error: unknown MCP tool '${name}' (the 4 tools are graph_query|get_architecture_context|code_search|list_services)`;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[mcp-bridge] tool '${name}' failed: ${msg}`);
    return `Error: ${msg}`;
  }
}

function graphQueryHandler(target: McpToolTarget, args: Record<string, unknown>): string {
  const serviceId = String(args['service_id'] ?? '');
  if (!serviceId) return 'Error: service_id is required for graph_query';
  const includeDependencies = args['include_dependencies'] !== false;
  const includeMethods = args['include_methods'] === true;
  const storePath = embeddingStorePath(target.projectRoot);
  if (!fs.existsSync(storePath)) return 'Error: no corbell workspace store found (run `corbell graph build` first)';
  let db: Database;
  try {
    db = new Database(storePath, { readonly: true });
  } catch (e: unknown) {
    return `Error querying graph: could not open the store: ${String(e)}`;
  }
  const hasService = rowAs<{ c: number }>(db.prepare("SELECT count(*) AS c FROM graph_nodes WHERE id = ? AND node_type = 'service'").get(serviceId), 'hasService');
  db.close();
  if (!hasService || (hasService?.c ?? 0) === 0) {
    return `Error: Service '${serviceId}' not found in the architecture graph.`;
  }
  const svc = readServices(storePath).find((s) => s.id === serviceId) ?? { id: serviceId, name: serviceId, language: '', service_type: 'api', repo: '', tags: [] };
  const lines = [
    `Service: ${svc.name} (${svc.id})`,
    `Language: ${svc.language}`,
    `Type: ${svc.service_type}`,
    `Repository: ${svc.repo}`,
    `Tags: ${svc.tags.length > 0 ? svc.tags.join(', ') : 'None'}`,
  ];
  if (includeDependencies) {
    const deps = readServiceDeps(storePath, serviceId);
    if (deps.length > 0) {
      lines.push('\nDependencies:');
      for (const d of deps) lines.push(`  \u2192 ${d.target_id} [${d.kind}]`);
    } else {
      lines.push('\nDependencies: None');
    }
  }
  if (includeMethods) {
    const methods = readServiceMethods(storePath, serviceId);
    if (methods.length > 0) {
      lines.push(`\nMethods (${methods.length} total):`);
      for (const m of methods) lines.push(`  - ${m.class_name ? `${m.class_name}.` : ''}${m.name} (${m.file_path}:${m.line_start})`);
    } else {
      lines.push('\nMethods: None');
    }
  }
  return lines.join('\n');
}

function listServicesHandler(target: McpToolTarget): string {
  const storePath = embeddingStorePath(target.projectRoot);
  if (!fs.existsSync(storePath)) return 'No services found. Run `corbell graph build` first.';
  const services = readServices(storePath);
  if (services.length === 0) return 'No services found. Run `corbell graph build` first.';
  const lines = [`## Services (${services.length} total)`, ''];
  for (const svc of services) {
    const tags = svc.tags.length > 0 ? svc.tags.join(', ') : 'none';
    const deps = readServiceDeps(storePath, svc.id);
    const methods = readServiceMethods(storePath, svc.id);
    lines.push(`- **${svc.id}** (${svc.language}, ${svc.service_type}) | tags: [${tags}] | deps: ${deps.length} | methods: ${methods.length}`);
  }
  return lines.join('\n');
}

function codeSearchHandler(target: McpToolTarget, args: Record<string, unknown>): string {
  const query = String(args['query'] ?? '').trim();
  const topK = Math.max(1, Math.floor(Number(args['top_k'] ?? 10)));
  const serviceId = String(args['service_id'] ?? '').trim();
  if (!query) return 'Error: query is required for code_search';
  const hits = queryEmbeddingIndex(target, query, { topK, encode: target.encode });
  const filtered = serviceId.length > 0 ? hits.filter((h) => h.serviceId === serviceId) : hits;
  if (filtered.length === 0) return `No code matches found for: ${query}`;
  const lines = [`## Code Search Results for: ${query}`, ''];
  for (const h of filtered) {
    lines.push(`### ${h.rank}. [${h.serviceId}] ${h.filePath}${h.symbol ? `::${h.symbol}` : ''}`);
    lines.push(`Lines ${h.startLine}-${h.endLine} | Type: ${h.chunkType} | Language: ${h.language} | score=${h.score}`);
    lines.push('```');
    lines.push(h.content.length > 1500 ? `${h.content.slice(0, 1500)}\n... (truncated)` : h.content);
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

function architectureContextHandler(target: McpToolTarget, args: Record<string, unknown>): string {
  const feature = String(args['feature_description'] ?? '').trim();
  const topK = Math.max(1, Math.floor(Number(args['top_k_services'] ?? 10)));
  if (!feature) return 'Error: feature_description is required for get_architecture_context';
  const lines = ['# Architecture Context Preview', ''];
  const storePath = embeddingStorePath(target.projectRoot);
  const services = fs.existsSync(storePath) ? readServices(storePath) : [];
  const hits = queryEmbeddingIndex(target, feature, { topK, encode: target.encode });
  if (hits.length > 0) {
    lines.push('## Auto-discovered Services');
    const seen = new Set<string>();
    for (const h of hits) {
      if (!seen.has(h.serviceId)) { seen.add(h.serviceId); lines.push(`- ${h.serviceId}`); }
    }
    lines.push(`*(From ${services.length} configured services)*\n`);
  } else if (services.length > 0) {
    lines.push('*No embedding matches — the context falls back to the configured services.*\n');
  } else {
    lines.push('*No embedding store available. Run `corbell embeddings build` first.*\n');
  }
  lines.push('## Top Code Context');
  for (const h of hits.slice(0, topK)) {
    lines.push(`- [${h.serviceId}] ${h.filePath}::${h.symbol ?? h.chunkType} (score=${h.score})`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// The vendor server launch — `corbell mcp serve` (the external clients' wire)
// ---------------------------------------------------------------------------

export interface McpServerLaunch {
  command: string;
  transport: 'stdio' | 'sse';
  port: number;
}

/** Resolve the launch command for the vendor's `corbell mcp serve`. Error
 *  paths FIRST: no workspace.yaml → the named MCP_WORKSPACE_MISSING (the
 *  server reads the workspace config at startup). The launch itself is the
 *  caller's spawn — this resolves the exact command the vendor's cli.py
 *  accepts (mcp.py:12-15). */
export function resolveMcpServeCommand(target: { projectRoot: string }, opts: { transport?: 'stdio' | 'sse'; port?: number; bin?: string } = {}): McpServerLaunch {
  const projectRoot = target.projectRoot;
  const bin = opts.bin ?? resolveCorbellBin();
  const transport = opts.transport ?? 'stdio';
  const port = opts.port ?? 8000;
  const wsConfigPath = path.join(projectRoot, 'corbell-data', 'workspace.yaml');
  if (!fs.existsSync(wsConfigPath)) {
    throw new Error('MCP_WORKSPACE_MISSING: no corbell-data/workspace.yaml at ' + projectRoot + ' — run the graph build (or `corbell init`) before starting the MCP server');
  }
  const base = `${bin} mcp serve`;
  const command = transport === 'sse' ? `${base} --transport sse --port ${port}` : base;
  return { command, transport, port };
}

/** Format a hit set through the D22 llm formatRows (the awareness surface the
 *  MCP code_search + the semantic verb share). */
export function formatSemanticRows(hits: Array<{ rank: number; filePath: string; startLine: number; symbol: string | null; score: number; serviceId: string }>, format: 'table' | 'llm'): QueryRow[] {
  const rows: QueryRow[] = hits.map((h) => ({
    rank: h.rank, file: h.filePath, line: h.startLine,
    symbol: h.symbol ?? '', score: h.score, service: h.serviceId,
  }));
  return formatRows(rows, format);
}
