export const NODE_TYPES = ['File','Class','Function','Interface','Module','Machine','Actor','Engine','Adapter','Container','Lexicon','Contract','Threshold','Gate','EvidenceFile','SpecClause','Graph','Path'] as const;
export type NodeType = typeof NODE_TYPES[number];
export const PREDICATES = {
  lasme: ['declares','implements','triggers','violates','shouldBe','wraps'] as const,
  mpse: ['evaluates_to','contradicts_oracle','grounded_through','unguarded_threshold'] as const,
  sro: ['caused','derived_from','resolved_to','superseded_by','flagged_by'] as const,
  wiring: ['calls','imports','awaits','exports','unwired'] as const,
} as const;
export type Predicate = (typeof PREDICATES)[keyof typeof PREDICATES][number];
export const ALL_PREDICATES: readonly Predicate[] = [...PREDICATES.lasme, ...PREDICATES.mpse, ...PREDICATES.sro, ...PREDICATES.wiring] as const;
export const NODE_TYPES_SET: ReadonlySet<string> = new Set(NODE_TYPES as readonly string[]);
export const PREDICATE_SET: ReadonlySet<string> = new Set(ALL_PREDICATES as readonly string[]);
export function isNodeType(v: unknown): v is NodeType {
  return typeof v === 'string' && (NODE_TYPES_SET as Set<string>).has(v);
}
export function isPredicate(v: unknown): v is Predicate {
  return typeof v === 'string' && (PREDICATE_SET as Set<string>).has(v);
}
