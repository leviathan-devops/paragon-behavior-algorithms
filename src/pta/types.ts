export type BehaviorState = "IDLE" | "MONITORING" | "PRIMED" | "INTERVENING";
export interface BehaviorRecord {
  state: BehaviorState;
  tier: 0 | 1 | 2 | 3 | 4;
  denialCount: number;
  escalationCount: number;
  lastComplianceVerified: boolean | null;
  complianceDeadlineSeq: number | null;
  seq: number;
  counters: Record<string, number>;
  directives: Array<{ seq: number; verb: string; patternOrMember: string }>;
}
export type EnforcementSurface = "TEA" | "TEB" | "GATE";

export interface ToolChainLayer {
  id: string;
  description: string;
  toolMatchers: Array<{
    toolName: string | RegExp;
    argPatterns?: Record<string, (string | RegExp)[]>;
  }>;
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
  enforcement: {
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
  };
  threshold: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  chainRules?: ChainRule[];
}

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

export interface ToolChainModule {
  name: string;
  brandPrefix: string;
  layers: ToolChainLayer[];
  chainRules: ChainRule[];
  compliance: {
    escapeHatches: string[];
    remediationTools: string[];
    verificationPatterns: RegExp[];
  };
  pbaBridge: {
    enabled: boolean;
    signalFilter?: string[];
    contextWindowSize?: number;
    confidenceBoost?: number;
  };
}

export interface ToolIntentSources {
  toolMatch: { toolName: string; matchedPattern: string | null; confidence: number };
  chainContext: { previousTools: string[]; chainViolations: string[]; confidence: number };
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number; confidence: number };
}

export interface ToolIntent {
  action: "ALLOW" | "ADVISE" | "BLOCK";
  layerId: string | null;
  confidence: number;
  tier: number;
  sources: ToolIntentSources;
}

export interface PbaSignal {
  family: string;
  confidence: number;
  excerpt: string;
  seq: number;
  sessionId: string;
}

export interface PbaStateChange {
  tier: number;
  escalationCount: number;
  activeFamilies: string[];
  lastWarheadBody: string | null;
  sessionId?: string;
}

export interface PtaSessionState {
  sessionId: string;
  record: BehaviorRecord;
  chainState: {
    callHistory: Array<{ tool: string; at: number; exitCode?: number; args?: Record<string, unknown> }>;
    activeViolations: Array<{ ruleName: string; layerId: string }>;
  };
  pbaSignals: PbaSignal[];
  behavioral: {
    toolCalls: number;
    verificationCalls: number;
    completionClaims: number;
    lastClaimTimestamp: number | null;
  };
  lastDispatchedTier: Map<string, number>;
}

export interface EnforcementEvent {
  type: "tool.call.started" | "tool.call.completed" | "tool.execute.before" | "tool.execute.after" | string;
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
  output?: string;
  exitCode?: number;
  timestamp?: number;
}

export interface PlatformAdapter {
  normalizeEvent(raw: unknown): EnforcementEvent | null;
  inject(message: { type: string; content: string; sessionId?: string }): void;
  interceptTool(event: EnforcementEvent): void;
  observeTool(event: EnforcementEvent): void;
  observeCompletion(event: EnforcementEvent): void;
}

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
