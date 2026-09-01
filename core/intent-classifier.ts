import type { ToolIntent, LayerShape, PbaSignal } from './types.js';

function hasWordBoundary(pattern: RegExp): boolean {
  return pattern.source.includes('\\b');
}

function scoreSignalsLocal(text: string, banks: LayerShape['banks']): { pos: number; neg: number; evidence: string } {
  let pos = 0;
  let neg = 0;
  let evidence = '';

  for (const p of banks.descriptive) {
    if (!(p instanceof RegExp)) throw new TypeError('descriptive must be RegExp');
    const m = text.match(p);
    if (m) {
      neg += 1;
      if (!evidence) evidence = m[0];
    }
  }

  for (const p of banks.use) {
    if (!(p instanceof RegExp)) throw new TypeError('use must be RegExp');
    const m = text.match(p);
    if (m) {
      neg += 3;
      if (!evidence) evidence = m[0];
      return { pos: 0, neg, evidence };
    }
  }

  for (const p of banks.suggestive) {
    if (!(p instanceof RegExp)) throw new TypeError('suggestive must be RegExp');
    const m = text.match(p);
    if (m) {
      pos += hasWordBoundary(p) ? 2 : 1;
      if (!evidence) evidence = m[0];
    }
  }

  for (const p of banks.substitute) {
    if (!(p instanceof RegExp)) throw new TypeError('substitute must be RegExp');
    const m = text.match(p);
    if (m) {
      pos += 2;
      if (!evidence) evidence = m[0];
    }
  }

  return { pos, neg, evidence };
}

function confidenceFn(pos: number, neg: number): number {
  return pos / (pos + neg + 1);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesToolMatcher(toolName: string, args: Record<string, unknown>, matcher: LayerShape['toolMatchers'][number]): boolean {
  let nameMatches = false;
  if (typeof matcher.toolName === 'string') {
    if (matcher.toolName.includes('*') || matcher.toolName.includes('?')) {
      nameMatches = globToRegExp(matcher.toolName).test(toolName);
    } else {
      nameMatches = matcher.toolName === toolName;
    }
  } else if (matcher.toolName instanceof RegExp) {
    nameMatches = matcher.toolName.test(toolName);
  }
  if (!nameMatches) return false;

  if (!matcher.argPatterns) return true;

  for (const [argName, patterns] of Object.entries(matcher.argPatterns)) {
    const val = args[argName];
    if (val === undefined || val === null) return false;
    const str = String(val);
    let anyMatch = false;
    for (const pat of patterns) {
      if (typeof pat === 'string') {
        if (pat.includes('*') || pat.includes('?')) {
          if (globToRegExp(pat).test(str)) anyMatch = true;
        } else {
          if (str.includes(pat)) anyMatch = true;
        }
      } else if (pat instanceof RegExp) {
        if (pat.test(str)) anyMatch = true;
      }
    }
    if (!anyMatch) return false;
  }
  return true;
}

function layerMatchesTool(layer: LayerShape, toolName: string, args: Record<string, unknown>): boolean {
  if (!layer.toolMatchers || layer.toolMatchers.length === 0) return true;
  return layer.toolMatchers.some((m) => matchesToolMatcher(toolName, args, m));
}

export function classifyIntent(
  toolCall: { toolName: string; args: Record<string, unknown> },
  chainContext: { previousTools: string[]; chainViolations: string[] },
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number },
  layers: LayerShape[],
): ToolIntent {
  if (!toolCall || typeof toolCall !== 'object') throw new TypeError('toolCall required');
  if (typeof toolCall.toolName !== 'string' || toolCall.toolName.length === 0) throw new TypeError('toolCall.toolName required');
  if (!toolCall.args || typeof toolCall.args !== 'object') throw new TypeError('toolCall.args required');
  if (!chainContext || typeof chainContext !== 'object') throw new TypeError('chainContext required');
  if (!Array.isArray(chainContext.previousTools)) throw new TypeError('chainContext.previousTools must be array');
  if (!Array.isArray(chainContext.chainViolations)) throw new TypeError('chainContext.chainViolations must be array');
  if (!pbaContext || typeof pbaContext !== 'object') throw new TypeError('pbaContext required');
  if (!Array.isArray(pbaContext.activeFamilies)) throw new TypeError('pbaContext.activeFamilies must be array');
  if (!Array.isArray(pbaContext.latestSignals)) throw new TypeError('pbaContext.latestSignals must be array');
  if (!Number.isFinite(pbaContext.macroTier)) throw new TypeError('pbaContext.macroTier must be finite');
  if (!Array.isArray(layers)) throw new TypeError('layers must be array');

  const pbaExcerpts = pbaContext.latestSignals.map((s) => s.excerpt).join(' ');
  const textBlob = `${toolCall.toolName} ${JSON.stringify(toolCall.args)} ${pbaExcerpts}`;

  const chainConfidence = chainContext.chainViolations.length > 0 ? 0.8 : 0.0;

  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') throw new TypeError('layer must be object');
    if (typeof layer.id !== 'string') throw new TypeError('layer.id must be string');
    if (!Number.isFinite(layer.threshold)) throw new TypeError('layer.threshold must be finite');
    if (!layer.banks) throw new TypeError('layer.banks required');

    if (!layerMatchesTool(layer, toolCall.toolName, toolCall.args)) continue;

    let source1Conf = 0;
    let matchedPattern: string | null = null;
    try {
      const { pos, neg, evidence } = scoreSignalsLocal(textBlob, layer.banks);
      source1Conf = confidenceFn(pos, neg);
      matchedPattern = evidence || null;
    } catch (err) {
      throw new Error(`ratio scoring failed for layer ${layer.id}: ${String((err as Error).message)}`);
    }

    let source3 = 0;
    if (layer.pbaContextBoost) {
      for (const fam of layer.pbaContextBoost.families) {
        if (pbaContext.activeFamilies.includes(fam)) {
          source3 += layer.pbaContextBoost.boostAmount;
        }
      }
      if (source3 > 1.0) source3 = 1.0;
    }

    const totalConfidence = source1Conf * 0.5 + chainConfidence * 0.3 + source3 * 0.2;

    const sources = {
      toolMatch: { toolName: toolCall.toolName, matchedPattern, confidence: source1Conf },
      chainContext: { previousTools: [...chainContext.previousTools], chainViolations: [...chainContext.chainViolations], confidence: chainConfidence },
      pbaContext: { activeFamilies: [...pbaContext.activeFamilies], latestSignals: [...pbaContext.latestSignals], macroTier: pbaContext.macroTier, confidence: source3 },
    };

    if (totalConfidence >= layer.threshold) {
      return { action: 'BLOCK', layerId: layer.id, confidence: totalConfidence, tier: 3, sources };
    }
    if (totalConfidence >= layer.threshold * 0.6) {
      return { action: 'ADVISE', layerId: layer.id, confidence: totalConfidence, tier: 2, sources };
    }
  }

  return {
    action: 'ALLOW',
    layerId: null,
    confidence: 0,
    tier: 0,
    sources: {
      toolMatch: { toolName: toolCall.toolName, matchedPattern: null, confidence: 0 },
      chainContext: { previousTools: [...chainContext.previousTools], chainViolations: [...chainContext.chainViolations], confidence: chainConfidence },
      pbaContext: { activeFamilies: [...pbaContext.activeFamilies], latestSignals: [...pbaContext.latestSignals], macroTier: pbaContext.macroTier, confidence: 0 },
    },
  };
}
