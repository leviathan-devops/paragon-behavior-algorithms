// src/subagents/trident-bug-hunter/graph/native-ast-adapter.ts
// THE NATIVE-AST ADAPTER (W2, spec §3.5 lines 852-883) — the LAST-RESORT
// fallback: the tsc Program pass extracting the classes/functions/imports/
// calls/awaits into the same GraphNode/Edge shapes (D5). NEVER the default;
// never built from scratch while Corbell/Ix cover the need (R11.5). It exists
// so the machine ALWAYS has a substrate even when the corbell binary is absent
// and the profile does not gate to ix — and the G11.2 honest note records
// when this path is what actually ran.
//
// THE CONTRACT (spec §3.5:857-877): find the nearest tsconfig (resolve up),
// ts.createProgram over its include tree, walk the source files:
//   - class declarations → class nodes + method nodes
//   - function declarations + function-valued variable statements → function nodes
//   - import declarations → { kind: 'imports' } edges
//   - call expressions → { kind: 'calls' } edges (awaited → { kind: 'awaits' })
// Every node is CODE_DERIVED with the file:line source anchor. The excluded
// dirs (profile.graph.excludes) are filtered BEFORE the walk.


import path from 'node:path';
import ts from 'typescript';
import type {
  GraphAdapter, GraphNode, GraphEdge, BuildResult,
  CallSite, ChainStep, ImportEdge, AwaitEdge, DeadNode, GraphNodeKind,
} from './interface.ts';
import { adapterFailed, graphEmpty } from './interface.ts';
import type { ProjectProfile } from '../../../shared/knowledge-graph/profile-schema';

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; // 1-indexed
}

/** Is the absolute file path inside an excluded dir? (profile.graph.excludes) */
function isExcluded(abs: string, root: string, excludes: string[]): boolean {
  for (const ex of excludes) {
    const exAbs = path.isAbsolute(ex) ? path.resolve(ex) : path.resolve(root, ex);
    if (abs === exAbs || abs.startsWith(exAbs + path.sep)) return true;
  }
  return false;
}

/** The source-file walk: returns the file's nodes + edges. */
function walkSourceFile(
  sf: ts.SourceFile,
  rel: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const push = (n: GraphNode): void => { nodes.push(n); };

  // the file itself is a node (the module anchor for the imports edges)
  push({ id: `file:${rel}`, kind: 'file', name: rel, file: rel, line: 1, lineage: 'CODE_DERIVED', source: `${rel}:1` });

  // classes → class node + method nodes
  for (const stmt of sf.statements) {
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      const clsName = stmt.name.text;
      const clsLine = lineOf(sf, stmt);
      push({ id: `class:${clsName}`, kind: 'class', name: clsName, file: rel, line: clsLine, lineage: 'CODE_DERIVED', source: `${rel}:${clsLine}` });
      for (const member of stmt.members) {
        const isMethod = ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member) || ts.isConstructorDeclaration(member);
        if (isMethod && member.name && ts.isIdentifier(member.name)) {
          const mName = `${clsName}.${member.name.text}`;
          push({ id: `method:${mName}`, kind: 'method', name: mName, file: rel, line: lineOf(sf, member), lineage: 'CODE_DERIVED', source: `${rel}:${lineOf(sf, member)}` });
        }
      }
    }
  }

  // top-level functions
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const fnName = stmt.name.text;
      const fnLine = lineOf(sf, stmt);
      push({ id: `fn:${fnName}`, kind: 'function', name: fnName, file: rel, line: fnLine, lineage: 'CODE_DERIVED', source: `${rel}:${fnLine}` });
    }
  }

  // imports
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const target = stmt.moduleSpecifier.text;
      const targetRel = target.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), target))
        : target;
      edges.push({ sourceId: `file:${rel}`, targetId: `file:${targetRel}`, kind: 'imports', lineage: 'CODE_DERIVED', file: rel, line: lineOf(sf, stmt) });
    }
  }

  // calls + awaits: the AST walk tracks the enclosing function so every call
  // edge is attributed to its caller. The callee must be an IDENTIFIER (the
  // honest subset — member/property calls need a type-checker resolution that
  // the fallback does not attempt). The caller id matches the node id space
  // ('fn:X' for a top-level function, 'method:Class.member' for a method).
  let currentClass: string | null = null;
  let currentFnId: string | null = null;
  // The parent is passed EXPLICITLY: this TS version (6.0.3) leaves `node.parent`
  // unbound for these walkers (verified by probe), so the await-detection relies
  // on the walk's own parent, never on the binder's `.parent` field.
  const visit = (node: ts.Node, parent: ts.Node | undefined): void => {
    const prevClass = currentClass;
    const prevFn = currentFnId;
    if (ts.isClassDeclaration(node) && node.name) currentClass = node.name.text;
    if (ts.isFunctionDeclaration(node) && node.name) currentFnId = `fn:${node.name.text}`;
    if ((ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isConstructorDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      currentFnId = currentClass ? `method:${currentClass}.${node.name.text}` : `fn:${node.name.text}`;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const inAwait = parent !== undefined && ts.isAwaitExpression(parent);
      const callerId = currentFnId ?? `file:${rel}`;
      edges.push({
        sourceId: callerId,
        targetId: `fn:${callee}`,
        kind: inAwait ? 'awaits' : 'calls',
        lineage: 'CODE_DERIVED',
        file: rel,
        line: lineOf(sf, node),
      });
    }
    ts.forEachChild(node, (child) => visit(child, node));
    currentClass = prevClass;
    currentFnId = prevFn;
  };
  visit(sf, undefined);

  return { nodes, edges };
}

