export interface FourBankFamily {
  id?: string;
  descriptive: RegExp[];
  suggestive: RegExp[];
  substitute: RegExp[];
  use: RegExp[];
}

export interface ScoreResult {
  pos: number;
  neg: number;
  evidence: string;
}

export type ConfidenceBand = 'ENFORCE' | 'DAMPEN' | 'SUPPRESS';

export interface WeightedViolation {
  familyId: string | number;
  pos: number;
  neg: number;
  confidence: number;
  weight: number;
  evidence: string;
}
