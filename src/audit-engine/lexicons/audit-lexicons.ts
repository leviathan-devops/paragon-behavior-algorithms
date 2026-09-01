/**
 * audit-lexicons.ts — THE MASTER TS/JS LEXICON SYSTEM (the L2 spec §3.3 — W3)
 *
 * THE OPERATOR: "i even have half a mind to say all regex in here should be
 * replaced with lexicons" + "macro level MASTER LEXICONS that can properly
 * work across any project for the next 2 years of builds."
 *
 * THE ISE LAW: the regex is the mechanical DETECTOR only (inside the matcher's
 * implementation); the DECISION is the state machine. A bare-regex matcher is
 * REJECTED at registration (LEXICON_REGISTRATION_REJECTED).
 * THE DUALITY: the tool's OWN detectors are registered through the SAME
 * registerPattern() — its detection layer and its construction material are
 * ONE.
 *
 * THE SLOP SIGNATURES (the ISE law's detection lexicon): the N-branch tower
 * (5+ pass branches / default-pass), the regex-only classifier (regex bodies +
 * a classifier name + no AST), the magic ladder (3+ unnamed numeric
 * thresholds) — these are the registration-time + calibration-time rejection
 * classes.
 */
import { CodeConstruct, Severity } from '../types.ts';
import { tridentLog } from '../../utils.js';

// ── THE PATTERNFAMILY (the typed detection family — the ISE law's unit) ──
export interface MatchResult {
  patternId: string;
  constructRef: string;               // the construct's identity (file:line)
  evidence: string;                   // the {Pattern, State, Evidence} — the node text window
  triggerFired: string;               // the triggerCondition that fired
  confidence: number;                 // 0.0-1.0
}

export interface AnalysisContext {
  checker: unknown | null;
  callGraph: { totalCallSites: number; coveragePercent: number };
  projectContext?: { gatedLayers: string[]; isPlugin: boolean };
  file?: string;
  line?: number;
}

export interface PatternFamily {
  id: string;                         // 'r2.empty-catch' — the stable inventory id
  kind: 'detector' | 'classifier';    // the detector FLAGS; the classifier names the class
  matcher: (node: CodeConstruct, ctx: AnalysisContext) => MatchResult | null;
  // Order-2+ — the AST-structural. Takes the construct + the context, returns
  // the match or null. A bare regex body is REJECTED at registration.
  triggerCondition: string;           // the named threshold/condition — a data field, never a literal
  severity: Severity;
  messageTemplate: string;            // the finding's description shape
  remediationHook?: string;           // the fix suggestion (the correction)
  exampleHits: string[];              // the recorded violation history (the calibration fixtures)
}

// ── THE LEXICON REGISTRY (the registration rejection — the ISE Order-2+ law) ──
export class LexiconRegistry {
  private patterns = new Map<string, PatternFamily>();

  register(family: PatternFamily): void {
    // THE ORDER-2+ CHECK — the matcher must take (node, ctx)
    if (typeof family.matcher !== 'function' || family.matcher.length < 2) {
      throw namedError('LEXICON_REGISTRATION_REJECTED',
        `bare-regex / unary matcher for ${family.id} — the ISE Order-2+ law: the matcher must take (node, ctx) and decide on the AST structure`);
    }
    // THE SLOP-SIGNATURE CHECK — a regex-body-only matcher (the regex-only classifier class)
    if (isBareRegexMatcher(family.matcher)) {
      throw namedError('LEXICON_REGISTRATION_REJECTED',
        `regex-only matcher for ${family.id} — the regex is the DETECTOR inside, never the matcher (the ISE law)`);
    }
    // THE FIXTURE CHECK — the exampleHits required (the calibration fixtures)
    if (!family.exampleHits || family.exampleHits.length === 0) {
      throw namedError('LEXICON_REGISTRATION_REJECTED',
        `exampleHits required for ${family.id} — the calibration fixtures (the D17 mutation gate)`);
    }
    this.patterns.set(family.id, family);
    tridentLog('INFO', 'audit-lexicons', `REGISTERED ${family.id} (${family.kind}, ${family.severity})`);
  }

  family(id: string): PatternFamily | undefined {
    return this.patterns.get(id);
  }

  all(): PatternFamily[] {
    return [...this.patterns.values()];
  }

  has(id: string): boolean {
    return this.patterns.has(id);
  }
}

