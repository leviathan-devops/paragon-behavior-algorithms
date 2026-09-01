# Patterns — trident-brain-v4.3.3

**Generated:** 2026-06-18T18:38:16.737Z
**Discovered:** 50 patterns

---

## Overview

This file catalogs every structural pattern discovered in the codebase.
Each pattern includes: name, location, type, description, code example,
when to use it, and what NOT to do (anti-pattern).

## Discovered Patterns

### 1. deepPlanningMachine

**Location:** `deep-planning-machine.ts:11`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: deepPlanningMachine (exported constant)
export const deepPlanningMachine: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: deepPlanningMachine without proper error handling
export function badDeepPlanningMachine(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 2. DeepPlanningContext

**Location:** `types.ts:4`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: DeepPlanningContext (interface contract)
export interface DeepPlanningContext {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: DeepPlanningContext without proper error handling
export function badDeepPlanningContext(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 3. ProblemSolvingContext

**Location:** `types.ts:23`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: ProblemSolvingContext (interface contract)
export interface ProblemSolvingContext {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: ProblemSolvingContext without proper error handling
export function badProblemSolvingContext(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 4. ContextSynthesisContext

**Location:** `types.ts:46`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: ContextSynthesisContext (interface contract)
export interface ContextSynthesisContext {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: ContextSynthesisContext without proper error handling
export function badContextSynthesisContext(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 5. SessionState

**Location:** `types.ts:65`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: SessionState (interface contract)
export interface SessionState {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: SessionState without proper error handling
export function badSessionState(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 6. OrchestratorContext

**Location:** `types.ts:71`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: OrchestratorContext (interface contract)
export interface OrchestratorContext {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: OrchestratorContext without proper error handling
export function badOrchestratorContext(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 7. MachineState

**Location:** `orchestrator-machine-v2.ts:24`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: MachineState (interface contract)
export interface MachineState {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: MachineState without proper error handling
export function badMachineState(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 8. OrchestratorMachineV2

**Location:** `orchestrator-machine-v2.ts:53`

**Type:** class

**What It Does:**
Defines a class encapsulating state and behavior. This is a primary
structural unit that other modules depend on for type safety and
encapsulation of implementation details.

**Code Example:**

```typescript
// Pattern: OrchestratorMachineV2 (class-based encapsulation)
export class OrchestratorMachineV2 {
  private state: Record<string, unknown> = {};

  constructor(initialState?: Record<string, unknown>) {
    if (initialState) this.state = { ...initialState };
  }

  getValue<T>(key: string): T | undefined {
    return this.state[key] as T | undefined;
  }

  setValue(key: string, value: unknown): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`Invalid key: ${key}`);
    }
    this.state[key] = value;
  }
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: OrchestratorMachineV2 without proper error handling
export function badOrchestratorMachineV2(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 9. orchestratorMachineV2

**Location:** `orchestrator-machine-v2.ts:180`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: orchestratorMachineV2 (exported constant)
export const orchestratorMachineV2: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: orchestratorMachineV2 without proper error handling
export function badOrchestratorMachineV2(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 10. problemSolvingMachine

**Location:** `problem-solving-machine.ts:12`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: problemSolvingMachine (exported constant)
export const problemSolvingMachine: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: problemSolvingMachine without proper error handling
export function badProblemSolvingMachine(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 11. contextSynthesisMachine

**Location:** `context-synthesis-machine.ts:11`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: contextSynthesisMachine (exported constant)
export const contextSynthesisMachine: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: contextSynthesisMachine without proper error handling
export function badContextSynthesisMachine(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 12. KnownPattern

**Location:** `hive-loader.ts:16`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: KnownPattern (interface contract)
export interface KnownPattern {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: KnownPattern without proper error handling
export function badKnownPattern(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 13. parseMetaPatterns

**Location:** `hive-loader.ts:171`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: parseMetaPatterns (function capability)
export function parseMetaPatterns(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('parseMetaPatterns: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: parseMetaPatterns without proper error handling
export function badParseMetaPatterns(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 14. EvidenceGate

**Location:** `evidence-gate.ts:4`

**Type:** class

**What It Does:**
Defines a class encapsulating state and behavior. This is a primary
structural unit that other modules depend on for type safety and
encapsulation of implementation details.

**Code Example:**

```typescript
// Pattern: EvidenceGate (class-based encapsulation)
export class EvidenceGate {
  private state: Record<string, unknown> = {};

  constructor(initialState?: Record<string, unknown>) {
    if (initialState) this.state = { ...initialState };
  }

  getValue<T>(key: string): T | undefined {
    return this.state[key] as T | undefined;
  }

  setValue(key: string, value: unknown): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`Invalid key: ${key}`);
    }
    this.state[key] = value;
  }
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: EvidenceGate without proper error handling
export function badEvidenceGate(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 15. generateContainerTestPlan

**Location:** `test-plan-generator.ts:11`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: generateContainerTestPlan (function capability)
export function generateContainerTestPlan(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('generateContainerTestPlan: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: generateContainerTestPlan without proper error handling
export function badGenerateContainerTestPlan(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 16. attachConfidenceDimensions

**Location:** `scoring.ts:13`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: attachConfidenceDimensions (function capability)
export function attachConfidenceDimensions(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('attachConfidenceDimensions: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: attachConfidenceDimensions without proper error handling
export function badAttachConfidenceDimensions(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 17. attachReproducible

**Location:** `scoring.ts:24`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: attachReproducible (function capability)
export function attachReproducible(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('attachReproducible: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: attachReproducible without proper error handling
export function badAttachReproducible(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 18. buildReproductionCommand

**Location:** `scoring.ts:37`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: buildReproductionCommand (function capability)
export function buildReproductionCommand(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('buildReproductionCommand: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: buildReproductionCommand without proper error handling
export function badBuildReproductionCommand(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 19. computeScore

**Location:** `scoring.ts:58`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: computeScore (function capability)
export function computeScore(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('computeScore: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: computeScore without proper error handling
export function badComputeScore(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 20. computeConfidenceDistribution

**Location:** `scoring.ts:201`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: computeConfidenceDistribution (function capability)
export function computeConfidenceDistribution(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('computeConfidenceDistribution: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: computeConfidenceDistribution without proper error handling
export function badComputeConfidenceDistribution(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 21. LayerEngine

**Location:** `layer-engine.ts:10`

**Type:** class

**What It Does:**
Defines a class encapsulating state and behavior. This is a primary
structural unit that other modules depend on for type safety and
encapsulation of implementation details.

**Code Example:**

```typescript
// Pattern: LayerEngine (class-based encapsulation)
export class LayerEngine {
  private state: Record<string, unknown> = {};

  constructor(initialState?: Record<string, unknown>) {
    if (initialState) this.state = { ...initialState };
  }

  getValue<T>(key: string): T | undefined {
    return this.state[key] as T | undefined;
  }

  setValue(key: string, value: unknown): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error(`Invalid key: ${key}`);
    }
    this.state[key] = value;
  }
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: LayerEngine without proper error handling
export function badLayerEngine(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 22. deduplicateFindings

**Location:** `layer-engine.ts:107`

**Type:** function

**What It Does:**
A standalone function providing a specific capability. Functions
are the primary executable units and should have clear single
responsibility.

**Code Example:**

```typescript
// Pattern: deduplicateFindings (function capability)
export function deduplicateFindings(input: string, options?: {
  strict?: boolean;
  timeout?: number;
}): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || input.length === 0) {
    throw new Error('deduplicateFindings: input cannot be empty');
  }
  const result = options?.strict
    ? input.trim().toLowerCase()
    : input;
  return { result, warnings };
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: deduplicateFindings without proper error handling
export function badDeduplicateFindings(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 23. CodeConstruct

**Location:** `types.ts:47`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: CodeConstruct (interface contract)
export interface CodeConstruct {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: CodeConstruct without proper error handling
export function badCodeConstruct(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 24. CallSiteEntry

**Location:** `types.ts:65`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: CallSiteEntry (interface contract)
export interface CallSiteEntry {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: CallSiteEntry without proper error handling
export function badCallSiteEntry(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 25. CallGraphEntry

**Location:** `types.ts:77`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: CallGraphEntry (interface contract)
export interface CallGraphEntry {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: CallGraphEntry without proper error handling
export function badCallGraphEntry(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 26. CallGraph

**Location:** `types.ts:84`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: CallGraph (interface contract)
export interface CallGraph {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: CallGraph without proper error handling
export function badCallGraph(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 27. SymbolTableEntry

**Location:** `types.ts:91`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: SymbolTableEntry (interface contract)
export interface SymbolTableEntry {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: SymbolTableEntry without proper error handling
export function badSymbolTableEntry(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 28. SymbolTable

**Location:** `types.ts:101`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: SymbolTable (interface contract)
export interface SymbolTable {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: SymbolTable without proper error handling
export function badSymbolTable(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 29. SuppressedFinding

**Location:** `types.ts:105`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: SuppressedFinding (interface contract)
export interface SuppressedFinding {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: SuppressedFinding without proper error handling
export function badSuppressedFinding(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 30. AuditMeta

**Location:** `types.ts:116`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: AuditMeta (interface contract)
export interface AuditMeta {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: AuditMeta without proper error handling
export function badAuditMeta(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 31. ProjectLanguageStats

**Location:** `types.ts:126`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: ProjectLanguageStats (interface contract)
export interface ProjectLanguageStats {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: ProjectLanguageStats without proper error handling
export function badProjectLanguageStats(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 32. AnalysisContext

**Location:** `types.ts:138`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: AnalysisContext (interface contract)
export interface AnalysisContext {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: AnalysisContext without proper error handling
export function badAnalysisContext(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 33. PreflightResult

**Location:** `types.ts:160`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: PreflightResult (interface contract)
export interface PreflightResult {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: PreflightResult without proper error handling
export function badPreflightResult(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 34. PreflightFinding

**Location:** `types.ts:173`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: PreflightFinding (interface contract)
export interface PreflightFinding {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: PreflightFinding without proper error handling
export function badPreflightFinding(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 35. AuditFinding

**Location:** `types.ts:179`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: AuditFinding (interface contract)
export interface AuditFinding {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: AuditFinding without proper error handling
export function badAuditFinding(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 36. LayerRule

**Location:** `types.ts:197`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: LayerRule (interface contract)
export interface LayerRule {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: LayerRule without proper error handling
export function badLayerRule(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 37. AuditResult

**Location:** `types.ts:213`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: AuditResult (interface contract)
export interface AuditResult {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: AuditResult without proper error handling
export function badAuditResult(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 38. ConfidenceDistribution

**Location:** `types.ts:227`

**Type:** interface

**What It Does:**
Defines a type contract that implementing modules must satisfy.
Used for dependency injection, polymorphism, and API stability.

**Code Example:**

```typescript
// Pattern: ConfidenceDistribution (interface contract)
export interface ConfidenceDistribution {
  id: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  validate(): boolean;
  serialize(): string;
}
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: ConfidenceDistribution without proper error handling
export function badConfidenceDistribution(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 39. SEVERITY_WEIGHT

**Location:** `types.ts:235`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: SEVERITY_WEIGHT (exported constant)
export const SEVERITY_WEIGHT: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: SEVERITY_WEIGHT without proper error handling
export function badSEVERITY_WEIGHT(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

### 40. CONFIDENCE_LABELS

**Location:** `types.ts:242`

**Type:** export

**What It Does:**
An exported constant, variable, or value. This is part of the
module public API surface.

**Code Example:**

```typescript
// Pattern: CONFIDENCE_LABELS (exported constant)
export const CONFIDENCE_LABELS: Readonly<Record<string, unknown>> = Object.freeze({
  version: '1.0.0',
  features: ['audit', 'planning', 'review'],
});
```

**When to Use:**
- When building a new module that needs this structural pattern
- When refactoring existing code to match established conventions
- When a new developer asks "how do we typically structure X?"

**Anti-Pattern (What NOT to Do):**

```typescript
// WRONG: CONFIDENCE_LABELS without proper error handling
export function badCONFIDENCE_LABELS(input: any): any {
  // No validation, no error handling, no return type
  return input?.property; // May return undefined silently
}
```

This anti-pattern violates: input validation, error handling,
and type safety. The correct pattern validates, throws on invalid
input, and has a strict return type.

---

## Architectural Patterns

These patterns apply to the system design regardless of discovery.

### P1: Hook Registration Pattern
- **Location:** `src/index.ts`
- **Type:** architectural
- **What It Does:** Registers all hooks in the plugin init function. Each
  hook is bound to its handler class instance to preserve `this` context.

```typescript
ctx.hook('chat.message', hooks.onChatMessage.bind(hooks));
```

**When to use:** During plugin initialization. **Anti-pattern:** Registering
hooks outside init (they won't fire).

### P2: Tool Definition Pattern
- **Location:** `src/tools/trident-brain-v4-3-3-tools.ts`
- **Type:** architectural
- **What It Does:** Each tool is defined as a `ToolDefinition` object with
  name, zod schema, description, and async handler.

```typescript
{ name: 'tool-name', schema: z.object({...}).strict(), handler: async (args, ctx) => {...} }
```

**When to use:** Adding a new tool. **Anti-pattern:** Using non-strict
schemas (allows unknown fields, potential injection).

### P3: SCAN+REPLACE Identity Pattern
- **Location:** `src/hooks/*-hooks.ts`
- **Type:** behavioral
- **What It Does:** Finds identity block by markers, replaces in-place.
  Idempotent — calling twice produces same result as once.

```typescript
const startIdx = system.findIndex(s => s.includes('[IDENTITY_START]'));
if (startIdx >= 0) { /* replace */ } else { /* push */ }
```

**When to use:** Any identity/context injection. **Anti-pattern:** Using
`unshift()` without checking for existing block (creates duplicates).

### P4: Layer Pipeline Pattern
- **Type:** behavioral
- **What It Does:** Modes execute layers sequentially. Each layer validates
  before the next starts.

```typescript
layer1(); validate(1); layer2(); validate(2); layer3(); validate(3);
```

**Anti-pattern:** Running layers in parallel with mock inputs.


---
*Generated by Trident v4.3.3*
