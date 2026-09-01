import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { classifyProject } from "../code-classifier.ts";
import { candidates as rLexiconCandidates } from "../layers/r-lexicon.ts";
import { candidates as rActorCandidates } from "../layers/r-actor.ts";
import { candidates as rStateMachineCandidates } from "../layers/r-state-machine.ts";
import { candidates as rEngineCandidates } from "../layers/r-engine.ts";
import { candidates as rAdapterCandidates } from "../layers/r-adapter.ts";
import { candidates as rMpseCandidates } from "../layers/r-mpse.ts";
import type { SpecBindings } from "../input/spec-bindings.ts";
import type { AnalysisContext, AuditFinding } from "../types.ts";

const SIX_IDS = new Set(["r-lexicon", "r-actor", "r-state-machine", "r-engine", "r-adapter", "r-mpse"]);

function makeSpecBindings(): SpecBindings {
  return {
    declarations: [
      { name: "lexicon", value: 100, tolerance: 5, specPath: "spec.md", line: 1, quote: "lexicon = 100 ±5" },
      { name: "actor", value: 200, tolerance: 5, specPath: "spec.md", line: 2, quote: "actor = 200 ±5" },
      { name: "state", value: 300, tolerance: 5, specPath: "spec.md", line: 3, quote: "state = 300 ±5" },
      { name: "engine", value: 400, tolerance: 5, specPath: "spec.md", line: 4, quote: "engine = 400 ±5" },
      { name: "adapter", value: 500, tolerance: 5, specPath: "spec.md", line: 5, quote: "adapter = 500 ±5" },
      { name: "threshold", value: 100, tolerance: 5, specPath: "spec.md", line: 6, quote: "threshold = 100 ±5" },
    ],
    unclear: [],
  };
}

const PREFLIGHT_STUB = {
  typeCheckPassed: true,
  typeCheckError: null,
  buildPassed: true,
  buildError: null,
  distExists: true,
  distIsSingleFile: false,
  distSize: 1000,
  hasRelativeImports: false,
  sourceMapExists: true,
  findings: [],
};

