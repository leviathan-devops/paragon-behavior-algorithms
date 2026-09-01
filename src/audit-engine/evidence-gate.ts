import { PreflightResult, AuditFinding } from './types.ts';
import * as ts from 'typescript';

export class EvidenceGate {
  private preflight: PreflightResult;
  private diagnostics: ts.Diagnostic[];
  private findings: AuditFinding[];

  constructor(preflight: PreflightResult, diagnostics: ts.Diagnostic[], findings?: AuditFinding[]) {
    this.preflight = preflight;
    this.diagnostics = diagnostics;
    this.findings = findings || [];
  }

  getPreflight(): PreflightResult {
    return this.preflight;
  }

  getDiagnostics(): ts.Diagnostic[] {
    return this.diagnostics;
  }

  suppress(layer: string, finding?: AuditFinding): boolean {
    switch (layer) {
      case 'R0':
        // R0 checks build chain integrity — a passing build genuinely contradicts R0 findings
        return this.preflight.buildPassed && this.preflight.typeCheckPassed;
      case 'R5':
        return this.preflight.distExists && this.preflight.distIsSingleFile;
      case 'R6':
        return this.preflight.buildPassed;
      case 'R2':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && f.evidence.includes(': ') && /[A-Z][a-zA-Z]+:\s/.test(f.evidence)
        );
      case 'R14':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && (f.file.includes('.test.') || f.file.includes('.spec.') || f.file.includes('__tests__'))
        );
      case 'R15':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && /process\.env\.\w+\s*\|\|/.test(f.evidence)
        );
      case 'R16': {
        // R16 checks code quality principles — most issues compile fine
        // Only suppress R16 findings that are directly about type/compilation correctness
        if (!this.preflight.buildPassed || !this.preflight.typeCheckPassed) {
          return false; // Build fails — R16 findings are MORE credible, not less
        }
        // Build passes — only suppress type-safety-specific R16 categories
        // B2 (type certainty / as casts) and B10 (output contract / missing return)
        // are directly contradicted by a passing typecheck
        const typeSafetyCategories = ['B2_TYPE_CERTAINTY', 'B10_OUTPUT_CONTRACT', 'B2', 'B10', 'TYPE_CERTAINTY', 'OUTPUT_CONTRACT'];
        if (finding?.category && typeSafetyCategories.includes(finding.category)) {
          return true;
        }
        // B1, B3, B4, B7, B8, B9, B11 — NOT contradicted by passing build
        return false;
      }
      default:
        return false;
    }
  }

  support(layer: string): boolean {
    switch (layer) {
      case 'R0':
        return !this.preflight.buildPassed || !this.preflight.typeCheckPassed;
      case 'R5':
        return !this.preflight.distExists || !this.preflight.distIsSingleFile;
      case 'R6':
        return this.diagnostics.some((d: ts.Diagnostic) => d.category === ts.DiagnosticCategory.Error);
      case 'R2':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && !f.evidence.includes(': ')
        );
      case 'R14':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && !f.file.includes('.test.') && !f.file.includes('.spec.') && !f.file.includes('__tests__')
        );
      case 'R15':
        return this.findings.some((f: AuditFinding) => f.layer === layer && !/process\.env\.\w+\s*\|\|/.test(f.evidence)); // R14 FIX: single-line return reduces return gap
      case 'R16':
        // Spec Phase 2: R16 is always supported when findings exist.
        // Build success does NOT delegitimize R16 findings.
        return this.findings && this.findings.length > 0;
      default:
        return false;
    }
  }

  applyEvidenceFactor(finding: AuditFinding): AuditFinding {
    const suppressed = this.suppress(finding.layer, finding);
    const supported = this.support(finding.layer);

    let confidence = finding.confidence;
    if (suppressed && !supported) {
      confidence = finding.confidence * 0.1;
    } else if (supported && !suppressed) {
      confidence = Math.min(1.0, finding.confidence * 1.5);
    } else if (suppressed && supported) {
      if (finding.severity === 'CRITICAL') {
        confidence = finding.confidence * 0.1;
      } else {
        confidence = Math.min(1.0, finding.confidence * 1.5);
      }
    }

    return {
      ...finding,
      confidence,
      evidenceSuppressed: suppressed,
    };
  }
}
