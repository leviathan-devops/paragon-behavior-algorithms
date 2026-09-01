// src/subagents/trident-bug-hunter/graph/ix-adapter.ts
// THE IX ADAPTER (W2, spec §3.4 lines 781-848) — the 26→34-language breadth
// fallback (D4), TRIGGER-GATED: registered ONLY when the profile selects
// `substrate: 'ix'`. Its `--format llm` output concept (map.ts:116,
// docs/llm-format.md) informs the query surface's llm mode (D22).
//
// THE WIRED ADAPTER (the V1.1 shell-class is dead): the query verbs shell the
// REAL ix CLI — `ix callers <symbol> --format llm` (whoCalls) · `ix trace
// <id> --format llm` (chain) · `ix depends <module> --format llm` (imports) ·
// `ix inventory --format llm` (nodes) — the wire-don't-build law (C1.12): the
// CLI is the silver-platter, this file is the thin typed shell over it. The
// answer data is the CLI's own llm-format records, never a placeholder.
//
// THE VERIFIED SURFACE (C7.2, from the spec): `ix map [--format json]` ·
// `ix callers <symbol> --format llm` · `ix trace <id> --format llm` ·
// `ix depends <module> --format llm` · `ix smells` · `ix inventory --format llm`
// · `ix docker start` (the ArangoDB backend). The persistence claim:
// "The graph lives on your machine, and it persists" (README:51-52).
//
// THE FAILURE MODES (spec §3.4:848): the ArangoDB backend down (the
// `ix docker start` ensure + a named ADAPTER_FAILED when the daemon cannot
// start), the alpha API churn ("APIs and behavior may change" — the defensive
// parsing + the trigger-gate keeps it OUT of the primary path), the G7.6
// llm-record edge cases (a non-matching non-blank line is DEBUG-logged, never
// a throw).

import type {
  GraphAdapter, GraphNode, GraphEdge, BuildResult,
  CallSite, ChainStep, ImportEdge, AwaitEdge, DeadNode, GraphNodeKind,
} from './interface.ts';
import { adapterFailed, adapterParseError, graphEmpty } from './interface.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema';
import type { ExecFn } from './corbell-adapter.ts';
import { defaultExec } from './corbell-adapter.ts';

// ---------------------------------------------------------------------------
// THE 34-ENTRY LANGUAGE ENUM (spec §2.5:301 — "26+ (the 34-entry enum)") — the
// machine's language map for the ix substrate. FLAG (honest): the spec cites
// the enum's COUNT (34) but never lists the entries — the names below are the
// canonical tree-sitter grammar set a tree-sitter-based multi-language graph
// tool ships; VERIFY against the real `ix` CLI (`ix inventory` / `ix --help`)
// at the W2 first run (the alpha API churn, spec §3.4:848). A typed enum
// catches the alpha API churn at compile time rather than at runtime; the
// isIxLanguage guard keeps the runtime validation on the same registry.
// ---------------------------------------------------------------------------
export const IX_LANGUAGES = [
  'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp',
  'csharp', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'zig', 'haskell',
  'elixir', 'erlang', 'clojure', 'lua', 'r', 'julia', 'perl', 'dart',
  'bash', 'elm', 'ocaml', 'fsharp', 'nim', 'vue', 'html', 'css', 'sql',
  'protobuf',
] as const;
export type IxLanguage = (typeof IX_LANGUAGES)[number];

/** The enum guard: a language token is an IxLanguage only when the enum
 *  carries it. Unknown tokens (the alpha churn) fail the guard — the caller
 *  DEBUG-logs rather than throws (G7.6). */
export function isIxLanguage(value: string): value is IxLanguage {
  // THE R16 TYPE_CERTAINTY GUARD — the language list is narrowed to the string
  // read surface behind the Array.isArray check.
  const langs = IX_LANGUAGES;
  if (Array.isArray(langs)) {
    return (langs as readonly string[]).includes(value);
  }
  return false;
}

/** THE LLM-RECORD DETECTOR (spec §3.4:834-838 — the DETECTOR only): the
 *  `caller=NAME file=PATH:LINE` records `ix callers` emits in --format llm. */
const LLM_RECORD_RE = /caller=(\S+)\s+file=(\S+?):(\d+)/;

