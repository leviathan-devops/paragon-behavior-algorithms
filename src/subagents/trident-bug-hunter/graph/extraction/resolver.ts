import { isNodeType, type NodeType } from '../../../../shared/knowledge-graph/ontology.ts';

export type ResolutionVerdict = 'same' | 'related' | 'unrelated';

export interface NewEntity {
  id: string;
  label: string;
  kind: string;
  file?: string | null;
  line?: number | null;
}

export interface ExistingCanonical {
  canonical_id: string;
  label: string;
  kind: string;
}

export interface ResolutionDecision {
  alias: string;
  canonicalId: string;
  verdict: ResolutionVerdict;
  reasoning: string;
  destructive: boolean;
  newEntity: NewEntity;
  existingCanonical: ExistingCanonical | null;
}

export interface ResolverDb {
  prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
  exec(sql: string): void;
}

export interface ResolverHarness {
  decide?(prompt: string): Promise<string>;
  run?(opts: unknown): Promise<{ text: string }>;
}

export class ResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RESOLVER_FAILED';
  }
}

function normalizeLabel(s: string): string { return s.trim().toLowerCase(); }

function tokenize(s: string): string[] {
  return s.split(/[^a-zA-Z0-9]+/).map((t) => t.toLowerCase()).filter((t) => t.length > 0);
}

function shareSignificantToken(a: string, b: string, minLen = 5): boolean {
  const aToks = tokenize(a);
  const bToks = tokenize(b);
  for (const at of aToks) {
    if (at.length < minLen) continue;
    for (const bt of bToks) {
      if (bt.length < minLen) continue;
      if (at === bt) return true;
      if (at.includes(bt) || bt.includes(at)) {
        const shorter = at.length < bt.length ? at : bt;
        if (shorter.length >= minLen) return true;
      }
    }
  }
  const an = normalizeLabel(a);
  const bn = normalizeLabel(b);
  if (an.length >= minLen && bn.length >= minLen) {
    if (an.includes(bn) || bn.includes(an)) return true;
    for (let i = 0; i + minLen <= an.length; i++) {
      const sub = an.slice(i, i + minLen);
      if (bn.includes(sub)) return true;
    }
  }
  return false;
}

function buildPrompt2Batch(newEntities: NewEntity[], existing: ExistingCanonical[]): string {
  const newLines = newEntities.map((e) => `- alias="${e.id}" label="${e.label}" kind=${e.kind} file=${e.file ?? ''}:${e.line ?? ''}`).join('\n');
  const existingLines = existing.length > 0 ? existing.map((c) => `- canonical="${c.canonical_id}" label="${c.label}" kind=${c.kind}`).join('\n') : '- (no existing canonicals — all new)';
  return `# SRO PROMPT 2 — RESOLUTION (B2b, batch, PRE-INSERTION)

You are the SRO resolver. This is a BATCH job over NEW entities BEFORE insertion (MC-B-03 — retrofitting is harder than upfront).
For each new entity, decide against existing canonical candidates:

Verdicts:
- same → one canonical (casing/alias collapse) — e.g. IntentComputeHealth / intentComputeHealth.ts / audit-layer alias → ONE canonical
- related → distinct but linked — e.g. ThresholdHelper:40 vs TVDThresholds:38 → RELATED (not merged)
- unrelated → different entity, no merge — e.g. name collision with different shapes

Output JSON shape: { "decisions": [{ "alias": string, "canonical_id": string, "verdict": "same"|"related"|"unrelated", "reasoning": string, "destructive": boolean }] }
Destructive=true means merging would lose shape distinction and MUST be REFUSED (alias kept as separate canonical).

NEW ENTITIES (to resolve):
${newLines}

EXISTING CANONICALS:
${existingLines}

Rules:
- same requires kind compatibility (same or subtype) and normalized label equality; casing differences are same.
- related requires shared significant token (≥5 chars) but distinct identity.
- unrelated is the default when no significant overlap.
- destructive=true when same normalized label but incompatible kinds (e.g. File vs Class) — the merge is REFUSED.
`;
}

