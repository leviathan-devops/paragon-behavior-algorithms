import type { TypedTriple } from './mechanical.ts';
import type { Predicate } from '../../../../shared/knowledge-graph/ontology.ts';

export interface MergedTriple extends TypedTriple {
  source: 'mechanical' | 'semantic' | 'both';
  conflict: boolean;
  conflictReason: string | null;
  anchorFile: string | null;
  anchorLine: number | null;
}

export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MERGE_FAILED';
  }
}

function normalizeCanonical(id: string): string {
  return id.trim().toLowerCase();
}

function tripleKey(triple: TypedTriple): string {
  return `${normalizeCanonical(triple.subject)}|${triple.predicate}|${normalizeCanonical(triple.object)}`;
}

function subjectObjectKey(triple: TypedTriple): string {
  return `${normalizeCanonical(triple.subject)}|${normalizeCanonical(triple.object)}`;
}

function buildMechanicalIndex(mechanical: TypedTriple[]): {
  byKey: Map<string, TypedTriple>;
  byPair: Map<string, TypedTriple[]>;
  bySubject: Map<string, TypedTriple[]>;
  subjects: Set<string>;
  objects: Set<string>;
} {
  const byKey = new Map<string, TypedTriple[]>();
  const byPair = new Map<string, TypedTriple[]>();
  const bySubject = new Map<string, TypedTriple[]>();
  const subjects = new Set<string>();
  const objects = new Set<string>();
  for (const t of mechanical) {
    const k = tripleKey(t);
    const p = subjectObjectKey(t);
    const sn = normalizeCanonical(t.subject);
    const on = normalizeCanonical(t.object);
    subjects.add(sn);
    objects.add(on);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(t);
    if (!byPair.has(p)) byPair.set(p, []);
    byPair.get(p)!.push(t);
    if (!bySubject.has(sn)) bySubject.set(sn, []);
    bySubject.get(sn)!.push(t);
  }
  // Collapse to single representative per key (take first — mechanical triples with same key are deduped by file:line)
  const singleByKey = new Map<string, TypedTriple>();
  for (const [k, arr] of byKey.entries()) singleByKey.set(k, arr[0]);
  return { byKey: singleByKey, byPair, bySubject, subjects, objects };
}

export interface MergeOptions {
  flagContradictions?: boolean;
}

