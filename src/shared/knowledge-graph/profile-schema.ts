// src/shared/knowledge-graph/profile-schema.ts
// THE ZOD CONTRACT — the ONLY project-specific artifact in the machine (W1).
// The engines are the constant; the profile is the variable (D1, spec §3.1/§4.2/§8.1).
// D26 — this schema FREEZES at W1: a later field addition requires the spec
// amendment + the `profileVersion` bump. A drift here poisons W2-W10.
//
// The file is the contract ONLY — no logic, no loader, no side effects.
// The existence checks (project.root / corpus / failureLogs) live in the loader
// with their NAMED errors (PROFILE_INVALID / CORPUS_MISSING / HISTORY_MISSING),
// not in the schema (a zod `.refine(fs.existsSync)` would break the pure-data
// contract and hide the named-error vocabulary).
//
// Shape authority: spec §4.2 lines 1754-1791 (the frozen zod block), cross-checked
// against §3.1 lines 420-461 and §8.1 lines 3644-3682. Installed zod is 4.1.8.

import { z } from 'zod';

/** A declared pipeline stage — id/entry/contract, each string min(1) (§3.1:424-428). */
export const PipelineStageSchema = z.object({
  id: z.string().min(1),       // unique per profile
  entry: z.string().min(1),    // the function/entry symbol the stage starts at
  contract: z.string().min(1), // the stage's declared invariant (prose, quoted from the corpus)
});
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** The frozen ProjectProfile contract (§4.2:1757-1789). */
export const ProjectProfileSchema = z.object({
  // D26 — the freeze contract; a field addition bumps this (§3.1:432).
  // §3.1 uses z.number().int().default(1); §4.2 uses z.number().default(1).
  // The .int() form is the stricter superset (an int IS a number) — a profile
  // valid under §4.2 passes under §3.1. The stricter form wins (the divergence
  // is recorded in the honest notes).
  profileVersion: z.number().int().default(1),
  project: z.object({
    name: z.string().min(1),
    root: z.string().min(1),           // the absolute project root (the loader verifies it exists)
    languages: z.array(z.string()).min(1),
    entryPoints: z.array(z.string()).min(1),
    build: z.string().min(1),          // the build command (the container verify uses it)
    test: z.string().min(1),           // the test command
  }),
  graph: z.object({
    substrate: z.enum(['corbell', 'ix', 'native-ast']), // D2/D4/D5 — the profile selects the adapter
    scope: z.array(z.string()).min(1),                  // the dirs the graph builds (e.g. ['src', 'identity'])
    excludes: z.array(z.string()).default([]),          // e.g. ['node_modules', 'dist', '.trident']
    // THE WARM-INDEX SKIP (HT-BUG-16): rebuild=false → the adapter skips the
    // minutes-long `graph build` and hunts READS against the existing store.
    // The index is built EXPLICITLY when the tree changes — never per-hunt.
    rebuild: z.boolean().optional(),
  }),
  rules: z.object({
    corpus: z.array(z.string()).min(1),      // the spec/bible/context .md paths (validated to EXIST at load)
    // zod 4.1.8: z.record requires the key type + the value type (the zod-3
    // one-arg form does not typecheck; the spec was written against the object API).
    bindings: z.record(z.string(), z.any()).default({}), // the predicate parameters (the P1-P22 bindings for Plutus)
  }),
  pipeline: z.object({
    stages: z.array(PipelineStageSchema).min(1), // the declared stages (id/entry/contract)
  }),
  history: z.object({
    failureLogs: z.array(z.string()).default([]), // the violation-history docs (validated to EXIST at load)
  }),
  awareness: z.object({
    docs: z.array(z.string()).default([]), // the canon-doc pointers (the RECON actor's read)
  }),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

/**
 * Compatibility alias — §4.2/§8.1 name the schema const `ProjectProfile`
 * (§4.2:1757, §8.1:3648); §3.1 names it `ProjectProfileSchema` (§3.1:431).
 * Both names are exported so any W2+ consumer compiles against either.
 */
export const ProjectProfile = ProjectProfileSchema;
