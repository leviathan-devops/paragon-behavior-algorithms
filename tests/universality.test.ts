import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ParagonToolEngine } from '../core/engine.js';
import { loadLayer, createRegistry, registerLayer } from '../config/loader.js';
import { fillTemplate, resolveWarhead, validateWarhead, getRequiredSections } from '../actuation/warhead-templates.js';
import { dispatchTea, blockAtTeb, dispatchDirective } from '../actuation/dispatch.js';
import { PbaBridgeImpl, correlateEscalation } from '../core/pba-bridge.js';
import { ChainTracker } from '../core/chain-tracker.js';
import { V2Synapse } from '../core/synapse.js';
import { step, createInitialRecord } from '../core/machine.js';
import { StructuredEnforcementError } from '../core/types.js';
import { MockAdapter } from '../hooks/mock.js';
import { OpencodeAdapter } from '../hooks/opencode-adapter.js';
import { ToolEventRouter } from '../capture/tool-event-router.js';

function makeModule(overrides: Partial<import('../core/types.js').ToolChainModule> = {}): import('../core/types.js').ToolChainModule {
  return {
    name: 'test-toolchain',
    brandPrefix: 'PTA',
    layers: [],
    chainRules: [],
    compliance: {
      escapeHatches: ['read', 'grep', 'glob'],
      remediationTools: ['trident-container-test'],
      verificationPatterns: [/results\.json/],
    },
    pbaBridge: { enabled: false },
    ...overrides,
  };
}

function makeLayer(overrides: Partial<import('../core/types.js').ToolChainLayer> = {}): import('../core/types.js').ToolChainLayer {
  return {
    id: 'SMOKE_TEST_GUARD',
    description: 'Block smoke tests as verification',
    toolMatchers: [{ toolName: 'bash', argPatterns: { command: [/node -e.*/i, /bun -e.*/i] as unknown as string[] } as unknown as Record<string, RegExp[]> }],
    banks: {
      descriptive: [/for the container test/i, /as pre-flight check/i],
      suggestive: [/\bjust quickly check\b/i, /\bsmoke test\b/i],
      substitute: [/instead of the container/i, /skip the full test/i],
      use: [/per the tool result/i, /trident-container-test/i],
    },
    pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
    enforcement: {
      tier1: 'DETECTED: {toolName} {args}\n\nWHY THIS FIRED: {chainViolations} {pbaFamilies} tier {pbaTier}\n\nWHAT THIS MEANS: Smoke substitution.\n\nCORRECT BEHAVIOR: Call {correctTool}\n\nSELF-CHECK: Am I calling {correctTool}?\n\nRESET PATH: Call {correctTool} ({anchor})',
      tier2: 'DETECTED: Repeated {count}\n\nWHY THIS FIRED: Repeated\n\nWHAT THIS MEANS: Escalated\n\nCORRECT BEHAVIOR: {correctTool}\n\nSELF-CHECK: Addressed?\n\nRESET PATH: {correctTool} ({anchor})',
      tier3: 'DETECTED: REFUSED {toolName}\n\nWHY THIS FIRED: Tier 3\n\nWHAT THIS MEANS: Blocked\n\nCORRECT BEHAVIOR: {correctTool}\n\nSELF-CHECK: Calling {correctTool}?\n\nRESET PATH: {correctTool} ({anchor})',
      tier4: '[PTA GATE] BEHAVIORAL CORRECTION cycles {escalationCount} PBA {pbaFamilies} tier {pbaTier}\n\nDETECTED: Sustained\n\nWHY THIS FIRED: Tier 3 not complied\n\nWHAT THIS MEANS: Catalyst\n\nCORRECT BEHAVIOR: {correctTool}\n\nSELF-CHECK: Understand?\n\nRESET PATH: {correctTool} ({anchor})',
    },
    threshold: 0.5,
    severity: 'HIGH',
    ...overrides,
  };
}

describe('ParagonToolEngine instantiation', () => {
  test('instantiates with empty module', () => {
    const engine = new ParagonToolEngine(makeModule());
    expect(engine).toBeDefined();
    expect(engine.getLayerCount()).toBe(0);
  });
  test('instantiates with a layer', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    expect(engine.getLayerCount()).toBe(1);
  });
  test('registerLayer adds a new layer', () => {
    const engine = new ParagonToolEngine(makeModule());
    engine.registerLayer(makeLayer());
    expect(engine.getLayerCount()).toBe(1);
  });
  test('duplicate layer id throws', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    expect(() => engine.registerLayer(makeLayer())).toThrow();
  });
  test('empty module name throws', () => {
    expect(() => new ParagonToolEngine({ ...makeModule(), name: '' } as unknown as import('../core/types.js').ToolChainModule)).toThrow();
  });
});

