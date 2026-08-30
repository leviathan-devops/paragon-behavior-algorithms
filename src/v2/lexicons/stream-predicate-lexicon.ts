// src/v2/lexicons/stream-predicate-lexicon.ts — THE STREAMING BATCH SCANNER (v2 W3 Wave0 repaired)
import type { Order2Matcher, PatternFamilyMember, FramePatternMarker, PatternGroup, ClassifierInput, ClassifierResult } from '../../lasme/contracts.js';
import { BareRegexRejectedError, DuplicateMemberError, MissingExampleHitsError } from '../../lasme/contracts.js';
import type { StreamSignal, V2Plane } from '../../v2/contracts.js';
import { boundedSlice } from '../../lasme/predicate-lexicon.js';
import { maskAll } from './masking.js';

export type { PatternGroup, ClassifierInput, ClassifierResult };
export interface StreamScanBatch { readonly cumulative: string; readonly delta: string; }
export interface StreamAnchor { readonly seq: number; readonly ts: number; readonly sessionID: string; }
const REASONING_PLANE: V2Plane = 'reasoning';
const EXCERPT_CAP = 200;
const WINDOW_RADIUS = 240;
export class StreamPredicateLexicon {
  private readonly members = new Map<string, PatternFamilyMember>();
  register(member: PatternFamilyMember): void {
    if (this.members.has(member.id)) throw new DuplicateMemberError(member.id);
    if ((member.matcher as unknown) instanceof RegExp) throw new BareRegexRejectedError(member.id);
    const hasPos = member.exampleHits.some((h) => h.shouldFlag === true);
    const hasNeg = member.exampleHits.some((h) => h.shouldFlag === false);
    if (!hasPos || !hasNeg) throw new MissingExampleHitsError(member.id);
    const m = member.matcher as Order2Matcher;
    if (m.kind === 'frame-pattern') {
      const fp = m as unknown as { markers: readonly FramePatternMarker[]; negative: readonly string[] };
      if (!fp.markers || fp.markers.length === 0) throw new MissingExampleHitsError(member.id);
      for (const marker of fp.markers) {
        if (!(marker.re instanceof RegExp)) throw new BareRegexRejectedError(member.id + '.marker-not-regexp');
        if (typeof marker.weight !== 'number' || !Number.isFinite(marker.weight) || marker.weight <= 0) throw new MissingExampleHitsError(member.id + '.marker-weight');
      }
      if (member.triggerCondition === null || member.triggerCondition === undefined) throw new MissingExampleHitsError(member.id + '.frame-pattern-needs-trigger');
      if (!member.exampleHits || member.exampleHits.length < 2) throw new MissingExampleHitsError(member.id);
    }
    this.members.set(member.id, member);
  }
  get(id: string): PatternFamilyMember | undefined { return this.members.get(id); }
  all(): readonly PatternFamilyMember[] { return [...this.members.values()]; }
  scan(batch: StreamScanBatch, anchor: StreamAnchor): StreamSignal[] {
    const masked = maskAll(batch.cumulative);
    const signals: StreamSignal[] = [];
    for (const member of this.members.values()) {
      const res = evaluateMember(member.matcher as Order2Matcher, masked, member.triggerCondition);
      if (res.matched && res.matchPos !== null) {
        const excerpt = excerptAround(batch.cumulative, res.matchPos, EXCERPT_CAP);
        signals.push({ memberId: member.id, plane: REASONING_PLANE, excerpt, anchor, weight: res.weight });
      }
    }
    return signals;
  }
}
interface EvalResult { matched: boolean; matchPos: number | null; weight: number; }
function parseThreshold(cond: unknown): number {
  if (cond === null || cond === undefined) return 0.5;
  if (typeof cond === 'number' && Number.isFinite(cond)) return cond;
  if (typeof cond === 'string') { const n = parseFloat(cond); return Number.isFinite(n) ? n : 0.5; }
  if (typeof cond === 'object') {
    const o = cond as Record<string, unknown>;
    if (typeof o['value'] === 'number' && Number.isFinite(o['value'] as number)) return o['value'] as number;
    if (typeof o['value'] === 'string') { const n = parseFloat(o['value'] as string); if (Number.isFinite(n)) return n; }
    if (typeof o['kind'] === 'string' && Array.isArray(o['args'])) {
      try { const v = (o as unknown as { value?: unknown }).value; if (typeof v === 'number') return v; if (typeof v === 'string') { const n = parseFloat(v); if (Number.isFinite(n)) return n; } } catch (e) { void e; }
    }
  }
  return 0.5;
}
function evaluateMember(matcher: Order2Matcher, text: string, triggerCondition: unknown): EvalResult {
  if (matcher.kind === 'frame-pattern') {
    const fp = matcher as unknown as { markers: readonly FramePatternMarker[]; negative: readonly string[] };
    const markers = fp.markers;
    const negatives = fp.negative ?? [];
    let totalWeight = 0;
    let matchedWeight = 0;
    let earliestPos: number | null = null;
    let earliestLen = 0;
    for (const marker of markers) {
      totalWeight += marker.weight;
      const re = marker.re;
      let matched = false;
      try { matched = re.test(text); if (re.global) re.lastIndex = 0; } catch (e) { void e; matched = false; }
      if (matched) {
        matchedWeight += marker.weight;
        try {
          const m = re.exec(text);
          if (re.global) re.lastIndex = 0;
          if (m && m.index !== undefined) { if (earliestPos === null || m.index < earliestPos) { earliestPos = m.index; earliestLen = m[0].length; } }
          else if (earliestPos === null) { const idx = text.search(re); if (idx !== -1) { earliestPos = idx; earliestLen = 0; } }
        } catch (e) { void e; }
      }
    }
    const threshold = parseThreshold(triggerCondition);
    if (matchedWeight < threshold) return { matched: false, matchPos: null, weight: 0 };
    if (earliestPos === null) earliestPos = 0;
    const winStart = Math.max(0, earliestPos - WINDOW_RADIUS);
    const winEnd = Math.min(text.length, earliestPos + earliestLen + WINDOW_RADIUS);
    const windowText = text.slice(winStart, winEnd);
    for (const neg of negatives) {
      try { if (frameToRegex(neg).test(windowText)) return { matched: false, matchPos: null, weight: 0 }; } catch (e) { void e; }
    }
    const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    const weight = Math.max(0, Math.min(1, coverage));
    return { matched: true, matchPos: earliestPos, weight };
  }
  const sf = matcher as unknown as { positive: readonly string[]; negative: readonly string[] };
  const positives = sf.positive ?? [];
  const negatives = sf.negative ?? [];
  let earliestPos: number | null = null;
  let earliestLen = 0;
  for (const pos of positives) {
    let re: RegExp;
    try { re = frameToRegex(pos); } catch (e) { void e; continue; }
    let m: RegExpExecArray | null = null;
    try { m = re.exec(text); } catch (e) { void e; continue; }
    if (m && m.index !== undefined) { if (earliestPos === null || m.index < earliestPos) { earliestPos = m.index; earliestLen = m[0].length; } }
  }
  if (earliestPos === null) return { matched: false, matchPos: null, weight: 0 };
  const winStart = Math.max(0, earliestPos - WINDOW_RADIUS);
  const winEnd = Math.min(text.length, earliestPos + earliestLen + WINDOW_RADIUS);
  const windowText = text.slice(winStart, winEnd);
  for (const neg of negatives) {
    let negRe: RegExp;
    try { negRe = frameToRegex(neg); } catch (e) { void e; continue; }
    try { if (negRe.test(windowText)) return { matched: false, matchPos: null, weight: 0 }; } catch (e) { void e; }
  }
  const totalPos = positives.length > 0 ? positives.length : 1;
  let matchedCount = 0;
  for (const pos of positives) { try { if (frameToRegex(pos).test(text)) matchedCount++; } catch (e) { void e; } }
  const coverage = matchedCount / totalPos;
  const weight = 0.55 + 0.4 * coverage;
  return { matched: true, matchPos: earliestPos, weight };
}
function excerptAround(text: string, centerPos: number, cap: number): string {
  if (text.length <= cap) return text;
  const suffix = `[...TRUNCATED:${text.length}]`;
  const budget = cap - suffix.length;
  if (budget <= 0) return boundedSlice(text, cap);
  const half = Math.floor(budget / 2);
  let start = Math.max(0, centerPos - half);
  let end = start + budget;
  if (end > text.length) { end = text.length; start = Math.max(0, end - budget); if (centerPos < start) start = Math.max(0, centerPos - half); if (start + budget > text.length) { start = Math.max(0, text.length - budget); end = text.length; } }
  const snippet = text.slice(start, end);
  return snippet + suffix;
}
const frameCache = new Map<string, RegExp>();
export function frameToRegex(frame: string): RegExp {
  const hit = frameCache.get(frame);
  if (hit !== undefined) return hit;
  const toks = frame.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const body = toks.map((t, i) => (i === toks.length - 1 ? `${t}(?:es|s)?` : t)).join('\\s+');
  const re = new RegExp(`\\b${body}\\b`, 'i');
  frameCache.set(frame, re);
  return re;
}
export function clearFrameCache(): void { frameCache.clear(); }

