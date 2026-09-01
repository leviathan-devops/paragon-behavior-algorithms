import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadLayer, registerLayer, createRegistry, compileGlob } from './index.ts';

function tmpFile(obj: unknown): string {
  const f = path.join(os.tmpdir(), `layer-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(obj), 'utf8');
  return f;
}

const SMOKE_FIXTURE = {
  id: 'SMOKE_TEST_GUARD',
  description: 'Block smoke tests',
  toolMatchers: [{ toolName: 'bash', argPatterns: { command: ['node -e*', 'bun -e*', 'python3 -c*'] } }],
  banks: {
    descriptive: ['for the container test', 'as pre-flight check'],
    suggestive: ['just quickly check', 'smoke test'],
    substitute: ['instead of the container', 'skip the full test'],
    use: ['per the tool result', 'trident-container-test'],
  },
  pbaContextBoost: { families: ['TEST_EVASION'], boostAmount: 0.2 },
  enforcement: { tier1: 't1 {count}', tier2: 't2 {count}', tier3: 't3 {count}', tier4: '[PTA GATE] t4 {count}' },
  threshold: 0.9,
  severity: 'HIGH',
  chainRules: [{ name: 'verification-requires-container-test', description: 'requires container', requires: [{ tool: 'trident-container-test' }], violation: { layerId: 'SMOKE_TEST_GUARD' } }],
};

describe('ms-layer-loader', () => {
  test('canonical SMOKE_TEST_GUARD fixture loads and compiles', () => {
    const f = tmpFile(SMOKE_FIXTURE);
    try {
      const layer = loadLayer(f);
      expect(layer.id).toBe('SMOKE_TEST_GUARD');
      expect(layer.banks.suggestive.length).toBe(2);
      expect(layer.banks.suggestive[0] instanceof RegExp).toBe(true);
      expect(layer.banks.use[0] instanceof RegExp).toBe(true);
      expect(layer.toolMatchers[0].argPatterns!.command[0] instanceof RegExp).toBe(true);
      // argPatterns anchored
      expect(layer.toolMatchers[0].argPatterns!.command[0].source.startsWith('^')).toBe(true);
      // banks unanchored
      expect(layer.banks.suggestive[0].source.startsWith('^')).toBe(false);
    } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('glob pin node -e* matches and non-match', () => {
    const f = tmpFile(SMOKE_FIXTURE);
    try {
      const layer = loadLayer(f);
      const re = layer.toolMatchers[0].argPatterns!.command[0];
      expect(re.test('node -e console.log(1)')).toBe(true);
      expect(re.test('node -x something')).toBe(false);
    } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('substring bank pattern case-insensitive', () => {
    const f = tmpFile(SMOKE_FIXTURE);
    try {
      const layer = loadLayer(f);
      const re = layer.banks.suggestive[0];
      expect(re.test('JUST QUICKLY CHECK')).toBe(true);
      expect(re.flags.includes('i')).toBe(true);
    } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('missing id throws LOADER_VALIDATION_FAILED', () => {
    const f = tmpFile({ ...SMOKE_FIXTURE, id: undefined });
    try { expect(() => loadLayer(f)).toThrow('LOADER_VALIDATION_FAILED'); } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('missing banks throws', () => {
    const bad = { ...SMOKE_FIXTURE, banks: undefined };
    const f = tmpFile(bad);
    try { expect(() => loadLayer(f)).toThrow('LOADER_VALIDATION_FAILED'); } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('missing enforcement.tier3 throws', () => {
    const bad = { ...SMOKE_FIXTURE, enforcement: { tier1: 'a', tier2: 'b', tier4: 'd' } };
    const f = tmpFile(bad);
    try { expect(() => loadLayer(f)).toThrow('LOADER_VALIDATION_FAILED'); } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('malformed JSON throws', () => {
    const fp = path.join(os.tmpdir(), `bad-${Date.now()}.json`);
    fs.writeFileSync(fp, '{ not json [', 'utf8');
    try { expect(() => loadLayer(fp)).toThrow(); } finally { try { fs.unlinkSync(fp); } catch {} }
  });

  test('registerLayer populates registry layers + chainRules + pbaBoosts', () => {
    const f = tmpFile(SMOKE_FIXTURE);
    try {
      const layer = loadLayer(f);
      const reg = createRegistry();
      registerLayer(reg, layer);
      expect(reg.layers.has('SMOKE_TEST_GUARD')).toBe(true);
      expect(reg.chainRules.length).toBe(1);
      expect(reg.pbaBoosts.length).toBe(1);
      expect(reg.pbaBoosts[0].families).toEqual(['TEST_EVASION']);
    } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('duplicate id registration rejected loudly', () => {
    const f = tmpFile(SMOKE_FIXTURE);
    try {
      const layer = loadLayer(f);
      const reg = createRegistry();
      registerLayer(reg, layer);
      expect(() => registerLayer(reg, layer)).toThrow('duplicate');
    } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('compileGlob anchored vs unanchored', () => {
    const anchored = compileGlob('node -e*', true);
    expect(anchored.source.startsWith('^')).toBe(true);
    expect(anchored.source.endsWith('$')).toBe(true);
    const unanchored = compileGlob('smoke test', false);
    expect(unanchored.source.startsWith('^')).toBe(false);
  });

  test('missing threshold throws', () => {
    const bad = { ...SMOKE_FIXTURE, threshold: undefined };
    const f = tmpFile(bad);
    try { expect(() => loadLayer(f)).toThrow('LOADER_VALIDATION_FAILED'); } finally { try { fs.unlinkSync(f); } catch {} }
  });

  test('missing toolMatchers throws', () => {
    const bad = { ...SMOKE_FIXTURE, toolMatchers: undefined };
    const f = tmpFile(bad);
    try { expect(() => loadLayer(f)).toThrow('LOADER_VALIDATION_FAILED'); } finally { try { fs.unlinkSync(f); } catch {} }
  });
});
