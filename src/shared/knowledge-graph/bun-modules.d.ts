// bun-modules.d.ts — ambient type declarations for the runtime-native modules
// the strict tsconfig (`types: ["node"]`, no bun-types installed) cannot resolve
// `bun:sqlite` and `bun:test` on its own. This shim declares the exact API surface
// the knowledge-graph layer uses. It is a TYPE-ONLY shim for the Bun runtime's
// real modules — it does NOT provide any implementation. The declarations are
// verified against the actual Bun 1.3.14 runtime by the test suites (a drift
// between this shim and the real API fails the tests at runtime, never silently).
//
// W1 build note: this is the required 6th file (the 5 deliverables + this type
// shim). The driver resolution (bun:sqlite over the spec's claimed better-sqlite3)
// and the bun:test typecheck gate both REQUIRE these declarations.

declare module "bun:sqlite" {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }

  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Record<string, unknown> | null | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    values(...params: unknown[]): unknown[][];
    finalize(): void;
  }

  export class Database {
    constructor(path: string, options?: {
      readonly?: boolean;
      create?: boolean;
      readwrite?: boolean;
    });
    isOpen: boolean;
    exec(sql: string): RunResult;
    prepare(sql: string): Statement;
    query(sql: string): Statement;
    transaction<T extends () => unknown>(fn: T): T;
    close(): void;
    serialize(): Uint8Array;
  }
}

declare module "bun:test" {
  export interface ExpectMatchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toHaveProperty(key: string, value?: unknown): void;
    toThrow(expected?: unknown): void;
    toBeGreaterThan(expected: number | bigint): void;
    toBeGreaterThanOrEqual(n: number | bigint): void;
    toBeLessThan(expected: number | bigint): void;
    toBeLessThanOrEqual(n: number | bigint): void;
    toMatch(expected: string | RegExp): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeNaN(): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
  }

  export interface ExpectResult extends ExpectMatchers {
    not: ExpectMatchers;
    resolves: ExpectMatchers;
    rejects: ExpectMatchers;
  }

  export function expect<T>(actual: T): ExpectResult;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}
