import type { GraphBackedAudit, Audit3DEvidence, GraphSnapshot, GraphDriftResult, CallerInfo, ChainStep, UnwiredInfo, AuditFinding, CallGraph, CodeConstruct } from './types.ts';

function normalizeFilePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function fileMatches(target: string, candidate: string): boolean {
  const nTarget = normalizeFilePath(target);
  const nCandidate = normalizeFilePath(candidate);
  if (nTarget === nCandidate) return true;
  if (nCandidate.endsWith('/' + nTarget)) return true;
  if (nTarget.endsWith('/' + nCandidate)) return true;
  if (nCandidate.endsWith(nTarget)) return true;
  if (nTarget.endsWith(nCandidate)) return true;
  return false;
}

export class GraphBackedAuditClass implements GraphBackedAudit {
  private graphSnapshot: GraphSnapshot | null;
  private callGraph: CallGraph | null;
  private constructsByFile: Map<string, CodeConstruct[]>;
  private allFindings: AuditFinding[];

  constructor(
    graph: GraphSnapshot | CallGraph | null,
    callGraph?: CallGraph | null,
    constructsByFile?: Map<string, CodeConstruct[]> | null,
    findings?: AuditFinding[] | null,
  ) {
    try {
      if (graph && typeof graph === 'object' && 'entries' in (graph as unknown as Record<string, unknown>) && (graph as unknown as CallGraph).entries instanceof Map) {
        const cg = graph as unknown as CallGraph;
        this.callGraph = cg;
        this.graphSnapshot = {
          timestamp: Date.now(),
          nodes: [],
          edges: Array.from(cg.entries.keys()),
          callGraphSnapshot: {
            entries: Array.from(cg.entries.values()).map((e) => ({ calleeFile: e.calleeFile, calleeName: e.calleeName, calleeLine: e.calleeLine, callSites: e.callSites })),
            totalCallSites: cg.totalCallSites,
            resolvedCallSites: cg.resolvedCallSites,
          },
        };
        this.constructsByFile = constructsByFile ?? new Map();
        this.allFindings = findings ?? [];
        return;
      }
      this.graphSnapshot = graph as GraphSnapshot | null;
      this.callGraph = callGraph ?? null;
      if (!this.callGraph && this.graphSnapshot?.callGraphSnapshot) {
        const snap = this.graphSnapshot.callGraphSnapshot;
        const entries = new Map<string, { calleeFile: string; calleeName: string; calleeLine: number; callSites: never[] }>();
        for (const e of snap.entries) {
          const key = e.calleeFile ? `${e.calleeFile}:${e.calleeLine}:${e.calleeName}` : `unresolved:${e.calleeName}`;
          entries.set(key, { calleeFile: e.calleeFile, calleeName: e.calleeName, calleeLine: e.calleeLine, callSites: e.callSites as never[] });
        }
        this.callGraph = {
          entries: entries as unknown as CallGraph['entries'],
          totalCallSites: snap.totalCallSites,
          resolvedCallSites: snap.resolvedCallSites,
          coveragePercent: snap.totalCallSites > 0 ? Math.round((snap.resolvedCallSites / snap.totalCallSites) * 100) : 0,
        };
      }
      this.constructsByFile = constructsByFile ?? new Map();
      this.allFindings = findings ?? [];
      if (!this.graphSnapshot) {
        this.graphSnapshot = { timestamp: Date.now(), nodes: [], edges: [], callGraphSnapshot: undefined };
      }
    } catch (e: unknown) {
      console.error('[GraphBackedAuditClass] constructor failed:', e instanceof Error ? e.message : String(e));
      this.graphSnapshot = { timestamp: Date.now(), nodes: [], edges: [] };
      this.callGraph = callGraph ?? null;
      this.constructsByFile = constructsByFile ?? new Map();
      this.allFindings = findings ?? [];
    }
  }

  updateContext(callGraph: CallGraph | null, constructsByFile: Map<string, CodeConstruct[]>, findings: AuditFinding[]): void {
    try {
      this.callGraph = callGraph;
      this.constructsByFile = constructsByFile;
      this.allFindings = findings;
      if (callGraph) {
        this.graphSnapshot = {
          timestamp: Date.now(),
          nodes: Array.from(constructsByFile.keys()),
          edges: Array.from(callGraph.entries.keys()),
          callGraphSnapshot: {
            entries: Array.from(callGraph.entries.values()).map((e) => ({ calleeFile: e.calleeFile, calleeName: e.calleeName, calleeLine: e.calleeLine, callSites: e.callSites })),
            totalCallSites: callGraph.totalCallSites,
            resolvedCallSites: callGraph.resolvedCallSites,
          },
        };
      }
    } catch (e: unknown) {
      console.error('[GraphBackedAuditClass] updateContext failed:', e instanceof Error ? e.message : String(e));
    }
  }

