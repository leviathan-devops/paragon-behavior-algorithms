import type { BehaviorRecord, MachineEvent, StepPayload } from './types.js';
export type { BehaviorRecord, BehaviorState, MachineEvent, StepPayload } from './types.js';
export { createInitialRecord } from './types.js';

const ESCALATION_DEADLINE_WINDOW = 5;
const REFRACTORY_SEQ_WINDOW = 25;

function bumpCounter(record: BehaviorRecord, payload?: StepPayload): Record<string, number> {
  if (!payload?.family || typeof payload.family !== 'string') return record.counters;
  return { ...record.counters, [payload.family]: (record.counters[payload.family] ?? 0) + 1 };
}

export function step(record: BehaviorRecord, event: MachineEvent, payload?: StepPayload): BehaviorRecord {
  try {
    if (event === 'TOOL_SIGNAL' && record.state === 'INTERVENING') {
      return { ...record, seq: record.seq + 1, counters: bumpCounter(record, payload) };
    }
    if (event === 'FIRST_TOOL_SIGNAL' && record.state === 'IDLE') {
      return { ...record, state: 'MONITORING', seq: record.seq + 1, counters: bumpCounter(record, payload) };
    }
    if (event === 'TOOL_SIGNAL' && (record.state === 'MONITORING' || record.state === 'PRIMED' || record.state === 'INTERVENING')) {
      return { ...record, state: 'MONITORING', seq: record.seq + 1, counters: bumpCounter(record, payload) };
    }
    if (event === 'CHAIN_PATTERN_HIT' && record.state === 'MONITORING') {
      if (payload?.patternId === undefined && payload?.memberId === undefined) return record;
      return { ...record, state: 'PRIMED', seq: record.seq + 1, counters: bumpCounter(record, payload) };
    }
    if (event === 'INTERVENE' && record.state === 'PRIMED') {
      const esc = record.escalationCount ?? 0;
      const skipTier = esc >= 3 ? 3 : esc >= 2 ? 2 : 1;
      const nextSeq = record.seq + 1;
      const patternOrMember = typeof payload?.patternId === 'string' ? payload.patternId : typeof payload?.memberId === 'string' ? payload.memberId : 'unknown';
      return {
        ...record,
        state: 'INTERVENING',
        tier: skipTier as BehaviorRecord['tier'],
        lastComplianceVerified: false,
        complianceDeadlineSeq: nextSeq + ESCALATION_DEADLINE_WINDOW,
        seq: nextSeq,
        directives: [...record.directives, { seq: nextSeq, verb: 'INTERVENE', patternOrMember }],
        counters: bumpCounter(record, payload),
      };
    }
    if (event === 'COMPLIANCE_VERIFIED' && record.state === 'INTERVENING') {
      const isGenuine = payload?.isGenuine === true || payload?.instrument === 'trident-problem-solving';
      const esc = Math.max(0, (record.escalationCount ?? 0) - (isGenuine ? 1 : 0));
      const probationDeadline = isGenuine ? null : record.seq + 1 + Math.floor(ESCALATION_DEADLINE_WINDOW / 2);
      return {
        ...record,
        state: 'MONITORING',
        tier: 0,
        denialCount: 0,
        escalationCount: esc,
        lastComplianceVerified: true,
        complianceDeadlineSeq: probationDeadline,
        seq: record.seq + 1,
        counters: bumpCounter(record, payload),
      };
    }
    if (event === 'COMPLIANCE_FAILED' && record.state === 'INTERVENING') {
      if (record.tier >= 4) return record;
      const nextTier = Math.min(4, record.tier + 1) as BehaviorRecord['tier'];
      const nextDenial = record.tier >= 3 ? record.denialCount + 1 : record.denialCount;
      const nextEsc = nextTier >= 2 ? (record.escalationCount ?? 0) + 1 : (record.escalationCount ?? 0);
      const window = nextEsc <= 1 ? ESCALATION_DEADLINE_WINDOW : nextEsc === 2 ? 2 : 0;
      const nextDeadline = record.seq + 1 + window;
      return {
        ...record,
        state: 'INTERVENING',
        tier: nextTier,
        denialCount: nextDenial,
        escalationCount: nextEsc,
        lastComplianceVerified: false,
        complianceDeadlineSeq: nextDeadline,
        seq: record.seq + 1,
        counters: bumpCounter(record, payload),
      };
    }
    if (event === 'SEQ_WINDOW' && record.state === 'INTERVENING') {
      const advanced = Number(payload?.advanced);
      if (!Number.isFinite(advanced) || advanced < REFRACTORY_SEQ_WINDOW) return record;
      const noOutstanding = record.directives.length === 0 || record.lastComplianceVerified === true;
      if (!noOutstanding) return record;
      return { ...record, state: 'MONITORING', seq: record.seq + 1 };
    }
    return record;
  } catch (err) {
    throw err;
  }
}
