import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const GRAPHIFY_PYTHON = process.env['GRAPHIFY_PYTHON'] ?? '/home/leviathan/.local/share/uv/tools/graphifyy/bin/python';

export class GraphifyMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(graphPath: string): Promise<void> {
    if (typeof graphPath !== 'string' || graphPath.trim() === '') {
      throw new Error('GRAPHIFY_CONNECT_INVALID: graphPath must be non-empty string');
    }
    if (this.client) {
      await this.disconnect();
    }
    this.transport = new StdioClientTransport({
      command: GRAPHIFY_PYTHON,
      args: ['-m', 'graphify.serve', graphPath],
    });
    this.client = new Client(
      { name: 'aether-hydra', version: '1.0.0' },
      { capabilities: {} },
    );
    try {
      await this.client.connect(this.transport);
    } catch (err) {
      this.client = null;
      this.transport = null;
      throw new Error(`GRAPHIFY_MCP_CONNECT_FAILED: ${String((err as Error).message ?? err)}`);
    }
  }

  async listTools(): Promise<string[]> {
    if (!this.client) throw new Error('Not connected');
    try {
      const result = await this.client.listTools();
      return result.tools.map((t) => t.name);
    } catch (err) {
      throw new Error(`GRAPHIFY_MCP_LIST_FAILED: ${String((err as Error).message ?? err)}`);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error('Not connected');
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('GRAPHIFY_CALL_INVALID: name must be non-empty string');
    }
    try {
      const result = await this.client.callTool({ name, arguments: args as Record<string, string> });
      const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
      if (Array.isArray(content) && content.length > 0) {
        const texts = content.map((c) => c.text ?? JSON.stringify(c)).join('\n');
        return texts;
      }
      return result;
    } catch (err) {
      if (String((err as Error).message ?? '').includes('Not connected')) throw err;
      throw new Error(`GRAPHIFY_MCP_CALL_FAILED: ${name} \u2014 ${String((err as Error).message ?? err)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
      }
      this.client = null;
    }
    this.transport = null;
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}

export function createGraphifyTools(mcp: GraphifyMCPClient): AgentTool[] {
  if (!mcp) throw new Error('GRAPHIFY_TOOLS_INVALID: mcp client required');

  const queryTool: AgentTool = {
    name: 'graphify:query',
    label: 'Graph Query',
    description: 'Ask a natural-language question about the codebase structure. Returns a scoped subgraph.',
    parameters: Type.Object({
      question: Type.String({ description: 'The question (e.g. "what connects auth to the database?")' }),
    }),
    execute: async (toolCallId: string, params: unknown, _signal: unknown, _onUpdate: unknown, _context: unknown) => {
      void toolCallId;
      const { question } = params as { question: string };
      const result = await mcp.callTool('query_graph', { question });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  } as unknown as AgentTool;

  const pathTool: AgentTool = {
    name: 'graphify:path',
    label: 'Path Trace',
    description: 'Find the shortest path between two concepts in the code graph.',
    parameters: Type.Object({
      from: Type.String({ description: 'Starting concept name' }),
      to: Type.String({ description: 'Target concept name' }),
    }),
    execute: async (toolCallId: string, params: unknown, _signal: unknown, _onUpdate: unknown, _context: unknown) => {
      void toolCallId;
      const { from, to } = params as { from: string; to: string };
      const result = await mcp.callTool('shortest_path', { source: from, target: to });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  } as unknown as AgentTool;

  const explainTool: AgentTool = {
    name: 'graphify:explain',
    label: 'Explain Concept',
    description: 'Get detailed info about a concept: connections, community, degree, source file.',
    parameters: Type.Object({
      concept: Type.String({ description: 'The concept to explain' }),
    }),
    execute: async (toolCallId: string, params: unknown, _signal: unknown, _onUpdate: unknown, _context: unknown) => {
      void toolCallId;
      const { concept } = params as { concept: string };
      const result = await mcp.callTool('get_node', { label: concept });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  } as unknown as AgentTool;

  const subgraphTool: AgentTool = {
    name: 'graphify:subgraph',
    label: 'Subgraph Extraction',
    description: 'Extract a scoped subgraph around a concept. Use for blast-radius analysis.',
    parameters: Type.Object({
      center: Type.String({ description: 'The center concept' }),
      depth: Type.Optional(Type.Number({ description: 'Max hops from center (default 3)' })),
    }),
    execute: async (toolCallId: string, params: unknown, _signal: unknown, _onUpdate: unknown, _context: unknown) => {
      void toolCallId;
      const { center, depth } = params as { center: string; depth?: number };
      const args: Record<string, unknown> = { label: center };
      if (typeof depth === 'number' && Number.isFinite(depth)) args['depth'] = depth;
      const result = await mcp.callTool('get_neighbors', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  } as unknown as AgentTool;

  return [queryTool, pathTool, explainTool, subgraphTool];
}
