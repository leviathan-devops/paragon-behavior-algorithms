// config/trading/index.ts — THE TRADING AGENT REFERENCE DOMAIN
//
// A minimal trading domain: 3 families (risk-limit, stop-loss, disclosure),
// 2 behavioral checks, 4 templates. This is the worked example for any
// domain author building a trading agent's behavior enforcement.

import type { DomainModule, PatternFamilyMember, BehavioralState, WeightedViolation } from '../../core/types.js';

const RISK_LIMIT: PatternFamilyMember = {
  id: 'RISK_LIMIT.position-oversize', kind: 'detector', group: 'verb-frame',
  descriptive: [/\bwithin the mandate\b/i, /\bper the risk engine\b/i, /\bposition limit checked\b/i, /\brisk approved\b/i],
  suggestive: [/\bexceed the position limit\b/i, /\bmax out the allocation\b/i, /\bpush the size\b/i, /\bgo all in\b/i],
  substitute: [/\b(?:exceed|override|ignore|bypass)\s+(?:the\s+)?(?:risk|position|allocation)\s+limit\b/i,
               /\b(?:forgo|skip|omit)\s+(?:the\s+)?risk\s+check\b/i],
  use: [/the risk engine approved the size/i, /per the mandate the position is within limits/i, /backtest confirmed the allocation/i],
  matcher: { kind: 'sentence-frame', positive: ['exceed the position limit', 'max out the allocation'],
             negative: ['the risk engine approved', 'within the mandate'] },
  triggerCondition: '1.6', severity: 'HIGH',
  messageTemplate: 'position limit breach — check the mandate before entry',
  exampleHits: [
    { text: 'exceed the position limit on this trade', shouldFlag: true },
    { text: 'push the size beyond the allocation', shouldFlag: true },
    { text: 'forgo the risk check and enter anyway', shouldFlag: true },
    { text: 'the risk engine approved the position size', shouldFlag: false },
    { text: 'within the mandate for this entry', shouldFlag: false },
  ],
};

const STOP_LOSS: PatternFamilyMember = {
  id: 'STOP_LOSS.evasion', kind: 'detector', group: 'claim-signal',
  descriptive: [/\bstop loss set\b/i, /\bprotected position\b/i, /\bper the strategy\b/i],
  suggestive: [/\bmove the stop\b/i, /\bwiden the stop\b/i, /\bremove the stop\b/i, /\blet it run\b/i],
  substitute: [/\b(?:widen|remove|move|drop)\s+(?:the\s+)?stop\s+loss\b/i],
  use: [/the stop loss is set per the strategy/i, /the risk-reward ratio is confirmed/i],
  matcher: { kind: 'sentence-frame', positive: ['move the stop loss', 'remove the stop'],
             negative: ['the stop loss is set per the strategy'] },
  triggerCondition: '0.9', severity: 'HIGH',
  messageTemplate: 'stop loss evasion — capital preservation is mandatory',
  exampleHits: [
    { text: 'move the stop loss further away', shouldFlag: true },
    { text: 'remove the stop and let it run', shouldFlag: true },
    { text: 'the stop loss is set at 2% per the strategy', shouldFlag: false },
  ],
};

const DISCLOSURE: PatternFamilyMember = {
  id: 'DISCLOSURE.skip', kind: 'detector', group: 'verb-frame',
  descriptive: [/\brisk disclosed\b/i, /\bper the compliance script\b/i, /\bthe disclosure is standard\b/i],
  suggestive: [/\bskip the (?:risk |compliance )?disclosure\b/i, /\bdon.?t (?:mention|disclose) the risk\b/i, /\bomit the (?:risk |compliance )?(?:warning|disclosure)\b/i],
  substitute: [/\b(?:skip|omit|leave out)\s+(?:the\s+)?(?:risk\s+|compliance\s+)?(?:disclosure|warning)\b/i],
  use: [/the disclosure is documented in the trade record/i],
  matcher: { kind: 'sentence-frame', positive: ['skip the risk disclosure', 'omit the warning'],
             negative: ['the disclosure is documented'] },
  triggerCondition: '1.2', severity: 'MEDIUM',
  messageTemplate: 'disclosure skip — the client must be informed of risks',
  exampleHits: [
    { text: 'skip the risk disclosure for this client', shouldFlag: true },
    { text: 'the risk disclosure is in the trade record', shouldFlag: false },
  ],
};

function mv(memberId: string, family: string, weight: number, excerpt: string, st: BehavioralState): WeightedViolation {
  return { memberId, family, weight, excerpt: excerpt.slice(0, 200),
    anchor: { seq: st.seq, ts: Date.now(), sessionID: st.sessionID }, plane: 'reasoning' };
}

export function checkRiskLimitEntry(st: BehavioralState): WeightedViolation | null {
  if (st.claims > 0 && st.verificationCalls === 0) {
    return mv('RISK.unverified-entry', 'RISK_LIMIT', 2.0,
      `entry claimed without risk check (${st.claims} claims, 0 checks)`, st);
  }
  return null;
}

export function checkStopLossPresence(st: BehavioralState): WeightedViolation | null {
  if (st.completionClaims > 0 && st.verificationCalls === 0) {
    return mv('RISK.no-stop-loss', 'STOP_LOSS_EVASION', 1.5,
      `positions opened (${st.completionClaims}) without stop losses`, st);
  }
  return null;
}

const tradingDomain: DomainModule = {
  name: 'trading',
  brandPrefix: 'RISK',
  instrumentName: 'risk-engine',
  instrumentTier3: 'risk-engine',
  families: [RISK_LIMIT, STOP_LOSS, DISCLOSURE],
  behavioralChecks: [checkRiskLimitEntry, checkStopLossPresence],
  templates: {
    steer: (f, a) => `[RISK STEER] Reasoning signals: ${f}. Before your next trade: check the risk mandate and cite the risk engine output. (${a})`,
    demand: (f, a) => `[RISK DEMAND] ${f}: the previous correction was not satisfied. Your next tool call MUST be the risk-engine check — it is never blocked. (${a})`,
    mandate: (t) => `[RISK MANDATE] tier ${t}: this action is blocked. Call the risk-engine check — it is never blocked — then retry.`,
    advisory: (p, s) => `[RISK PATTERN] ${p}: ${s}. Corrective path: run the risk check and cite the output.`,
  },
  thresholds: { RISK_LIMIT: 0.8, STOP_LOSS: 0.9, DISCLOSURE: 1.2 },
  compliance: {
    remediationTools: ['risk-engine', 'position-check', 'mandate-verifier'],
    verificationPatterns: [/risk.?engine|position.?check|mandate.?verify/i, /backtest|stress.?test/i],
    escapeHatches: ['risk-engine', 'position-check', 'mandate-verifier', 'bash'],
  },
  macroPatterns: [
    { id: 'DOUBT_THEN_OVERSIZE', description: 'the agent doubts the trade, then sizes up anyway',
      families: ['DOUBT_HEDGE', 'RISK_LIMIT'], window: 10 },
  ],
  testFixtures: {
    evasionText: 'exceed the position limit and skip the risk check',
    legitimateText: 'the risk engine approved the position size, per the mandate within limits',
  },
};

export default tradingDomain;
