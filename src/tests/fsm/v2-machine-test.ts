/**
 * V2 State Machine Test — expose the illegal transition bug
 * 
 * Tests that advanceLayer() can be called multiple times in sequence
 * without throwing illegal transition errors.
 */
import { OrchestratorMachineV2 } from '../../fsm/orchestrator-machine-v2.ts';
import { orchestrator } from '../../orchestrator.ts';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  const cond = actual === expected;
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}: ${actual}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}: expected ${expected}, got ${actual}`);
  }
}

// ── TEST 1: advanceLayer multiple times ──
console.log('\n--- Test 1: Multi-layer advance (CODE_REVIEW, 17 layers) ---');
const m1 = new OrchestratorMachineV2();
m1.startMode('CODE_REVIEW');
assertEqual('start: status', m1.getStatus(), 'RUNNING');
assertEqual('start: layer', m1.getLayer(), 0);
assertEqual('start: maxLayers', m1.getMaxLayers(), 17);

for (let i = 1; i <= 17; i++) {
  try {
    m1.advanceLayer();
    assertEqual(`advance #${i}: layer`, m1.getLayer(), i);
  } catch (e: unknown) {
    assert(`advance #${i}: no throw`, false);
    console.log(`    ERROR: ${(e as Error).message}`);
  }
}
assertEqual('after 17 advances: status', m1.getStatus(), 'LAYER_COMPLETE');

// 18th advance should transition to COMPLETE
try {
  m1.advanceLayer();
  assertEqual('advance #18: status', m1.getStatus(), 'COMPLETE');
} catch (e: unknown) {
  assert('advance #18: complete transition', false);
  console.log(`    ERROR: ${(e as Error).message}`);
}

assert('isComplete: true', m1.isComplete());

// ── TEST 2: advanceLayer on DEEP_PLANNING (3 layers) ──
console.log('\n--- Test 2: Multi-layer advance (DEEP_PLANNING, 3 layers) ---');
const m2 = new OrchestratorMachineV2();
m2.startMode('DEEP_PLANNING');
assertEqual('start: status', m2.getStatus(), 'RUNNING');
assertEqual('start: layer', m2.getLayer(), 0);

for (let i = 1; i <= 3; i++) {
  try {
    m2.advanceLayer();
    assertEqual(`advance #${i}: layer`, m2.getLayer(), i);
  } catch (e: unknown) {
    assert(`advance #${i}: no throw`, false);
    console.log(`    ERROR: ${(e as Error).message}`);
  }
}

m2.advanceLayer();
assertEqual('final advance: status', m2.getStatus(), 'COMPLETE');

// ── TEST 3: canTransitionTo with ERROR status ──
console.log('\n--- Test 3: canTransitionTo from ERROR ---');
// We need to use the singleton and force it into ERROR state
const { orchestratorMachineV2 } = await import('../../fsm/orchestrator-machine-v2.ts');
orchestratorMachineV2.startMode('CODE_REVIEW');
orchestratorMachineV2.fail('deliberate test error');
assertEqual('V2 status after fail', orchestratorMachineV2.getStatus(), 'ERROR');

const machineState = orchestrator.getMachineState();
assertEqual('getMachineState returns ERROR', machineState, 'ERROR');

// Check that canTransitionTo blocks transitions from ERROR (not just 'error_state')
const canTransition = orchestrator.canTransitionTo('CODE_REVIEW');
assertEqual('canTransitionTo(CODE_REVIEW) from ERROR should be false', canTransition, false);

const canTransitionIdle = orchestrator.canTransitionTo('IDLE');
assertEqual('canTransitionTo(IDLE) from ERROR should be true', canTransitionIdle, true);

// ── SUMMARY ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}`);

if (failed > 0) process.exit(1);
