export interface PbaSignal {
  family: string;
  confidence: number;
  excerpt: string;
  seq: number;
  sessionId: string;
}

export interface IntentSources {
  toolMatch: { toolName: string; matchedPattern: string | null; confidence: number };
  chainContext: { previousTools: string[]; chainViolations: string[]; confidence: number };
  pbaContext: { activeFamilies: string[]; latestSignals: PbaSignal[]; macroTier: number; confidence: number };
}

export interface ToolIntent {
  action: 'ALLOW' | 'ADVISE' | 'BLOCK';
  layerId: string | null;
  confidence: number;
  tier: number;
  sources: IntentSources;
}

export interface LayerShape {
  id: string;
  threshold: number;
  banks: {
    descriptive: RegExp[];
    suggestive: RegExp[];
    substitute: RegExp[];
    use: RegExp[];
  };
  toolMatchers: Array<{
    toolName: string | RegExp;
    argPatterns?: Record<string, (string | RegExp)[]>;
  }>;
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
}
