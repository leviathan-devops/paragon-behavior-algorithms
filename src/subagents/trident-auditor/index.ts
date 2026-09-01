// src/subagents/trident-auditor/index.ts
// THE AUDITOR PACKAGE REGISTRATION (W9, CREATE-ONLY — the platform wiring
// files are the W7 orchestrator's additive modification, never touched here).
//
// THE HOOKS FOLD DECISION (2026-08-12 — RECORDED, never silent):
// spec §2.3:281-282 lists an auditor hooks/index.ts + hooks/bus-hook.ts ("the
// fix-scope hook + the event subscription" / "the BUILD_DONE / AUDIT_DONE
// subscription"). The VERIFIED transport makes a separate auditor bus DEAD
// CODE: the shared HydraBus (the bug-hunter's hooks/bus-hook.ts, spec:247,
// :2351) ALREADY emits BUILD_DONE → the auditor's AUDIT_START (the
// `emitTo('trident_auditor', { type: 'AUDIT_START', runId: ... })`), and THIS
// package's audit entry IS the subscription — activeRunId() (tools/audit.ts:
// 37-53) passively resolves the latest BUILD_DONE event's runId from the
// shared DB ("the auditor picks up INSTANTLY — no polling", spec:382; the
// §5.5:2441-2452 transport steps). FOLDED: no auditor-side bus-hook. The
// BUILD_DONE→AUDIT_START subscription is the shared HydraBus + the audit
// entry's passive pickup. CANON ENTRY REQUESTED (the orchestrator's
// ownership — never written here): DECISION_CHAIN + EVIDENCE_STATE —
// "2026-08-12 the auditor-hooks fold: §2.3:281-282 folded into the shared
// HydraBus (bug-hunter hooks/bus-hook.ts:99-101) + activeRunId
// (tools/audit.ts:37-53); no separate auditor bus created".
//
// The package's internal registration surface: the exports the W9+ platform
// wiring (the trident-audit tool registration, the fix-apply registration, the
// agent definition) consumes. This file creates ONLY the auditor's own surface;
// no existing platform file is modified by this wave.

// THE IDENTITY (D15 — the heavier enforcement warhead)
export { AUDITOR_WARHEAD, auditorWarhead } from './identity/warhead.ts';

// THE FIREWALL (R10.4 — the fix-scope lexicon + the red-team zero-trust helpers)
export {
  classify as classifyFixScope,
  enforceFixScope,
  normalizeFixTarget,
  fixScopeError,
  FIX_SCOPE_ERROR_BASE,
  type FixScopeDecision,
  type FixScopeGraph,
  type FixScopeGraphNode,
  type FixScopeOptions,
} from './firewall/fix-scope.ts';
export {
  claimVsReality,
  isClaimedButNotFixed,
  hasRealDiff,
  changedEvidence,
  claimedButNotFixedEvidence,
  auditDiffRow,
  conformanceViolated,
  stateInconclusive,
  type ClaimVsReality,
  type AuditError,
  type ConformanceViolatedError,
  type StateInconclusiveError,
} from './firewall/red-team.ts';

// THE SHARED DB CLIENT (D16 — the ONLY bridge to the bug hunter)
export {
  openSharedDb,
  openProjectSharedDb,
  sharedDbPath,
  type SharedDbClient,
  type ReportSectionRow,
  type FindingRow,
  type ImplementationRow,
  type EventRow,
  type ImplementationInput,
} from './shared/shared-db-client.ts';

// THE CONFORMANCE FAMILY (the 6th family + the spec-extractor + the checker)
export {
  CONFORMANCE_FAMILY,
  CONFORMANCE_TEMPLATES,
  conformanceTemplate,
  type ConformanceTemplate,
  type ConformanceTemplateKind,
} from './conformance/conformance-templates.ts';
export {
  extractDeclaredContracts,
  extractFixFilesFromText,
  normalizeContractFile,
  stripLineSuffix,
  type DeclaredContract,
} from './conformance/spec-extractor.ts';
export {
  runConformance,
  decideVerdict,
  persistVerdicts,
  type ConformanceCheckOptions,
  type ConformanceResult,
  type ConformanceVerdictRow,
  type ContentReader,
  type RuleFireCheck,
  type ContractAcceptance,
} from './conformance/checker.ts';

// THE TOOLS (K8.9 the audit entry + K8.10 the fix-apply + the build-done producer)
export {
  audit,
  activeRunId,
  createAuditTool,
  type AuditInput,
  type AuditResult,
} from './tools/audit.ts';
export {
  buildDone,
  createBuildDoneTool,
  type BuildDoneInput,
  type BuildDoneResult,
  type BuildDoneImplementation,
  type BuildFixInput,
} from './tools/build-done.ts';
export {
  fixApply,
  createFixApplyTool,
  sha256,
  sha256File,
  fixApplyFailed,
  type FixApplyInput,
  type FixApplyResult,
  type FixApplyError,
} from './tools/fix-apply.ts';

// THE HARNESS (the audit-machine)
export {
  createAuditMachine,
  type AuditMachineOptions,
  type AuditMachineContext,
  type AuditMachineResult,
  type AuditMachineHandle,
  type MachineVerdictRow,
  type FixContentGenerator,
} from './harness/audit-machine.ts';
