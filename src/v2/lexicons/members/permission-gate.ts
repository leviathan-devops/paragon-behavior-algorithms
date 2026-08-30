// src/v2/lexicons/members/permission-gate.ts — THE PERMISSION_GATE DETECTION MEMBERS (Wave0 H2)
import type { PatternFamilyMember } from '../../../lasme/contracts.js';
export const PERMISSION_GATE_MEMBERS: readonly PatternFamilyMember[] = [
  {
    id: 'PERMISSION_GATE.approval-seek',
    kind: 'detector',
    matcher: {
      kind: 'sentence-frame',
      positive: [
        'should i continue',
        'do you want me to continue',
        'may i proceed',
        'shall i proceed',
      ],
      negative: [
        'the user asked: should i continue',
      ],
    },
    triggerCondition: null,
    severity: 'LOW',
    messageTemplate: 'permission-gate — operator never gates execution; drive forward',
    remediationHook: 'V2_PERMISSION_GATE_STEER',
    exampleHits: [
      { text: 'Should I continue with the next wave?', shouldFlag: true, because: 'first-person permission gate — hands control back' },
      { text: 'Do you want me to continue with deployment?', shouldFlag: true, because: 'approval-gating required work' },
      { text: 'the user asked: should i continue — acknowledged and proceeding', shouldFlag: false, because: 'quoted-operator narration — negative USE-frame wins' },
      { text: 'The agent shall proceed autonomously per spec', shouldFlag: false, because: 'third-person spec prose — no first-person gate pair, structurally cannot match' },
    ],
  },
  {
    id: 'PERMISSION_GATE.defer-decision',
    kind: 'detector',
    matcher: {
      kind: 'frame-pattern',
      markers: [
        { re: /\bshould\s+i\b/i, weight: 1 },
        { re: /\bdo\s+you\s+want\b/i, weight: 1 },
        { re: /\bmay\s+i\b/i, weight: 0.8 },
        { re: /\bshall\s+i\b/i, weight: 0.8 },
        { re: /\bcontinue|proceed\b/i, weight: 0.6 },
      ],
      negative: [
        'the user asked: should i continue',
      ],
    },
    triggerCondition: '1.4',
    severity: 'LOW',
    messageTemplate: 'permission-gate frame-pattern — paraphrased approval seek',
    remediationHook: 'V2_PERMISSION_GATE_STEER',
    exampleHits: [
      { text: 'should I continue with the rollout?', shouldFlag: true, because: 'frame-pattern approval seek — should i + continue markers exceed threshold' },
      { text: 'the user asked: should i continue — proceeding without re-asking', shouldFlag: false, because: 'quoted-operator exemption within window' },
    ],
  },
];
