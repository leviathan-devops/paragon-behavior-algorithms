import { z } from 'zod';

export const AdjudicationSchema = z.enum(['TRUE_DEFECT', 'RED_HERRING', 'UNCLEAR']);
export type Adjudication = z.infer<typeof AdjudicationSchema>;

export const DerailmentModeSchema = z.enum(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
export type DerailmentMode = z.infer<typeof DerailmentModeSchema>;

export const VerdictSchema = z.object({
  findingIndex: z.number().int().nonnegative(),
  layer: z.string().min(1),
  adjudication: AdjudicationSchema,
  file: z.string().min(1),
  line: z.number().int().positive(),
  specPath: z.string().optional(),
  specLine: z.number().int().positive().optional(),
  specQuote: z.string().optional(),
  codeQuote: z.string().optional(),
  divergence: z.string().optional(),
  legitimizingReason: z.string().optional(),
  missingEvidence: z.string().optional(),
  confidence: z.number().min(0.55).max(1.0),
  derailmentMode: DerailmentModeSchema.optional(),
});

export type Verdict = z.infer<typeof VerdictSchema>;

export const VerdictsFileSchema = z.object({
  runId: z.string().min(1),
  verdicts: z.array(VerdictSchema),
});

export interface VerdictsFile {
  readonly runId: string;
  readonly verdicts: readonly Verdict[];
}

export function parseVerdictsFile(raw: unknown): VerdictsFile {
  return VerdictsFileSchema.parse(raw) as VerdictsFile;
}