function heuristicDecide(newEntity: NewEntity, existing: ExistingCanonical[]): { canonical: ExistingCanonical | null; verdict: ResolutionVerdict; reasoning: string; destructive: boolean } {
  if (existing.length === 0) {
    return { canonical: null, verdict: 'unrelated', reasoning: `no existing canonicals — "${newEntity.label}" is new`, destructive: false };
  }
  for (const c of existing) {
    if (normalizeLabel(newEntity.label) === normalizeLabel(c.label) && normalizeLabel(newEntity.kind) === normalizeLabel(c.kind)) {
      return { canonical: c, verdict: 'same', reasoning: `casing/alias collapse: "${newEntity.label}" (${newEntity.kind}) lower-equals "${c.label}" (${c.kind})`, destructive: false };
    }
  }
  for (const c of existing) {
    if (normalizeLabel(newEntity.label) === normalizeLabel(c.label) && normalizeLabel(newEntity.kind) !== normalizeLabel(c.kind)) {
      return { canonical: c, verdict: 'unrelated', reasoning: `name collision with different shapes: "${newEntity.label}" kind=${newEntity.kind} vs "${c.label}" kind=${c.kind} — destructive merge REFUSED`, destructive: true };
    }
    if (normalizeLabel(newEntity.id) === normalizeLabel(c.canonical_id) && normalizeLabel(newEntity.kind) !== normalizeLabel(c.kind)) {
      return { canonical: c, verdict: 'unrelated', reasoning: `id collision with different shapes: "${newEntity.id}" vs "${c.canonical_id}"`, destructive: true };
    }
  }
  for (const c of existing) {
    if (shareSignificantToken(newEntity.label, c.label) || shareSignificantToken(newEntity.id, c.canonical_id) || shareSignificantToken(newEntity.id, c.label) || shareSignificantToken(newEntity.label, c.canonical_id)) {
      return { canonical: c, verdict: 'related', reasoning: `shared significant token between "${newEntity.label}" and "${c.label}" (kind ${newEntity.kind} vs ${c.kind}) — distinct, linked`, destructive: false };
    }
  }
  for (const c of existing) {
    const nid = normalizeLabel(newEntity.id);
    const cid = normalizeLabel(c.canonical_id);
    if (nid.includes(cid) || cid.includes(nid)) {
      if (nid.length >= 5 && cid.length >= 5) {
        return { canonical: c, verdict: 'related', reasoning: `id fragmentation: "${newEntity.id}" shares fragment with "${c.canonical_id}"`, destructive: false };
      }
    }
  }
  return { canonical: null, verdict: 'unrelated', reasoning: `no significant overlap for "${newEntity.label}" (${newEntity.kind}) against ${existing.length} canonicals`, destructive: false };
}

export interface ResolveEntitiesOptions {
  db?: ResolverDb | null;
  runId?: string;
  harness?: ResolverHarness | null;
  strict?: boolean;
}