/** Parse the `--format llm` newline-delimited call-site records. */
export function parseLlmCallSites(stdout: string): CallSite[] {
  const sites: CallSite[] = [];
  for (const line of stdout.split('\n')) {
    const m = LLM_RECORD_RE.exec(line);
    if (m) {
      sites.push({ caller: m[1], file: m[2], line: Number(m[3]) });
    } else if (line.trim().length > 0) {
      // the alpha API churn (G7.6): a non-matching non-blank line is DEBUG-logged,
      // never a throw — the trigger-gate keeps ix out of the primary path anyway.
      console.debug(`[ix-adapter] skipping unparseable llm record: "${line.trim()}"`);
    }
  }
  return sites;
}

/** THE TRACE-RECORD DETECTOR (the DETECTOR only): the `from=NAME to=NAME
 *  kind=KIND file=PATH:LINE` records `ix trace` emits in --format llm. */
const TRACE_RECORD_RE = /from=(\S+)\s+to=(\S+)\s+kind=(\S+)\s+file=(\S+?):(\d+)/;

/** Parse the `--format llm` trace records into the ChainStep shape. The
 *  G7.6 posture: a non-matching non-blank line is DEBUG-logged, never a throw. */
export function parseLlmTrace(stdout: string): ChainStep[] {
  const steps: ChainStep[] = [];
  for (const line of stdout.split('\n')) {
    const m = TRACE_RECORD_RE.exec(line);
    if (m) {
      steps.push({ from: m[1], to: m[2], kind: m[3], file: m[4], line: Number(m[5]) });
    } else if (line.trim().length > 0) {
      console.debug(`[ix-adapter] skipping unparseable llm trace record: "${line.trim()}"`);
    }
  }
  return steps;
}

/** THE DEPENDS-RECORD DETECTOR (the DETECTOR only): the `from=NAME to=NAME
 *  file=PATH:LINE` records `ix depends` emits in --format llm. */
const DEPENDS_RECORD_RE = /from=(\S+)\s+to=(\S+)\s+file=(\S+?):(\d+)/;

/** Parse the `--format llm` depends records into the ImportEdge shape. The
 *  G7.6 posture: a non-matching non-blank line is DEBUG-logged, never a throw. */
export function parseLlmDepends(stdout: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const line of stdout.split('\n')) {
    const m = DEPENDS_RECORD_RE.exec(line);
    if (m) {
      edges.push({ from: m[1], to: m[2], file: m[3], line: Number(m[4]) });
    } else if (line.trim().length > 0) {
      console.debug(`[ix-adapter] skipping unparseable llm depends record: "${line.trim()}"`);
    }
  }
  return edges;
}

/** THE INVENTORY-RECORD DETECTOR (the DETECTOR only — the alpha API, spec
 *  §3.4:848): the `ix inventory --format llm` node-listing records. The shape
 *  is unverified against a real CLI — the detector accepts a KEY=TOKEN sequence
 *  ending in `file=PATH:LINE` (id=/name=/kind=/lang= prefixes), extracting
 *  whatever fields exist. A record without a file anchor is DEBUG-logged, never
 *  a throw. IDs follow the parseMapJson `ix:` prefix convention so the graph
 *  never holds unprefixed nodes. */
const INVENTORY_FILE_RE = /(?:^|\s)file=(\S+?):(\d+)/;
// the g flag is REQUIRED for matchAll (a non-global regex throws TypeError).
const INVENTORY_TOKEN_RE = /(?:^|\s)(id|name|kind|lang)=(\S+)/g;

const KNOWN_NODE_KINDS: readonly GraphNodeKind[] =
  ['class', 'function', 'method', 'module', 'stage', 'rule', 'file'];

/** Parse the `--format llm` inventory output into GraphNode rows (CODE_DERIVED,
 *  `ix:`-prefixed ids, kind normalized to the union, the lang token validated
 *  against the enum). Empty output returns [] — the caller recovers via the
 *  build-time map cache (the alpha shape churn, G7.6). */
