// l3-engine-discoverer.ts — Groups constructs by engine domain for parallel L3 generation.
// Each domain becomes a scoped L2 spec via parallel runInternalLLMLoop.

import type { AnalysisResult } from './analysis-engine.ts';
import type { CodeConstruct } from '../audit-engine/types.ts';
import type { ThreatReport, ThreatFinding } from './threat-modeler.ts';
import type { DefenseSpec } from './defense-catalog.ts';
import { tridentLog } from '../utils.js';

export interface EngineDomain {
  name: string;
  constructs: CodeConstruct[];
  filePaths: Set<string>;
}

/**
 * Detect engine domains from analysis constructs.
 * Groups by directory prefix (e.g., "audit-engine/" → "audit", "poseidon/" → "planning").
 * If all constructs are in one directory, returns a single domain.
 */
export function detectEngineDomains(analysis: AnalysisResult): EngineDomain[] {
  const domainMap = new Map<string, EngineDomain>();
  const constructs = analysis.constructs || [];

  for (const construct of constructs) {
    const c = construct;
    const filePath: string = c.filePath || '';
    if (!filePath) continue;

    // Extract domain from file path
    // Strategy: Look for meaningful directory names, preferring subdirectories AFTER 'src'
    // src/audit/xxx → "audit"
    // src/planning/xxx → "planning"
    // src/nlp/xxx → "nlp"
    // audit-engine/xxx → "audit"
    const parts = filePath.replace(/\\/g, '/').split('/');
    let domainName = 'core';
    let passedSrc = false;

    // First pass: find if 'src' exists in path
    const srcIdx = parts.findIndex(p => p.toLowerCase() === 'src');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].toLowerCase();

      // Skip non-domain path components
      if (part === 'src') { passedSrc = true; continue; }
      if (part === 'root' || part === '..' || part === '.') continue;
      // Skip file extensions
      if (part.endsWith('.ts') || part.endsWith('.js') || part.endsWith('.tsx') || part.endsWith('.jsx')) continue;
      // Skip the project root directory itself (common project names)
      if (srcIdx >= 0 && i < srcIdx) {
        // Before 'src' — only use specific known engine names
        if (part === 'audit-engine' || part === 'audit') { domainName = 'audit'; break; }
        if (part === 'poseidon' || part === 'planning') { domainName = 'planning'; break; }
        if (part === 'nlp') { domainName = 'nlp'; break; }
        if (part === 'hooks') { domainName = 'hooks'; break; }
        if (part === 'tools') { domainName = 'tools'; break; }
        if (part === 'warheads') { domainName = 'warheads'; break; }
        if (part === 'artifacts') { domainName = 'artifacts'; break; }
        if (part === 'modes') { domainName = 'modes'; break; }
        if (part === 'fsm') { domainName = 'fsm'; break; }
        if (part === 'identity') { domainName = 'identity'; break; }
        if (part === 'evidence') { domainName = 'evidence'; break; }
        continue; // Skip generic match for pre-src directories
      }

      // Specific engine mappings
      if (part === 'audit-engine' || part === 'audit') { domainName = 'audit'; break; }
      if (part === 'poseidon' || part === 'planning') { domainName = 'planning'; break; }
      if (part === 'nlp') { domainName = 'nlp'; break; }
      if (part === 'hooks') { domainName = 'hooks'; break; }
      if (part === 'tools') { domainName = 'tools'; break; }
      if (part === 'warheads') { domainName = 'warheads'; break; }
      if (part === 'artifacts') { domainName = 'artifacts'; break; }
      if (part === 'modes') { domainName = 'modes'; break; }
      if (part === 'fsm') { domainName = 'fsm'; break; }
      if (part === 'identity') { domainName = 'identity'; break; }
      if (part === 'evidence') { domainName = 'evidence'; break; }

      // Generic: use the directory name (only for post-src or paths without src)
      if (part.length > 2 && part !== 'node_modules' && part !== 'dist') {
        domainName = part.replace(/[^a-z0-9]/g, '');
        break;
      }
    }

    if (!domainMap.has(domainName)) {
      domainMap.set(domainName, {
        name: domainName,
        constructs: [],
        filePaths: new Set(),
      });
    }

    const domain = domainMap.get(domainName)!;
    domain.constructs.push(construct);
    if (filePath) domain.filePaths.add(filePath);
  }

  // If only 1 domain or 0 domains, return single domain
  const domains = [...domainMap.values()];

  // Sort by construct count (largest first)
  domains.sort((a, b) => b.constructs.length - a.constructs.length);

  // Limit to top 6 domains to avoid excessive parallelism
  const limited = domains.slice(0, 6);

  tridentLog('INFO', 'l3-engine-discoverer',
    `Detected ${domains.length} domains, using top ${limited.length}: ` +
    limited.map(d => `${d.name}(${d.constructs.length})`).join(', '));

  return limited.length > 0 ? limited : [{ name: 'core', constructs: [], filePaths: new Set() }];
}

/**
 * Scope analysis to a specific domain.
 * Returns a new AnalysisResult containing only constructs, threats, and defenses
 * relevant to the specified domain's files.
 */
export function scopeAnalysisToDomain(
  analysis: AnalysisResult,
  domain: EngineDomain,
): AnalysisResult {
  const domainFiles = domain.filePaths;

  // Filter constructs to domain files
  const scopedConstructs = analysis.constructs.filter((c: CodeConstruct) => {
    const fp = c.filePath || '';
    return domainFiles.has(fp);
  });

  // Filter threats to those with findings in domain files
  const scopedThreats = analysis.threats.filter((t: ThreatReport) => {
    const findings = t.findings || [];
    return findings.some((f: ThreatFinding) => (f.file && domainFiles.has(f.file)) || false);
  }).map((t: ThreatReport) => ({
    ...t,
    findings: (t.findings || []).filter((f: ThreatFinding) => (f.file && domainFiles.has(f.file)) || false),
  }));

  // Keep all defenses (they're project-wide, not domain-specific)
  // But could filter by domain if defense has domain metadata
  const scopedDefenses = analysis.defenses;

  return {
    ...analysis,
    constructs: scopedConstructs,
    threats: scopedThreats as ThreatReport[],
    defenses: scopedDefenses as DefenseSpec[],
  } as AnalysisResult;
}
