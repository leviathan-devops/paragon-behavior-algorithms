import { testDeepPlanning, testProblemSolving, testContextSynthesis, testOrchestrator } from './fsm/properties.ts';
import { testNLP } from './nlp/properties.ts';
import { testIdentity } from './identity/properties.ts';
import { testTools } from './tools/properties.ts';
import { testZeroTolerance, testInvariants, testFuzz } from './deep/deep-properties.ts';

let total = 0;
total += testDeepPlanning();
total += testProblemSolving();
total += testContextSynthesis();
total += testOrchestrator();
total += testNLP();
total += testIdentity();
total += testTools();
total += testZeroTolerance();
total += testInvariants();
total += testFuzz();
console.log(`Total: ${total} properties`);
