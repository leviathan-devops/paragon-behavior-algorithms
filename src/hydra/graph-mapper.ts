import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import fs from 'node:fs';
import path from 'node:path';
import type { GraphMapper, GraphifyGraph, GraphifyNode, GraphifyEdge, Community, Subgraph, Path, NodeDetail } from './types.js';
import { GraphifyMCPClient, createGraphifyTools } from './graphify.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const GRAPHIFY_BIN = process.env['GRAPHIFY_BIN'] ?? '/home/leviathan/.local/bin/graphify';

function normalizeGraph(raw: Record<string, unknown>): GraphifyGraph {
  const rawNodes = (raw['nodes'] as unknown[]) ?? [];
  const rawLinks = ((raw['links'] as unknown[]) ?? (raw['edges'] as unknown[]) ?? []) as Record<string, unknown>[];

  const nodes: GraphifyNode[] = rawNodes.map((n) => {
    const r = n as Record<string, unknown>;
    return {
      id: String(r['id'] ?? r['label'] ?? ''),
      label: String(r['label'] ?? r['id'] ?? ''),
      type: String(r['file_type'] ?? r['type'] ?? 'unknown'),
      file: String(r['source_file'] ?? r['file'] ?? ''),
      data: r as Record<string, unknown>,
    };
  });

  const edges: GraphifyEdge[] = rawLinks.map((e) => {
    const src = String(e['source'] ?? e['src'] ?? '');
    const dst = String(e['target'] ?? e['dst'] ?? '');
    const relation = String(e['relation'] ?? 'references');
    const rawConf = String(e['confidence'] ?? 'EXTRACTED');
    const confidence: 'EXTRACTED' | 'INFERRED' = rawConf === 'INFERRED' ? 'INFERRED' : 'EXTRACTED';
    return { src, dst, relation, confidence };
  });

  const communityMap = new Map<number, string[]>();
  for (const n of rawNodes as Record<string, unknown>[]) {
    const cid = n['community'];
    if (typeof cid === 'number') {
      const arr = communityMap.get(cid) ?? [];
      arr.push(String(n['id'] ?? ''));
      communityMap.set(cid, arr);
    }
  }
  const communities: Community[] = [];
  for (const [cid, members] of communityMap.entries()) {
    communities.push({ id: String(cid), label: `Community ${cid}`, members, size: members.length });
  }

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }
  const sorted = [...degree.entries()].sort((a, b) => b[1] - a[1]);
  const godNodes = sorted.slice(0, 5).map(([id]) => id);

  return { nodes, edges, communities, godNodes };
}

export class GraphifyMCPMapper implements GraphMapper {
  private mcp: GraphifyMCPClient;
  private lastGraphPath: string | null = null;

  constructor(mcp?: GraphifyMCPClient) {
    this.mcp = mcp ?? new GraphifyMCPClient();
  }

  async extract(
    targetRoot: string,
    opts?: { codeOnly?: boolean; scope?: string[]; exclude?: string[] },
  ): Promise<GraphifyGraph> {
    if (typeof targetRoot !== 'string' || targetRoot.trim() === '') {
      throw new Error('GRAPHIFY_EXTRACT_FAILED: targetRoot must be non-empty string');
    }
    const resolved = path.resolve(targetRoot);
    if (!fs.existsSync(resolved)) {
      throw new Error(`GRAPHIFY_EXTRACT_FAILED: targetRoot not found: ${resolved}`);
    }
    const baseArgs = ['extract', resolved, ...(opts?.codeOnly === false ? [] : ['--code-only'])];
    const scopeArgs = opts?.scope && opts.scope.length > 0 ? opts.scope.flatMap((s) => ['--scope', s]) : [];
    const excludeArgs = opts?.exclude && opts.exclude.length > 0 ? opts.exclude.flatMap((e) => ['--exclude', e]) : [];
    const args = [...baseArgs, ...scopeArgs, ...excludeArgs];
    void `${GRAPHIFY_BIN} ${args.map((a) => `"${a}"`).join(' ')}`;
    try {
      await execFileAsync(GRAPHIFY_BIN, args, { cwd: resolved, timeout: 120_000 });
    } catch (err) {
      const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string; status?: number };
      const stderrTail = e.stderr ? String(e.stderr).slice(-2000) : String(e.message ?? err).slice(-2000);
      const isUnknownFlag = /unknown option|unrecognized/i.test(stderrTail);
      if (isUnknownFlag && (scopeArgs.length > 0 || excludeArgs.length > 0)) {
        await execFileAsync(GRAPHIFY_BIN, baseArgs, { cwd: resolved, timeout: 120_000 });
      } else if (!isUnknownFlag) {
        throw new Error(`GRAPHIFY_EXTRACT_FAILED: ${stderrTail}`);
      } else {
        const ee = e as { stderr?: Buffer; message?: string };
        throw new Error(`GRAPHIFY_EXTRACT_FAILED: ${String(ee.stderr ?? ee.message ?? err).slice(-2000)}`);
      }
    }

