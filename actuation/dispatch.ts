// actuation/dispatch.ts — THE TIER-PROPORTIONAL DISPATCH (adaptive-primary)
import type { EnforcementDirective, DirectiveSurface } from '../core/types.js';
import type { DomainModule } from '../core/types.js';
import { StructuredEnforcementError } from '../core/types.js';
import { hasAdaptiveTemplate, resolveWarheadWithLexicon } from './warhead-templates.js';
import type { WarheadFillContext } from './warhead-templates.js';
function brandPrefixFor(domain: DomainModule): string {
  const b = (domain as unknown as { brandPrefix?: string }).brandPrefix;
  if (typeof b === 'string' && b.length > 0) return b;
  return domain.name.toUpperCase();
}
function instrumentFor(domain: DomainModule): string {
  const v = (domain as unknown as { instrumentName?: string }).instrumentName;
  if (typeof v === 'string' && v.length > 0) return v;
  return domain.compliance.remediationTools[0] ?? 'trident-container-test';
}
function instrumentTier3For(domain: DomainModule): string {
  const v = (domain as unknown as { instrumentTier3?: string }).instrumentTier3;
  if (typeof v === 'string' && v.length > 0) return v;
  return domain.compliance.remediationTools[0] ?? 'trident-problem-solving';
}
function lexiconFor(domain: DomainModule): Record<string, string> {
  const l = (domain as unknown as { lexicon?: Record<string, string> }).lexicon;
  return l ?? {};
}
function excerptFromTrigger(trigger: unknown): string {
  try {
    const t = trigger as Record<string, unknown>;
    if (!t || typeof t !== 'object') return 'signals';
    if (typeof t['excerpt'] === 'string' && (t['excerpt'] as string).length > 0) return String(t['excerpt']).slice(0, 60);
    const ev = t['evidence'];
    if (Array.isArray(ev) && ev.length > 0) {
      const first = ev[0] as Record<string, unknown>;
      if (first && typeof first['excerpt'] === 'string' && (first['excerpt'] as string).length > 0) return String(first['excerpt']).slice(0, 60);
    }
    if (typeof t['memberId'] === 'string' && (t['memberId'] as string).length > 0) return String(t['memberId']).slice(0, 60);
    if (typeof t['family'] === 'string' && (t['family'] as string).length > 0) return String(t['family']).slice(0, 60);
    if (typeof t['patternId'] === 'string' && (t['patternId'] as string).length > 0) return String(t['patternId']).slice(0, 60);
    return 'signals';
  } catch (err) {
    void err;
    return 'signals';
  }
}
export function composeAdaptive(domain: DomainModule, family: string, tier: number, anchor: string, trigger: unknown): string | null {
  const lex = lexiconFor(domain) as unknown as Record<string, never>;
  if (!hasAdaptiveTemplate(family, lex as never)) return null;
  const fill: WarheadFillContext = {
    count: 1,
    excerpt: excerptFromTrigger(trigger),
    instrument: instrumentFor(domain),
    instrumentTier3: instrumentTier3For(domain),
  };
  const t = Math.min(4, Math.max(1, tier === 0 ? 1 : tier)) as 1 | 2 | 3 | 4;
  const body = resolveWarheadWithLexicon(family, t, fill, lex as never);
  if (body.includes('unidentified pattern')) return null;
  const tag = tier >= 2 ? 'DEMAND' : 'STEER';
  const brand = brandPrefixFor(domain);
  return `[${brand} ${tag}] ${body} (${anchor})`;
}
export function dispatchDirective(
  directive: EnforcementDirective,
  surface: DirectiveSurface,
  domain: DomainModule,
  feedEvidence: (event: { kind: string; detail: string }) => void,
): void {
  if (directive.level === 'OFF') return;
  const tier = directive.tier ?? 0;
  const families = directive.trigger instanceof Object && 'family' in directive.trigger
    ? String((directive.trigger as { family: unknown }).family)
    : 'signals';
  const anchor = `${directive.triad.evidence.file}:${directive.triad.evidence.line}`;
  let text: string;
  const adaptive = composeAdaptive(domain, families, tier, anchor, directive.trigger);
  if (adaptive !== null) {
    text = adaptive;
  } else if (tier >= 2) {
    text = domain.templates.demand(families, anchor);
  } else {
    text = domain.templates.steer(families, anchor);
  }
  surface.attach(text);
  try {
    feedEvidence({ kind: directive.verb, detail: families });
  } catch (err) {
    void err;
  }
}
export function throwMandate(domain: DomainModule, tier: number, familyHint?: string, opts?: { count?: number; excerpt?: string }): StructuredEnforcementError {
  const anchorFamily = typeof familyHint === 'string' && familyHint.length > 0
    ? familyHint
    : (domain.families[0]?.id.split('.')[0] ?? 'TEST_EVASION');
  const lex = lexiconFor(domain) as unknown as Record<string, never>;
  if (hasAdaptiveTemplate(anchorFamily, lex as never)) {
    try {
      const fill: WarheadFillContext = {
        count: opts?.count ?? 1,
        excerpt: opts?.excerpt ?? anchorFamily,
        instrument: instrumentFor(domain),
        instrumentTier3: instrumentTier3For(domain),
      };
      const t = Math.min(4, Math.max(1, tier)) as 1 | 2 | 3 | 4;
      const body = resolveWarheadWithLexicon(anchorFamily, t, fill, lex as never);
      if (!body.includes('unidentified pattern')) {
        return new StructuredEnforcementError({
          machine: brandPrefixFor(domain),
          detected: 'this tool call is blocked',
          correction: body,
          evidenceRequired: true,
          phase: 'B',
          tier,
        });
      }
    } catch (err) {
      void err;
    }
  }
  const text = domain.templates.mandate(tier);
  return new StructuredEnforcementError({
    machine: domain.name.toUpperCase(),
    detected: 'this tool call is blocked',
    correction: text,
    evidenceRequired: true,
    phase: 'B',
    tier,
  });
}
const lastDispatchedTier = new Map<string, number>();
export function shouldRedispatch(sessionID: string, currentTier: number): boolean {
  const last = lastDispatchedTier.get(sessionID) ?? 0;
  return currentTier > last;
}
export function markDispatched(sessionID: string, tier: number): void {
  lastDispatchedTier.set(sessionID, tier);
}
export function resetDispatchTracker(sessionID?: string): void {
  if (sessionID === undefined) lastDispatchedTier.clear();
  else lastDispatchedTier.delete(sessionID);
}
