import {
  LayerRule,
  CodeConstruct,
  AnalysisContext,
  AuditFinding,
  ConstructType,
} from './types.ts';
import { EvidenceGate } from './evidence-gate.ts';
import { tridentLog } from '../utils.js';
// THE W3 LEXICON INTEGRATION (the L2 spec §5.5): the lexicon-backed layers
// (R4/R8/R11/R13/R17/R1) dispatch through the PatternFamily battery — the
// matchers FLAG, the machine DECIDES (the ISE law). The layer's hand-rolled
// logic is replaced by the lexicon consumption.
import { runBattery, LexiconFinding, FOUNDING_LEXICON_MAP } from './lexicons/lexicon-dispatch.ts';
// THE D17 GOLDEN-STATE WIRING (the L2 spec §3.5.3 — the 2026-08-20 correction):
// the CalibrationGate is INVOKED before every lexicon battery — a matcher that
// false-fires on the clean-core fixtures (a MISS of its exampleHits, or a
// FALSE_FIRE on the golden fixtures) is FLAGGED + EXCLUDED from THIS run. THE
// DEBACLE'S FIX: the gate was built + unit-tested + NEVER wired — the audit
// flooded ~2,000 false positives because no matcher was ever excluded.
import { CalibrationGate } from './lexicons/audit-calibration.ts';

// THE GOLDEN-STATE FIXTURES (the spec §3.5.3 — the clean shapes the matchers
// must stay SILENT on): a normal function (R1/R10 must stay quiet), a catch
// that USES its binding (R4 must stay quiet), a string containing "TODO"
// (R8 — the marker-in-string is DATA, not a defect), a normal import (R6
// must not false-fire — the bundler resolves it). A matcher that fires on
// ANY of these is over-firing — FLAGGED + EXCLUDED.
const GOLDEN_STATE_FIXTURES: string[] = [
  'export function add(a: number, b: number): number { return a + b; }',  // clean fn — R1 output-contract must stay SILENT
  'try { risky(); } catch (e: unknown) { return e instanceof Error ? e.message : String(e); }',  // catch USES the binding — R4 must stay SILENT
  'const s = "TODO is just data, not a marker";',   // the marker-in-string — R8 must stay SILENT
  'import * as fs from "fs";',                       // the normal import — R6 must stay SILENT (the bundler resolves it)
];

export class LayerEngine {
  private layers: LayerRule[] = [];

  registerLayer(layer: LayerRule): void {
    this.layers.push(layer);
  }

  registerLayers(layers: LayerRule[]): void {
    for (const layer of layers) {
      this.layers.push(layer);
    }
  }

  async evaluateAll(ctx: AnalysisContext, evidence: EvidenceGate): Promise<AuditFinding[]> {
    const allFindings: AuditFinding[] = [];

    for (const layer of this.layers) {
      if (!layer.enabled) continue;

      const layerFindings = await this.evaluateLayer(layer, ctx, evidence);
      allFindings.push(...layerFindings);
    }

    const deduped = deduplicateFindings(allFindings);
    return deduped;
  }

  private async evaluateLayer(
    layer: LayerRule,
    ctx: AnalysisContext,
    evidence: EvidenceGate,
  ): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // THE W3 LEXICON DISPATCH — a lexicon-backed layer runs the PatternFamily
    // battery over the constructs (the matchers FLAG, the machine DECIDES).
    // THE DUAL-LAYERED: the tool's OWN detectors are the same PatternFamilies.
    const lexiconPatterns = FOUNDING_LEXICON_MAP[layer.layer];
    if (lexiconPatterns && lexiconPatterns.length > 0) {
      // THE D17 GOLDEN-STATE GATE (the L2 spec §3.5.3 — the 2026-08-20 fix):
      // run the CalibrationGate's FIRE + SILENT tests over the patterns BEFORE
      // the battery — a matcher that MISSES its own exampleHits OR FALSE-FIRES
      // on the clean-core fixtures is FLAGGED + EXCLUDED from THIS run, never
      // silently shipped. THE TESTS ARE ACTUALLY INVOKED (the 2026-08-20
      // debacle: the gate was built but never called — the fireTest/silentTest
      // must RUN, not just be checked via a default-CALIBRATED verdictOf).
      const gate = new CalibrationGate();
      const excludedPatterns: string[] = [];
      const calibratedPatterns: typeof lexiconPatterns = [];
      for (const pattern of lexiconPatterns) {
        let flagged = false;
        try {
          const fire = await gate.fireTest(pattern, pattern.exampleHits ?? []);
          if (fire.result === 'MISS') flagged = true;
          else {
            const silent = await gate.silentTest(pattern, GOLDEN_STATE_FIXTURES);
            if (silent.result === 'FALSE_FIRE') flagged = true;
          }
        } catch /* the calibration never breaks the audit — an un-testable matcher runs */ {
          flagged = false;
        }
        if (flagged) excludedPatterns.push(pattern.id);
        else calibratedPatterns.push(pattern);
      }
      if (excludedPatterns.length > 0) {
        tridentLog('WARN', 'audit-engine', `D17 golden-state: EXCLUDED the over-firing matchers ${excludedPatterns.join(', ')} for layer ${layer.layer} — they FALSE-FIRE on the clean core / MISS their violation fixtures, so their findings on the target would be false positives`);
      }
      const battery = calibratedPatterns.length > 0 ? calibratedPatterns : lexiconPatterns;
      const lexiconFindings = runBattery(battery, ctx.constructs, {
        checker: ctx.checker,
        callGraph: ctx.callGraph,
        projectContext: ctx.projectContext,
      });
      for (const lf of lexiconFindings) {
        findings.push(this.applyLexiconFinding(lf, layer, evidence));
      }
      return findings;
    }

