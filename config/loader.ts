import * as fs from 'node:fs';
import type { LayerJson, CompiledLayer, LayerRegistry } from '../core/types.js';
import { LoaderValidationFailedError } from '../core/types.js';

export type { LayerJson, CompiledLayer, LayerRegistry } from '../core/types.js';
export { LoaderValidationFailedError } from '../core/types.js';

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegexSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*') out += '.*';
    else out += escapeRegex(glob[i]);
  }
  return out;
}

export function compileGlob(pattern: string, anchored: boolean): RegExp {
  if (!pattern || typeof pattern !== 'string') throw new Error('compileGlob: pattern is required');
  const source = globToRegexSource(pattern);
  if (anchored) return new RegExp('^' + source + '$', 'i');
  return new RegExp(source, 'i');
}

export function compileBankPatterns(patterns: string[]): RegExp[] {
  if (!Array.isArray(patterns)) throw new Error('compileBankPatterns: patterns must be array');
  return patterns.map((p) => compileGlob(p, false));
}

export function compileArgPatterns(argPatterns: Record<string, string[]>): Record<string, RegExp[]> {
  if (!argPatterns || typeof argPatterns !== 'object') throw new Error('compileArgPatterns: argPatterns is required');
  const compiled: Record<string, RegExp[]> = {};
  for (const [key, patterns] of Object.entries(argPatterns)) {
    if (!Array.isArray(patterns)) throw new Error(`compileArgPatterns: patterns for '${key}' must be array`);
    compiled[key] = patterns.map((p) => compileGlob(p, true));
  }
  return compiled;
}

function validateLayerJson(raw: Record<string, unknown>): void {
  if (!raw || typeof raw !== 'object') throw new LoaderValidationFailedError('id');
  if (!raw.id || typeof raw.id !== 'string' || raw.id.trim() === '') throw new LoaderValidationFailedError('id');
  if (!Array.isArray(raw.toolMatchers) || raw.toolMatchers.length === 0) throw new LoaderValidationFailedError('toolMatchers');
  if (!raw.banks || typeof raw.banks !== 'object') throw new LoaderValidationFailedError('banks');
  const banks = raw.banks as Record<string, unknown>;
  if (!Array.isArray(banks.descriptive)) throw new LoaderValidationFailedError('banks.descriptive');
  if (!Array.isArray(banks.suggestive)) throw new LoaderValidationFailedError('banks.suggestive');
  if (!Array.isArray(banks.substitute)) throw new LoaderValidationFailedError('banks.substitute');
  if (!Array.isArray(banks.use)) throw new LoaderValidationFailedError('banks.use');
  if (!raw.enforcement || typeof raw.enforcement !== 'object') throw new LoaderValidationFailedError('enforcement');
  const enf = raw.enforcement as Record<string, unknown>;
  if (!enf.tier1 || typeof enf.tier1 !== 'string') throw new LoaderValidationFailedError('enforcement.tier1');
  if (!enf.tier2 || typeof enf.tier2 !== 'string') throw new LoaderValidationFailedError('enforcement.tier2');
  if (!enf.tier3 || typeof enf.tier3 !== 'string') throw new LoaderValidationFailedError('enforcement.tier3');
  if (!enf.tier4 || typeof enf.tier4 !== 'string') throw new LoaderValidationFailedError('enforcement.tier4');
  if (typeof raw.threshold !== 'number' || !Number.isFinite(raw.threshold)) throw new LoaderValidationFailedError('threshold');
}

export function loadLayer(jsonPath: string): CompiledLayer {
  if (!jsonPath || typeof jsonPath !== 'string') throw new LoaderValidationFailedError('jsonPath');
  let raw: Record<string, unknown>;
  try {
    const text = fs.readFileSync(jsonPath, 'utf8');
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof LoaderValidationFailedError) throw e;
    if (e instanceof SyntaxError) throw new Error(`LOADER_VALIDATION_FAILED: malformed JSON at ${jsonPath}: ${e.message}`);
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`LOADER_VALIDATION_FAILED: file not found: ${jsonPath}`);
    }
    throw e;
  }

  try {
    validateLayerJson(raw);
  } catch (e) {
    if (e instanceof LoaderValidationFailedError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[LayerLoader] validate failed: ${msg}`);
    throw e;
  }

  try {
    const r = raw as unknown as LayerJson;
    const compiled: CompiledLayer = {
      id: r.id,
      description: r.description ?? '',
      toolMatchers: r.toolMatchers.map((m) => ({
        toolName: m.toolName,
        argPatterns: m.argPatterns ? compileArgPatterns(m.argPatterns) : undefined,
      })),
      banks: {
        descriptive: compileBankPatterns(r.banks.descriptive),
        suggestive: compileBankPatterns(r.banks.suggestive),
        substitute: compileBankPatterns(r.banks.substitute),
        use: compileBankPatterns(r.banks.use),
      },
      pbaContextBoost: r.pbaContextBoost,
      enforcement: r.enforcement,
      threshold: r.threshold,
      severity: r.severity ?? 'MEDIUM',
      chainRules: (r.chainRules ?? []).map((cr) => ({
        name: cr.name,
        description: cr.description ?? '',
        requires: cr.requires,
        forbids: cr.forbids,
        violation: cr.violation,
      })),
    };
    return compiled;
  } catch (e) {
    if (e instanceof LoaderValidationFailedError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[LayerLoader] compile failed: ${msg}`);
    throw e;
  }
}

export function registerLayer(registry: LayerRegistry, layer: CompiledLayer): void {
  if (!registry || typeof registry !== 'object') throw new Error('registerLayer: registry is required');
  if (!layer || typeof layer !== 'object' || !layer.id) throw new Error('registerLayer: layer is required');
  if (registry.layers.has(layer.id)) {
    throw new Error(`LOADER_VALIDATION_FAILED: duplicate layer id '${layer.id}'`);
  }
  try {
    registry.layers.set(layer.id, layer);
    if (layer.chainRules && layer.chainRules.length > 0) {
      for (const cr of layer.chainRules) {
        registry.chainRules.push({ ...cr, layerId: layer.id });
      }
    }
    if (layer.pbaContextBoost) {
      registry.pbaBoosts.push({
        layerId: layer.id,
        families: layer.pbaContextBoost.families,
        boostAmount: layer.pbaContextBoost.boostAmount,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[LayerLoader] registerLayer failed: ${msg}`);
    throw e;
  }
}

export function createRegistry(): LayerRegistry {
  return { layers: new Map(), chainRules: [], pbaBoosts: [] };
}