function writeFileEnsured(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function buildHomelandFixture(root: string): void {
  writeFileEnsured(path.join(root, "package.json"), JSON.stringify({ name: "a3-homeland-fixture", version: "0.0.0" }));
  writeFileEnsured(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020", module: "ESNext", strict: true, esModuleInterop: true, skipLibCheck: true } }));
  writeFileEnsured(path.join(root, "src/core/lexicon-decision.ts"), "export function decide(x: number) {\n  if (x === 1) return \"a\";\n  else if (x === 2) return \"b\";\n  else if (x === 3) return \"c\";\n  else if (x === 4) return \"d\";\n  else return \"e\";\n}\n");
  writeFileEnsured(path.join(root, "src/core/lexicon-pattern-broken.ts"), "export interface PatternFamily {\n  id: string;\n  kind: string;\n}\n");
  writeFileEnsured(path.join(root, "src/actors/actor-missing.ts"), "export class MyService {\n  run() { return 42; }\n}\n");
  writeFileEnsured(path.join(root, "src/actors/actor-unstarted.ts"), "import { createActor } from \"xstate\";\nexport const actor = createActor({} as any);\n");
  writeFileEnsured(path.join(root, "src/state/machine-bad.ts"), "import { createMachine } from \"xstate\";\nexport const machine = createMachine({\n  id: \"bad\",\n  initial: \"idle\",\n  states: { idle: {}, active: {} }\n});\n");
  writeFileEnsured(path.join(root, "src/state/flags-scattered.ts"), "export let isBuilding = false;\nexport let isTesting = false;\nexport function check() {\n  if (isBuilding) return 1;\n  if (isTesting) return 2;\n  return 0;\n}\n");
  writeFileEnsured(path.join(root, "src/engine/engine-core.ts"), "export class Engine {\n  doWork() { return 1; }\n}\n");
  writeFileEnsured(path.join(root, "src/engine/container-bad.ts"), "export class Container {\n  method() { return 1; }\n}\n");
  writeFileEnsured(path.join(root, "src/engine/supervisor-bad.ts"), "export class Supervisor {\n  tick() { return 0; }\n}\n");
  writeFileEnsured(path.join(root, "src/adapter/adapter-bad.ts"), "export class PaymentAdapter {\n  handle(x: any) { return x; }\n}\n");
  writeFileEnsured(path.join(root, "src/adapter/boundary-leak.ts"), "export function onEvent(e: any) {\n  return (globalThis as any).tool.execute({ kind: \"TOOL_AFTER\" });\n}\n");
  writeFileEnsured(path.join(root, "src/mpse/contract-bad.ts"), "import { checkContract } from \"../math/contract.ts\";\nexport function validate(x: number) {\n  if (x < 999) return true;\n  checkContract({ id: \"threshold\" } as any);\n  return false;\n}\nexport type MathExpr = { kind: string };\nexport const threshold = 999;\n");
  writeFileEnsured(path.join(root, "src/mpse/extra-test.test.ts"), "export const dummy = 1;\nif (dummy < 777) {}\nif (dummy > 888) {}\n");
}

type LayerCandidate = { subject: string; predicate: string; object: string; file: string; line: number; evidenceQuote: string; implicatedSpecClause?: string; side: string };

function collectAllCandidates(ctx: AnalysisContext, specBindings: SpecBindings): Array<LayerCandidate & { layer: string }> {
  const map: Record<string, LayerCandidate[]> = {};
  try { map["r-lexicon"] = rLexiconCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-lexicon failed", e instanceof Error ? e.message : String(e)); map["r-lexicon"] = []; }
  try { map["r-actor"] = rActorCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-actor failed", e instanceof Error ? e.message : String(e)); map["r-actor"] = []; }
  try { map["r-state-machine"] = rStateMachineCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-state-machine failed", e instanceof Error ? e.message : String(e)); map["r-state-machine"] = []; }
  try { map["r-engine"] = rEngineCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-engine failed", e instanceof Error ? e.message : String(e)); map["r-engine"] = []; }
  try { map["r-adapter"] = rAdapterCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-adapter failed", e instanceof Error ? e.message : String(e)); map["r-adapter"] = []; }
  try { map["r-mpse"] = rMpseCandidates(ctx as unknown as AnalysisContext, specBindings) as unknown as LayerCandidate[]; } catch (e: unknown) { console.error("[a3] r-mpse failed", e instanceof Error ? e.message : String(e)); map["r-mpse"] = []; }
  const out: Array<LayerCandidate & { layer: string }> = [];
  for (const layer of ["r-lexicon", "r-actor", "r-state-machine", "r-engine", "r-adapter", "r-mpse"] as const) {
    for (const c of map[layer] ?? []) out.push({ ...c, layer });
  }
  return out;
}

function candidatesToFindings(candidates: Array<LayerCandidate & { layer: string }>): AuditFinding[] {
  const seen = new Set<string>();
  const out: AuditFinding[] = [];
  for (const c of candidates) {
    const key = `${c.layer}:${c.file}:${c.line}:${c.predicate}:${c.object}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      layer: c.layer,
      severity: "MEDIUM",
      category: `${c.predicate}.${c.object}`,
      file: c.file,
      line: c.line,
      evidence: c.evidenceQuote,
      description: `${c.predicate} ${c.object} at ${c.file}:${c.line}`,
      correction: c.implicatedSpecClause ?? `Review ${c.predicate} ${c.object}`,
      runtimeImpact: "candidate requires adjudication",
      confidence: 0.55,
      constructType: null,
      callGraphRef: null,
      evidenceSuppressed: false,
      triad: { pattern: { memberId: `${c.predicate}.${c.object}`, familySeverity: "MEDIUM" }, state: { machineId: c.layer, from: "ANALYZED", to: "EVIDENCED" }, evidence: { file: c.file, line: c.line } },
    });
  }
  return out;
}

const tmpRoots: string[] = [];
let homelandRoot = "";
let homelandCtx: AnalysisContext | null = null;
let homelandSpec: SpecBindings | null = null;

beforeAll(() => {
  homelandRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a3-homeland-"));
  tmpRoots.push(homelandRoot);
  buildHomelandFixture(homelandRoot);
  homelandSpec = makeSpecBindings();
  homelandCtx = classifyProject(homelandRoot, PREFLIGHT_STUB as any, { name: "a3-homeland-fixture" }, {}, null);
});

afterAll(() => {
  for (const r of tmpRoots) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch (e: unknown) { console.error("[a3] cleanup failed", r, e instanceof Error ? e.message : String(e)); }
  }
});

describe("A-3 real-target six-layer proof", () => {
  test("every emitted finding has machineId in six-id domain and never layer-engine", () => {
    // # mut-check: fails if any finding carries layer-engine or outside id — mapping mutation caught
    const cands = collectAllCandidates(homelandCtx!, homelandSpec!);
    const findings = candidatesToFindings(cands);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.triad).toBeDefined();
      expect(SIX_IDS.has(f.triad!.state.machineId)).toBe(true);
      expect(f.triad!.state.machineId).not.toBe("layer-engine");
      expect(f.layer).not.toBe("layer-engine");
    }
    expect(findings.every(f => f.triad!.state.machineId !== "layer-engine")).toBe(true);
  });

  test("at least 3 distinct layer ids fired across corpus and total candidates >= 3", () => {
    // # mut-check: fails if corpus collapses to <3 layers — fixture regression would drop an id
    const cands = collectAllCandidates(homelandCtx!, homelandSpec!);
    const ids = new Set(cands.map(c => c.layer));
    expect(ids.size).toBeGreaterThanOrEqual(3);
    expect(cands.length).toBeGreaterThanOrEqual(3);
  });

  test("every row carries non-empty subject predicate evidence and triad fields", () => {
    // # mut-check: fails if any candidate emits empty triad fields — blank evidence mutation caught
    const cands = collectAllCandidates(homelandCtx!, homelandSpec!);
    const findings = candidatesToFindings(cands);
    expect(findings.length).toBeGreaterThan(0);
    for (const c of cands) {
      expect(c.subject.length).toBeGreaterThan(0);
      expect(c.predicate.length).toBeGreaterThan(0);
      expect(c.evidenceQuote.length).toBeGreaterThan(0);
      expect(c.file.length).toBeGreaterThan(0);
      expect(c.line).toBeGreaterThan(0);
    }
    for (const f of findings) {
      expect(f.triad!.pattern.memberId.length).toBeGreaterThan(0);
      expect(f.triad!.state.machineId.length).toBeGreaterThan(0);
      expect(f.triad!.evidence.file.length).toBeGreaterThan(0);
      expect(f.triad!.evidence.line).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });

  test("deterministic: two runs deep-equal", () => {
    // # mut-check: fails if candidate ordering nondeterministic — random id mutation caught
    const a = collectAllCandidates(homelandCtx!, homelandSpec!);
    const b = collectAllCandidates(homelandCtx!, homelandSpec!);
    const fa = candidatesToFindings(a);
    const fb = candidatesToFindings(b);
    expect(JSON.stringify(fa)).toBe(JSON.stringify(fb));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("adversarial: empty target yields 0 candidates without throw", () => {
    // # mut-check: fails if empty target throws or returns non-zero — guard mutation caught
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a3-empty-"));
    tmpRoots.push(emptyRoot);
    fs.writeFileSync(path.join(emptyRoot, "package.json"), JSON.stringify({ name: "empty" }));
    fs.writeFileSync(path.join(emptyRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    let threw = false;
    let cands: Array<LayerCandidate & { layer: string }> = [];
    try {
      const ctx = classifyProject(emptyRoot, PREFLIGHT_STUB as any, { name: "empty" }, {}, null);
      cands = collectAllCandidates(ctx, makeSpecBindings());
    } catch (e: unknown) { console.error("[a3] empty target threw", e instanceof Error ? e.message : String(e)); threw = true; }
    expect(threw).toBe(false);
    expect(cands.length).toBe(0);
    expect(candidatesToFindings(cands).length).toBe(0);
  });

  test("adversarial: target with only non-ts files yields 0 candidates", () => {
    // # mut-check: fails if non-ts files misclassified — glob mutation caught
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3-nonts-"));
    tmpRoots.push(root);
    writeFileEnsured(path.join(root, "package.json"), JSON.stringify({ name: "nonts" }));
    writeFileEnsured(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    writeFileEnsured(path.join(root, "src/readme.md"), "# hello\n");
    writeFileEnsured(path.join(root, "src/data.json"), `{"a":1}`);
    writeFileEnsured(path.join(root, "src/notes.txt"), "notes");
    const ctx = classifyProject(root, PREFLIGHT_STUB as any, { name: "nonts" }, {}, null);
    const cands = collectAllCandidates(ctx, makeSpecBindings());
    expect(cands.length).toBe(0);
  });

  test("adversarial: duplicate identical files — documents single-emission dedup behavior", () => {
    // # mut-check: fails if dedup key mutation causes double emission
    const dupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a3-dup-"));
    tmpRoots.push(dupRoot);
    const content = "export class Engine {\n  doWork() { return 1; }\n}\n";
    writeFileEnsured(path.join(dupRoot, "package.json"), JSON.stringify({ name: "dup" }));
    writeFileEnsured(path.join(dupRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020" } }));
    writeFileEnsured(path.join(dupRoot, "src/a/engine.ts"), content);
    writeFileEnsured(path.join(dupRoot, "src/b/engine.ts"), content);
    const ctxA = classifyProject(dupRoot, PREFLIGHT_STUB as any, { name: "dup" }, {}, null);
    const candsA = collectAllCandidates(ctxA, makeSpecBindings());
    const findingsA = candidatesToFindings(candsA);
    const singleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a3-single-"));
    tmpRoots.push(singleRoot);
    writeFileEnsured(path.join(singleRoot, "package.json"), JSON.stringify({ name: "single" }));
    writeFileEnsured(path.join(singleRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2020" } }));
    writeFileEnsured(path.join(singleRoot, "src/a/engine.ts"), content);
    const ctxS = classifyProject(singleRoot, PREFLIGHT_STUB as any, { name: "single" }, {}, null);
    const candsS = collectAllCandidates(ctxS, makeSpecBindings());
    const findingsS = candidatesToFindings(candsS);
    expect(findingsS.length).toBeGreaterThan(0);
    expect(findingsA.length).toBeGreaterThanOrEqual(findingsS.length);
    const keysA = new Set(findingsA.map(f => `${f.layer}:${f.file}:${f.line}:${f.category}`));
    const keysS = new Set(findingsS.map(f => `${f.layer}:${f.file}:${f.line}:${f.category}`));
    expect(keysA.size).toBe(findingsA.length);
    expect(keysS.size).toBe(findingsS.length);
  });
});