    if (layer.applicableTo.length === 0) {
      try {
        const specialFindings = layer.evaluate(null, ctx);
        for (const f of specialFindings) {
          findings.push(this.applyDefaults(f, layer, evidence));
        }
      } catch (err: unknown) {
        // Non-fatal — layer crash logged, partial findings returned from completed layers
        tridentLog('WARN', 'layer-engine', `Layer ${layer.layer} crashed on root eval: ${err instanceof Error ? err.message : String(err)}`);
      }
      return findings;
    }

    const narrowed = ctx.constructs.filter((c: CodeConstruct) => this.matchesGates(c, layer)); // AUDIT_FP: local variable in evaluateLayer, used at line 58

    for (const construct of narrowed) {
      try {
        const constructFindings = layer.evaluate(construct, ctx);
        for (const f of constructFindings) {
          findings.push(this.applyDefaults(f, layer, evidence, construct));
        }
      } catch (err: unknown) {
        // Non-fatal — construct crash logged, SKIP this construct, continue with others
        tridentLog('WARN', 'layer-engine', `Layer ${layer.layer} crashed on ${construct.name || 'anonymous'}: ${err instanceof Error ? err.message : String(err)}`);
        continue; // Skip this construct, don't abort the entire layer
      }
    }

    return findings;
  }

  /** THE LEXICON FINDING → THE AUDIT FINDING (the triad-gated mapping). */
  private applyLexiconFinding(
    lf: LexiconFinding,
    layer: LayerRule,
    evidence: EvidenceGate,
  ): AuditFinding {
    return {
      layer: layer.layer,
      severity: lf.severity,
      category: lf.ruleId,
      file: lf.file,
      line: lf.line,
      evidence: lf.evidence,
      description: lf.description,
      correction: lf.correction,
      runtimeImpact: `Lexicon ${lf.ruleId} flagged a pattern in the ${layer.layer} layer (conf: ${lf.confidence.toFixed(2)})`,
      confidence: lf.confidence,
      constructType: null,
      callGraphRef: null,
      evidenceSuppressed: evidence.suppress(layer.layer),
      triad: {
        pattern: { memberId: lf.ruleId, familySeverity: lf.severity },
        state: { machineId: layer.layer, from: 'ANALYZE', to: 'CLASSIFY' },
        evidence: { file: lf.file, line: lf.line },
      },
    };
  }

  private matchesGates(construct: CodeConstruct, layer: LayerRule): boolean {
    if (!layer.applicableTo.includes(construct.type)) return false;

    if (layer.excludeTypes && layer.excludeTypes.includes(construct.type)) return false;

    if (layer.requireAsync && !construct.isAsync) return false;

    if (layer.requireHasBody && (!construct.body || construct.body.length < 3)) return false;

    if (layer.requireDefinition && !construct.isDefinition) return false;

    if (layer.requireCallSite && !construct.isCallSite) return false;

    return true;
  }

  private applyDefaults(
    finding: AuditFinding,
    layer: LayerRule,
    evidence: EvidenceGate,
    construct?: CodeConstruct,
  ): AuditFinding {
    const memberId = finding.category || finding.rule || layer.layer;
    const file = finding.file;
    const line = finding.line;
    return {
      layer: layer.layer,
      severity: finding.severity,
      category: finding.category,
      file: finding.file,
      line: finding.line,
      evidence: finding.evidence,
      description: finding.description,
      correction: finding.correction,
      runtimeImpact: finding.runtimeImpact,
      confidence: finding.confidence || 0.70,
      constructType: construct?.type || finding.constructType || null,
      callGraphRef: finding.callGraphRef || null,
      evidenceSuppressed: evidence.suppress(layer.layer),
      triad: (finding as AuditFinding).triad ?? {
        pattern: { memberId, familySeverity: finding.severity },
        state: { machineId: layer.layer, from: 'ANALYZE', to: 'CLASSIFY' },
        evidence: { file, line },
      },
    };
  }

  getLayers(): LayerRule[] {
    return [...this.layers];
  }
}

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((f: AuditFinding) => {
    const key = `${f.layer}:${f.file}:${f.line}:${f.category}:${f.description.substring(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
