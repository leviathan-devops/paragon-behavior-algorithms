// src/lasme/oracle.ts — the OracleRegistry (spec §2.4, W4)
//
// THE EMPIRICAL EVIDENCE CHECK — forked from the PARAGON `OracleRegistry`
// (src/math/oracle.ts). THE REAL PARAGON CONTRACT (the zero-trust audit fix
// #1 — the ZT-1 law): "the firewall does not read the agent's reasoning — it
// evaluates the agent's number against the oracle" (KB-01:313). Integer
// equality, zero false positives by construction.
//
// THE LOAD-BEARING LAWS:
//   - THE DISCHARGE IS THE ONLY COMPARISON MODE. There is NO invented
//     check-shape (NO DIST_SHA/TEST_OUTPUT/CONTAINER_RESULT comparison-mode
//     oracle — that invented shape is the ZT-1 CRITICAL regression, BANNED).
//     The oracle evaluates the agent's NUMBER against a REGISTERED value.
//   - THE FAIL-CLOSED ORACLE: a claim with NO registered oracle for its
//     exprId → UNMEASURABLE — never a guess, never a silent pass (the
//     loud-fail-or-clear-pass law).
//   - THE ONLY COMPARISONS: integer/boolean/set equality (zero false
//     positives by construction); the floats compare ONLY against the
//     REGISTERED epsilon (the hidden tolerance BANNED — OracleEpsilonError).
//   - THE FIRST-WINS: a re-register THROWS OracleConflictError.
//   - THE contentHash(): the sha256 over the sorted registrations — the
//     oracle state itself verifiable; a drift in the registered truths is
//     detectable.
//
// THE TYPES: the OracleDeclaration + the ProvenanceAnchor are IMPORTED from
// the LANDED W0 contracts (src/lasme/contracts.ts) — never redefined here.
// The discharge result shape is this module's output contract.
//
// Source lineage:
//   KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/PARAGON_V1/src/math/oracle.ts
//   (the FORK SOURCE — the OracleConflictError, the OracleEpsilonError, the
//   register/discharge/contentHash fork)
// SPec: STTGF_MUTATION_PARAGON_OVERHAUL_L2_SPEC.md §2.4 + §3 (W4) + §4

import { createHash } from 'node:crypto';
import type { OracleDeclaration, ProvenanceAnchor } from './contracts.js';

export type { OracleDeclaration, ProvenanceAnchor };

// ── THE DISCHARGE RESULT (this module's output contract — spec §2.4) ──────
// THE BASIS is the ONLY comparison outcome the W4 gate + the §2.1 span
// verdict read (`discharges.some(d => d.basis === 'UNMEASURABLE' || ...)`).
export type DischargeBasis = 'EVALUATED_EQUAL' | 'EVALUATED_DIFFERENT' | 'UNMEASURABLE';

export interface DischargeResult {
  readonly basis: DischargeBasis;
  readonly oracleId?: string;
  readonly observed: number | boolean | readonly (string | number)[];
  readonly expected?: number | boolean | readonly (string | number)[];
  readonly reason?: string;
}

// ── THE REGISTRATION ERRORS (the loud fails — spec §2.4) ───────────────────

export class OracleConflictError extends Error {
  readonly code = 'ORACLE_CONFLICT';
  constructor(public readonly exprId: string) {
    super(`ORACLE_CONFLICT: oracle already registered for ${exprId} — the first registration wins, a re-register is loud`);
    this.name = 'OracleConflictError';
  }
}

export class OracleEpsilonError extends Error {
  readonly code = 'ORACLE_FLOAT_REQUIRES_EPSILON';
  constructor(public readonly exprId: string) {
    super(`ORACLE_FLOAT_REQUIRES_EPSILON: ${exprId} is a non-integer float oracle without a registered epsilon — the hidden tolerance is BANNED`);
    this.name = 'OracleEpsilonError';
  }
}

interface OracleEntryInternal {
  readonly decl: OracleDeclaration;
  readonly registeredIdx: number; // the registration ORDER (append-only); never wall time
}

/**
 * THE ORACLE REGISTRY — the empirical authority. The claim's words NEVER
 * override the registered truth. Forked from the PARAGON OracleRegistry.
 */
export class OracleRegistry {
  private readonly entries = new Map<string, OracleEntryInternal>();
  private nextIdx = 0;

  /**
   * THE REGISTRATION — the append-only, the first-wins (spec §2.4):
   *   - a duplicate exprId THROWS OracleConflictError (the first registration
   *     wins, the loud re-register);
   *   - a non-integer float WITHOUT the registered epsilon THROWS
   *     OracleEpsilonError (the hidden tolerance BANNED).
   */
  register(decl: OracleDeclaration): void {
    const existing = this.entries.get(decl.exprId);
    if (existing !== undefined) throw new OracleConflictError(decl.exprId);
    if (
      typeof decl.oracleValue === 'number' &&
      !Number.isInteger(decl.oracleValue) &&
      decl.epsilon === undefined
    ) {
      throw new OracleEpsilonError(decl.exprId);
    }
    this.entries.set(decl.exprId, { decl, registeredIdx: this.nextIdx++ });
  }

  /** THE READ — the registered declaration for an exprId (undefined if none). */
  get(exprId: string): OracleDeclaration | undefined {
    return this.entries.get(exprId)?.decl;
  }

