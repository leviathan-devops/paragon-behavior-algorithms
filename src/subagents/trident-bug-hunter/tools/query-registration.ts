// src/subagents/trident-bug-hunter/tools/query-registration.ts
// THE 7-VERB QUERY TOOL REGISTRATION (W7, spec §5.2:2367-2374 — K5.1). The
// awareness surface for ALL agents — the 7 verbs (who-calls/chain/
// must-implement/unwired/rule/violations/consistency) read the shared DB + the
// graph. THE NO-REINJECTION LAW (D11): the agents' context queries answer from
// the stored graph + findings — the 500K corpus re-read dies at this surface.
//
// THE DB RESOLUTION: the store path is the project's ONE durable truth
// (<project>/.trident/knowledge-graph/shared.db — spec §1.3:119). The tool
// receives the runId/verb/... args; the targetPath the DB resolves from is the
// optional arg (the platform passes the project root the session hunts). The
// execute is READ-ONLY + deterministic (the query surface never writes).

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'node:path';
import { openStore } from '../../../shared/knowledge-graph/db.ts';
import { runQuery, type QueryVerb } from '../surface/query-tool.ts';
import { CorbellEmbeddings } from '../graph/corbell-embeddings.ts';
import { createDocsPatterns } from './docs-patterns.ts';

export interface QueryToolArgs {
  verb: QueryVerb;
  symbol?: string;
  from?: string;
  to?: string;
  ruleId?: string;
  week?: string;
  runId?: string;
  query?: string;
  topK?: number;
  format?: 'table' | 'llm' | 'full';
  limit?: number;
  offset?: number;
  proposed?: string;
  targetPath: string;
}

/** Resolve the shared store path for the project (the ONE durable truth). */
export function queryStorePath(targetPath: string): string {
  return path.join(targetPath, '.trident', 'knowledge-graph', 'shared.db');
}

/** THE QUERY EXECUTE — the verb runner over the project's shared store + the
 *  corbell-native surfaces (the semantic + the docs patterns). Fail-closed: an
 *  unreadable store is the named SQLITE error (the store's own open), never a
 *  silent empty. The semantic/docs verbs wire the corbell-native surfaces —
 *  the embeddings store + the docs patterns store — so the machine's awareness
 *  surface reaches the vendor's semantic + docs layers. */
export async function runQueryTool(args: QueryToolArgs): Promise<string> {
  const db = openStore(queryStorePath(args.targetPath));
  try {
    const corbell = new CorbellEmbeddings({ projectRoot: args.targetPath });
    const rows = runQuery(
      {
        verb: args.verb,
        symbol: args.symbol,
        from: args.from,
        to: args.to,
        ruleId: args.ruleId,
        week: args.week,
        runId: args.runId,
        query: args.query,
        topK: args.topK,
        format: args.format,
        limit: args.limit,
        offset: args.offset,
        proposed: args.proposed,
      },
      db,
      undefined,
      { semantic: corbell, docs: createDocsPatterns({ projectRoot: args.targetPath }) },
    );
    return JSON.stringify(rows, null, 2);
  } finally {
    db.close();
  }
}

/** THE TOOL CREATOR — the trident-tools.ts registration consumes this. */
export function createBugHunterQueryTool() {
  return tool({
    description:
      'Query the bug-hunter knowledge graph: the 7 structural verbs (who-calls, chain, must-implement, unwired, rule, violations, consistency) answer the architecture questions from the stored graph + findings, and the 3 corbell-native verbs (semantic-search, code-search, docs-patterns) answer the semantic + the design-pattern questions through the corbell embeddings + docs layers — the awareness surface that replaces the corpus re-read.',
    args: {
      verb: z.enum(['who-calls', 'chain', 'must-implement', 'unwired', 'rule', 'violations', 'consistency', 'semantic-search', 'code-search', 'docs-patterns', 'blast-radius', 'would-break']).describe('The query verb'),
      symbol: z.string().optional().describe('The symbol for who-calls / chain'),
      from: z.string().optional().describe('The chain start (chain verb)'),
      to: z.string().optional().describe('The chain target (chain verb)'),
      ruleId: z.string().optional().describe('The rule id (rule verb)'),
      week: z.string().optional().describe('The ISO week (violations verb)'),
      runId: z.string().optional().describe('The run id (violations / rule verb)'),
      query: z.string().optional().describe('The free-text query (semantic-search / code-search verb)'),
      topK: z.number().optional().describe('The top-k results (semantic-search / code-search, default 10)'),
      format: z.enum(['table', 'llm', 'full']).optional().describe('The output format (the llm format emits the token-minimal records)'),
      limit: z.number().optional().describe('Pagination limit (violations verb)'),
      offset: z.number().optional().describe('Pagination offset (violations verb)'),
      proposed: z.string().optional().describe('Proposed signature (would-break verb)'),
      targetPath: z.string().describe('Absolute path to the project root whose shared store the query reads'),
    },
    execute: async (args: QueryToolArgs): Promise<string> => {
      return runQueryTool(args);
    },
  });
}
