export interface ToolEvidenceRecord {
  type: 'tool_result';
  tool: string;
  args: Record<string, unknown>;
  exitCode: number;
  output: string;
  timestamp: number;
  signature: string;
}

export interface OffenseRecord {
  layerId: string;
  violation: unknown;
  timestamp: number;
}

export interface DispatchRecord {
  layerId: string;
  tier: number;
  surface: string;
  timestamp: number;
}

export const POOL_TTL_MS = 600_000;
export const GATE_TTL_MS = 300_000;