export async function resolveEntities(
  newEntities: NewEntity[],
  existing: ExistingCanonical[],
  harness: ResolverHarness | null = null,
  opts: ResolveEntitiesOptions = {},
): Promise<ResolutionDecision[]> {
  const effectiveHarness = harness ?? opts.harness ?? null;
  const db = opts.db ?? null;
  const runId = opts.runId ?? `run-${Date.now()}`;
  if (!Array.isArray(newEntities)) throw new ResolverError('RESOLVER_FAILED: newEntities must be an array');
  if (!Array.isArray(existing)) throw new ResolverError('RESOLVER_FAILED: existing must be an array');
  for (const e of newEntities) {
    if (!e || typeof e !== 'object') throw new ResolverError(`RESOLVER_FAILED: newEntity must be object, got ${typeof e}`);
    if (typeof e.id !== 'string' || e.id.trim().length === 0) throw new ResolverError(`RESOLVER_FAILED: newEntity.id must be non-empty string, got ${JSON.stringify(e.id)}`);
    if (typeof e.label !== 'string' || e.label.trim().length === 0) throw new ResolverError(`RESOLVER_FAILED: newEntity.label must be non-empty string, got ${JSON.stringify(e.label)}`);
    if (typeof e.kind !== 'string' || e.kind.trim().length === 0) throw new ResolverError(`RESOLVER_FAILED: newEntity.kind must be non-empty string, got ${JSON.stringify(e.kind)}`);
  }
  for (const c of existing) {
    if (!c || typeof c !== 'object') throw new ResolverError(`RESOLVER_FAILED: existing entry must be object, got ${typeof c}`);
    if (typeof c.canonical_id !== 'string' || c.canonical_id.trim().length === 0) throw new ResolverError(`RESOLVER_FAILED: existing canonical_id must be non-empty`);
  }
  const prompt = buildPrompt2Batch(newEntities, existing);
  let harnessDecisions: ResolutionDecision[] | null = null;
  if (effectiveHarness && typeof effectiveHarness.decide === 'function') {
    try {
      const raw = await effectiveHarness.decide(prompt);
      if (typeof raw === 'string' && raw.trim().length > 0) {
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch (e: unknown) { throw new ResolverError(`RESOLVER_FAILED: harness returned non-JSON — ${e instanceof Error ? e.message : String(e)}`); }
        const obj = parsed as Record<string, unknown>;
        const arr: unknown[] = Array.isArray(obj.decisions) ? obj.decisions as unknown[] : Array.isArray(parsed) ? parsed as unknown[] : [];
        const decisions: ResolutionDecision[] = [];
        for (const d of arr) {
          if (!d || typeof d !== 'object') continue;
          const rec = d as Record<string, unknown>;
          const alias = typeof rec.alias === 'string' ? String(rec.alias).trim() : '';
          const canonicalId = typeof rec.canonical_id === 'string' ? String(rec.canonical_id).trim() : typeof rec.canonicalId === 'string' ? String(rec.canonicalId).trim() : '';
          const verdict = typeof rec.verdict === 'string' ? rec.verdict.trim() as ResolutionVerdict : null;
          const reasoning = typeof rec.reasoning === 'string' ? rec.reasoning : '';
          const destructive = Boolean(rec.destructive);
          if (!alias || !verdict || !['same','related','unrelated'].includes(verdict)) continue;
          const newEnt = newEntities.find((n) => n.id === alias || n.label === alias) ?? { id: alias, label: alias, kind: 'Class' };
          const existCanon = existing.find((c) => c.canonical_id === canonicalId) ?? null;
          decisions.push({ alias, canonicalId: canonicalId || alias, verdict, reasoning: reasoning || `harness verdict ${verdict}`, destructive, newEntity: newEnt, existingCanonical: existCanon });
        }
        if (decisions.length === newEntities.length) harnessDecisions = decisions;
      }
    } catch (e: unknown) {
      if (e instanceof ResolverError) throw e;
      throw new ResolverError(`RESOLVER_FAILED: harness decide threw — ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (effectiveHarness && typeof effectiveHarness.run === 'function') {
    try {
      const res = await effectiveHarness.run({ prompt, newEntities, existing }) as { text?: string };
      if (res && typeof res.text === 'string' && res.text.trim().length > 0) {
        try {
          const parsed = JSON.parse(res.text);
          const obj = parsed as Record<string, unknown>;
          if (Array.isArray(obj.decisions)) {
            const decisions: ResolutionDecision[] = [];
            for (const d of obj.decisions as unknown[]) {
              const rec = d as Record<string, unknown>;
              const alias = String(rec.alias ?? '').trim();
              const canonicalId = String((rec.canonical_id ?? rec.canonicalId ?? alias) as string).trim();
              const verdict = String(rec.verdict ?? '').trim() as ResolutionVerdict;
              if (!['same','related','unrelated'].includes(verdict)) continue;
              const newEnt = newEntities.find((n) => n.id === alias) ?? { id: alias, label: alias, kind: 'Class' };
              const existCanon = existing.find((c) => c.canonical_id === canonicalId) ?? null;
              decisions.push({ alias, canonicalId, verdict, reasoning: String(rec.reasoning ?? ''), destructive: Boolean(rec.destructive), newEntity: newEnt, existingCanonical: existCanon });
            }
            if (decisions.length === newEntities.length) harnessDecisions = decisions;
          }
        } catch (parseErr: unknown) {
          throw new ResolverError(`RESOLVER_FAILED: harness run returned non-JSON — ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        }
      }
    } catch (e: unknown) {
      if (e instanceof ResolverError) throw e;
      throw new ResolverError(`RESOLVER_FAILED: harness run threw — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const decisions: ResolutionDecision[] = harnessDecisions ?? newEntities.map((ne) => {
    const h = heuristicDecide(ne, existing);
    const canonicalId = h.canonical ? h.canonical.canonical_id : ne.id;
    const verdict: ResolutionVerdict = h.verdict;
    return {
      alias: ne.id,
      canonicalId,
      verdict,
      reasoning: h.reasoning,
      destructive: h.destructive,
      newEntity: ne,
      existingCanonical: h.canonical,
    };
  });
  if (db) {
    for (const d of decisions) {
      if (d.verdict === 'unrelated' && d.destructive) {
        try {
          db.prepare('INSERT OR REPLACE INTO resolutions (alias, canonical_id, verdict, reasoning, created_run) VALUES (?,?,?,?,?)').run(d.alias, d.alias, d.verdict, d.reasoning, runId);
        } catch (e: unknown) {
          throw new ResolverError(`RESOLVER_FAILED: resolutions write failed for alias=${d.alias} — ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
      if (d.verdict === 'same') {
        const target = d.existingCanonical ? d.existingCanonical.canonical_id : d.canonicalId;
        try {
          db.prepare('INSERT OR REPLACE INTO resolutions (alias, canonical_id, verdict, reasoning, created_run) VALUES (?,?,?,?,?)').run(d.alias, target, d.verdict, d.reasoning, runId);
        } catch (e: unknown) {
          throw new ResolverError(`RESOLVER_FAILED: resolutions write failed for alias=${d.alias} → ${target} — ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        try {
          db.prepare('INSERT OR REPLACE INTO resolutions (alias, canonical_id, verdict, reasoning, created_run) VALUES (?,?,?,?,?)').run(d.alias, d.canonicalId, d.verdict, d.reasoning, runId);
        } catch (e: unknown) {
          throw new ResolverError(`RESOLVER_FAILED: resolutions write failed for alias=${d.alias} — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }
  return decisions;
}

export function buildPrompt2Demand(newEntities: NewEntity[], existing: ExistingCanonical[]): string {
  if (!Array.isArray(newEntities) || newEntities.length === 0) throw new ResolverError('RESOLVER_FAILED: newEntities must be non-empty array for Prompt 2 demand');
  return buildPrompt2Batch(newEntities, existing);
}

export { shareSignificantToken };