export function parseLlmInventory(stdout: string): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fileMatch = INVENTORY_FILE_RE.exec(trimmed);
    if (!fileMatch) {
      console.debug(`[ix-adapter] skipping unparseable llm inventory record: "${trimmed}"`);
      continue;
    }
    const tokens: Record<string, string> = {};
    for (const m of trimmed.matchAll(INVENTORY_TOKEN_RE)) tokens[m[1]] = m[2];
    const file = fileMatch[1];
    const lineNo = Number(fileMatch[2]);
    const idToken = tokens['id'] ?? tokens['name'] ?? file;
    const kindToken = tokens['kind'];
    const langToken = tokens['lang'];
    if (langToken !== undefined && !isIxLanguage(langToken)) {
      // the alpha API churn: an unknown language token is DEBUG-logged (G7.6),
      // never a throw — the enum catches the drift at the guard.
      console.debug(`[ix-adapter] inventory record carries language '${langToken}' outside the ${IX_LANGUAGES.length}-entry enum (alpha churn): "${trimmed}"`);
    }
    nodes.push({
      id: `ix:${idToken}`,
      kind: (KNOWN_NODE_KINDS as readonly string[]).includes(kindToken ?? '') ? (kindToken as GraphNodeKind) : 'file',
      name: tokens['name'] ?? tokens['id'] ?? file,
      file,
      line: lineNo,
      lineage: 'CODE_DERIVED',
      source: `${file}:${lineNo}`,
      data: langToken !== undefined ? { language: langToken } : undefined,
    });
  }
  return nodes;
}

/** Defensive map-JSON parse: the `ix map . --format json` shape is the alpha
 *  API's — accept {nodes:[...], edges:[...]} OR an array, extracting whatever
 *  fields exist (id/name/kind/file/line/source). */

/** THE R16 TYPE_CERTAINTY GUARDED READ — a parsed object's nodes field is read
 *  behind the typeof/null guard before the typed access. */
function parsedNodes(parsed: unknown): unknown {
  if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
    const nodes = (parsed as { nodes?: unknown }).nodes;
    if (nodes !== undefined) return nodes;
  }
  return undefined;
}
export function parseMapJson(parsed: unknown): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const list = Array.isArray(parsed) ? parsed : parsedNodes(parsed);
  if (Array.isArray(list)) {
    for (const item of list as Record<string, unknown>[]) {
      const id = String(item['id'] ?? item['name'] ?? '');
      if (!id) continue;
      nodes.push({
        id: `ix:${id}`,
        kind: (item['kind'] as GraphNodeKind) ?? 'file',
        name: String(item['name'] ?? id),
        file: typeof item['file'] === 'string' ? (item['file'] as string) : undefined,
        line: typeof item['line'] === 'number' ? (item['line'] as number) : undefined,
        lineage: 'CODE_DERIVED',
        source: 'ix',
        data: item,
      });
    }
  }
  const edgeList = (parsed as { edges?: unknown })?.edges;
  if (Array.isArray(edgeList)) {
    for (const item of edgeList as Record<string, unknown>[]) {
      const sourceId = String(item['sourceId'] ?? item['from'] ?? item['source']);
      const targetId = String(item['targetId'] ?? item['to'] ?? item['target']);
      if (!sourceId || !targetId) continue;
      edges.push({
        sourceId: `ix:${sourceId}`,
        targetId: `ix:${targetId}`,
        kind: (item['kind'] as GraphEdge['kind']) ?? 'calls',
        lineage: 'CODE_DERIVED',
        line: typeof item['line'] === 'number' ? (item['line'] as number) : undefined,
      });
    }
  }
  return { nodes, edges };
}

/** The trigger-gated adapter. Constructing it for a profile that does NOT
 *  select 'ix' throws the named NOT_CONFIGURED-style ADAPTER_FAILED — the gate
 *  is MECHANICAL (the constructor), never a silent no-op. The query verbs
 *  answer from the REAL ix CLI (the wired adapter — spec §3.4:804-810). */
export class IxAdapter implements GraphAdapter {
  private cachedNodes: GraphNode[] = [];
  private cachedEdges: GraphEdge[] = [];
  private built = false;

  constructor(
    private profile: ProjectProfile,
    private exec: ExecFn = defaultExec,
  ) {
    if (profile.graph.substrate !== 'ix') {
      throw adapterFailed(
        'ix',
        `NOT_CONFIGURED - the ix adapter is trigger-gated: it registers ONLY when profile.graph.substrate === 'ix' (current: '${profile.graph.substrate}')`,
      );
    }
  }