describe('escape hatches always pass', () => {
  test('read passes at tier 0', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const result = engine.onToolEvent('sid-esc-1', { type: 'before', toolName: 'read', args: { filePath: 'some-file' } });
    expect(result).toBeNull();
  });
  test('grep passes at tier 0', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const result = engine.onToolEvent('sid-esc-2', { type: 'before', toolName: 'grep', args: { pattern: 'foo' } });
    expect(result).toBeNull();
  });
  test('glob passes at tier 0', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const result = engine.onToolEvent('sid-esc-3', { type: 'before', toolName: 'glob', args: { pattern: '**/*.ts' } });
    expect(result).toBeNull();
  });
  test('demanded tool always passes', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const result = engine.onToolEvent('sid-esc-4', { type: 'before', toolName: 'trident-container-test', args: {} });
    expect(result).toBeNull();
  });
  test('escape hatch passes even when INTERVENING', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const sid = 'sid-esc-5';
    for (let i = 0; i < 10; i++) {
      try {
        engine.onToolEvent(sid, { type: 'started', toolName: 'bash', args: { command: 'node -e "console.log(1)" smoke test instead of the container' } });
        engine.onToolEvent(sid, { type: 'before', toolName: 'bash', args: { command: 'node -e "console.log(1)" smoke test instead of the container' } });
      } catch { void 0; }
    }
    const result = engine.onToolEvent(sid, { type: 'before', toolName: 'read', args: { filePath: 'some-file' } });
    expect(result).toBeNull();
  });
});

describe('bridge standalone mode', () => {
  test('engine works with pbaBridge disabled', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()], pbaBridge: { enabled: false } }));
    const result = engine.onToolEvent('sid-stand-1', { type: 'before', toolName: 'write', args: { filePath: 'some-file' } });
    expect(result).not.toBeNull();
  });
  test('empty PBA context does not throw', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const result = engine.onToolEvent('sid-stand-2', { type: 'before', toolName: 'bash', args: { command: 'node -e "x"' } });
    expect(result).toBeDefined();
  });
  test('bridge ring buffer empty returns defaults', () => {
    const bridge = new PbaBridgeImpl();
    expect(bridge.getRecentSignals('no-such-sid', 5)).toEqual([]);
    expect(bridge.getActiveFamilies('no-such-sid')).toEqual([]);
    expect(bridge.getMacroTier('no-such-sid')).toBe(0);
  });
});

describe('tier-to-surface routing', () => {
  test('dispatchTea appends body to output', () => {
    const out = dispatchTea('correction body', 'tool output');
    expect(out).toBe('tool output\n\ncorrection body');
  });
  test('dispatchTea with empty output', () => {
    const out = dispatchTea('body', '');
    expect(out).toBe('\n\nbody');
  });
  test('blockAtTeb throws StructuredEnforcementError', () => {
    expect(() => blockAtTeb('correction body', 'TEST_LAYER')).toThrow(StructuredEnforcementError);
  });
  test('blockAtTeb error has correct fields', () => {
    try {
      blockAtTeb('my correction', 'MY_LAYER');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(StructuredEnforcementError);
      const err = e as StructuredEnforcementError;
      expect(err.machine).toBe('pta');
      expect(err.evidenceRequired).toBe(true);
      expect(err.tier).toBe(3);
      expect(err.correction).toBe('my correction');
    }
  });
  test('dispatchDirective injects [PTA GATE] prefix', () => {
    const adapter = new MockAdapter();
    dispatchDirective('my directive body', adapter);
    expect(adapter.injectedMessages.length).toBe(1);
    expect(adapter.injectedMessages[0].content).toBe('[PTA GATE] my directive body');
    expect(adapter.injectedMessages[0].type).toBe('chat.message');
  });
  test('dispatchDirective via OpencodeAdapter', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const adapter = new OpencodeAdapter(engine);
    dispatchDirective('directive body', adapter);
    expect(adapter.getInjectedMessages().length).toBe(1);
    expect(adapter.getInjectedMessages()[0].content).toContain('[PTA GATE]');
  });
});

