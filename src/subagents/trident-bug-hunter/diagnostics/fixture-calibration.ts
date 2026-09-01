// src/subagents/trident-bug-hunter/diagnostics/fixture-calibration.ts
// THE F11.5 FIXTURE RUN PATH — the wiring that turns the fixture-profile dir
// (fixtures/fixture-profile/) into a full calibration run: the profile + the
// fire/golden fixtures → runCalibration → the CALIBRATION_vN.md record. This is
// the S7 container scenario's runtime proof ("run the calibration tool with the
// FIRE + GOLDEN fixtures" — the pass token `CALIBRATION` + `fired`/`silent`).
//
// THE LOADER CONTRACT: the fixture dir carries the SOURCE FILES (the bytes the
// read returns) + the manifest JSON per fixture (the graph's code-state — the
// nodes the compiled predicate reads, serialized the way the spec's own test
// builds them: fixtureGraph('price-anchored') with the abs(open - level) edge).
// The graph is load-bearing, never decoration (K21.2): the adapter materializes
// the manifest's nodes so the predicate's check reads the real code-state.
//
// THE CLOSED-LOOP RULE (C26): the fire fixture's ruleId/file/line must align
// with the profile's declared predicate id — the loader stamps the declared
// ruleId onto the compiled predicate (the §6.4 convention: `id: 'P6'`), so the
// mutation test is closed-loop (the predicate fires on its OWN recorded class).
//
// THE COORDINATION GAP: the fixture profile (fixtures/fixture-profile/profile.yaml)
// is the battery-p6 agent's wave deliverable — the loader consumes it via the
// profile-loader conventions WHEN PRESENT; when absent, buildFixtureProfile()
// constructs the spec's fixture-project profile object (the data the run needs)
// and the coordination gap is REPORTED, never masked, never a fabricated yaml.

import fs from 'node:fs';
import path from 'node:path';
import { loadProfile } from '../../../shared/knowledge-graph/profile-loader.ts';
import { ProjectProfileSchema, type ProjectProfile } from '../../../shared/knowledge-graph/profile-schema.ts';
import { TEMPLATE_LIBRARY, compileTemplate, type CompiledPredicate } from '../lexicon/templates.ts';
import type {
  GraphAdapter, GraphNode, BuildResult, CallSite, ChainStep, ImportEdge, AwaitEdge, DeadNode, GraphNodeKind,
} from '../graph/interface.ts';
import { runCalibration, type CalibrationFixtures, type CalibrationResult, type FireFixture, type GoldenFixture } from './calibration.ts';

// ---------------------------------------------------------------------------
// The manifest shapes (the on-disk fixture contract — DATA, never imports)
// ---------------------------------------------------------------------------

/** A serialized graph node — the code-state the predicate reads. */
export interface FixtureNodeManifest {
  id: string;
  kind: GraphNodeKind;
  name: string;
  file: string;
  line: number;
  lineage: GraphNode['lineage'];
  source: string;
  data?: Record<string, unknown>;
}

/** The FIRE fixture manifest: the FireFixture fields + the graph's code-state. */
export interface FireFixtureManifest {
  ruleId: string;
  file: string;
  line: number;
  description: string;
  sourceFile: string;
  graph: { nodes: FixtureNodeManifest[] };
}

/** The GOLDEN fixture manifest: the GoldenFixture fields + the graph's code-state. */
export interface GoldenFixtureManifest {
  anchor: string;
  file: string;
  description: string;
  sourceFile: string;
  graph: { nodes: FixtureNodeManifest[] };
}

/** The fixture loader's result: the profile + the fixtures assembled from disk. */
export interface FixtureLoadResult {
  profile: ProjectProfile;
  fixtures: CalibrationFixtures;
  fixtureProfileDir: string;
  profileFromDisk: boolean;   // true when profile.yaml existed (battery-p6's deliverable)
}

// ---------------------------------------------------------------------------
// The graph adapter — materializes the manifest's code-state nodes (K21.2)
// ---------------------------------------------------------------------------

/** Build a REAL GraphAdapter carrying the fixture's code-state nodes. The engine
 *  reads graph.nodes() + node.data — an empty graph would throw ENGINE_GRAPH_EMPTY
 *  (a scan over zero nodes) and a stub returning [] would corrupt the mutation
 *  semantics (MISS/SILENT that proves nothing). The edge queries return the
 *  honest empty — the fixture graph carries nodes only (no cross-module edges). */
export function graphFromManifest(nodes: FixtureNodeManifest[]): GraphAdapter {
  const materialized: GraphNode[] = nodes.map((n) => ({
    id: n.id, kind: n.kind, name: n.name, file: n.file, line: n.line,
    lineage: n.lineage, source: n.source, data: n.data,
  }));
  return {
    build: async (): Promise<BuildResult> => ({
      nodes: materialized, edges: [], durationMs: 0, adapter: 'native-ast',
      lineage: { spec: 0, code: materialized.length, hybrid: 0 },
    }),
    whoCalls: (): CallSite[] => [],
    chain: (): ChainStep[] => [],
    imports: (): ImportEdge[] => [],
    awaits: (): AwaitEdge[] => [],
    unwired: (): DeadNode[] => [],
    nodes: (kind?: GraphNodeKind): GraphNode[] =>
      kind === undefined ? materialized : materialized.filter((n) => n.kind === kind),
  };
}

