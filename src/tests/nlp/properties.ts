import fc from 'fast-check';
import { detectIntent } from '../../nlp/intent-parser.ts';

export function testNLP(): number {
  let c = 0;
  fc.assert(fc.property(fc.string({minLength:5,maxLength:200}), (input: string) => {
    const r = detectIntent(input);
    return r !== null && typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1;
  }), { numRuns: 500 }); c += 500;
  fc.assert(fc.property(fc.string({minLength:3,maxLength:100}), (input: string) => {
    const r1 = detectIntent(input);
    const r2 = detectIntent(input);
    return r1.mode === r2.mode && r1.confidence === r2.confidence;
  }), { numRuns: 200 }); c += 200;
  return c;
}
