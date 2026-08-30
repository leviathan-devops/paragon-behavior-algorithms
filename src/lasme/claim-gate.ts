// src/lasme/claim-gate.ts — THE ROLE-FILTER CLAIM GATE (spec §2.3, W3)
//
// THE PARAGON FORK: src/machines/claim-gate.ts of the PARAGON V1 boilerplate
// (KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/PARAGON_V1) — the role-filter +
// the demand-lifecycle structure, adapted to the landed LASME contracts.
//
// THE OPERATOR'S SCOPE LAW (VERBATIM): "this should NEVER fire on user
// messages only agent messages." The claimEventFromChat adapter is the
// STRUCTURAL guarantee — role !== 'assistant' returns null, so the user's
// words NEVER enter the mutation path. The F-2-REPLAY + the F-3-universal
// (NO environment gate — the role filter is the ONLY gate).
//
// THE CONTRACT (spec §2.3): the ClaimGateState {sessionId, armed, demands,
// strikes}, the ClaimDemand {claimExcerpt ≤200, triad, atSeq, expiresAtSeq},
// the CLAIM_GATE_TTL_SEQ 8 consume-once, the CLAIM_GATE_ESCALATION_AT 3 strike
// escalation, the claimEventFromChat(sessionId, role, text, seq, triad)
// adapter (role !== 'assistant' → null; else the WarheadEvent with
// agentOrigin:true). The model NEVER redefines the landed contracts — it
// imports WarheadEvent + EvidenceTriad from ./contracts.js.
//
// THE DOOM-LOOP WEAPONS (spec §2.3): the demand rides the next few results
// (the TTL 8 consume-once) then expires; the 3-strike escalation (3 ignored
// demands → the ESCALATE / MANDATORY enforcement); the clear (a clean
// generation / the evidence-landed state / the container-test escape hatch)
// disarms the gate. THE F-3 FIX: NO environment gate anywhere in this file —
// the mutation is UNIVERSAL across the agent completions in EVERY session.

import type { EvidenceTriad, WarheadEvent } from './contracts.js';

// ---------------------------------------------------------------------------
// THE NAMED CONSTANTS (spec §2.3 — never magic numbers)
// ---------------------------------------------------------------------------

/** the demand rides the next few tool results, then expires (consume-once). */
export const CLAIM_GATE_TTL_SEQ = 8;

/** the strikes before the ESCALATE fires (3 ignored demands → MANDATORY). */
export const CLAIM_GATE_ESCALATION_AT = 3;

/** the claim-excerpt byte budget (≤200 chars per the spec). */
export const CLAIM_EXCERPT_CAP = 200;

/** the WarheadEvent payload text cap (the boundedSlice discipline). */
export const CLAIM_PAYLOAD_CAP = 2000;

// ---------------------------------------------------------------------------
// THE STATE + THE DEMAND (spec §2.3 the contract — the exact shape)
// ---------------------------------------------------------------------------

export interface ClaimGateState {
  readonly sessionId: string;
  armed: boolean;
  demands: ClaimDemand[]; // the consume-once demands (the TTL)
  strikes: number; // the ignored demands count (the escalation ladder)
}

export interface ClaimDemand {
  readonly claimExcerpt: string; // ≤200 chars (the byte budget)
  readonly triad: EvidenceTriad; // the evidence triplet
  readonly atSeq: number;
  readonly expiresAtSeq: number; // the TTL — consume-once discipline
}

// ---------------------------------------------------------------------------
// THE PURE HELPERS
// ---------------------------------------------------------------------------

/**
 * boundedSlice — the byte-budget discipline (the identical semantic to the
 * PARAGON/lasme boundedSlice — the truncation is VISIBLE). Kept local so the
 * W3 gate is self-contained (there is no lasme barrel; predicate-lexicon.ts is
 * W1's file and must not be coupled into this gate).
 */