  async build(profile: ProjectProfile): Promise<BuildResult> {
    // the ArangoDB backend ensure — the spec's `ix docker start` when the
    // backend is down (D4); a daemon that cannot start is the named failure.
    try {
      this.exec('ix docker start', { cwd: profile.project.root, timeout: 120_000 });
    } catch (e: unknown) {
      throw adapterFailed('ix docker start', `the ArangoDB backend could not start: ${String(e)}`);
    }
    const t0 = Date.now();
    let stdout: string;
    try {
      stdout = this.exec('ix map . --format json', { cwd: profile.project.root, timeout: 120_000 });
    } catch (e: unknown) {
      throw adapterFailed('ix map . --format json', `the CLI call failed: ${String(e)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch (e: unknown) {
      throw adapterParseError('ix map json', `the --format json output did not parse: ${String(e)}`);
    }
    const { nodes, edges } = parseMapJson(parsed);
    if (nodes.length === 0) throw graphEmpty('ix map produced zero nodes');
    this.cachedNodes = nodes;
    this.cachedEdges = edges;
    this.built = true;
    return {
      nodes,
      edges,
      durationMs: Date.now() - t0,
      adapter: 'ix',
      lineage: {
        spec: 0,
        code: nodes.filter((n) => n.lineage === 'CODE_DERIVED').length + edges.filter((e) => e.lineage === 'CODE_DERIVED').length,
        hybrid: 0,
      },
      command: 'ix map . --format json',
    };
  }

  private ensureBuilt(): void {
    if (!this.built) {
      throw adapterFailed('ix query', 'no graph built — call build() first (the query verbs read the built graph)');
    }
  }

  whoCalls(symbol: string): CallSite[] {
    // THE EXEC (spec §3.4:805) — the real CLI, the llm format, the 30s timeout.
    // Error path FIRST: an exec failure (the binary missing / the backend down /
    // the timeout) is the named ADAPTER_FAILED with the command — never a raw
    // child_process error leaking past the contract.
    let out: string;
    try {
      out = this.exec(`ix callers ${symbol} --format llm`, { cwd: this.profile.project.root, timeout: 30_000 });
    } catch (e: unknown) {
      throw adapterFailed(`ix callers ${symbol} --format llm`, `the CLI call failed: ${String(e)}`);
    }
    return parseLlmCallSites(out);
  }

  chain(id: string): ChainStep[] {
    this.ensureBuilt();
    let out: string;
    try {
      out = this.exec(`ix trace ${id} --format llm`, { cwd: this.profile.project.root, timeout: 30_000 });
    } catch (e: unknown) {
      throw adapterFailed(`ix trace ${id} --format llm`, `the CLI call failed: ${String(e)}`);
    }
    return parseLlmTrace(out);
  }

  imports(module: string): ImportEdge[] {
    this.ensureBuilt();
    let out: string;
    try {
      out = this.exec(`ix depends ${module} --format llm`, { cwd: this.profile.project.root, timeout: 30_000 });
    } catch (e: unknown) {
      throw adapterFailed(`ix depends ${module} --format llm`, `the CLI call failed: ${String(e)}`);
    }
    return parseLlmDepends(out);
  }

  awaits(_symbol: string): AwaitEdge[] {
    this.ensureBuilt();
    return this.cachedEdges
      .filter((e) => e.kind === 'awaits')
      .map((e) => ({ from: e.sourceId, to: e.targetId, file: this.profile.project.root, line: e.line ?? 0 }));
  }

  unwired(): DeadNode[] {
    this.ensureBuilt();
    const targets = new Set(this.cachedEdges.filter((e) => e.kind === 'calls').map((e) => e.targetId));
    return this.cachedNodes
      .filter((n) => !targets.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, file: n.file ?? this.profile.project.root, line: n.line ?? 0 }));
  }

  nodes(kind?: GraphNodeKind): GraphNode[] {
    if (!this.built) return [];
    // THE EXEC (spec §3.4:810 — `nodes → ix inventory --format llm`) — the
    // query-time listing, the llm format, the 30s timeout. Error path FIRST:
    // an exec failure is the named ADAPTER_FAILED (a LOUD fail, never a silent
    // cache answer). The shape churn (G7.6) is the RECOVERY path: rows the
    // alpha inventory output does not parse are DEBUG-logged, and the merged
    // result fills them from the build-time `ix map` rows (the cache) — the
    // SAME graph through a DIFFERENT real CLI verb, never a substitute artifact.
    let inventory: GraphNode[];
    try {
      inventory = parseLlmInventory(this.exec('ix inventory --format llm', { cwd: this.profile.project.root, timeout: 30_000 }));
    } catch (e: unknown) {
      throw adapterFailed('ix inventory --format llm', `the CLI call failed: ${String(e)}`);
    }
    // The merge: the query-time inventory rows are the fresher truth; the
    // build-time map rows fill the shape-churn gaps. Dedup by the `ix:` id.
    const byId = new Map<string, GraphNode>();
    for (const n of [...inventory, ...this.cachedNodes]) byId.set(n.id, n);
    const merged = [...byId.values()];
    return kind === undefined ? merged : merged.filter((n) => n.kind === kind);
  }
}
