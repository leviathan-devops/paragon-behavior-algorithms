export interface EnforcementEvent {
  type: string;
  sessionId?: string;
  layerId?: string;
  tier?: number;
  timestamp: number;
  [key: string]: unknown;
}

export interface PersistenceConfig {
  stateDir: string;
}
