import type { FourBankFamily, ScoreResult, ConfidenceBand, WeightedViolation } from './types.js';

function hasWordBoundary(pattern: RegExp): boolean {
  return pattern.source.includes('\\b');
}

function safeMatch(text: string, pattern: RegExp): string | null {
  try {
    const m = text.match(pattern);
    if (m && m[0]) return m[0];
    return m ? m[0] : null;
  } catch (err) {
    throw new Error(`pattern match failed for ${pattern.source}: ${String((err as Error).message)}`);
  }
}

export function scoreSignals(text: string, family: FourBankFamily): ScoreResult {
  if (family === null || family === undefined) {
    throw new TypeError('family is required');
  }
  if (!Array.isArray(family.descriptive) || !Array.isArray(family.suggestive) || !Array.isArray(family.substitute) || !Array.isArray(family.use)) {
    throw new TypeError('family must have descriptive/suggestive/substitute/use arrays');
  }
  const input = text === null || text === undefined ? '' : String(text);
  let pos = 0;
  let neg = 0;
  let evidence = '';

  for (const pattern of family.descriptive) {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError(`descriptive pattern must be RegExp, got ${typeof pattern}`);
    }
    const hit = safeMatch(input, pattern);
    if (hit !== null) {
      neg += 1;
      if (!evidence) evidence = hit;
    }
  }

  for (const pattern of family.use) {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError(`use pattern must be RegExp, got ${typeof pattern}`);
    }
    const hit = safeMatch(input, pattern);
    if (hit !== null) {
      neg += 3;
      if (!evidence) evidence = hit;
      return { pos: 0, neg, evidence };
    }
  }

  for (const pattern of family.suggestive) {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError(`suggestive pattern must be RegExp, got ${typeof pattern}`);
    }
    const hit = safeMatch(input, pattern);
    if (hit !== null) {
      pos += hasWordBoundary(pattern) ? 2 : 1;
      if (!evidence) evidence = hit;
    }
  }

  for (const pattern of family.substitute) {
    if (!(pattern instanceof RegExp)) {
      throw new TypeError(`substitute pattern must be RegExp, got ${typeof pattern}`);
    }
    const hit = safeMatch(input, pattern);
    if (hit !== null) {
      pos += 2;
      if (!evidence) evidence = hit;
    }
  }

  return { pos, neg, evidence };
}

export function confidence(pos: number, neg: number): number {
  if (!Number.isFinite(pos) || !Number.isFinite(neg)) {
    throw new TypeError('pos and neg must be finite numbers');
  }
  if (pos < 0 || neg < 0) {
    throw new RangeError('pos and neg must be >= 0');
  }
  return pos / (pos + neg + 1);
}

export function classifyBand(conf: number): ConfidenceBand {
  if (!Number.isFinite(conf)) {
    throw new TypeError('conf must be finite number');
  }
  if (conf < 0 || conf > 1) {
    throw new RangeError('conf must be between 0 and 1');
  }
  if (conf >= 0.5) return 'ENFORCE';
  if (conf >= 0.3) return 'DAMPEN';
  return 'SUPPRESS';
}

export function batchScan(text: string, allFamilies: FourBankFamily[]): WeightedViolation | null {
  if (text === null || text === undefined) {
    throw new TypeError('text is required');
  }
  if (!Array.isArray(allFamilies)) {
    throw new TypeError('allFamilies must be array');
  }
  const input = String(text);
  for (let i = 0; i < allFamilies.length; i++) {
    const family = allFamilies[i]!;
    const { pos, neg, evidence } = scoreSignals(input, family);
    const conf = confidence(pos, neg);
    if (pos > 0 && conf >= 0.5 && pos > neg) {
      const weight = conf * 2;
      return {
        familyId: family.id ?? i,
        pos,
        neg,
        confidence: conf,
        weight,
        evidence,
      };
    }
  }
  return null;
}
