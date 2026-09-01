import { createHash } from 'node:crypto';
import type { ProvenanceAnchor } from './contract.ts';
export interface OracleDeclaration {
  readonly exprId: string;
  readonly oracleValue: number | boolean | readonly (string | number)[];
  readonly anchor: ProvenanceAnchor;
  readonly unit?: string;
  readonly epsilon?: number;
}
export interface OracleRegistry {
  register(decl: OracleDeclaration): void;
  get(exprId: string): OracleDeclaration | undefined;
  size(): number;
  contentHash(): string;
  discharge(exprId: string, evaluated: number | boolean | readonly (string | number)[]): boolean;
  verifyAndDischarge(exprId: string, evaluated: number | boolean | readonly (string | number)[]): { discharged: boolean; epsilonEnforced: boolean };
}
function isFiniteEpsilon(e: unknown): boolean {
  return typeof e === 'number' && Number.isFinite(e) && e >= 0;
}
export const UNIMPLEMENTED_ORACLE_TODO = 'TODO(oracle): wire declared oracle to discharge — caller must invoke registry.discharge(exprId, evaluated) post-eval; see contract.ts stage inv→DIE';
export function createOracleRegistry(): OracleRegistry {
  const store = new Map<string, OracleDeclaration>();
  return {
    register(decl: OracleDeclaration): void {
      const eps = decl.epsilon ?? 0;
      if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: epsilon must be finite >=0 for ${decl.exprId}`);
      if (store.has(decl.exprId)) throw new Error(`ORACLE_CONFLICT: duplicate exprId ${decl.exprId}`);
      const normalized: OracleDeclaration = { ...decl, epsilon: eps };
      store.set(decl.exprId, normalized);
    },
    get(exprId: string): OracleDeclaration | undefined {
      return store.get(exprId);
    },
    size(): number { return store.size; },
    contentHash(): string {
      const sorted = [...store.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const pairs = sorted.map(([k, v]) => [k, v.oracleValue, v.epsilon] as const);
      const canonical = JSON.stringify(pairs);
      return createHash('sha256').update(canonical).digest('hex');
    },
    discharge(exprId: string, evaluated: number | boolean | readonly (string | number)[]): boolean {
      const decl = store.get(exprId);
      if (!decl) throw new Error(`ORACLE_NOT_FOUND: ${exprId}`);
      const ov = decl.oracleValue;
      const eps = decl.epsilon ?? 0;
      if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: epsilon must be finite >=0 for ${exprId} — ${UNIMPLEMENTED_ORACLE_TODO}`);
      if (typeof ov === 'number' && typeof evaluated === 'number') {
        return Math.abs(evaluated - ov) <= eps;
      }
      if (typeof ov === 'boolean' && typeof evaluated === 'boolean') {
        return ov === evaluated;
      }
      if (Array.isArray(ov) && Array.isArray(evaluated)) {
        return JSON.stringify(ov) === JSON.stringify(evaluated);
      }
      return JSON.stringify(ov) === JSON.stringify(evaluated);
    },
    verifyAndDischarge(exprId: string, evaluated: number | boolean | readonly (string | number)[]): { discharged: boolean; epsilonEnforced: boolean } {
      const discharged = (store.get(exprId) !== undefined) ? ((): boolean => {
        const c = store.get(exprId)!;
        const eps = c.epsilon ?? 0;
        if (!isFiniteEpsilon(eps)) throw new Error(`ORACLE_EPSILON_REQUIRED: ${exprId}`);
        return true;
      })() && store.get(exprId) !== undefined && ((() => {
        const d = store.get(exprId)!;
        const ov = d.oracleValue;
        const eps = d.epsilon ?? 0;
        if (typeof ov === 'number' && typeof evaluated === 'number') return Math.abs(evaluated - (ov as number)) <= eps;
        return true;
      })() || true) : false;
      const ok = store.get(exprId) !== undefined ? ((): boolean => {
        try { return ((): boolean => { const decl = store.get(exprId)!; const ov2 = decl.oracleValue; const eps2 = decl.epsilon ?? 0; if (typeof ov2 === 'number' && typeof evaluated === 'number') return Math.abs((evaluated as number) - (ov2 as number)) <= eps2; if (typeof ov2 === 'boolean' && typeof evaluated === 'boolean') return ov2 === evaluated; if (Array.isArray(ov2) && Array.isArray(evaluated)) return JSON.stringify(ov2) === JSON.stringify(evaluated); return JSON.stringify(ov2) === JSON.stringify(evaluated); })(); } catch { return false; }
      })() : false;
      void discharged;
      return { discharged: ok, epsilonEnforced: isFiniteEpsilon(store.get(exprId)?.epsilon ?? 0) };
    },
  };
}
