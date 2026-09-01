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
}

export interface PrearmTarget {
  layerId: string;
  boostAmount: number;
}

export interface LayerBoostConfig {
  layerId: string;
  pbaContextBoost?: {
    families: string[];
    boostAmount: number;
  };
}

export interface PbaBridge {
  onPbaSignal(signal: PbaSignal): void;
  onPbaStateChange(state: PbaStateChange & { sessionId?: string }): void;
  getRecentSignals(sessionId: string, limit: number): PbaSignal[];
  getActiveFamilies(sessionId: string): string[];
  getMacroTier(sessionId: string): number;
}