    const graphPath = path.join(resolved, 'graphify-out', 'graph.json');
    this.lastGraphPath = graphPath;
    if (!fs.existsSync(graphPath)) {
      throw new Error(`GRAPHIFY_EXTRACT_FAILED: graph.json not found at ${graphPath} after extract`);
    }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`GRAPHIFY_EXTRACT_FAILED: graph.json parse failed \u2014 ${String((err as Error).message)}`);
    }
    if ((opts?.scope && opts.scope.length > 0) || (opts?.exclude && opts.exclude.length > 0)) {
      const rawNodes = (raw['nodes'] as Record<string, unknown>[]) ?? [];
      const filtered = rawNodes.filter((n) => {
        const sf = String(n['source_file'] ?? n['file'] ?? '');
        if (opts?.exclude && opts.exclude.some((ex) => sf.includes(ex))) return false;
        if (opts?.scope && opts.scope.length > 0) return opts.scope.some((sc) => sf.includes(sc));
        return true;
      });
      const keptIds = new Set(filtered.map((n) => String(n['id'] ?? '')));
      const rawEdges = ((raw['links'] as unknown[]) ?? (raw['edges'] as unknown[]) ?? []) as Record<string, unknown>[];
      const filteredEdges = rawEdges.filter((e) => keptIds.has(String(e['source'] ?? e['src'] ?? '')) && keptIds.has(String(e['target'] ?? e['dst'] ?? '')));
      raw = { ...raw, nodes: filtered, links: filteredEdges, edges: filteredEdges };
    }
    return normalizeGraph(raw);
  }

  async query(graph: GraphifyGraph, question: string): Promise<Subgraph> {
    if (!graph || !Array.isArray(graph.nodes)) throw new Error('GRAPHIFY_QUERY_INVALID: graph required');
    if (typeof question !== 'string' || question.trim() === '') throw new Error('GRAPHIFY_QUERY_INVALID: question must be non-empty');
    if (this.mcp.isConnected()) {
      try {
        const raw = await this.mcp.callTool('query_graph', { question });
        const text = String(raw);
        void text;
        const matched = graph.nodes.filter((n) => question.toLowerCase().split(/\s+/).some((tok) => tok.length > 2 && (n.label.toLowerCase().includes(tok) || n.id.toLowerCase().includes(tok))));
        const relatedEdges = graph.edges.filter((e) => matched.some((m) => m.id === e.src || m.id === e.dst));
        if (matched.length > 0) return { nodes: matched, edges: relatedEdges, query: question };
      } catch {
      }
    }
    const toks = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const matched = graph.nodes.filter((n) => toks.some((tok) => n.label.toLowerCase().includes(tok) || n.id.toLowerCase().includes(tok) || n.file.toLowerCase().includes(tok)));
    const relatedEdges = graph.edges.filter((e) => matched.some((m) => m.id === e.src || m.id === e.dst));
    const nodes = matched.length > 0 ? matched : graph.nodes.slice(0, 5);
    const edges = matched.length > 0 ? relatedEdges : [];
    return { nodes, edges, query: question };
  }

  async path(graph: GraphifyGraph, from: string, to: string): Promise<Path> {
    if (!graph || !Array.isArray(graph.nodes)) throw new Error('GRAPHIFY_PATH_INVALID: graph required');
    if (typeof from !== 'string' || from.trim() === '' || typeof to !== 'string' || to.trim() === '') throw new Error('GRAPHIFY_PATH_INVALID: from and to must be non-empty');
    if (this.mcp.isConnected()) {
      try {
        const raw = await this.mcp.callTool('shortest_path', { source: from, target: to });
        void String(raw);
      } catch {
      }
    }
    const findId = (q: string) => {
      const low = q.toLowerCase();
      const hit = graph.nodes.find((n) => n.label.toLowerCase().includes(low) || n.id.toLowerCase() === low);
      return hit?.id ?? null;
    };
    const fromId = findId(from);
    const toId = findId(to);
    if (!fromId || !toId) return { from, to, hops: [], length: 0 };
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const a = adj.get(e.src) ?? [];
      a.push(e.dst);
      adj.set(e.src, a);
      const b = adj.get(e.dst) ?? [];
      b.push(e.src);
      adj.set(e.dst, b);
    }
    const queue: string[][] = [[fromId]];
    const visited = new Set<string>([fromId]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const last = cur[cur.length - 1];
      if (last === toId) {
        return { from, to, hops: cur as readonly string[], length: cur.length - 1 };
      }
      for (const nb of adj.get(last) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push([...cur, nb]);
        }
      }
    }
    return { from, to, hops: [], length: 0 };
  }

  async explain(graph: GraphifyGraph, concept: string): Promise<NodeDetail> {
    if (!graph || !Array.isArray(graph.nodes)) throw new Error('GRAPHIFY_EXPLAIN_INVALID: graph required');
    if (typeof concept !== 'string' || concept.trim() === '') throw new Error('GRAPHIFY_EXPLAIN_INVALID: concept must be non-empty');
    if (this.mcp.isConnected()) {
      try {
        const raw = await this.mcp.callTool('get_node', { label: concept });
        void String(raw);
      } catch {
      }
    }
    const low = concept.toLowerCase();
    const node = graph.nodes.find((n) => n.label.toLowerCase().includes(low) || n.id.toLowerCase() === low);
    if (!node) throw new Error(`GRAPHIFY_EXPLAIN_NOT_FOUND: no node matching "${concept}"`);
    const connections = graph.edges.filter((e) => e.src === node.id || e.dst === node.id).map((e) => (e.src === node.id ? e.dst : e.src));
    const degree = connections.length;
    const community = graph.communities.find((c) => c.members.includes(node.id))?.id;
    return { id: node.id, label: node.label, type: node.type, file: node.file, degree, community, connections, data: node.data };
  }

  async merge(slices: object[]): Promise<GraphifyGraph> {
    if (!Array.isArray(slices)) throw new Error('GRAPHIFY_MERGE_INVALID: slices must be array');
    const nodeMap = new Map<string, GraphifyNode>();
    const edgeSet = new Set<string>();
    const edges: GraphifyEdge[] = [];
    const communityMap = new Map<string, Community>();
    for (const s of slices) {
      if (!s || typeof s !== 'object') continue;
      const g = s as Partial<GraphifyGraph>;
      for (const n of g.nodes ?? []) {
        if (n && typeof n.id === 'string' && !nodeMap.has(n.id)) nodeMap.set(n.id, n as GraphifyNode);
      }
      for (const e of g.edges ?? []) {
        if (!e || typeof (e as GraphifyEdge).src !== 'string') continue;
        const key = `${(e as GraphifyEdge).src}\u2192${(e as GraphifyEdge).dst}:${(e as GraphifyEdge).relation}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push(e as GraphifyEdge);
        }
      }
      for (const c of g.communities ?? []) {
        if (c && typeof c.id === 'string' && !communityMap.has(c.id)) communityMap.set(c.id, c as Community);
      }
    }
    const nodes = [...nodeMap.values()];
    const communities = [...communityMap.values()];
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
      degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
    }
    const godNodes = [...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    return { nodes, edges, communities, godNodes };
  }

  asAgentTools(_graph: GraphifyGraph): AgentTool[] {
    return createGraphifyTools(this.mcp);
  }

  getMcp(): GraphifyMCPClient {
    return this.mcp;
  }

  getLastGraphPath(): string | null {
    return this.lastGraphPath;
  }
}
