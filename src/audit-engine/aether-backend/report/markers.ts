export const REPORT_MARKERS: readonly string[] = [
  '# CODE AUDIT AETHER REPORT',
  '## 0 RUN METADATA',
  '## 1 THE VERDICT TABLE',
  '## 2 TRUE DEFECTS',
  '## 3 THE KILL LOG',
  '## 4 THE ESCALATION QUEUE',
  '## 5 THE SYNTHESIS',
  '## 6 THE SELF-VERIFY STAMP',
] as const;
const PATS: readonly RegExp[] = [
  /^# CODE AUDIT AETHER REPORT\b/m,
  /^## 0 RUN METADATA\b/m,
  /^## 1 THE VERDICT TABLE\b/m,
  /^## 2 TRUE DEFECTS\b/m,
  /^## 3 THE KILL LOG\b/m,
  /^## 4 THE ESCALATION QUEUE\b/m,
  /^## 5 THE SYNTHESIS\b/m,
  /^## 6 THE SELF-VERIFY STAMP\b/m,
] as const;
export interface MarkerResult { readonly ok: boolean; readonly found: number; readonly total: number; readonly missing: string[]; readonly ordered: boolean; }
export function checkReportMarkers(t: string): MarkerResult {
  if (typeof t !== 'string') return { ok:false, found:0, total:PATS.length, missing:[...REPORT_MARKERS], ordered:false };
  const miss: string[]=[]; let found=0; const pos:number[]=[];
  for (let i=0;i<PATS.length;i++) { const m=t.match(PATS[i]); if(m && m.index!==undefined){found++;pos.push(m.index);} else miss.push(REPORT_MARKERS[i]); }
  let ord=true; for(let i=1;i<pos.length;i++) if(pos[i]<=pos[i-1]){ord=false;break;}
  if(miss.length>0) ord=false;
  return { ok: found===PATS.length && ord, found, total:PATS.length, missing: miss, ordered: ord };
}
