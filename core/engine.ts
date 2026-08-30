// core/engine.ts — THE INTEGRATION SPINE
//
// Composes the full enforcement loop: the platform adapter's events flow
// through the role gate → the capture planes → the classifier → the synapse →
// the machine → the gates → the tier-proportional dispatch, with the
// compliance observation closing the loop (the reset + the pool bridge).
//
// THE WIRING CONTRACT (spec §2.6):
//   onToolAfter(remediation tool, success)
//     → measureCompliance → a fresh verified test_result in the pool
//     → COMPLIANCE_VERIFIED → MONITORING tier 0
//   deadline passed without compliance
//     → COMPLIANCE_FAILED → tier++ → the DEMAND redispatch (the climb is seen)
//   tier ≥ 3 non-hatch tool call
//     → StructuredEnforcementError (the DENY — the teeth)

import { RoleGate, readPart } from './role-gate.js';
import { scoreSignals, confidence, modulateWeight, batchScan,
         ENFORCE_CONF_BAND } from './classifier.js';
import { V2Synapse } from './synapse.js';
import { step, createInitialRecord } from './machine.js';
import type { MachineEvent } from './machine.js';
import { GateEngine } from './gate-engine.js';
import { ComplianceCollector } from './collector.js';
import { CircuitBreaker } from './circuit.js';
import type { DomainModule, WeightedViolation, BehavioralState,
               BehaviorRecord, EvidenceRecord, GateResult,
               StructuredEnforcementError as SEE } from './types.js';
import { StructuredEnforcementError } from './types.js';
import { dispatchDirective, throwMandate,
         shouldRedispatch, markDispatched } from '../actuation/dispatch.js';

// ═══ THE SESSION STATE (per-sid — no cross-session bleed) ═══

interface SessionState {
  record: BehaviorRecord;
  synapse: V2Synapse;
  behavioral: BehavioralState;
  pendingCalls: Array<{ tool: string; args: Record<string, unknown>; exitCode?: number }>;
  lastSeq: number;
  pendingRedispatch?: boolean;
  lastPrimedFamily?: string;
}

const SESSION_CAP = 256;

// ═══ THE ENGINE ═══

export interface EngineHooks {
  /** Receives every enforcement audit row (the observability surface). */
  onEvent?: (row: { kind: string; detail: Record<string, unknown> }) => void;
  /** The enforcement dial (FULL default per the operator doctrine; OFF = kill switch). */
  level?: 'OFF' | 'STEER' | 'FULL';
}

export class ParagonEngine {
  readonly roleGate = new RoleGate();
  readonly gates = new GateEngine();
  readonly circuit = new CircuitBreaker(3);
  readonly collector: ComplianceCollector;
  readonly level: 'OFF' | 'STEER' | 'FULL';

  private readonly sessions = new Map<string, SessionState>();
  private readonly hooks: EngineHooks;
  private seq = 0;

  constructor(readonly domain: DomainModule, hooks: EngineHooks = {}) {
    this.level = hooks.level ?? 'FULL';
    this.hooks = hooks;
    this.collector = new ComplianceCollector(`paragon-${domain.name}`);
    this.circuit.setEscapeHatches(domain.compliance.escapeHatches);
    this.registerTierGates();
  }

  // ══ THE TIER GATES (the fresh-subset criteria per tier) ══

  private registerTierGates(): void {
    const ttl = 300_000;
    this.gates.registerGate({
      gateId: 'steer', description: 'tier-1 dispatch gate',
      minEvidenceCount: 1, requiredEvidenceTypes: ['audit_log'], ttlMs: ttl,
    });
    this.gates.registerGate({
      gateId: 'demand', description: 'tier-2 dispatch gate',
      minEvidenceCount: 2, requiredEvidenceTypes: ['audit_log'], ttlMs: ttl,
    });
    this.gates.registerGate({
      gateId: 'deny', description: 'tier-3 dispatch gate',
      minEvidenceCount: 2, requiredEvidenceTypes: ['audit_log', 'test_result'],
      ttlMs: ttl, requireAllTypes: true,
    });
  }

  // ══ SESSION RESOLUTION ══

  private sessionFor(sessionID: string): SessionState {
    const sid = sessionID && sessionID !== '' ? sessionID : 'default';
    let s = this.sessions.get(sid);
    if (!s) {
      if (this.sessions.size >= SESSION_CAP) {
        const oldest = this.sessions.keys().next().value;
        if (typeof oldest === 'string') this.sessions.delete(oldest);
      }
      s = {
        record: createInitialRecord(sid, this.level),
        synapse: new V2Synapse({ fire: this.domain.thresholds, decayAlpha: 0.05, refractorySeq: 25 }),
        behavioral: {
          claims: 0, results: 0, claimedPaths: [], narrationTurns: 0,
          toolCalls: 0, completionClaims: 0, verificationCalls: 0,
          seq: 0, sessionID: sid,
        },
        pendingCalls: [],
        lastSeq: 0,
      };
      this.sessions.set(sid, s);
    }
    return s;
  }