/** The last-resort fallback — the tsc Program pass (spec §3.5). */
export class NativeAstAdapter implements GraphAdapter {
  private cachedNodes: GraphNode[] = [];
  private cachedEdges: GraphEdge[] = [];
  private built = false;

  constructor(
    private profile: ProjectProfile,
  ) {}

  private findTsconfig(root: string): string {
    const found = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!found) {
      throw adapterFailed('ts.createProgram', `no tsconfig.json found under ${root} (resolved up) — the native-ast fallback needs a tsconfig`);
    }
    return found;
  }

  async build(profile: ProjectProfile): Promise<BuildResult> {
    const t0 = Date.now();
    const configPath = this.findTsconfig(profile.project.root);
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) {
      throw adapterFailed('tsconfig read', `could not read ${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
    }
    const config = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    const program = ts.createProgram(config.fileNames, config.options);
    const root = path.resolve(profile.project.root);
    const excludes = profile.graph.excludes;

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (const sf of program.getSourceFiles()) {
      const abs = path.resolve(sf.fileName);
      // the project tree only: the program also contains the compiler's default
      // library files (lib.es5.d.ts etc.) which must never pollute the graph
      if (!abs.startsWith(root + path.sep)) continue;
      if (abs.includes(`${path.sep}node_modules${path.sep}`)) continue;
      if (abs.includes(`${path.sep}.trident${path.sep}`)) continue;
      if (isExcluded(abs, root, excludes)) continue;
      const rel = path.relative(root, abs);
      const walked = walkSourceFile(sf, rel);
      nodes.push(...walked.nodes);
      edges.push(...walked.edges);
    }
    if (nodes.length === 0) {
      throw graphEmpty(`native-ast found no declarations under ${profile.graph.scope.join(', ')} (tsconfig: ${configPath})`);
    }
    // resolve the import edges to REAL file nodes: the TS specifier ('./helper')
    // lacks the extension, the node is 'file:src/helper.ts'. Try the extension
    // variants against the actual file-node set (data-driven — nothing fitted);
    // a bare/external module (e.g. 'zod') stays raw — it has no file node here.
    const fileIds = new Set(nodes.filter((n) => n.kind === 'file').map((n) => n.id));
    for (const e of edges) {
      if (e.kind !== 'imports' || fileIds.has(e.targetId)) continue;
      const base = e.targetId.startsWith('file:') ? e.targetId.slice('file:'.length) : e.targetId;
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, path.posix.join(base, 'index.ts')];
      const hit = candidates.map((c) => `file:${c}`).find((c) => fileIds.has(c));
      if (hit) e.targetId = hit;
    }
    // THE DANGLING-EDGE DROP (Wave X live catch): an import edge to an EXTERNAL
    // module ('events', 'zod') has no file node in this tree — writeGraph's
    // graph_edges FK (REFERENCES graph_nodes(id)) rejects any edge whose
    // endpoints are not emitted nodes, and one bad edge aborted the WHOLE
    // build (the GRAPH_LOGIC: FAILED live run). Drop them loudly — the graph
    // models THIS tree's internal structure; external specifiers are not
    // graph entities.
    const allIds = new Set(nodes.map((n) => n.id));
    const beforeDrop = edges.length;
    const internal = edges.filter((e) => allIds.has(e.sourceId) && allIds.has(e.targetId));
    const dropped = beforeDrop - internal.length;
    if (dropped > 0) {
      console.warn(`[native-ast] dropped ${dropped} dangling edges (endpoints outside the emitted node set — external imports)`);
    }
    // THE DUPLICATE-ID DEDUPE (host live catch, 2026-08-31): the bare-name id
    // scheme (class:X, fn:y — NOT file-qualified) collides across files at
    // repo scale (two Service configs in two files = one class:X); graph_nodes
    // id is the PRIMARY KEY and one duplicate aborted the WHOLE writeGraph
    // (UNIQUE constraint failed: graph_nodes.id — the INCONCLUSIVE host run).
    // First-wins dedupe: the kept node carries the id every duplicate edge
    // already references, so the edges stay referentially intact.
    const seenIds = new Set<string>();
    const uniqueNodes = nodes.filter((n) => (seenIds.has(n.id) ? false : (seenIds.add(n.id), true)));
    const dupNodes = nodes.length - uniqueNodes.length;
    if (dupNodes > 0) {
      console.warn(`[native-ast] deduped ${dupNodes} duplicate node ids (bare-name scheme collisions across files — first-wins)`);
    }
    const keptIds = new Set(uniqueNodes.map((n) => n.id));
    const uniqueEdges = internal.filter((e) => keptIds.has(e.sourceId) && keptIds.has(e.targetId));
    this.cachedNodes = uniqueNodes;
    this.cachedEdges = uniqueEdges;
    this.built = true;
    return {
      nodes: uniqueNodes,
      edges: uniqueEdges,
      durationMs: Date.now() - t0,
      adapter: 'native-ast',
      lineage: {
        spec: 0,
        code: nodes.filter((n) => n.lineage === 'CODE_DERIVED').length + edges.filter((e) => e.lineage === 'CODE_DERIVED').length,
        hybrid: 0,
      },
      command: `ts.createProgram(${configPath})`,
    };
  }

  private ensureBuilt(): void {
    if (!this.built) {
      throw adapterFailed('native-ast query', 'no graph built — call build() first');
    }
  }

  whoCalls(symbol: string): CallSite[] {
    this.ensureBuilt();
    // the caller supplies a bare name; resolve against BOTH id spaces
    const target = this.cachedNodes.some((n) => n.id === `method:${symbol}`)
      ? `method:${symbol}`
      : `fn:${symbol}`;
    return this.cachedEdges
      .filter((e) => (e.kind === 'calls' || e.kind === 'awaits') && e.targetId === target)
      .map((e) => ({ file: e.file ?? this.profile.project.root, line: e.line ?? 0, caller: e.sourceId }));
  }

  chain(id: string): ChainStep[] {
    this.ensureBuilt();
    const start = id.startsWith('fn:') || id.startsWith('file:') || id.startsWith('class:') || id.startsWith('method:') ? id : `fn:${id}`;
    const steps: ChainStep[] = [];
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const from = queue.shift()!;
      for (const e of this.cachedEdges.filter((x) => (x.kind === 'calls' || x.kind === 'awaits') && x.sourceId === from)) {
        steps.push({ from, to: e.targetId, kind: e.kind, file: e.file ?? this.profile.project.root, line: e.line ?? 0 });
        if (!seen.has(e.targetId)) {
          seen.add(e.targetId);
          queue.push(e.targetId);
        }
      }
    }
    return steps;
  }

  imports(module: string): ImportEdge[] {
    this.ensureBuilt();
    const start = module.startsWith('file:') ? module : `file:${module}`;
    return this.cachedEdges
      .filter((e) => e.kind === 'imports' && e.sourceId === start)
      .map((e) => ({ from: e.sourceId, to: e.targetId, file: e.file ?? this.profile.project.root, line: e.line ?? 0 }));
  }

  awaits(symbol: string): AwaitEdge[] {
    this.ensureBuilt();
    const start = `fn:${symbol}`;
    return this.cachedEdges
      .filter((e) => e.kind === 'awaits' && e.sourceId === start)
      .map((e) => ({ from: e.sourceId, to: e.targetId, file: e.file ?? this.profile.project.root, line: e.line ?? 0 }));
  }

  unwired(): DeadNode[] {
    this.ensureBuilt();
    const targets = new Set(this.cachedEdges.filter((e) => e.kind === 'calls').map((e) => e.targetId));
    return this.cachedNodes
      .filter((n) => (n.kind === 'function' || n.kind === 'method' || n.kind === 'class') && !targets.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, file: n.file ?? this.profile.project.root, line: n.line ?? 0 }));
  }

  nodes(kind?: GraphNodeKind): GraphNode[] {
    if (!this.built) return [];
    return kind === undefined ? [...this.cachedNodes] : this.cachedNodes.filter((n) => n.kind === kind);
  }
}