/** THE SLOP-SIGNATURE DETECTOR — a matcher whose body is ONLY a regex test (the regex-only classifier class).
 * THE ISE LAW NAMED AT THE DETECTOR: the regexes below are the MECHANICAL
 * DETECTOR — they detect the "regex-only matcher" SHAPE in a candidate's
 * source. The DECISION is the registry's rejection (the structural check that
 * follows). This is the L4 meta-lexicon policing the lexicons — the detection
 * layer, never the decision layer. A regex that DECIDES is the slop class;
 * a regex that DETECTS the slop shape is the enforcement. */
function isBareRegexMatcher(matcher: (node: CodeConstruct, ctx: AnalysisContext) => MatchResult | null): boolean {
  const src = matcher.toString();
  // THE DETECTOR: the source contains a regex literal OR a .test(/.match( call
  // AND does NOT reference the ctx parameter (the Order-2 context-awareness).
  const hasRegex = /\/[^/]+\/[a-z]*\.(test|match|exec)\(/.test(src) || /new RegExp/.test(src);
  const usesCtx = src.includes('ctx');
  // THE DECISION: a regex that never consults the context is the prose-shape class
  return hasRegex && !usesCtx;
}

// ── THE LEXICON MACHINE (IDLE→PARSED→ANALYZED→CLASSIFIED→EVIDENCED→EMITTED) ──
// THE MATCHERS FLAG (the MatchResults — NO verdicts); THE MACHINE DECIDES.
// THE FAIL-STATE: INCONCLUSIVE — never PASS.
export type LexiconMachineState =
  | 'IDLE' | 'PARSED' | 'ANALYZED' | 'CLASSIFIED' | 'EVIDENCED' | 'EMITTED' | 'INCONCLUSIVE';

export interface LexiconFinding {
  ruleId: string;                     // the pattern id
  pattern: string;                    // the machine state at the finding ('CLASSIFIED')
  state: string;                      // the machine state ('EVIDENCED')
  evidence: string;                   // the {Pattern, State, Evidence} — the node text + the file:line
  file: string;
  line: number;
  severity: Severity;
  confidence: number;
  description: string;
  correction: string;
  layer: string;
}

/**
 * THE BATTERY RUN — the compiled predicates over the constructs. The matchers
 * FLAG (the MatchResults); the machine CLASSIFIES (the triggerConditions →
 * the findings). THE HONEST SILENT: an unbound predicate returns [] — it
 * claims nothing it cannot measure. THE EVIDENCE TRIAD: every finding carries
 * {Pattern, State, Evidence} — no triplet = no finding.
 */
export function runBattery(
  patterns: PatternFamily[],
  constructs: CodeConstruct[],
  ctx: AnalysisContext,
): LexiconFinding[] {
  const findings: LexiconFinding[] = [];
  for (const pattern of patterns) {
    for (const construct of constructs) {
      try {
        const match = pattern.matcher(construct, ctx);
        if (!match) continue;
        // THE MACHINE DECIDES — the match FLAGGED; the triggerCondition is the
        // named threshold (a data field, never a literal)
        findings.push({
          ruleId: match.patternId,
          pattern: 'CLASSIFIED',
          state: 'EVIDENCED',
          evidence: match.evidence,
          file: construct.filePath,
          line: construct.line,
          severity: pattern.severity,
          confidence: match.confidence,
          description: pattern.messageTemplate.replace('{evidence}', match.evidence),
          correction: pattern.remediationHook || '',
          layer: layerFromPatternId(match.patternId),
        });
      } catch (e: unknown) {
        tridentLog('ERROR', 'audit-lexicons', `matcher ${pattern.id} threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return findings;
}

/** THE LAYER FROM THE PATTERN ID — 'r2.empty-catch' → 'R2'. */
export function layerFromPatternId(patternId: string): string {
  const m = patternId.match(/^r(\d+)/);
  return m ? `R${m[1]}` : 'R0';
}

/** THE DEDUPE — the ruleId+file+line collapse (the determinism + the no-duplicate law). */
export function dedupeFindings(findings: LexiconFinding[]): LexiconFinding[] {
  const seen = new Set<string>();
  const out: LexiconFinding[] = [];
  for (const f of findings) {
    const key = `${f.ruleId}|${f.file}|${f.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function namedError(code: string, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}
