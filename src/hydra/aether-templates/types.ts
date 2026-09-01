import { z } from 'zod';

export const LayerCandidateSchema = z.object({
  layer: z.string(),
  predicate: z.string(),
  subject: z.string(),
  object: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  evidence: z.string().min(1),
  implicatedSpecClause: z.string().optional(),
  graphContext: z.object({
    communityId: z.number().optional(),
    degree: z.number().optional(),
    inferredPaths: z.array(z.string()).optional(),
  }).optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  crossReferenced: z.boolean().optional(),
  crossReferencedBy: z.array(z.string()).optional(),
  graphRefs: z.array(z.string()).optional(),
});

export type LayerCandidate = z.infer<typeof LayerCandidateSchema>;

export const SubagentOutputSchema = z.object({
  candidates: z.array(LayerCandidateSchema),
  graphSlice: z.object({
    queriedConcepts: z.array(z.string()),
    relevantSubgraph: z.string(),
  }).optional(),
  summary: z.string(),
});

export type SubagentOutput = z.infer<typeof SubagentOutputSchema>;

export interface AuditorTemplate {
  layerId: string;
  anchorPredicate: string;
  layerNumber: number;
  staticPrompt: string;
  outputSchema: z.ZodSchema;
  graphQueries: string[];
  filterTags?: string[];
}