  getRecord(sessionID: string): BehaviorRecord {
    return this.sessionFor(sessionID).record;
  }

  private emit(kind: string, detail: Record<string, unknown>): void {
    if (this.hooks.onEvent) this.hooks.onEvent({ kind, detail });
  }

  // ══ THE CAPTURE ENTRY (every platform text event) ══

  /**
   * Feed a text emission (reasoning or text-think) from an ASSISTANT part.
   * The caller is responsible for role gating — or use handleEvent which
   * routes through the built-in RoleGate.
   */
  observeText(text: string, sessionID: string, plane: 'reasoning' | 'text-think'): WeightedViolation[] {
    if (text === '') return [];
    this.seq++;
    const s = this.sessionFor(sessionID);
    const violations = this.classifyText(text, sessionID, plane);
    const machineViolations = this.runBehavioralChecks(s);

    const all = [...violations, ...machineViolations];
    if (all.length > 0) {
      this.onSignals(s, all);
    }
    this.tickEscalation(s);
    return all;
  }

  /** Feed a raw platform event through the built-in role gate + planes. */
  handleEvent(rawEvent: unknown): void {
    const evt = (rawEvent as { type?: string; properties?: unknown });
    if (!evt || typeof evt.type !== 'string') return;

    this.roleGate.observe(evt as never);

    if (evt.type === 'message.updated' || evt.type === 'message.created') return;

    if (evt.type === 'message.part.updated' || evt.type === 'message.part.delta') {
      if (!this.roleGate.shouldProcess(evt as never)) {
        this.emit('role-gate-drop', { type: evt.type });
        return;
      }
      const part = readPart(evt as never);
      if (part && typeof part.text === 'string' && part.text !== '') {
        const plane = part.type === 'reasoning' ? 'reasoning' as const : 'text-think' as const;
        // the tagless path: text parts without think-tag shapes feed directly
        this.observeText(part.text, part.sessionID ?? 'default', plane);
      }
    }
  }

  // ══ THE CLASSIFIER LADDER ══

