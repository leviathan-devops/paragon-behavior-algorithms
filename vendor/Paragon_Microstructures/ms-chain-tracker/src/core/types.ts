export type ViolationType = 'MISSING_PREREQUISITE' | 'FORBIDDEN_PRECEDENT' | 'LOOP_DETECTED' | 'SEQUENCE_REVERSED';

export interface ChainRule {
  name: string;
  description: string;
  requires?: Array<{
    tool: string | RegExp;
    args?: Record<string, string | RegExp>;
    withinMs?: number;
  }>;
  forbids?: Array<{
    tool: string | RegExp;
    withinMs?: number;
  }>;
  violation: {
    layerId: string;
    customMessage?: string;
  };
}

export interface ChainViolation {
  ruleName: string;
  violationType: ViolationType;
  expectedTool: string;
  actualContext: string;
  layerId: string;
}

export interface CallRecord {
  tool: string;
  at: number;
  args?: Record<string, unknown>;
  exitCode?: number;
  output?: string;
}