  async evidence3D(file: string): Promise<Audit3DEvidence> {
    try {
      if (!file || typeof file !== 'string' || file.trim().length === 0) {
        return {
          node: file || '(empty)',
          callers: [],
          chain: [],
          unwired: [],
          findings: [],
        };
      }

      if (!this.callGraph && !this.graphSnapshot) {
        const degraded: AuditFinding = {
          layer: 'R9',
          severity: 'MEDIUM',
          category: 'GRAPH_UNAVAILABLE',
          file,
          line: 1,
          evidence: 'graph unavailable — shared.db not connected',
          description: 'Graph instance unavailable — evidence3D degraded to file-only findings',
          correction: 'Ensure shared.db graph instance is available via AnalysisContext callGraph',
          runtimeImpact: 'Callers/chain/unwired unavailable — audit falls back to 2D AST findings',
          confidence: 0.5,
          constructType: null,
          callGraphRef: null,
          evidenceSuppressed: false,
        };
        return {
          node: file,
          callers: [],
          chain: [],
          unwired: [],
          findings: [degraded],
        };
      }

      const normalizedFile = normalizeFilePath(file);
      const constructs = this.constructsByFile.get(file) ?? this.constructsByFile.get(normalizedFile) ?? (() => {
        for (const [k, v] of this.constructsByFile.entries()) {
          if (fileMatches(file, k)) return v;
        }
        return undefined;
      })() ?? [];

      const nodeId = constructs.length > 0 ? `${file}:${constructs[0].line}` : file;

      const callers: CallerInfo[] = [];
      const chain: ChainStep[] = [];
      if (this.callGraph) {
        try {
          for (const [, entry] of this.callGraph.entries) {
            if (!entry.calleeFile) continue;
            if (!fileMatches(file, entry.calleeFile)) continue;
            for (const cs of entry.callSites) {
              callers.push({
                filePath: cs.callSiteFile,
                line: cs.callSiteLine,
                constructName: entry.calleeName,
              });
              chain.push({
                from: `${cs.callSiteFile}:${cs.callSiteLine}`,
                to: `${entry.calleeFile}:${entry.calleeLine}`,
                evidence: entry.calleeName,
              });
            }
          }
        } catch (e: unknown) {
          console.error('[GraphBackedAuditClass] callers/chain extraction failed for', file, ':', e instanceof Error ? e.message : String(e));
        }
      }

      if (this.graphSnapshot?.edges && chain.length === 0) {
        try {
          for (const edgeKey of this.graphSnapshot.edges) {
            if (fileMatches(file, edgeKey) || edgeKey.includes(normalizedFile) || normalizedFile.includes(edgeKey)) {
              chain.push({
                from: edgeKey,
                to: file,
                evidence: edgeKey,
              });
            }
          }
        } catch (e: unknown) {
          console.error('[GraphBackedAuditClass] snapshot chain fallback failed:', e instanceof Error ? e.message : String(e));
        }
      }

      const unwired: UnwiredInfo[] = [];
      try {
        const definedNames = new Set<string>();
        for (const c of constructs) {
          if (c.isDefinition && c.name && c.name !== '<anonymous>' && c.name !== '<arrow>' && c.name !== '<method>') {
            definedNames.add(c.name);
          }
        }
        const wiredNames = new Set<string>();
        if (this.callGraph) {
          for (const [, entry] of this.callGraph.entries) {
            if (fileMatches(file, entry.calleeFile)) {
              wiredNames.add(entry.calleeName);
            }
          }
        }
        for (const c of constructs) {
          if (c.isDefinition && c.name && definedNames.has(c.name) && !wiredNames.has(c.name)) {
            if (c.type === 'FUNCTION_DECLARATION' || c.type === 'METHOD_DECLARATION' || c.type === 'CLASS_DECLARATION') {
              unwired.push({
                description: `Unwired construct '${c.name}' at ${file}:${c.line} has no incoming call graph edges`,
                severity: 'LOW',
              });
            }
          }
        }
        for (const c of constructs) {
          if (c.type === 'TRY_STATEMENT' || c.type === 'CATCH_CLAUSE') {
            const bodyText = c.body ?? '';
            if (bodyText.trim().length === 0 || (c.node && (c.node as unknown as { block?: { statements: unknown[] } }).block && ((c.node as unknown as { block: { statements: unknown[] } }).block.statements.length === 0))) {
              unwired.push({
                description: `Empty catch / unwired error handler at ${file}:${c.line}`,
                severity: 'MEDIUM',
              });
            }
          }
        }
        if (constructs.length === 0 && this.constructsByFile.size === 0) {
          unwired.push({
            description: `No constructs indexed for ${file} — unwired analysis degraded`,
            severity: 'LOW',
          });
        }
      } catch (e: unknown) {
        console.error('[GraphBackedAuditClass] unwired extraction failed for', file, ':', e instanceof Error ? e.message : String(e));
      }

      let fileFindings: AuditFinding[] = [];
      try {
        fileFindings = this.allFindings.filter((f) => fileMatches(file, f.file));
        if (fileFindings.length === 0 && constructs.length > 0) {
          for (const c of constructs) {
            if (c.type === 'CATCH_CLAUSE' && c.body.trim().length === 0) {
              fileFindings.push({
                layer: 'R14',
                severity: 'MEDIUM',
                category: 'CONTROL_FLOW',
                file,
                line: c.line,
                evidence: 'empty catch block',
                description: 'Empty catch block — error swallowed with no handling',
                correction: 'Add error logging, recovery, or re-throw',
                runtimeImpact: 'Errors silently consumed — debugging impossible',
                confidence: 0.95,
                constructType: c.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
      } catch (e: unknown) {
        console.error('[GraphBackedAuditClass] findings filter failed for', file, ':', e instanceof Error ? e.message : String(e));
        fileFindings = [];
      }

      return {
        node: nodeId,
        callers,
        chain,
        unwired,
        findings: fileFindings,
      };
    } catch (e: unknown) {
      console.error('[GraphBackedAuditClass] evidence3D failed for', file, ':', e instanceof Error ? e.message : String(e));
      return {
        node: file || '(error)',
        callers: [],
        chain: [],
        unwired: [{ description: `evidence3D error: ${e instanceof Error ? e.message : String(e)}`, severity: 'LOW' }],
        findings: [],
      };
    }
  }

  graphDrift(baseline: GraphSnapshot): GraphDriftResult {
    try {
      if (!baseline || typeof baseline !== 'object') {
        return { driftDetected: false, driftedNodes: [], message: 'No baseline provided — drift check skipped' };
      }
      const current = this.graphSnapshot;
      if (!current) {
        return { driftDetected: true, driftedNodes: baseline.nodes ?? [], message: 'Current graph unavailable — all baseline nodes considered drifted' };
      }
      const baselineNodes = new Set<string>(baseline.nodes ?? []);
      const currentNodes = new Set<string>(current.nodes ?? []);
      const baselineEdges = new Set<string>(baseline.edges ?? []);
      const currentEdges = new Set<string>(current.edges ?? []);

      const driftedNodes: string[] = [];
      for (const n of baselineNodes) {
        if (!currentNodes.has(n)) driftedNodes.push(n);
      }
      for (const n of currentNodes) {
        if (!baselineNodes.has(n)) driftedNodes.push(n);
      }
      const driftedEdges: string[] = [];
      for (const e of baselineEdges) {
        if (!currentEdges.has(e)) driftedEdges.push(e);
      }
      for (const e of currentEdges) {
        if (!baselineEdges.has(e)) driftedEdges.push(e);
      }
      if (driftedEdges.length > 0) {
        for (const e of driftedEdges) {
          if (!driftedNodes.includes(e)) driftedNodes.push(e);
        }
      }

      if (baseline.callGraphSnapshot && current.callGraphSnapshot) {
        try {
          const baseEntries = new Map<string, string>();
          for (const ent of baseline.callGraphSnapshot.entries) baseEntries.set(`${ent.calleeFile}:${ent.calleeLine}:${ent.calleeName}`, JSON.stringify(ent.callSites));
          const curEntries = new Map<string, string>();
          for (const ent of current.callGraphSnapshot.entries) curEntries.set(`${ent.calleeFile}:${ent.calleeLine}:${ent.calleeName}`, JSON.stringify(ent.callSites));
          for (const [k, v] of baseEntries) {
            if (!curEntries.has(k) || curEntries.get(k) !== v) {
              if (!driftedNodes.includes(k)) driftedNodes.push(k);
            }
          }
          for (const k of curEntries.keys()) {
            if (!baseEntries.has(k) && !driftedNodes.includes(k)) driftedNodes.push(k);
          }
        } catch (e: unknown) {
          console.error('[GraphBackedAuditClass] callGraph drift comparison failed:', e instanceof Error ? e.message : String(e));
        }
      }

      const driftDetected = driftedNodes.length > 0;
      return {
        driftDetected,
        driftedNodes,
        message: driftDetected ? `Drift detected: ${driftedNodes.length} nodes/edges drifted` : 'No drift detected — graphs are consistent',
      };
    } catch (e: unknown) {
      console.error('[GraphBackedAuditClass] graphDrift failed:', e instanceof Error ? e.message : String(e));
      return { driftDetected: false, driftedNodes: [], message: `graphDrift error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
