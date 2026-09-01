import * as path from 'node:path';
import type { VerdictsFile } from './verdicts.js';
export interface ValidateOpts { readonly candidatesCount: number; readonly targetRoot: string; readonly specs: readonly string[]; }
export type ValidateResult = { ok: true; rejections: string[] } | { ok: false; rejections: string[] };
const ADJ = new Set(['TRUE_DEFECT','RED_HERRING','UNCLEAR']);
function nonEmpty(v: unknown): boolean { return typeof v === 'string' && (v as string).length >= 1; }
function inTarget(f: string, root: string): boolean {
  if (!root) return false;
  const r = path.resolve(root, f); const rt = path.resolve(root);
  return r === rt || r.startsWith(rt + path.sep);
}
function specIn(spec: string | undefined, specs: readonly string[]): boolean {
  if (!spec) return false;
  const a = path.resolve(spec);
  for (const s of specs) { if (path.resolve(s) === a || s === spec) return true; }
  return false;
}
export function validateVerdicts(file: VerdictsFile, opts: ValidateOpts): ValidateResult {
  const rej: string[] = [];
  if (!file || typeof (file as unknown as Record<string,unknown>).runId !== 'string' || (file.runId as string).length === 0) rej.push('V0: runId missing or empty');
  if (!Array.isArray((file as unknown as Record<string,unknown>).verdicts)) { rej.push('V0: verdicts not an array'); return { ok:false, rejections: rej }; }
  for (let i=0;i<file.verdicts.length;i++) {
    const v = file.verdicts[i] as unknown as Record<string,unknown>;
    const pre = `V:verdict[${i}]`;
    const fi = v.findingIndex as number; const adj = v.adjudication as string; const conf = v.confidence as number;
    const fpos = v.file as string; const ln = v.line as number;
    if (!ADJ.has(adj)) rej.push(`V8:${pre} adjudication '${String(adj)}' not in {TRUE_DEFECT,RED_HERRING,UNCLEAR}`);
    if (typeof fi !== 'number' || !Number.isInteger(fi) || fi < 0 || fi >= opts.candidatesCount) rej.push(`V1:${pre} findingIndex ${String(fi)} not in [0,${opts.candidatesCount})`);
    if (adj === 'TRUE_DEFECT') {
      const miss: string[] = [];
      if (!nonEmpty(v.specPath)) miss.push('specPath');
      if (typeof v.specLine !== 'number' || !Number.isInteger(v.specLine as number) || (v.specLine as number) < 1) miss.push('specLine');
      if (!nonEmpty(v.specQuote)) miss.push('specQuote');
      if (!nonEmpty(v.codeQuote)) miss.push('codeQuote');
      if (!nonEmpty(v.divergence)) miss.push('divergence');
      if (miss.length) rej.push(`V2:${pre} TRUE_DEFECT missing [${miss.join(',')}]`);
    }
    if (adj === 'RED_HERRING' && !nonEmpty(v.legitimizingReason)) rej.push(`V3:${pre} RED_HERRING missing legitimizingReason`);
    if (adj === 'UNCLEAR' && !nonEmpty(v.missingEvidence)) rej.push(`V4:${pre} UNCLEAR missing missingEvidence`);
    if (typeof conf !== 'number' || Number.isNaN(conf) || conf < 0.55 || conf > 1.0) rej.push(`V5:${pre} confidence ${String(conf)} not in [0.55,1.0]`);
    if (typeof fpos !== 'string' || fpos.length===0 || typeof ln !== 'number' || !Number.isInteger(ln) || ln<1) rej.push(`V6:${pre} file/line invalid file='${String(fpos)}' line=${String(ln)}`);
    else if (!inTarget(fpos, opts.targetRoot)) rej.push(`V6:${pre} file '${String(fpos)}' not inside targetRoot '${opts.targetRoot}'`);
    if (adj === 'TRUE_DEFECT' && typeof v.specPath === 'string' && (v.specPath as string).length>0) {
      if (!specIn(v.specPath as string, opts.specs)) rej.push(`V7:${pre} specPath '${String(v.specPath)}' not in specs[]`);
    }
  }
  if (rej.length===0) return { ok:true, rejections:[] };
  return { ok:false, rejections: rej };
}