  private classifyText(text: string, sessionID: string,
    plane: 'reasoning' | 'text-think'): WeightedViolation[] {
    const out: WeightedViolation[] = [];

    // The per-signal confidence ladder
    for (const member of this.domain.families) {
      const scored = scoreSignals(text, member);
      const conf = confidence(scored.pos, scored.neg);
      const modulated = modulateWeight(0.9, conf);
      if (modulated > 0) {
        out.push({
          memberId: member.id, family: member.id.split('.')[0], plane,
          excerpt: scored.evidence.slice(0, 200),
          anchor: { seq: this.seq, ts: Date.now(), sessionID },
          weight: modulated,
        });
      }
    }

    // The batch-wide FI-1 scan (the paraphrase synthesis)
    const synth = batchScan(text, this.domain.families);
    if (synth && !out.some((w) => w.memberId === synth.memberId)) {
      out.push({
        memberId: synth.memberId, family: synth.family, plane,
        excerpt: synth.evidence.slice(0, 200),
        anchor: { seq: this.seq, ts: Date.now(), sessionID },
        weight: synth.weight,
      });
    }

    // The behavioral feed (the domain checks' text input: claims + completion claims)
    const s = this.sessionFor(sessionID);
    if (/\b(done|complete|finished|verified|working)\b/i.test(text)) s.behavioral.completionClaims++;
    if (/\bI (?:will|'ll|have) (?:built|written|created|fixed|deployed|shipped)\b/i.test(text)) s.behavioral.claims++;
    s.behavioral.narrationTurns++;
    s.behavioral.seq = this.seq;

    return out;
  }

  // ══ THE BEHAVIORAL CHECKS (the text-independent detectors) ══

  private runBehavioralChecks(s: SessionState): WeightedViolation[] {
    const out: WeightedViolation[] = [];
    for (const check of this.domain.behavioralChecks) {
      const v = check({ ...s.behavioral });
      if (v !== null) out.push(v);
    }
    return out;
  }

  // ══ THE SIGNALS → THE MACHINE (the accrual + the fusion) ══

  private onSignals(s: SessionState, violations: WeightedViolation[]): void {
    for (const v of violations) {
      s.synapse.accumulate(v, this.seq);
    }

    // The synapse fire → PATTERN_HIT (the fusion primes the machine)
    const fired = this.firstFiringFamily(s);
    if (fired !== null) {
      s.lastPrimedFamily = fired;
      this.feed(s, 'PATTERN_HIT', { patternId: fired, family: fired });
      return;
    }

    // The accrual events
    if (s.record.state === 'IDLE') {
      this.feed(s, 'FIRST_SIGNAL', { family: violations[0].family });
    } else {
      this.feed(s, 'SIGNAL', { family: violations[0].family });
    }
  }

  private firstFiringFamily(s: SessionState): string | null {
    // The synapse's ACTUAL neurons are the source of truth (the families the
    // signals created), NOT the domain's threshold keys — the contract bug
    // class where the member-id family prefix diverges from the threshold key.
    for (const [family, snap] of Object.entries(s.synapse.snapshot())) {
      const n = s.synapse.getNeuron(family);
      if (!n) continue;
      void snap;
      if (n.canFire(this.seq)) {
        n.fire(this.seq);
        return family;
      }
    }
    return null;
  }

  // ══ THE MACHINE FEED ══

  private feed(s: SessionState, type: MachineEvent['type'],
    payload: Record<string, unknown>): void {
    const event: MachineEvent = {
      type,
      payload,
      triad: {
        pattern: { memberId: String(payload['family'] ?? payload['patternId'] ?? 'unknown') },
        state: { from: s.record.state, to: s.record.state },
        evidence: { file: 'engine', line: this.seq },
        seq: this.seq,
        observedAt: Date.now(),
      },
    };
    const result = step(s.record, event);
    if (result.kind === 'TRANSITIONED') {
      s.record = result.record;
      this.emit('machine-transition', {
        event: type, from: event.triad.state.from,
        to: s.record.state, tier: s.record.tier, seq: this.seq,
      });
    } else if (result.kind === 'UNCHANGED' && result.reason) {
      this.emit('machine-unchanged', { event: type, reason: result.reason });
    }
  }

  // ══ THE ESCALATION TICK (the deadline clock) ══

  private tickEscalation(s: SessionState): void {
    if (s.record.state !== 'INTERVENING') return;
    if (s.record.complianceDeadlineSeq === null) return;
    if (this.seq >= s.record.complianceDeadlineSeq + 5) {
      const tierBefore = s.record.tier;
      this.feed(s, 'COMPLIANCE_FAILED', { deadline: s.record.complianceDeadlineSeq });
      if (s.record.tier > tierBefore) {
        this.emit('escalate-tick', { tier: s.record.tier, seq: this.seq });
        // The redispatch: the model SEES the climb (the tier-proportional demand)
        s.pendingRedispatch = true;
      }
    }
  }

  // ══ THE INTERVENTION SURFACES ══

  /**
   * Try to dispatch on a surface. Call from messages.transform (every turn)
   * and tool.before (every call). Returns the appended text (or null).
   */
  tryIntervene(sessionID: string, surface: 'messages.transform' | 'tool-before',
    attach: (text: string) => void): string | null {
    const s = this.sessionFor(sessionID);

    // The PRIMED → INTERVENING lift (tier 1) on an eligible surface
    if (s.record.state === 'PRIMED') {
      this.feed(s, 'INTERVENE', { surface, family: s.lastPrimedFamily ?? 'signals' });
      // feed() reassigns s.record — read the state through the fresh reference
      if ((s.record as { state: string }).state !== 'INTERVENING') return null;

      // THE POOL-ORDER FIX: the offense IN the pool BEFORE the gate eval
      void this.collector.recordOffense(
        { family: s.lastPrimedFamily ?? 'signals', excerpt: 'intervene' }, this.seq);

      // The dispatch: the attach is SYNCHRONOUS (the delivery is the load-bearing
      // act; the gate eval rides as observability — the non-blocking design)
      const family = s.lastPrimedFamily ?? 'signals';
      const directiveText = s.record.tier >= 2
        ? this.domain.templates.demand(family, `engine:${this.seq}`)
        : this.domain.templates.steer(family, `engine:${this.seq}`);
      attach(directiveText);
      markDispatched(sessionID, s.record.tier);
      void this.collector.recordDispatch({ verb: 'STEER_INJECT', tier: s.record.tier }, this.seq);
      this.emit('steer-appended', {
        tier: s.record.tier, len: directiveText.length,
        head: directiveText.slice(0, 60), seq: this.seq,
      });
      // The gate eval: observability-only, never blocks the delivery
      void this.evaluateGate(s, s.record.tier);
      return directiveText;
    }

    // The tier≥3 teeth (the DENY — dial-independent)
    if (s.record.tier >= 3 && surface === 'tool-before') {
      const err = throwMandate(this.domain, s.record.tier);
      attach(err.message);
      this.emit('deny-throw', { tier: s.record.tier, seq: this.seq });
      return err.message;
    }

    // The escalation redispatch (the DEMAND append on the climb)
    if (s.pendingRedispatch && s.record.state === 'INTERVENING' && surface === 'messages.transform') {
      s.pendingRedispatch = false;
      const family = s.lastPrimedFamily ?? 'signals';
      const directiveText = this.domain.templates.demand(family, `engine:${this.seq}`);
      attach(directiveText);
      markDispatched(sessionID, s.record.tier);
      void this.collector.recordDispatch({ verb: 'STEER_INJECT', tier: s.record.tier }, this.seq);
      this.emit('steer-appended', {
        tier: s.record.tier, len: directiveText.length,
        head: directiveText.slice(0, 60), seq: this.seq, redispatch: true,
      });
      void this.evaluateGate(s, s.record.tier);
      return directiveText;
    }

    return null;
  }

  /** The gate evaluation (observability — the verdict never blocks the dispatch). */
  private async evaluateGate(s: SessionState, tier: number): Promise<void> {
    const gateId = tier >= 3 ? 'deny' : tier >= 2 ? 'demand' : 'steer';
    const result: GateResult = await this.gates.evaluate(gateId, this.collector.getRecords());
    this.emit('gate-eval', {
      gateId, verdict: result.verdict,
      pool: this.collector.getRecords().length, tier,
    });
  }

  // ══ THE COMPLIANCE OBSERVATION (tool.after — the loop closer) ══

  /**
   * Observe a completed tool call. A successful remediation-tool call
   * closes the escalation window: COMPLIANCE_VERIFIED → tier 0 + the pool
   * insert (the bridge) + the circuit recordSuccess.
   */
  observeTool(sessionID: string, toolName: string,
    _args: Record<string, unknown>, exitCode?: number): void {
    const s = this.sessionFor(sessionID);
    s.behavioral.toolCalls++;
    s.behavioral.verificationCalls = this.isRemediationTool(toolName)
      ? s.behavioral.verificationCalls + 1 : s.behavioral.verificationCalls;
    s.pendingCalls.push({ tool: toolName, args: _args, exitCode });

    // The compliance detection: the REMEDIATION class only (anti-eager)
    const isRemediation = this.isRemediationTool(toolName);
    const succeeded = exitCode === undefined || exitCode === 0;

    if (s.record.state === 'INTERVENING' && isRemediation && succeeded) {
      // THE POOL BRIDGE: the comply-millisecond insert
      void this.collector.measureCompliance(
        { toolClass: toolName, toolPattern: this.remediationPattern() },
        [{ tool: toolName, args: _args, exitCode }]);
      this.feed(s, 'COMPLIANCE_VERIFIED', { tool: toolName });
      this.circuit.recordSuccess();
      this.emit('v2-comply', { tool: toolName, tier: s.record.tier, seq: this.seq });
    }
  }

  private isRemediationTool(toolName: string): boolean {
    const lower = toolName.toLowerCase();
    for (const t of this.domain.compliance.remediationTools) {
      if (lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)) return true;
    }
    for (const p of this.domain.compliance.verificationPatterns) {
      if (p.test(toolName)) return true;
    }
    return false;
  }

  private remediationPattern(): RegExp {
    return new RegExp(
      this.domain.compliance.remediationTools.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'i');
  }

  // ══ THE TOOL INTERCEPTION (tool.before — the teeth) ══

  /**
   * Intercept a tool call before execution. Returns a StructuredEnforcementError
   * to block, or null to allow. The escape hatch NEVER blocks (the anti-lock law).
   */
  interceptTool(sessionID: string, toolName: string,
    args: Record<string, unknown>): SEE | null {
    const s = this.sessionFor(sessionID);

    // The escape hatch: the instrument passes at every tier
    const isHatch = this.domain.compliance.escapeHatches.some(
      (h) => toolName.toLowerCase().includes(h.toLowerCase()));
    if (isHatch) return null;

    // The circuit: when OPEN, only the hatches pass
    if (!this.circuit.allowRequest(toolName)) {
      return throwMandate(this.domain, 4);
    }

    // The tier≥3 DENY
    if (s.record.tier >= 3) {
      const err = throwMandate(this.domain, s.record.tier);
      this.circuit.recordFailure();
      this.emit('tool-denied', { tool: toolName, tier: s.record.tier, seq: this.seq });
      return err;
    }

    void args;
    return null;
  }

  // ══ THE OBSERVABILITY ══

  getSeq(): number { return this.seq; }
  getSessionCount(): number { return this.sessions.size; }
  getPool(): EvidenceRecord[] { return this.collector.getRecords(); }
}