describe('warhead templates', () => {
  test('fillTemplate replaces all 9 fields', () => {
    const tpl = '{count} {toolName} {args} {chainViolations} {pbaFamilies} {pbaTier} {escalationCount} {correctTool} {anchor}';
    const filled = fillTemplate(tpl, {
      count: 5, toolName: 'bash', args: '{"cmd":"x"}', chainViolations: 'rule1', pbaFamilies: 'TEST_EVASION', pbaTier: 2, escalationCount: 3, correctTool: 'trident-container-test', anchor: 'pta:test:1',
    });
    expect(filled).toBe('5 bash {"cmd":"x"} rule1 TEST_EVASION 2 3 trident-container-test pta:test:1');
  });
  test('fillTemplate handles missing fields with defaults', () => {
    const filled = fillTemplate('count={count} tool={toolName}', {});
    expect(filled).toBe('count=1 tool=unknown');
  });
  test('resolveWarhead tier 1 returns filled template', () => {
    const layer = makeLayer();
    const body = resolveWarhead(layer as unknown as import('../core/types.js').WarheadLayer, 1, { toolName: 'bash', count: 2 });
    expect(body).toContain('bash');
    expect(body).toContain('trident-container-test');
  });
  test('resolveWarhead clamps tier to 1-4', () => {
    const layer = makeLayer();
    expect(() => resolveWarhead(layer as unknown as import('../core/types.js').WarheadLayer, 0, {})).not.toThrow();
    expect(() => resolveWarhead(layer as unknown as import('../core/types.js').WarheadLayer, 99, {})).not.toThrow();
  });
  test('resolveWarhead throws on missing tier template', () => {
    const layer = { id: 'BAD', enforcement: { tier1: 'a' } } as unknown as import('../core/types.js').WarheadLayer;
    expect(() => resolveWarhead(layer, 2, {})).toThrow();
  });
  test('validateWarhead reports missing sections', () => {
    const result = validateWarhead('DETECTED foo WHY THIS FIRED bar');
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });
  test('validateWarhead passes when all 6 sections present', () => {
    const body = 'DETECTED x WHY THIS FIRED y WHAT THIS MEANS z CORRECT BEHAVIOR a SELF-CHECK b RESET PATH c';
    const result = validateWarhead(body);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
  test('getRequiredSections returns 6 entries', () => {
    expect(getRequiredSections()).toHaveLength(6);
  });
});

describe('ChainTracker adversarial', () => {
  test('recordCall + wasCalled detects prerequisite', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-chain-1', 'trident-container-test', {});
    expect(tracker.wasCalled('sid-chain-1', 'trident-container-test')).toBe(true);
  });
  test('wasCalled returns false when prerequisite missing', () => {
    const tracker = new ChainTracker();
    expect(tracker.wasCalled('sid-chain-2', 'trident-container-test')).toBe(false);
  });
  test('evaluateRules MISSING_PREREQUISITE when required not called', () => {
    const tracker = new ChainTracker();
    const violations = tracker.evaluateRules('sid-chain-3', 'bash', {}, [
      { name: 'needs-container-test', description: 'needs it', requires: [{ tool: 'trident-container-test' }], violation: { layerId: 'SMOKE_TEST_GUARD' } },
    ]);
    expect(violations.length).toBe(1);
    expect(violations[0].violationType).toBe('MISSING_PREREQUISITE');
  });
  test('evaluateRules no violation when prerequisite satisfied', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-chain-4', 'trident-container-test', {});
    const violations = tracker.evaluateRules('sid-chain-4', 'bash', {}, [
      { name: 'needs-container-test', description: 'needs it', requires: [{ tool: 'trident-container-test' }], violation: { layerId: 'SMOKE_TEST_GUARD' } },
    ]);
    expect(violations.length).toBe(0);
  });
  test('detectLoop true when same tool 3x same output', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-chain-5', 'bash', {});
    tracker.recordResult('sid-chain-5', 'bash', 0, 'same output');
    tracker.recordCall('sid-chain-5', 'bash', {});
    tracker.recordResult('sid-chain-5', 'bash', 0, 'same output');
    tracker.recordCall('sid-chain-5', 'bash', {});
    tracker.recordResult('sid-chain-5', 'bash', 0, 'same output');
    expect(tracker.detectLoop('sid-chain-5')).toBe(true);
  });
  test('detectLoop false when outputs differ', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-chain-6', 'bash', {});
    tracker.recordResult('sid-chain-6', 'bash', 0, 'output A');
    tracker.recordCall('sid-chain-6', 'bash', {});
    tracker.recordResult('sid-chain-6', 'bash', 0, 'output B');
    tracker.recordCall('sid-chain-6', 'bash', {});
    tracker.recordResult('sid-chain-6', 'bash', 0, 'output C');
    expect(tracker.detectLoop('sid-chain-6')).toBe(false);
  });
  test('detectLoop false when less than 3 calls', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-chain-7', 'bash', {});
    tracker.recordCall('sid-chain-7', 'bash', {});
    expect(tracker.detectLoop('sid-chain-7')).toBe(false);
  });
  test('concurrent sessions are isolated', () => {
    const tracker = new ChainTracker();
    tracker.recordCall('sid-A', 'tool-a', {});
    expect(tracker.wasCalled('sid-B', 'tool-a')).toBe(false);
    expect(tracker.wasCalled('sid-A', 'tool-a')).toBe(true);
  });
  test('empty sessionId throws', () => {
    const tracker = new ChainTracker();
    expect(() => tracker.recordCall('', 'bash', {})).toThrow();
  });
  test('history cap at 100', () => {
    const tracker = new ChainTracker();
    for (let i = 0; i < 110; i++) tracker.recordCall('sid-cap', 'tool-' + i, {});
    expect(tracker._getHistoryLength('sid-cap')).toBe(100);
  });
});

