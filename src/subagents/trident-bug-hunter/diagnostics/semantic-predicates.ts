// semantic predicates probe 6 predicates compact — hoisted contentMap (D3)
import { z } from 'zod';
import { SEVERITIES, type Severity } from '../../../shared/knowledge-graph/db.ts';
import type { CheckContext, CompiledPredicate, Finding, PredicateTemplate } from '../lexicon/templates.ts';
import { compileTemplate } from '../lexicon/templates.ts';
import type { EvidenceTriad } from '../../../audit-engine/triad.ts';
import { isEvidenceTriad } from '../../../audit-engine/triad.ts';
const CARD_FIELDS = { verbatimQuote: z.string(), anchor: z.string(), severity: z.enum(SEVERITIES) } as const;
type TriadFinding = Finding & { triad: EvidenceTriad };
function mapSeverity(dbSev: Severity): EvidenceTriad['pattern']['familySeverity'] { return dbSev === 'CRIT' ? 'CRITICAL' : dbSev === 'HIGH' ? 'HIGH' : dbSev === 'MED' ? 'MEDIUM' : 'LOW'; }
function makeTriad(file: string, line: number, memberId: string, severity: Severity): EvidenceTriad {
  const triad: EvidenceTriad = { pattern: { memberId, familySeverity: mapSeverity(severity) }, state: { machineId: 'semantic-battery', from: 'IDLE', to: 'VIOLATED' }, evidence: { file, line } };
  if (!isEvidenceTriad(triad)) throw new Error('FINDING_NO_TRIPLET');
  return triad;
}
function bindSeverity(b: Record<string, unknown>): Severity {
  const v = b['severity'];
  if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) return v as Severity;
  return 'HIGH';
}
function evStr(mid: string, file: string, line: number, snippet: string, bug: string): string { return `[${bug}] ${mid} at ${file}:${line} — ${snippet.slice(0,180)} | triad=${mid}`; }

