import fc from 'fast-check';
import { createTridentTools } from '../../tools/trident-tools.ts';

export function testTools(): number {
  let c = 0;
  const tools = createTridentTools();
  const names = Object.keys(tools);
  fc.assert(fc.property(fc.constantFrom(...(names as [string, ...string[]])), (n) => {
    return typeof (tools as Record<string, { execute: Function }>)[n].execute === 'function';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.constantFrom(...(names as [string, ...string[]])), (n) => {
    return typeof (tools as Record<string, { description: string }>)[n].description === 'string' && (tools as Record<string, { description: string }>)[n].description.length > 10;
  }), { numRuns: 50 }); c += 50;
  return c;
}