describe('PbaBridge adversarial', () => {
  test('ring buffer caps at 20', () => {
    const bridge = new PbaBridgeImpl();
    for (let i = 0; i < 25; i++) {
      bridge.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.5, excerpt: 'excerpt ' + i, seq: i, sessionId: 'sid-ring' });
    }
    expect(bridge.getRecentSignals('sid-ring', 100)).toHaveLength(20);
  });
  test('empty signal family throws', () => {
    const bridge = new PbaBridgeImpl();
    expect(() => bridge.onPbaSignal({ family: '', confidence: 0.5, excerpt: 'x', seq: 0, sessionId: 'sid-1' })).toThrow();
  });
  test('null state throws', () => {
    const bridge = new PbaBridgeImpl();
    expect(() => bridge.onPbaStateChange(null as unknown as import('../core/types.js').PbaStateChange)).toThrow();
  });
  test('correlateEscalation PBA tier 3 bumps PTA to 2', () => {
    expect(correlateEscalation(0, 3)).toBe(2);
    expect(correlateEscalation(1, 3)).toBe(2);
    expect(correlateEscalation(2, 3)).toBe(2);
    expect(correlateEscalation(3, 3)).toBe(3);
  });
  test('correlateEscalation PBA tier 0 does not bump', () => {
    expect(correlateEscalation(0, 0)).toBe(0);
    expect(correlateEscalation(1, 0)).toBe(1);
  });
  test('correlateEscalation non-finite throws', () => {
    expect(() => correlateEscalation(NaN, 0)).toThrow();
    expect(() => correlateEscalation(0, Infinity)).toThrow();
  });
  test('getLayersToPrearm returns matching layers', () => {
    const bridge = new PbaBridgeImpl();
    bridge.registerLayer({ layerId: 'SMOKE_TEST_GUARD', pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 } });
    expect(bridge.getLayersToPrearm('TEST_EVASION')).toHaveLength(1);
    expect(bridge.getLayersToPrearm('OTHER_FAMILY')).toHaveLength(0);
  });
  test('getRecentSignals with limit 0 returns empty', () => {
    const bridge = new PbaBridgeImpl();
    bridge.onPbaSignal({ family: 'TEST_EVASION', confidence: 0.5, excerpt: 'x', seq: 0, sessionId: 'sid-limit-0' });
    expect(bridge.getRecentSignals('sid-limit-0', 0)).toEqual([]);
  });
});

