import fc from 'fast-check';
import {shortFile, confidenceLabel, parseVersion, formatVersion} from '../../utils.ts';
import { setCurrentAgent, getCurrentAgent, clearCurrentAgent } from '../../hooks/agent-state.ts';

export function testIdentity(): number {
  let c = 0;
  fc.assert(fc.property(fc.string({minLength:1}), (n) => {
    setCurrentAgent(n); const a = getCurrentAgent(); clearCurrentAgent(); return a !== undefined;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string(), fc.integer({min:0,max:999}), (f,l) => {
    return shortFile(f+':'+l).includes(':');
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.float({min:0,max:1}), (conf) => {
    return ['CRITICAL','HIGH','MEDIUM','LOW'].includes(confidenceLabel(conf));
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string({minLength:1}), (v) => {
    const p = parseVersion(v); return typeof p.major === 'number';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer({min:0,max:9}),fc.integer({min:0,max:9}),fc.integer({min:0,max:9}), (a,b,cc) => {
    return formatVersion(a,b,cc).startsWith('V');
  }), { numRuns: 50 }); c += 50;
  return c;
}
