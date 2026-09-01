// src/subagents/trident-bug-hunter/index.ts
// THE BUG-HUNTER PACKAGE REGISTRATION (W7, spec §2.2:248 — "the registration
// (tools + hooks + the identity loader + the allowlist)"). The package's
// internal registration surface: the exports the W7 platform wiring (the
// trident-tools.ts / trident-hooks.ts / definitions.ts additive modifications)
// consumes. This file creates ONLY the bug-hunter's own surface — no existing
// platform file is modified by this file itself.
//
// THE SEPARATION LAW (D16): the auditor package's files are NOT touched by
// this wave (its registration is its own index.ts — already delivered). This
// index exports the bug-hunter's surface ONLY.

// THE IDENTITY (D15 — the recon warhead + the 3 prompt-parts, spec §2.2:208-212)
export { BUG_HUNTER_WARHEAD, bugHunterWarhead } from './identity/warhead.ts';

// THE HARNESS (the micro-loop + the actors — the machine's body)
export {
  createMicroLoop,
  type MicroLoopOptions,
  type MicroLoopContext,
  type MicroLoopResult,
  type MicroLoopHandle,
} from './harness/micro-loop-machine.ts';
export { recon, type IntendedBehavior } from './harness/recon.ts';
export { map, type MapResult } from './harness/map.ts';
export { scan, resolveCorpusPaths, type ScanResult } from './harness/scan.ts';
export {
  solveTrace,
  SOLVER_FRAMEWORKS,
  findingIdOf,
  type TraceRow,
  type SolverFramework,
} from './harness/trace.ts';
export { strike, type StrikeResult } from './harness/strike.ts';
export {
  report,
  sectionFromFinding,
  toWriterSection,
  type ReportActorInput,
  type ReportResult,
  type ReportWriter,
} from './harness/report.ts';

// THE TOOLS (the bug-hunt entry + the 7-verb query — the platform registrations)
export {
  createBugHuntTool,
  spawnBugHunterLoop,
  type BugHuntArgs,
  type BugHuntResult,
} from './tools/bug-hunt.ts';
export {
  createBugHunterQueryTool,
  runQueryTool,
  queryStorePath,
  type QueryToolArgs,
} from './tools/query-registration.ts';
export {
  createReportWriterTool,
} from './tools/report-writer.ts';

// THE HOOKS (the tool.before lexicons + the tool.after injector + the event bus)
export {
  createBugHunterHooks,
  getDiagnosticsServer,
  type BugHunterHooks,
  type BugHunterHookOptions,
} from './hooks/index.ts';
export {
  HydraBus,
  createHydraBus,
  type EventRow,
  type BusSubscriber,
  type BusDefaultWiring,
} from './hooks/bus-hook.ts';

// THE FIREWALL LEXICONS (W3 — the platform wiring's tool.before second line)
export { classify as bashLockdownClassify, enforceBashLockdown } from './firewall/readonly.ts';
export { classify as reportScopeClassify, enforceReportScope } from './firewall/artifact-scope.ts';

// THE SURFACE (W6 — the LOGIC-LSP + the query surface)
export {
  DiagnosticsServer,
  inject as logicLspInject,
  loadStateFromFindings,
  type LogicDiagnostic,
  type FindingsProvider,
  type ToolResultLike,
  type InjectedResult,
} from './surface/lsp-injector.ts';
export { runQuery, formatRows, type QueryRow, type QueryVerb, type QueryInput, type QueryExtensions, type SemanticHit, type SemanticSurface, type DocsPatternRow, type DocsPatternSurface } from './surface/query-tool.ts';

// THE CORBELL-NATIVE STACK (W2b — the semantic layer + the MCP bridge + the UI
// + the docs patterns — everything the corbell ships that the structural slice
// left dormant). The wire-don't-build law: each export is a thin shell over the
// vendor's native surface — the embeddings CLI + store, the mcp serve, the ui
// serve, the docs scan/learn.
export {
  CorbellEmbeddings,
  buildEmbeddingIndex,
  queryEmbeddingIndex,
  parseEmbeddingSummary,
  cosineSimilarity,
  decodeFloat32Blob,
  resolveCorbellBin,
  resolveVenvPython,
  embeddingStorePath,
  EmbeddingError,
  embeddingError,
  type EmbeddingBuildResult,
  type EmbeddingQueryOptions,
  type EncodeFn,
} from './graph/corbell-embeddings.ts';
export {
  CORBELL_MCP_TOOLS,
  runMcpTool,
  resolveMcpServeCommand,
  formatSemanticRows,
  type McpToolDef,
  type McpToolTarget,
  type McpServerLaunch,
} from './tools/mcp-bridge.ts';
export {
  resolveUiLaunchCommand,
  checkUiReachable,
  defaultUiProbe,
  CORBELL_UI_DEFAULT_PORT,
  type UiLaunch,
  type UiReachability,
  type UiProbe,
} from './tools/ui-server.ts';
export {
  extractDocsPatterns,
  readDocsPatterns,
  createDocsPatterns,
  parseLearnSummary,
  docsPatternsStorePath,
  DocsPatternError,
  docsPatternError,
  type DocsExtractionResult,
} from './tools/docs-patterns.ts';