describe('State machine adversarial', () => {
  test('IDLE + FIRST_TOOL_SIGNAL -> MONITORING', () => {
    const rec = createInitialRecord();
    const next = step(rec, 'FIRST_TOOL_SIGNAL');
    expect(next.state).toBe('MONITORING');
  });
  test('TOOL_SIGNAL in INTERVENING stays INTERVENING (rearm)', () => {
    const rec = createInitialRecord({ state: 'INTERVENING', tier: 2 });
    const next = step(rec, 'TOOL_SIGNAL');
    expect(next.state).toBe('INTERVENING');
  });
  test('COMPLIANCE_VERIFIED resets tier to 0', () => {
    const rec = createInitialRecord({ state: 'INTERVENING', tier: 3, escalationCount: 1 });
    const next = step(rec, 'COMPLIANCE_VERIFIED', { isGenuine: true });
    expect(next.tier).toBe(0);
    expect(next.state).toBe('MONITORING');
  });
  test('COMPLIANCE_FAILED escalates tier', () => {
    const rec = createInitialRecord({ state: 'INTERVENING', tier: 1, escalationCount: 0, complianceDeadlineSeq: 0, seq: 10 });
    const next = step(rec, 'COMPLIANCE_FAILED');
    expect(next.tier).toBe(2);
  });
  test('tier never exceeds 4', () => {
    const rec = createInitialRecord({ state: 'INTERVENING', tier: 4, escalationCount: 3, complianceDeadlineSeq: 0, seq: 10 });
    const next = step(rec, 'COMPLIANCE_FAILED');
    expect(next.tier).toBe(4);
  });
});

describe('Synapse adversarial', () => {
  test('accumulation and fire', () => {
    const syn = new V2Synapse({ fire: { 'FAM': 0.5 }, decayAlpha: 0.05, refractorySeq: 25 });
    syn.accumulate({ familyId: 'FAM', weight: 1.0 }, 0);
    expect(syn.getNeuron('FAM').canFire()).toBe(true);
  });
  test('refractory prevents immediate re-fire', () => {
    const syn = new V2Synapse({ fire: { 'FAM': 0.5 }, decayAlpha: 0.05, refractorySeq: 25 });
    syn.accumulate({ familyId: 'FAM', weight: 1.0 }, 0);
    syn.getNeuron('FAM').fire();
    expect(syn.getNeuron('FAM').canFire()).toBe(false);
  });
  test('boostBaseline increases lambda', () => {
    const syn = new V2Synapse({ fire: { 'FAM': 1.0 }, decayAlpha: 0.05, refractorySeq: 25 });
    syn.getNeuron('FAM').boostBaseline(0.5);
    expect(syn.getNeuron('FAM').value()).toBe(0.5);
  });
  test('canAnyFire false when no signals', () => {
    const syn = new V2Synapse({ fire: { 'FAM': 0.9 }, decayAlpha: 0.05, refractorySeq: 25 });
    expect(syn.canAnyFire()).toBe(false);
  });
});

describe('Config loader adversarial', () => {
  test('loadLayer compiles valid _template.json', () => {
    const tplPath = path.join(import.meta.dir, '../layers/_template.json');
    if (!fs.existsSync(tplPath)) return;
    const layer = loadLayer(tplPath);
    expect(layer.id).toBe('EXAMPLE_LAYER');
    expect(layer.banks.descriptive.length).toBeGreaterThan(0);
  });
  test('loadLayer throws on missing file', () => {
    expect(() => loadLayer('/tmp/no-such-file-xyz-pta-9999.json')).toThrow();
  });
  test('loadLayer throws on malformed JSON', () => {
    const tmp = path.join(os.tmpdir(), 'bad-json-' + Date.now() + '.json');
    fs.writeFileSync(tmp, '{ not valid json', 'utf8');
    expect(() => loadLayer(tmp)).toThrow();
    try { fs.unlinkSync(tmp); } catch {}
  });
  test('loadLayer throws on missing required field', () => {
    const tmp = path.join(os.tmpdir(), 'missing-field-' + Date.now() + '.json');
    fs.writeFileSync(tmp, JSON.stringify({ id: 'X' }), 'utf8');
    expect(() => loadLayer(tmp)).toThrow();
    try { fs.unlinkSync(tmp); } catch {}
  });
  test('registerLayer + createRegistry', () => {
    const registry = createRegistry();
    const tplPath = path.join(import.meta.dir, '../layers/_template.json');
    if (!fs.existsSync(tplPath)) return;
    const layer = loadLayer(tplPath);
    registerLayer(registry, layer);
    expect(registry.layers.has(layer.id)).toBe(true);
  });
  test('duplicate layer id throws', () => {
    const registry = createRegistry();
    const tplPath = path.join(import.meta.dir, '../layers/_template.json');
    if (!fs.existsSync(tplPath)) return;
    const layer = loadLayer(tplPath);
    registerLayer(registry, layer);
    expect(() => registerLayer(registry, layer)).toThrow();
  });
});

