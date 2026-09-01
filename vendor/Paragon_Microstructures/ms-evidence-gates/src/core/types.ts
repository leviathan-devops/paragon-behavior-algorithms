export interface ToolEvidenceRecord {
  type: 'tool_result';
  tool: string;
  args: Record<string, unknown>;
  exitCode: number;
  output: string;
  timestamp: number;
  signature: string;
}

export interface GateCriteria {
  minEvidenceCount: boolean;
  freshness: boolean;
  requiredTypes: boolean;
  allTypes: boolean;
  signatureVerification: boolean;
}

export interface GateResult {
  verdict: 'PASS' | 'INCONCLUSIVE' | 'FAIL';
  criteria: GateCriteria;
  poolSize: number;
  totalFresh?: number;
}