export function boundedSlice(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap - 20)}[…TRUNCATED:${text.length}]`;
}

/** pruneExpired — drop the demands whose TTL window has passed. */
function pruneExpired(demands: ClaimDemand[], currentSeq: number): ClaimDemand[] {
  return demands.filter((d) => d.expiresAtSeq > currentSeq);
}

// ---------------------------------------------------------------------------
// THE CHAT-MESSAGE ADAPTER — THE ROLE FILTER (spec §2.3 — the canonical line)
// ---------------------------------------------------------------------------

/**
 * claimEventFromChat — the role filter that implements the operator's canon
 * "this should NEVER fire on user messages only agent messages."
 *
 * role !== 'assistant' → null (the user words NEVER enter the mutation path —
 * the structural guarantee, the F-2-REPLAY). role === 'assistant' → the
 * WarheadEvent {type:'CLAIM_CANDIDATE', agentOrigin:true, payload{bounded text
 * ≤2000, triad}, receivedAtSeq: seq} — the mutation's candidate.
 */
export function claimEventFromChat(
  sessionId: string,
  role: string,
  text: string,
  seq: number,
  triad: EvidenceTriad,
): WarheadEvent | null {
  if (role !== 'assistant') return null; // THE ROLE FILTER — the user words never enter
  return {
    type: 'CLAIM_CANDIDATE',
    sessionId,
    agentOrigin: true,
    payload: { text: boundedSlice(text, CLAIM_PAYLOAD_CAP), triad },
    receivedAtSeq: seq,
  };
}

// ---------------------------------------------------------------------------
// THE GATE — the demand lifecycle (the TTL consume-once + the 3-strike)
// ---------------------------------------------------------------------------

export class ClaimGate {
  private readonly states = new Map<string, ClaimGateState>();

  private state(sessionId: string): ClaimGateState {
    let s = this.states.get(sessionId);
    if (s === undefined) {
      s = { sessionId, armed: false, demands: [], strikes: 0 };
      this.states.set(sessionId, s);
    }
    return s;
  }

  /** onAgentClaim — arms the gate + registers the consume-once demand. */
  onAgentClaim(sessionId: string, claimText: string, triad: EvidenceTriad, atSeq: number): void {
    const s = this.state(sessionId);
    s.armed = true;
    const demand: ClaimDemand = {
      claimExcerpt: boundedSlice(claimText, CLAIM_EXCERPT_CAP),
      triad,
      atSeq,
      expiresAtSeq: atSeq + CLAIM_GATE_TTL_SEQ,
    };
    s.demands = [...s.demands, demand];
  }

  /**
   * pendingDemand — the FRESH demand for the Phase-B splice (consume-once).
   * The expired demands (seq past the TTL) are pruned, then the first fresh
   * demand is returned. A demand not consumed within the TTL window expires.
   */
  pendingDemand(sessionId: string, currentSeq: number): ClaimDemand | null {
    const s = this.states.get(sessionId);
    if (s === undefined) return null;
    const fresh = pruneExpired(s.demands, currentSeq);
    s.demands = fresh;
    s.armed = fresh.length > 0; // the expired demand disarms the gate
    return fresh[0] ?? null;
  }

  /** consumeDemand — the splice delivery marks it consumed (exactly once). */
  consumeDemand(sessionId: string, atSeq: number): void {
    const s = this.states.get(sessionId);
    if (s === undefined) return;
    const rest = s.demands.filter((d) => d.atSeq !== atSeq);
    s.demands = rest;
    if (rest.length === 0) s.armed = false;
  }

  /** clear — the clean generation / the evidence-landed state / the
   *  container-test escape hatch. Disarms the gate + zeroes the strikes. */
  clear(sessionId: string): void {
    const s = this.states.get(sessionId);
    if (s !== undefined) {
      s.armed = false;
      s.demands = [];
      s.strikes = 0;
    }
  }

  /** strike — an ignored demand counts; at CLAIM_GATE_ESCALATION_AT the
   *  ESCALATE fires (the enforcement demand becomes MANDATORY). */
  strike(sessionId: string): number {
    const s = this.state(sessionId);
    s.strikes += 1;
    return s.strikes;
  }

  /** shouldEscalate — the strike ladder crossed → the ESCALATE. */
  shouldEscalate(sessionId: string): boolean {
    return this.state(sessionId).strikes >= CLAIM_GATE_ESCALATION_AT;
  }

  /** armed — is a demand pending for the session. */
  armed(sessionId: string): boolean {
    return this.states.get(sessionId)?.armed ?? false;
  }

  /** strikes — the current escalation count (the test + the wiring surface). */
  strikes(sessionId: string): number {
    return this.state(sessionId).strikes;
  }
}

/** The Phase-B splice: the demand rides the tool result as the NEWEST
 *  instruction (the persistent steering without the doom-loop). */
export function spliceDemand(toolResult: string, demand: ClaimDemand): string {
  return `${toolResult}\n\n[P-GATE] You may CLAIM correctness only with container-test evidence. Claim under gate: "${demand.claimExcerpt}" — run the container suite (the escape hatch) or withdraw the claim.`;
}