export function scoreSignals(text: string, family: PatternFamilyMember): { pos: number; neg: number; evidence: string } {
  let pos = 0;
  let neg = 0;
  let evidence = '';
  const des = (family as unknown as { descriptive?: readonly RegExp[] }).descriptive ?? [];
  for (const re of des) {
    try { const m = text.match(re); if (m) { neg += 1; evidence = evidence || m[0]; } if ((re as RegExp).global) (re as RegExp).lastIndex = 0; } catch { void 0; }
  }
  const sug = (family as unknown as { suggestive?: readonly RegExp[] }).suggestive;
  if (sug && sug.length > 0) {
    for (const re of sug) {
      try { const m = text.match(re); if (m) { pos += re.source.includes('\\b') ? 2 : 1; evidence = evidence || m[0]; } if ((re as RegExp).global) (re as RegExp).lastIndex = 0; } catch { void 0; }
    }
  } else if (family.matcher) {
    const m = family.matcher as unknown as { positive?: readonly string[]; markers?: readonly FramePatternMarker[] };
    if (m.positive) {
      for (const p of m.positive) { try { if (frameToRegex(p).test(text)) { pos += 1; evidence = evidence || p; } } catch { void 0; } }
    }
    if (m.markers) {
      for (const mk of m.markers) { try { if (mk.re.test(text)) { pos += mk.weight >= 1 ? 1 : 0.7; evidence = evidence || mk.re.source; } if (mk.re.global) mk.re.lastIndex = 0; } catch { void 0; } }
    }
  }
  const sub = (family as unknown as { substitute?: readonly RegExp[] }).substitute ?? [];
  for (const re of sub) {
    try { const m = text.match(re); if (m) { pos += 2; evidence = evidence || m[0]; } if ((re as RegExp).global) (re as RegExp).lastIndex = 0; } catch { void 0; }
  }
  const use = (family as unknown as { use?: readonly RegExp[] }).use ?? [];
  let useHit = false;
  for (const re of use) {
    try { if (re.test(text)) { neg += 3; useHit = true; } if ((re as RegExp).global) (re as RegExp).lastIndex = 0; } catch { void 0; }
  }
  return { pos, neg, evidence, useHit } as unknown as { pos: number; neg: number; evidence: string };
}

