import { describe, test, expect } from 'bun:test';
import { GraphifyMCPClient, createGraphifyTools } from '../graphify.ts';
import { GraphifyMCPMapper } from '../graph-mapper.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeFixture(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydra-ut-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'alpha.ts'), 'export class Alpha { greet(){ return "hi" } }');
  fs.writeFileSync(path.join(tmp, 'src', 'beta.ts'), 'import { Alpha } from "./alpha"; export function useAlpha(){ return new Alpha().greet() }');
  fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
  return tmp;
}

describe('GraphifyMCPClient adversarial', () => {
  test('Not connected throws loudly on callTool', async () => {
    const mcp = new GraphifyMCPClient();
    await expect(mcp.callTool('query_graph', { question: 'x' })).rejects.toThrow('Not connected');
  });
  test('Not connected throws on listTools', async () => {
    const mcp = new GraphifyMCPClient();
    await expect(mcp.listTools()).rejects.toThrow('Not connected');
  });
  test('connect empty path throws GRAPHIFY_CONNECT_INVALID', async () => {
    const mcp = new GraphifyMCPClient();
    await expect(mcp.connect('')).rejects.toThrow('GRAPHIFY_CONNECT_INVALID');
  });
  test('callTool empty name throws', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    void graph;
    const gp = path.join(tmp, 'graphify-out', 'graph.json');
    const mcp = new GraphifyMCPClient();
    await mcp.connect(gp);
    await expect(mcp.callTool('', {})).rejects.toThrow('GRAPHIFY_CALL_INVALID');
    await mcp.disconnect();
  });
  test('concurrent callTool calls work', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    await mapper.extract(tmp, { codeOnly: true });
    const gp = path.join(tmp, 'graphify-out', 'graph.json');
    const mcp = new GraphifyMCPClient();
    await mcp.connect(gp);
    const results = await Promise.all([
      mcp.callTool('query_graph', { question: 'Alpha' }),
      mcp.callTool('query_graph', { question: 'useAlpha' }),
      mcp.callTool('get_node', { label: 'Alpha' }),
    ]);
    expect(results.length).toBe(3);
    expect(String(results[0]).toLowerCase()).toContain('alpha');
    await mcp.disconnect();
  });
  test('disconnect then call throws Not connected', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    await mapper.extract(tmp, { codeOnly: true });
    const gp = path.join(tmp, 'graphify-out', 'graph.json');
    const mcp = new GraphifyMCPClient();
    await mcp.connect(gp);
    await mcp.disconnect();
    await expect(mcp.callTool('query_graph', { question: 'x' })).rejects.toThrow('Not connected');
  });
  test('createGraphifyTools null throws', () => {
    expect(() => createGraphifyTools(null as unknown as GraphifyMCPClient)).toThrow('GRAPHIFY_TOOLS_INVALID');
  });
  test('createGraphifyTools returns 4 tools with correct names and TypeBox schemas', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    await mapper.extract(tmp, { codeOnly: true });
    const gp = path.join(tmp, 'graphify-out', 'graph.json');
    const mcp = new GraphifyMCPClient();
    await mcp.connect(gp);
    const tools = createGraphifyTools(mcp);
    expect(tools.length).toBe(4);
    const names = tools.map((t: unknown) => (t as { name: string }).name);
    expect(names).toEqual(['graphify:query', 'graphify:path', 'graphify:explain', 'graphify:subgraph']);
    for (const t of tools as unknown as Array<{ parameters: unknown }>) {
      expect(t.parameters).toBeDefined();
      expect(typeof t.parameters).toBe('object');
    }
    // execute via tool returns content block
    const qt = (tools as unknown as Array<{ name: string; execute: (a: string, b: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }>).find((x) => x.name === 'graphify:query')!;
    const res = await qt.execute('id1', { question: 'Alpha' });
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text.toLowerCase()).toContain('alpha');
    await mcp.disconnect();
  });
});

describe('GraphifyMCPMapper adversarial', () => {
  test('extract empty targetRoot throws GRAPHIFY_EXTRACT_FAILED', async () => {
    const mapper = new GraphifyMCPMapper();
    await expect(mapper.extract('', {})).rejects.toThrow('GRAPHIFY_EXTRACT_FAILED');
  });
  test('extract nonexistent path throws GRAPHIFY_EXTRACT_FAILED', async () => {
    const mapper = new GraphifyMCPMapper();
    await expect(mapper.extract('/tmp/does-not-exist-zzz-999', {})).rejects.toThrow('GRAPHIFY_EXTRACT_FAILED');
  });
  test('extract real fixture produces >=1 node with symbol', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    expect(graph.nodes.some((n) => n.label.includes('Alpha'))).toBe(true);
  });
  test('query empty question throws', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    await expect(mapper.query(graph, '')).rejects.toThrow('GRAPHIFY_QUERY_INVALID');
  });
  test('query null graph throws', async () => {
    const mapper = new GraphifyMCPMapper();
    await expect(mapper.query(null as unknown as never, 'Alpha')).rejects.toThrow('GRAPHIFY_QUERY_INVALID');
  });
  test('explain not found throws', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    await expect(mapper.explain(graph, 'NonExistentSymbolXYZ')).rejects.toThrow('GRAPHIFY_EXPLAIN_NOT_FOUND');
  });
  test('path empty from throws', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    await expect(mapper.path(graph, '', 'Alpha')).rejects.toThrow('GRAPHIFY_PATH_INVALID');
  });
  test('merge empty slices returns empty graph', async () => {
    const mapper = new GraphifyMCPMapper();
    const merged = await mapper.merge([]);
    expect(merged.nodes.length).toBe(0);
    expect(merged.edges.length).toBe(0);
  });
  test('merge dedupes by id', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    const merged = await mapper.merge([graph, graph]);
    expect(merged.nodes.length).toBe(graph.nodes.length);
    expect(merged.edges.length).toBe(graph.edges.length);
  });
  test('merge concurrent slices', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    const results = await Promise.all([mapper.merge([graph]), mapper.merge([graph, graph]), mapper.merge([])]);
    expect(results[0].nodes.length).toBe(graph.nodes.length);
    expect(results[1].nodes.length).toBe(graph.nodes.length);
    expect(results[2].nodes.length).toBe(0);
  });
  test('asAgentTools returns 4 tools', async () => {
    const tmp = makeFixture();
    const mapper = new GraphifyMCPMapper();
    const graph = await mapper.extract(tmp, { codeOnly: true });
    const tools = mapper.asAgentTools(graph);
    expect(tools.length).toBe(4);
  });
  test('merge ignores null slices and computes godNodes', async () => {
    const mapper = new GraphifyMCPMapper();
    const merged = await mapper.merge([null as unknown as object, { nodes: [{ id: 'a', label: 'a', type: 'x', file: 'f' }], edges: [{ src: 'a', dst: 'b', relation: 'calls', confidence: 'EXTRACTED' }], communities: [], godNodes: [] } as unknown as object]);
    expect(merged.nodes.length).toBe(1);
    expect(merged.godNodes.length).toBeGreaterThanOrEqual(1);
  });
});
