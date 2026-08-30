// src/v2/enforcement/router.ts — THE MULTI-DIMENSIONAL ENFORCEMENT ROUTER (spec §2.8)
// Verb selected by event-type context × severity × config level.
// Templates are PINNED STRINGS — zero model calls (LAW-1 MASTER/SLAVE).
// v2 NEVER mutates output tokens — that is v1's exclusive verb until v3.

import type { EnforcementDirective, EnforcementVerb, V2Level } from '../contracts.js';
import { writeEvidence } from '../evidence/ledger-writer.js';

// ─── THE TEMPLATES (< 90 tokens each, warhead-grade) ─────────────────────────

const STEER_TEMPLATE = (families: string, anchor: string): string =>
  `[V2 STEER] Reasoning signals: ${families}. Before your next output: run the verification you are narrating, cite the tool result, and do not describe this firewall — describe your work. (${anchor})`;

// THE DEMAND TEMPLATE (audit wave-1787924354199, E-05 — was never implemented:
// the machine escalated the GATE but the model saw the identical [V2 STEER] text
// at every tier). Tier >=2 messages escalate to the demand wording per the
// neural map's pinned strings.
const DEMAND_TEMPLATE = (families: string, anchor: string): string =>
  `[V2 DEMAND] ${families}: the previous steer was not satisfied. Your next tool call MUST be trident-container-test — it is never blocked — and cite its tool result before any further output. (${anchor})`;

const ADVISORY_TEMPLATE = (patternId: string, evidenceSummary: string): string =>
  `[V2 PATTERN] ${patternId}: ${evidenceSummary}. The pattern is logged. Corrective path: run the container test and cite the tool result.`;

// ─── THE ROUTER ──────────────────────────────────────────────────────────────

export interface DirectiveSurface {
  // 'advisory' — the D4 pattern-time surface (spec §2.8): the advisory rides
  // the ledger at fusion time under FULL; no context injection, evidence-only.
  kind: 'tool-before' | 'messages' | 'advisory' | 'none';
  attach: (text: string) => void;
}

export function dispatchDirective(
  directive: EnforcementDirective,
  surface: DirectiveSurface,
  feedV1: (event: { kind: string; detail: string; at: number; distSha: string }) => void,
): void {
  if (directive.level === 'OFF') return;

  const verb = selectVerb(directive, surface);
  if (!verb) {
    // D3 always fires regardless of verb availability
    writeEvidence('enforcement', { skipped: true, level: directive.level });
    return;
  }

  switch (verb) {
    case 'TOOL_PREPEND': {
      const families = directive.trigger instanceof Object && 'family' in directive.trigger
        ? String(directive.trigger.family)
        : 'unknown';
      const anchor = `${directive.triad.evidence.file}:${directive.triad.evidence.line}`;
      const text = (directive.tier ?? 0) >= 2
        ? DEMAND_TEMPLATE(families, anchor)
        : STEER_TEMPLATE(families, anchor);
      surface.attach(text);
      break;
    }
    case 'STEER_INJECT': {
      const families = directive.trigger instanceof Object && 'family' in directive.trigger
        ? String(directive.trigger.family)
        : directive.trigger instanceof Object && 'patternId' in directive.trigger
          ? String(directive.trigger.patternId)
          : 'signals';
      const anchor = `${directive.triad.evidence.file}:${directive.triad.evidence.line}`;
      // THE TIER-PROPORTIONAL MESSAGE (E-05 closed): tier >=2 escalates the
      // wording to the DEMAND template — the model must SEE the escalation,
      // not just the gate telemetry.
      const text = (directive.tier ?? 0) >= 2
        ? DEMAND_TEMPLATE(families, anchor)
        : STEER_TEMPLATE(families, anchor);
      surface.attach(text);
      break;
    }
    case 'ADVISORY': {
      const pid = directive.trigger instanceof Object && 'patternId' in directive.trigger
        ? String(directive.trigger.patternId) : 'signal';
      const summary = directive.trigger instanceof Object && 'evidence' in directive.trigger
        ? JSON.stringify(directive.trigger.evidence).substring(0, 200) : '';
      surface.attach(ADVISORY_TEMPLATE(pid, summary));
      break;
    }
    case 'EVIDENCE_FEED':
      break; // handled below — unconditional
  }

  // D3 EVIDENCE FEED — every dispatched directive lands in the ledger + v1's machine
  writeEvidence('enforcement', {
    verb, level: directive.level,
    trigger: directive.trigger instanceof Object ? JSON.stringify(directive.trigger).substring(0, 300) : 'unknown',
    atSeq: directive.triad.state.from,
    sessionID: directive.triad.pattern.memberId,
  });
  // THE D3 CALL (the operator's fully-test-everything round caught it: feedV1 was
  // an accepted-but-never-invoked parameter — the v1 cross-feed leg was dead):
  try {
    feedV1({
      kind: verb,
      detail: directive.trigger instanceof Object && 'memberId' in directive.trigger
        ? String(directive.trigger.memberId)
        : directive.trigger instanceof Object && 'patternId' in directive.trigger
          ? String(directive.trigger.patternId)
          : 'unknown',
      at: Date.now(),
      distSha: '',
    });
  } catch { /* the observer law — the ledger row above already records the dispatch */ }
}

function selectVerb(directive: EnforcementDirective, surface: DirectiveSurface): EnforcementVerb | null {
  const available = verbsForLevel(directive.level);
  if (!available.has('STEER_INJECT') && !available.has('TOOL_PREPEND') && !available.has('ADVISORY')) return null;
  switch (surface.kind) {
    case 'tool-before': return available.has('TOOL_PREPEND') ? 'TOOL_PREPEND' : null;
    case 'messages': return available.has('STEER_INJECT') ? 'STEER_INJECT' : null;
    case 'advisory': return available.has('ADVISORY') ? 'ADVISORY' : null; // GAP-5: the dead verb made reachable
    default: return null;
  }
}

function verbsForLevel(level: V2Level): ReadonlySet<string> {
  switch (level) {
    case 'OFF': return new Set<string>();
    case 'STEER': return new Set<string>(['STEER_INJECT', 'EVIDENCE_FEED']);
    case 'FULL': return new Set<string>(['TOOL_PREPEND', 'STEER_INJECT', 'EVIDENCE_FEED', 'ADVISORY']);
  }
}