export const PROCESS_CWD_PERSISTENCE_MESSAGE = 'process.cwd()-resolved persistence path';
export const PROCESS_CWD_PERSISTENCE_REMEDIATION = 'anchor to project root via injected baseDir';
export const P1: PredicateTemplate = {
  id: 'semantic.process-cwd-persistence', family: 'PROCESS', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev = bindSeverity(ctx.bindings);
    const files = [...new Set(ctx.graph.nodes().map(n => n.file).filter((f): f is string => !!f))];
    for (const file of files) {
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if (text === undefined) continue;
      if (!text.includes('process.cwd()')) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) if ((lines[i] ?? '').includes('process.cwd()')) {
        const win = lines.slice(Math.max(0,i-2), Math.min(lines.length,i+12)).join('\n');
        if (/(writeFile|mkdirSync|path\.join).*\.trident/.test(win)) {
          const triad = makeTriad(file,i+1,'semantic.process-cwd-persistence',sev);
          findings.push({ ruleId:'semantic.process-cwd-persistence', severity:sev, file, line:i+1, evidence:evStr('semantic.process-cwd-persistence',file,i+1,lines[i]!.trim(),'HT-BUG-3b/15'), verdict:'VIOLATION', triad } as TriadFinding);
        }
      }
    }
    return findings;
  },
};
export const DUAL_STORE_LIFECYCLE_MESSAGE = 'lifecycle writes side-channel store';
export const DUAL_STORE_LIFECYCLE_REMEDIATION = 'write terminal phase via writeStateAtomic';
export const P2: PredicateTemplate = {
  id: 'semantic.dual-store-lifecycle-write', family: 'PROCESS', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev = bindSeverity(ctx.bindings);
    const files = [...new Set(ctx.graph.nodes().map(n => n.file).filter((f): f is string => !!f))];
    for (const file of files) {
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if (!text.includes('setAbortFlag')) continue;
      const lines = text.split('\n');
      for (let i=0;i<lines.length;i++) if((lines[i]??'').includes('setAbortFlag')) {
        const win = lines.slice(Math.max(0,i-15),Math.min(lines.length,i+15)).join('\n');
        if (/abort/i.test(win) && !/writeStateAtomic|phase.*FAILED/.test(win)) {
          const triad = makeTriad(file,i+1,'semantic.dual-store-lifecycle-write',sev);
          findings.push({ ruleId:'semantic.dual-store-lifecycle-write', severity:sev, file, line:i+1, evidence:evStr('semantic.dual-store-lifecycle-write',file,i+1,lines[i]!.trim(),'HT-BUG-2'), verdict:'VIOLATION', triad } as TriadFinding);
        }
      }
    }
    return findings;
  },
};
export const UNWIRED_ENFORCEMENT_MESSAGE = 'exported gate has zero callers';
export const UNWIRED_ENFORCEMENT_REMEDIATION = 'wire gate into hook';
export const P3: PredicateTemplate = {
  id: 'semantic.unwired-enforcement', family: 'WIRING', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev = bindSeverity(ctx.bindings);
    for (const node of ctx.graph.nodes()) {
      if (node.kind!=='function' && node.kind!=='method' && node.kind!=='class') continue;
      if (!/(enforce|gate|guard|STATE_GATE)/i.test(node.name)) continue;
      if (ctx.graph.whoCalls(node.name).length!==0) continue;
      const file = node.file ?? ''; if (!file) continue;
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if (!/(enforcer|gate|firewall)/i.test(file) && !/(enforcer|gate)/i.test(text.slice(0,2000))) continue;
      const triad = makeTriad(file, node.line??1,'semantic.unwired-enforcement',sev);
      findings.push({ ruleId:'semantic.unwired-enforcement', severity:sev, file, line:node.line??1, evidence:evStr('semantic.unwired-enforcement',file,node.line??1,node.name,'wired-dead'), verdict:'VIOLATION', triad } as TriadFinding);
    }
    return findings;
  },
};
export const ERROR_ONLY_GUARD_MESSAGE = 'guard covers only error/aborted';
export const ERROR_ONLY_GUARD_REMEDIATION = 'add Array.isArray(message.content) guard';
export const P4: PredicateTemplate = {
  id: 'semantic.error-only-guard-gap', family: 'CONTRACT', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev = bindSeverity(ctx.bindings);
    const files = [...new Set(ctx.graph.nodes().map(n => n.file).filter((f): f is string => !!f))];
    for (const file of files) {
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if(!text.includes('stopReason')) continue;
      const lines=text.split('\n');
      for(let i=0;i<lines.length;i++) if(/stopReason.*error|stopReason.*aborted/i.test(lines[i]??'')) {
        const win=lines.slice(Math.max(0,i-8),Math.min(lines.length,i+16)).join('\n');
        if(!/Array\.isArray.*message\.content|AETHER_MALFORMED/.test(win)) {
          const triad=makeTriad(file,i+1,'semantic.error-only-guard-gap',sev);
          findings.push({ ruleId:'semantic.error-only-guard-gap', severity:sev, file, line:i+1, evidence:evStr('semantic.error-only-guard-gap',file,i+1,lines[i]!.trim(),'HT-BUG-8'), verdict:'VIOLATION', triad } as TriadFinding);
        }
      }
    }
    return findings;
  },
};
export const DIAGNOSTICS_JAIL_MESSAGE = 'phase allowlist lacks read exemptions';
export const DIAGNOSTICS_JAIL_REMEDIATION = 'add DIAGNOSTIC_TOOLS exemption';
export const P5: PredicateTemplate = {
  id: 'semantic.diagnostics-jail', family: 'PROCESS', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev=bindSeverity(ctx.bindings);
    const files = [...new Set(ctx.graph.nodes().map(n => n.file).filter((f): f is string => !!f))];
    for(const file of files) {
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if(!/PHASE_REQUIRED_TOOLS/i.test(text)) continue;
      if(/DIAGNOSTIC_TOOLS/i.test(text)) continue;
      const lines=text.split('\n');
      for(let i=0;i<lines.length;i++) if(/PHASE_REQUIRED_TOOLS/i.test(lines[i]??'')) {
        const win=lines.slice(Math.max(0,i-5),Math.min(lines.length,i+30)).join('\n');
        if(!/DIAGNOSTIC_TOOLS|AUDIT_TOOLS|read/.test(win)) {
          const triad=makeTriad(file,i+1,'semantic.diagnostics-jail',sev);
          findings.push({ ruleId:'semantic.diagnostics-jail', severity:sev, file, line:i+1, evidence:evStr('semantic.diagnostics-jail',file,i+1,lines[i]!.trim(),'HT-BUG-21'), verdict:'VIOLATION', triad } as TriadFinding);
        }
      }
    }
    return findings;
  },
};
export const UNSCOPED_WALKER_MESSAGE = 'walker exclude omits Checkpoints';
export const UNSCOPED_WALKER_REMEDIATION = 'add EXCLUDED_DIRS with Checkpoints .trident dist';
export const P6: PredicateTemplate = {
  id: 'semantic.unscoped-walker', family: 'PROCESS', parameters: z.object({ ...CARD_FIELDS }),
  check(ctx) {
    const findings: Finding[] = []; const sev=bindSeverity(ctx.bindings);
    const files = [...new Set(ctx.graph.nodes().map(n => n.file).filter((f): f is string => !!f))];
    for(const file of files) {
      const text = ctx.contentMap?.get(file); if (text === undefined) continue;
      if(!/scanTsFiles|readdirSync/i.test(text)) continue;
      const lines=text.split('\n');
      for(let i=0;i<lines.length;i++) if(/scanTsFiles|readdirSync/i.test(lines[i]??'')) {
        const win=lines.slice(Math.max(0,i-20),Math.min(lines.length,i+30)).join('\n');
        const hasEx=/exclude|EXCLUDED_DIRS/i.test(win);
        if(!hasEx) {
          const triad=makeTriad(file,i+1,'semantic.unscoped-walker',sev);
          findings.push({ ruleId:'semantic.unscoped-walker', severity:sev, file, line:i+1, evidence:evStr('semantic.unscoped-walker',file,i+1,lines[i]!.trim(),'HT-BUG-20'), verdict:'VIOLATION', triad } as TriadFinding);
        } else if(!/Checkpoints/i.test(win) || !/\.trident/i.test(win)) {
          const triad=makeTriad(file,i+1,'semantic.unscoped-walker',sev);
          findings.push({ ruleId:'semantic.unscoped-walker', severity:sev, file, line:i+1, evidence:evStr('semantic.unscoped-walker',file,i+1,lines[i]!.trim()+' missing Checkpoints/.trident','HT-BUG-20'), verdict:'VIOLATION', triad } as TriadFinding);
        }
      }
    }
    return findings;
  },
};

export const SEMANTIC_TEMPLATES: Readonly<Record<string, PredicateTemplate>> = {
  'semantic.process-cwd-persistence': P1,
  'semantic.dual-store-lifecycle-write': P2,
  'semantic.unwired-enforcement': P3,
  'semantic.error-only-guard-gap': P4,
  'semantic.diagnostics-jail': P5,
  'semantic.unscoped-walker': P6,
};
export const SEMANTIC_PREDICATE_IDS = Object.keys(SEMANTIC_TEMPLATES);
export function buildSemanticBattery(batteryVersion = 'semantic-v1'): CompiledPredicate[] {
  const out: CompiledPredicate[] = [];
  for (const [id, tmpl] of Object.entries(SEMANTIC_TEMPLATES)) out.push(compileTemplate(tmpl, { verbatimQuote: tmpl.id, anchor: `semantic-predicates.ts:${id}`, severity: 'HIGH' as Severity }, { verbatimQuote: tmpl.id, anchor: `semantic-predicates.ts:${id}`, severity: 'HIGH' as Severity }, batteryVersion));
  return out;
}