  /** THE COUNT — the number of registered oracles. */
  size(): number {
    return this.entries.size;
  }

  /** THE EXPR IDS — the keys of the registered oracles (sorted, deterministic). */
  exprIds(): string[] {
    return [...this.entries.keys()].sort();
  }

  /**
   * THE contentHash — the sha256 over the SORTED registrations (each row the
   * exprId | value-key | epsilon), registration-order INDEPENDENT. A drift in
   * the registered truths is detectable.
   */
  contentHash(): string {
    const rows = [...this.entries.values()]
      .map((e) => [
        e.decl.exprId,
        scalarKey(e.decl.oracleValue),
        String(e.decl.epsilon ?? ''),
      ] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const joined = rows.map((r) => r.join('|')).join('\n');
    return createHash('sha256').update(joined).digest('hex');
  }

  /**
   * THE DISCHARGE — the ONLY comparison mode (the ZT-1 law). The ONLY
   * comparisons: integer/boolean/set equality (zero false positives by
   * construction); the floats compare ONLY against the REGISTERED epsilon;
   * a missing oracle is UNMEASURABLE (the fail-closed — honest, never a
   * guess, never a silent pass).
   */
  discharge(exprId: string, observed: number | boolean | readonly (string | number)[]): DischargeResult {
    const entry = this.entries.get(exprId);
    if (entry === undefined) {
      return {
        basis: 'UNMEASURABLE',
        observed,
        reason: `no oracle registered for ${exprId}`,
      };
    }
    const expected = entry.decl.oracleValue;

    // THE NUMBER COMPARISON — the integer equality OR the epsilon float.
    if (typeof expected === 'number' && typeof observed === 'number') {
      // GARBAGE IN → CONTRADICTED. NO EXCUSES. A non-finite value is never a
      // valid measurement (the PARAGON BUG-1 fix).
      if (!Number.isFinite(observed)) {
        return {
          basis: 'EVALUATED_DIFFERENT',
          oracleId: exprId,
          observed,
          expected,
          reason: 'non-finite observed value',
        };
      }
      if (Number.isInteger(expected) && Number.isInteger(observed)) {
        return observed === expected
          ? { basis: 'EVALUATED_EQUAL', oracleId: exprId, observed }
          : { basis: 'EVALUATED_DIFFERENT', oracleId: exprId, observed, expected };
      }
      const eps = entry.decl.epsilon;
      if (eps === undefined) {
        return {
          basis: 'UNMEASURABLE',
          oracleId: exprId,
          observed,
          reason: `float oracle without a registered epsilon: ${exprId}`,
        };
      }
      return Math.abs(observed - expected) <= eps
        ? { basis: 'EVALUATED_EQUAL', oracleId: exprId, observed }
        : { basis: 'EVALUATED_DIFFERENT', oracleId: exprId, observed, expected };
    }

    // THE BOOLEAN EQUALITY.
    if (typeof expected === 'boolean' && typeof observed === 'boolean') {
      return observed === expected
        ? { basis: 'EVALUATED_EQUAL', oracleId: exprId, observed }
        : { basis: 'EVALUATED_DIFFERENT', oracleId: exprId, observed, expected };
    }

    // THE SET EQUALITY — the readonly array compared AS A SET (order-independent).
    if (Array.isArray(expected) && Array.isArray(observed)) {
      const a = [...expected].sort();
      const b = [...observed].sort();
      const equal = a.length === b.length && a.every((x, i) => x === b[i]);
      return equal
        ? { basis: 'EVALUATED_EQUAL', oracleId: exprId, observed }
        : { basis: 'EVALUATED_DIFFERENT', oracleId: exprId, observed, expected };
    }

    // THE TYPE MISMATCH → CONTRADICTED (the PARAGON "GARBAGE IN → CONTRADICTED").
    return {
      basis: 'EVALUATED_DIFFERENT',
      oracleId: exprId,
      observed,
      reason: 'oracle type mismatch',
    };
  }
}

/** THE SYNC DISCHARGE — a bare function form of discharge(exprId, observed)
 *  over a REGISTRY instance, mirroring the spec's `discharge(exprId, observed)`
 *  surface. The comparison logic is parity with OracleRegistry#discharge. */
export function discharge(exprId: string, observed: number | boolean | readonly (string | number)[]): DischargeResult {
  return DEFAULT_REGISTRY.discharge(exprId, observed);
}

/** THE SYNC REGISTER — mirrors the spec's `register(decl)` surface over the
 *  DEFAULT_REGISTRY. For the bare-surface callers. */
export function register(decl: OracleDeclaration): void {
  DEFAULT_REGISTRY.register(decl);
}

/** THE DEFAULT REGISTRY — the singleton the bare discharge/register surfaces
 *  operate on. The W6 wiring may also construct its OWN OracleRegistry
 *  instances for the per-session scoping; the singleton serves the sync path. */
export const DEFAULT_REGISTRY = new OracleRegistry();

// ── THE SCALAR-KEY HELPER (the contentHash value encoding) ────────────────

/** THE ORDER-INDEPENDENT VALUE KEY — the number/boolean/array → the canonical
 *  string used in the contentHash rows. Forked from the PARAGON scalarKey. */
function scalarKey(value: number | boolean | readonly (string | number)[]): string {
  if (Array.isArray(value)) return `[${[...value].sort().join(',')}]`;
  return String(value);
}
