export type DeliverySurface = 'TEA' | 'TEB' | 'GATE';

export interface WarheadContext {
  count?: number;
  toolName?: string;
  args?: string;
  chainViolations?: string;
  pbaFamilies?: string;
  pbaTier?: number;
  escalationCount?: number;
  correctTool?: string;
  anchor?: string;
}

export interface WarheadLayer {
  id: string;
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
}

export interface PlatformAdapter {
  inject(message: { type: string; content?: string; body?: string; text?: string; [key: string]: unknown }): void;
}

export class StructuredEnforcementError extends Error {
  readonly machine: 'pta' = 'pta';
  readonly detected: string;
  readonly correction: string;
  readonly evidenceRequired: true = true;
  readonly tier: 3 = 3;
  constructor(opts: { detected: string; correction: string }) {
    super(`[PTA ENFORCEMENT] ${opts.detected}`);
    this.name = 'StructuredEnforcementError';
    this.detected = opts.detected;
    this.correction = opts.correction;
  }
}