describe('ToolEventRouter', () => {
  test('routes started event', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const router = new ToolEventRouter(engine);
    const result = router.route({ type: 'started', toolName: 'bash', args: {}, sessionId: 'sid-router-1' });
    expect(result).toBeNull();
  });
  test('routes before event returns intent', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const router = new ToolEventRouter(engine);
    const result = router.route({ type: 'before', toolName: 'write', args: { filePath: 'some-file' }, sessionId: 'sid-router-2' });
    expect(result).toBeDefined();
  });
  test('unknown event type throws', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const router = new ToolEventRouter(engine);
    expect(() => router.route({ type: 'unknown' as unknown as 'before', toolName: 'bash', args: {}, sessionId: 'sid-router-3' })).toThrow();
  });
  test('onBefore delegates to engine', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const router = new ToolEventRouter(engine);
    const result = router.onBefore('sid-router-4', 'read', { filePath: 'some-file' });
    expect(result).toBeNull();
  });
});

describe('hooks platform adapters', () => {
  test('MockAdapter inject + intercept + observe', () => {
    const adapter = new MockAdapter();
    adapter.inject({ type: 'chat.message', content: 'hello' });
    expect(adapter.injectedMessages.length).toBe(1);
    adapter.interceptTool('bash', {}, 'sid-mock-1');
    expect(adapter.interceptedTools.length).toBe(1);
    adapter.observeTool('bash', {}, { output: 'hi' }, 'sid-mock-1');
    expect(adapter.observedTools.length).toBe(1);
    adapter.clear();
    expect(adapter.injectedMessages.length).toBe(0);
  });
  test('OpencodeAdapter normalizes events', () => {
    const engine = new ParagonToolEngine(makeModule());
    const adapter = new OpencodeAdapter(engine);
    expect(adapter.normalizeEvent({ type: 'tool.started' })).toBeDefined();
    expect(adapter.normalizeEvent(null)).toBeNull();
    expect(adapter.normalizeEvent({})).toBeNull();
  });
  test('OpencodeAdapter interceptTool delegates to engine', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    const adapter = new OpencodeAdapter(engine);
    const result = adapter.interceptTool('write', { filePath: 'some-file' }, 'sid-opencode-1');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

describe('concurrent + boundary', () => {
  test('concurrent sessions are isolated', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    engine.onToolEvent('sid-conc-A', { type: 'before', toolName: 'bash', args: { command: 'node -e "x" smoke test instead of the container' } });
    const recA = engine.getRecord('sid-conc-A');
    const recB = engine.getRecord('sid-conc-B');
    expect(recA.state).toBe('MONITORING');
    expect(recB.state).toBe('IDLE');
  });
  test('empty args does not throw', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    expect(() => engine.onToolEvent('sid-empty-1', { type: 'before', toolName: 'bash', args: {} })).not.toThrow();
  });
  test('null sessionId throws', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    expect(() => engine.onToolEvent(null as unknown as string, { type: 'before', toolName: 'bash', args: {} })).toThrow();
  });
  test('session cap evicts oldest', () => {
    const engine = new ParagonToolEngine(makeModule());
    for (let i = 0; i < 260; i++) {
      engine.onToolEvent('sid-cap-' + i, { type: 'before', toolName: 'read', args: {} });
    }
    expect(engine.getSessionCount()).toBeLessThanOrEqual(256);
  });
  test('engine handles many sequential tool events', () => {
    const engine = new ParagonToolEngine(makeModule({ layers: [makeLayer()] }));
    for (let i = 0; i < 20; i++) {
      engine.onToolEvent('sid-stress', { type: 'started', toolName: 'bash', args: { command: 'cmd-' + i } });
      engine.onToolEvent('sid-stress', { type: 'completed', toolName: 'bash', args: { command: 'cmd-' + i }, exitCode: 0, output: 'output ' + i + ' with enough content to be considered genuine artifact here for testing' });
    }
    expect(engine.getRecord('sid-stress')).toBeDefined();
  });
});