export function confidence(pos: number, neg: number): number {
  return pos / (pos + neg + 1);
}

export function classify(input: ClassifierInput, families: readonly PatternFamilyMember[]): ClassifierResult {
  let bestPos = 0;
  let bestNeg = 0;
  let bestEvidence = '';
  let bestGroup: string | null = null;
  const matched: string[] = [];
  let useShortCircuit = false;
  let useEvidence = '';
  for (const f of families) {
    const s = scoreSignals(input.text, f);
    const useArr = (f as unknown as { use?: readonly RegExp[] }).use ?? [];
    let hasUse = false;
    for (const re of useArr) { try { if (re.test(input.text)) { hasUse = true; useEvidence = useEvidence || (input.text.match(re)?.[0] ?? ''); } if ((re as RegExp).global) (re as RegExp).lastIndex = 0; } catch { void 0; } }
    if (hasUse) { useShortCircuit = true; }
    if (s.pos > 0) {
      const g = (f as unknown as { group?: string }).group ?? f.id;
      if (!matched.includes(g)) matched.push(g);
    }
    if (s.pos > bestPos || (s.pos === bestPos && s.neg > bestNeg)) { bestPos = s.pos; bestNeg = s.neg; bestEvidence = s.evidence; bestGroup = (f as unknown as { group?: string }).group ?? f.id; }
  }
  if (useShortCircuit) {
    return { intent: 'none', confidence: 0, action: 'allow', matchedFamilies: matched, evidence: useEvidence };
  }
  const conf = confidence(bestPos, bestNeg);
  const shouldBlock = bestPos > 0 && bestPos > bestNeg;
  return { intent: shouldBlock ? (bestGroup ?? 'flagged') : 'none', confidence: conf, action: shouldBlock ? 'block' : 'allow', matchedFamilies: matched, evidence: bestEvidence };
}