// ---------------------------------------------------------------------------
// THE FIXTURE LOADER — the fixture dir → CalibrationFixtures
// ---------------------------------------------------------------------------

/** THE R16 TYPE_CERTAINTY GUARDED READ — a fixture manifest is parsed + the
 *  parsed shape is typeof/!== null-guarded before the typed assertion. */
function asFixture<T extends object>(raw: string, label: string): T {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed !== undefined && parsed !== null && typeof parsed === 'object') {
    return parsed as T;
  }
  throw new Error(`CALIBRATION_FIXTURE_INVALID: ${label} parsed to a non-object`);
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the declaredPredicates binding (an
 *  unknown value) is typeof/!== null-guarded before the map assertion. */
function bindingsMap(v: unknown): Record<string, Record<string, unknown>> {
  if (v !== undefined && v !== null && typeof v === 'object') {
    return v as Record<string, Record<string, unknown>>;
  }
  return {};
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the severity binding is narrowed by
 *  the literal-union check (no cast at all — the comparison narrows it). */
function severityFromBinding(v: unknown): 'CRIT' | 'HIGH' | 'MED' | 'WARN' {
  if (v === 'CRIT' || v === 'HIGH' || v === 'MED' || v === 'WARN') {
    return v;
  }
  return 'HIGH';
}

/** Read one fire fixture dir (manifest.json + the source file) → a FireFixture. */
export function loadFireFixture(dir: string): FireFixture {
  const manifest = asFixture<FireFixtureManifest>(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'), 'fire manifest');
  const source = fs.readFileSync(path.join(dir, manifest.sourceFile), 'utf8');
  if (!manifest.ruleId || !manifest.file || !manifest.line) {
    throw new Error(`CALIBRATION_FIXTURE_INVALID: fire fixture ${dir} carries an empty ruleId/file/line anchor`);
  }
  return {
    ruleId: manifest.ruleId,
    file: manifest.file,
    line: manifest.line,
    description: manifest.description,
    source,
    graph: graphFromManifest(manifest.graph.nodes),
  };
}

/** Read one golden fixture dir (manifest.json + the source file) → a GoldenFixture. */
export function loadGoldenFixture(dir: string): GoldenFixture {
  const manifest = asFixture<GoldenFixtureManifest>(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'), 'golden manifest');
  const source = fs.readFileSync(path.join(dir, manifest.sourceFile), 'utf8');
  if (!manifest.anchor || !manifest.file) {
    throw new Error(`CALIBRATION_FIXTURE_INVALID: golden fixture ${dir} carries an empty anchor/file`);
  }
  return {
    anchor: manifest.anchor,
    file: manifest.file,
    source,
    graph: graphFromManifest(manifest.graph.nodes),
  };
}

/** Read the fixture-profile's fixtures/{fire,golden}/ dirs into a CalibrationFixtures. */
export function loadCalibrationFixtures(fixtureProfileDir: string): CalibrationFixtures {
  const fireDir = path.join(fixtureProfileDir, 'fixtures', 'fire');
  const goldenDir = path.join(fixtureProfileDir, 'fixtures', 'golden');
  if (!fs.existsSync(fireDir) || !fs.existsSync(goldenDir)) {
    throw new Error(`CALIBRATION_FIXTURE_INVALID: the fixture dirs ${fireDir} + ${goldenDir} must exist`);
  }
  const fire = fs.readdirSync(fireDir)
    .filter((f) => f === 'manifest.json')
    .map(() => loadFireFixture(fireDir));
  const golden = fs.readdirSync(goldenDir)
    .filter((f) => f === 'manifest.json')
    .map(() => loadGoldenFixture(goldenDir));
  return { fire, golden };
}

// ---------------------------------------------------------------------------
// THE FIXTURE PROFILE (the spec's fixture-project shape — C24)
// ---------------------------------------------------------------------------

/** Build the fixture-project's ProjectProfile — the run's data input. The shape
 *  follows the spec's fixture-project contract (the S2/S5/S7 scenarios mount
 *  /workspace/fixture-profile with profile.yaml): a native-ast project rooted at
 *  the fixture-profile dir, the P6 declared predicate bound to the
 *  domain.numeric-threshold template (the abs(open - level) comparator class). */
export function buildFixtureProfile(fixtureProfileDir: string): ProjectProfile {
  return ProjectProfileSchema.parse({
    profileVersion: 1,
    project: {
      name: 'fixture-profile',
      root: fixtureProfileDir,
      languages: ['typescript'],
      entryPoints: ['src/index.ts'],
      build: 'bun build',
      test: 'bun test',
    },
    graph: { substrate: 'native-ast', scope: ['src'], excludes: [] },
    rules: {
      corpus: ['corpus.md'],
      bindings: {
        declaredPredicates: {
          P6: {
            template: 'domain.numeric-threshold',
            symbol: 'priceAnchor',
            valuePath: 'comparator',
            operator: 'gt',
            threshold: 1.0,
            verbatimQuote: 'NOTHING SHOULD BE PRICE ANCHORED EVER... YOU DO NOT HARDCODE FUCKING PRICES... E1 CALCULATES THE EXACT ZONES',
            anchor: 'ZONE_ANCHORED_E2_FIX_SPEC.md:6',
            severity: 'CRIT',
          },
        },
      },
    },
    pipeline: {
      stages: [
        { id: 'e2-selection', entry: 'selectE2', contract: 'the E2 designation is zone-anchored, never price-anchored' },
      ],
    },
    history: { failureLogs: [] },
    awareness: { docs: [] },
  });
}

/** Compile the fixture battery — the declared predicates with their DECLARED
 *  ruleIds stamped (the §6.4 convention: `id: 'P6'`). The compile path is the
 *  compiler's own compileDeclared with the ruleId preserved, so the mutation
 *  test is closed-loop: the fire fixture's ruleId === the battery predicate's id. */
export async function compileFixtureBattery(profile: ProjectProfile): Promise<CompiledPredicate[]> {
  const declared = bindingsMap(profile.rules.bindings['declaredPredicates']);
  const battery: CompiledPredicate[] = [];
  for (const [ruleId, binding] of Object.entries(declared)) {
    const templateId = String(binding['template'] ?? '');
    const template = TEMPLATE_LIBRARY[templateId];
    if (!template) {
      throw new Error(`TEMPLATE_UNKNOWN: declaredPredicate ${ruleId} names template '${templateId}'`);
    }
    const verbatimQuote = String(binding['verbatimQuote'] ?? '');
    if (!verbatimQuote || verbatimQuote.trim() === '') {
      throw new Error(`D13_VIOLATION: declaredPredicate ${ruleId} lacks a verbatim quote — doctrine is QUOTED, never synthesized`);
    }
    const anchor = String(binding['anchor'] ?? `${ruleId}`);
    const severity = severityFromBinding(binding['severity']);
    const compiled = compileTemplate(template, binding, { verbatimQuote, anchor, severity }, 'fixture-battery');
    battery.push({ ...compiled, id: ruleId }); // stamp the declared ruleId — the closed loop
  }
  return battery;
}

// ---------------------------------------------------------------------------
// THE RUN PATH — the fixture-profile dir → the calibration record
// ---------------------------------------------------------------------------

/** Load the profile from profile.yaml when battery-p6's deliverable has landed;
 *  otherwise build the spec's fixture-project profile (the coordination gap is
 *  reported via profileFromDisk=false — never a masked gap, never a fabricated yaml). */
export function loadFixtureProfile(fixtureProfileDir: string): { profile: ProjectProfile; profileFromDisk: boolean } {
  const yamlPath = path.join(fixtureProfileDir, 'profile.yaml');
  if (fs.existsSync(yamlPath)) {
    return { profile: loadProfile(yamlPath), profileFromDisk: true };
  }
  return { profile: buildFixtureProfile(fixtureProfileDir), profileFromDisk: false };
}

/** Assemble the full fixture load: the profile + the fire/golden fixtures. */
export function loadFixtureProfileFixtures(fixtureProfileDir: string): FixtureLoadResult {
  const { profile, profileFromDisk } = loadFixtureProfile(fixtureProfileDir);
  const fixtures = loadCalibrationFixtures(fixtureProfileDir);
  return { profile, fixtures, fixtureProfileDir, profileFromDisk };
}

/** THE RUN PATH — runCalibration(profile, fixtures) over the fixture dir,
 *  writing the CALIBRATION_vN.md record at the fixture-profile dir (or the
 *  supplied recordPath). Dry-run by default (D28 — the gate is born OFF; the
 *  verdicts are computed + surfaced, the live flip is the operator's curation).
 *  The coordination fact (the profileFromDisk flag — battery-p6's profile.yaml
 *  landed or the spec-shaped profile was constructed) rides the loader's
 *  FixtureLoadResult; the caller reports it, never hides it. */
export async function runFixtureCalibration(
  fixtureProfileDir: string,
  opts: { recordPath?: string; dryRun?: boolean; battery?: CompiledPredicate[] } = {},
): Promise<CalibrationResult> {
  try {
    const { profile, fixtures } = loadFixtureProfileFixtures(fixtureProfileDir);
    const battery = opts.battery ?? (await compileFixtureBattery(profile));
    const recordPath = opts.recordPath ?? fixtureProfileDir;
    return runCalibration(profile, fixtures, {
      battery,
      dryRun: opts.dryRun ?? true,
      recordPath,
    });
  } catch (e: unknown) {
    console.warn(`[fixture-calibration] runFixtureCalibration failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
