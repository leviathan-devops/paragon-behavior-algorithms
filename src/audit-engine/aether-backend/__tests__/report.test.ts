import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { validateVerdicts } from '../report/validator.js';
import { checkReportMarkers } from '../report/markers.js';
import { writeManifest, readManifest } from '../report/manifest.js';
import { writeReconMap, writeCandidateContext, appendWriteViolation, readWriteViolations } from '../report/evidence.js';
import type { VerdictsFile } from '../report/verdicts.js';
function mkTmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aether-report-')); }
function rmTmp(p: string) { fs.rmSync(p, { recursive: true, force: true }); }
const SPEC = path.join(os.tmpdir(), 'spec-ARCH_SPEC.md');
const TARGET = path.join(os.tmpdir(), 'tgt');
function bv(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { findingIndex: 0, layer: 'r-actor', adjudication: 'TRUE_DEFECT', file: 'src/foo.ts', line: 10, specPath: SPEC, specLine: 100, specQuote: 'the spec declares X', codeQuote: 'the code does Y', divergence: 'gap Z', confidence: 0.9, ...over };
}
function bf(vs: Record<string, unknown>[]): VerdictsFile { return { runId: 'audit-1', verdicts: vs as never }; }
const opts = { candidatesCount: 2, targetRoot: TARGET, specs: [SPEC] };
describe('validator V1-V8', () => {
  it('V1 pass', () => { expect(validateVerdicts(bf([bv({findingIndex:1})]), opts).ok).toBe(true); });
  it('V1 fail out of bounds', () => { const r=validateVerdicts(bf([bv({findingIndex:5})]), opts); expect(r.ok).toBe(false); expect(r.rejections.some(x=>x.includes('V1'))).toBe(true); });
  it('V1 fail negative', () => { expect(validateVerdicts(bf([bv({findingIndex:-1})]), opts).ok).toBe(false); });
  it('V2 pass', () => { expect(validateVerdicts(bf([bv()]), opts).ok).toBe(true); });
  it('V2 fail missing specQuote', () => { const v=bv(); delete (v as Record<string,unknown>).specQuote; const r=validateVerdicts(bf([v]), opts); expect(r.ok).toBe(false); expect(r.rejections.some(x=>x.includes('V2'))).toBe(true); });
  it('V2 fail missing divergence', () => { const v=bv(); delete (v as Record<string,unknown>).divergence; expect(validateVerdicts(bf([v]), opts).rejections.some(x=>x.includes('V2'))).toBe(true); });
  it('V3 pass', () => { const f=bf([{findingIndex:0,layer:'r-actor',adjudication:'RED_HERRING',file:'src/foo.ts',line:1,legitimizingReason:'leaf util no state',confidence:0.8}]); expect(validateVerdicts(f, opts).ok).toBe(true); });
  it('V3 fail', () => { const f=bf([{findingIndex:0,layer:'r-actor',adjudication:'RED_HERRING',file:'src/foo.ts',line:1,confidence:0.8}]); const r=validateVerdicts(f, opts); expect(r.ok).toBe(false); expect(r.rejections.some(x=>x.includes('V3'))).toBe(true); });
  it('V4 pass', () => { const f=bf([{findingIndex:0,layer:'r-lexicon',adjudication:'UNCLEAR',file:'src/foo.ts',line:1,missingEvidence:'needs grep',confidence:0.6}]); expect(validateVerdicts(f, opts).ok).toBe(true); });
  it('V4 fail', () => { const f=bf([{findingIndex:0,layer:'r-lexicon',adjudication:'UNCLEAR',file:'src/foo.ts',line:1,confidence:0.6}]); expect(validateVerdicts(f, opts).rejections.some(x=>x.includes('V4'))).toBe(true); });
  it('V5 pass boundaries', () => { expect(validateVerdicts(bf([bv({confidence:0.55})]), opts).ok).toBe(true); expect(validateVerdicts(bf([bv({confidence:1.0})]), opts).ok).toBe(true); });
  it('V5 fail low', () => { expect(validateVerdicts(bf([bv({confidence:0.54})]), opts).rejections.some(x=>x.includes('V5'))).toBe(true); });
  it('V5 fail high', () => { expect(validateVerdicts(bf([bv({confidence:1.1})]), opts).rejections.some(x=>x.includes('V5'))).toBe(true); });
  it('V6 pass inside target', () => { expect(validateVerdicts(bf([bv({file:'src/a.ts'})]), opts).ok).toBe(true); });
  it('V6 fail outside', () => { const f=bf([bv({file:'../../etc/passwd'})]); const r=validateVerdicts(f, {candidatesCount:2,targetRoot:'/tmp/tgt',specs:[SPEC]}); expect(r.rejections.some(x=>x.includes('V6'))).toBe(true); });
  it('V7 pass', () => { expect(validateVerdicts(bf([bv({specPath:SPEC})]), opts).ok).toBe(true); });
  it('V7 fail', () => { const f=bf([bv({specPath:'/other/spec.md'})]); expect(validateVerdicts(f, opts).rejections.some(x=>x.includes('V7'))).toBe(true); });
  it('V8 fail unknown adjudication', () => { const f=bf([{findingIndex:0,layer:'r-actor',adjudication:'MAYBE' as never,file:'src/foo.ts',line:1,confidence:0.8}]); expect(validateVerdicts(f, opts).rejections.some(x=>x.includes('V8'))).toBe(true); });
  it('empty verdicts with 0 candidates', () => { expect(validateVerdicts({runId:'audit-1',verdicts:[]} as never, {candidatesCount:0,targetRoot:TARGET,specs:[SPEC]}).ok).toBe(true); });
  it('missing runId', () => { const r=validateVerdicts({runId:'',verdicts:[]} as never, {candidatesCount:0,targetRoot:TARGET,specs:[]}); expect(r.ok).toBe(false); });
});
describe('markers', () => {
  const good = `# CODE AUDIT AETHER REPORT \u2014 /ws \u2014 audit-1\n## 0 RUN METADATA\nmeta\n## 1 THE VERDICT TABLE\ntable\n## 2 TRUE DEFECTS\ndefects\n## 3 THE KILL LOG\nkill\n## 4 THE ESCALATION QUEUE\nqueue\n## 5 THE SYNTHESIS\nsynth\n## 6 THE SELF-VERIFY STAMP\nstamp\n`;
  it('pass 8/8', () => { const r=checkReportMarkers(good); expect(r.ok).toBe(true); expect(r.found).toBe(8); });
  it('fail missing', () => { const r=checkReportMarkers(good.replace('## 3 THE KILL LOG','')); expect(r.ok).toBe(false); expect(r.missing.length).toBe(1); });
  it('fail empty', () => { expect(checkReportMarkers('').ok).toBe(false); });
  it('fail null', () => { expect(checkReportMarkers(null as unknown as string).ok).toBe(false); });
  it('fail order', () => { const reordered='## 1 THE VERDICT TABLE\n## 0 RUN METADATA\n'+good; expect(checkReportMarkers(reordered).ordered).toBe(false); });
  it('concurrent pure', () => { const a=checkReportMarkers(good); const b=checkReportMarkers(''); expect(a.ok).toBe(true); expect(b.ok).toBe(false); });
});
describe('manifest', () => {
  let tmp:string; beforeEach(()=>{tmp=mkTmp();}); afterEach(()=>rmTmp(tmp));
  it('round-trip', () => { const m={runId:'audit-1',ready:true,provider:'opencode-go/muse-spark-1.2-contributor' as const,counts:{candidatesIn:1,trueDefect:1,redHerring:0,unclear:0,unclassifiedEmitted:0},rounds:{used:3,budget:5},wallClockMs:1000,probeMs:200,phaseLog:[{phase:'P0',enteredAt:0,exitedAt:100}],validatorRejects:0}; const p=writeManifest(tmp,m); expect(fs.existsSync(p)).toBe(true); const back=readManifest(tmp); expect(back.runId).toBe('audit-1'); });
  it('empty ledgerRoot throws', () => { expect(()=>writeManifest('',{runId:'x',ready:false,provider:'opencode-go/muse-spark-1.2-contributor' as const,counts:{candidatesIn:0,trueDefect:0,redHerring:0,unclear:0,unclassifiedEmitted:0},rounds:{used:0,budget:0},wallClockMs:0,probeMs:0,phaseLog:[],validatorRejects:0})).toThrow(); });
  it('ready false with error', () => { const m={runId:'audit-2',ready:false,stage:'probe' as const,error:{code:'AETHER_API_UNREACHABLE',message:'no',remedy:'fix'},provider:'opencode-go/muse-spark-1.2-contributor' as const,counts:{candidatesIn:0,trueDefect:0,redHerring:0,unclear:0,unclassifiedEmitted:0},rounds:{used:0,budget:0},wallClockMs:0,probeMs:0,phaseLog:[],validatorRejects:0}; writeManifest(tmp,m); expect(readManifest(tmp).error?.code).toBe('AETHER_API_UNREACHABLE'); });
});
describe('evidence', () => {
  let tmp:string; beforeEach(()=>{tmp=mkTmp();}); afterEach(()=>rmTmp(tmp));
  it('reconMap + cand + violations', () => {
    const p1=writeReconMap(tmp,[{specPath:SPEC,lines:100,clauses:['clause A L10']}]); expect(fs.existsSync(p1)).toBe(true);
    const p2=writeCandidateContext(tmp,0,'code excerpt here'); expect(fs.readFileSync(p2,'utf-8')).toBe('code excerpt here');
    const p3=writeCandidateContext(tmp,5,'second'); expect(path.basename(p3)).toBe('cand-05-context.txt');
    appendWriteViolation(tmp,{attempted:'/etc/passwd',ledgerRoot:tmp}); expect(readWriteViolations(tmp).length).toBe(1);
    appendWriteViolation(tmp,{attempted:'/other',ledgerRoot:tmp}); expect(readWriteViolations(tmp).length).toBe(2);
  });
  it('empty violations', () => { expect(readWriteViolations(tmp).length).toBe(0); });
  it('concurrent writes', () => { writeCandidateContext(tmp,0,'a'); writeCandidateContext(tmp,1,'b'); expect(fs.existsSync(path.join(tmp,'evidence','cand-00-context.txt'))).toBe(true); expect(fs.existsSync(path.join(tmp,'evidence','cand-01-context.txt'))).toBe(true); });
  it('invalid index throws', () => { expect(()=>writeCandidateContext(tmp,-1,'x')).toThrow(); });
});