export function mergePasses(mechanical: TypedTriple[], semantic: TypedTriple[], opts: MergeOptions = {}): MergedTriple[] {
  if (!Array.isArray(mechanical)) throw new MergeError('MERGE_FAILED: mechanical must be an array');
  if (!Array.isArray(semantic)) throw new MergeError('MERGE_FAILED: semantic must be an array');
  const flagContradictions = opts.flagContradictions !== false;

  for (const t of [...mechanical, ...semantic]) {
    if (!t || typeof t !== 'object') throw new MergeError(`MERGE_FAILED: triple must be object, got ${typeof t}`);
    if (typeof t.subject !== 'string' || t.subject.trim().length === 0) throw new MergeError(`MERGE_FAILED: triple missing subject: ${JSON.stringify(t).slice(0, 200)}`);
    if (typeof t.object !== 'string' || t.object.trim().length === 0) throw new MergeError(`MERGE_FAILED: triple missing object: ${JSON.stringify(t).slice(0, 200)}`);
    if (typeof t.predicate !== 'string' || t.predicate.trim().length === 0) throw new MergeError(`MERGE_FAILED: triple missing predicate: ${JSON.stringify(t).slice(0, 200)}`);
    if (typeof t.evidence !== 'string' || t.evidence.trim().length === 0) throw new MergeError(`MERGE_FAILED: triple missing evidence (MC-B-02): ${JSON.stringify(t).slice(0, 200)}`);
  }

  const index = buildMechanicalIndex(mechanical);
  const merged: MergedTriple[] = [];
  const seenMechanicalKeys = new Set<string>();

  for (const m of mechanical) {
    const k = tripleKey(m);
    if (seenMechanicalKeys.has(k)) continue;
    seenMechanicalKeys.add(k);
    merged.push({
      ...m,
      evidence: m.evidence.trim().slice(0, 500),
      confidence: 1.0,
      source: 'mechanical',
      conflict: false,
      conflictReason: null,
      anchorFile: m.file ?? null,
      anchorLine: m.line ?? null,
    });
  }

  for (const s of semantic) {
    const k = tripleKey(s);
    const pair = subjectObjectKey(s);
    const mechExact = index.byKey.get(k);
    const mechPairGroup = index.byPair.get(pair) ?? [];

    if (mechExact) {
      const anchor = mechExact;
      const inheritedFile = anchor.file;
      const inheritedLine = anchor.line;
      merged.push({
        subject: s.subject.trim(),
        predicate: s.predicate as Predicate,
        object: s.object.trim(),
        evidence: s.evidence.trim().slice(0, 500),
        confidence: s.confidence,
        file: inheritedFile || s.file,
        line: inheritedLine || s.line,
        subjectKind: s.subjectKind ?? anchor.subjectKind,
        objectKind: s.objectKind ?? anchor.objectKind,
        source: 'both',
        conflict: false,
        conflictReason: null,
        anchorFile: anchor.file ?? null,
        anchorLine: anchor.line ?? null,
      });
      continue;
    }

    if (flagContradictions && mechPairGroup.length > 0) {
      const mechPredicates = mechPairGroup.map((x) => x.predicate).join(',');
      const anchor = mechPairGroup[0];
      const inheritedFile = anchor.file;
      const inheritedLine = anchor.line;
      // CONFLICT: same subject/object pair but different predicate — both kept + flagged (L8 contradiction class, never silently resolved)
      for (const mech of mechPairGroup) {
        // mark the mechanical already emitted as conflicted (retro-flag)
        const existing = merged.find((x) => tripleKey(x) === tripleKey(mech));
        if (existing && !existing.conflict) {
          existing.conflict = true;
          existing.conflictReason = `CONTRADICTION: mechanical predicate=${mech.predicate} vs semantic predicate=${s.predicate} for ${s.subject}->${s.object} (both preserved, flagged as L8 contradiction)`;
        }
      }
      merged.push({
        subject: s.subject.trim(),
        predicate: s.predicate as Predicate,
        object: s.object.trim(),
        evidence: s.evidence.trim().slice(0, 500),
        confidence: s.confidence,
        file: inheritedFile || s.file,
        line: inheritedLine || s.line,
        subjectKind: s.subjectKind,
        objectKind: s.objectKind,
        source: 'semantic',
        conflict: true,
        conflictReason: `CONTRADICTION: mechanical predicate(s)=[${mechPredicates}] vs semantic predicate=${s.predicate} for ${s.subject}->${s.object} — Pass A exactness anchors, Pass B semantics kept, flagged never silently resolved`,
        anchorFile: anchor.file ?? null,
        anchorLine: anchor.line ?? null,
      });
      continue;
    }

    // Check subject or object resolves to A node → inherit file:line anchor
    const subjNorm = normalizeCanonical(s.subject);
    const objNorm = normalizeCanonical(s.object);
    const subjectResolves = index.subjects.has(subjNorm) || index.objects.has(subjNorm);
    const objectResolves = index.subjects.has(objNorm) || index.objects.has(objNorm);
    let anchorFile: string | null = null;
    let anchorLine: number | null = null;
    if (subjectResolves || objectResolves) {
      const candidates: TypedTriple[] = [];
      const subjHits = index.bySubject.get(subjNorm) ?? [];
      candidates.push(...subjHits);
      // also search objects index for either side
      for (const m of mechanical) {
        if (normalizeCanonical(m.object) === subjNorm || normalizeCanonical(m.subject) === objNorm || normalizeCanonical(m.object) === objNorm) {
          if (!candidates.includes(m)) candidates.push(m);
        }
      }
      if (candidates.length > 0) {
        anchorFile = candidates[0].file ?? null;
        anchorLine = candidates[0].line ?? null;
      }
    }

    const resolvedFile = (subjectResolves || objectResolves) && anchorFile ? anchorFile : s.file;
    const resolvedLine = (subjectResolves || objectResolves) && anchorLine ? anchorLine : s.line;

    merged.push({
      subject: s.subject.trim(),
      predicate: s.predicate as Predicate,
      object: s.object.trim(),
      evidence: s.evidence.trim().slice(0, 500),
      confidence: s.confidence,
      file: resolvedFile,
      line: resolvedLine,
      subjectKind: s.subjectKind,
      objectKind: s.objectKind,
      source: 'semantic',
      conflict: false,
      conflictReason: null,
      anchorFile: anchorFile,
      anchorLine: anchorLine,
    });
  }

  return merged;
}

export function flagContradictions(triples: MergedTriple[]): MergedTriple[] {
  return triples.filter((t) => t.conflict);
}
