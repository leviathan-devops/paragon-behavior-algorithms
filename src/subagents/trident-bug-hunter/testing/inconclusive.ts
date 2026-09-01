export const inconclusiveMarker = '::INCONCLUSIVE(';

export function isInconclusiveResult(v: unknown): boolean {
  return typeof v === 'string' && v.includes(inconclusiveMarker);
}

export function markInconclusive(testName: string, reason: string, evidenceLine: string): never {
  const msg = `${inconclusiveMarker}${reason}):: ${testName} — ${evidenceLine}`;
  throw new Error(msg);
}
