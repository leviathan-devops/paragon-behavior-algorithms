// actuation/dispatch.ts — THE TIER-PROPORTIONAL DISPATCH
//
// Delivers the tier-proportional enforcement to the agent's context and tool
// surface. The templates are loaded from the domain module — the machinery
// selects the template by tier, the domain provides the wording.

import type { EnforcementDirective, DirectiveSurface, EvidenceTriad,
              WeightedViolation } from '../core/types.js';
import type { DomainModule } from '../core/types.js';

export function dispatchDirective(
  directive: EnforcementDirective,
  surface: DirectiveSurface,
  domain: DomainModule,
  feedEvidence: (event: { kind: string; detail: string }) => void,
): void {
  if (directive.level === 'OFF') return;

  const tier = directive.tier ?? 0;
  const families = directive.trigger instanceof Object && 'family' in directive.trigger
    ? String(directive.trigger.family)
    : 'signals';
  const anchor = `${directive.triad.evidence.file}:${directive.triad.evidence.line}`;

  let text: string;
  if (tier >= 2) {
    text = domain.templates.demand(families, anchor);
  } else {
    text = domain.templates.steer(families, anchor);
  }

  surface.attach(text);

  // The evidence feed
  try {
    feedEvidence({ kind: directive.verb, detail: families });
  } catch { /* the observer law */ }
}

// ═══ THE TIER-PROPORTIONAL MANDATE THROW ═══

import { StructuredEnforcementError } from '../core/types.js';

export function throwMandate(domain: DomainModule, tier: number): StructuredEnforcementError {
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

// ═══ THE REDISPATCH (the tier climb is visible to the agent) ═══

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
