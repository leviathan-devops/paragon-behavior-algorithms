export interface CanEvaluateResult {
  allowed: boolean;
  missing: string[];
}

export class DependencyGateChain {
  private readonly deps = new Map<string, Set<string>>();
  private readonly passed = new Set<string>();

  register(gateId: string, dependsOn: string[]): void {
    if (!gateId || typeof gateId !== 'string' || gateId.length === 0) {
      throw new Error('DependencyGateChain: gateId must be a non-empty string');
    }
    if (!Array.isArray(dependsOn)) {
      throw new Error('DependencyGateChain: dependsOn must be an array');
    }
    for (const d of dependsOn) {
      if (!d || typeof d !== 'string' || d.length === 0) {
        throw new Error(`DependencyGateChain: dependsOn entry for "${gateId}" must be a non-empty string`);
      }
      if (d === gateId) {
        throw new Error(`DependencyGateChain: gate "${gateId}" cannot depend on itself`);
      }
    }
    if (this.deps.has(gateId)) {
      throw new Error(`DependencyGateChain: gate "${gateId}" already registered`);
    }
    this.deps.set(gateId, new Set(dependsOn));
    this.detectCycle();
  }

  markPassed(gateId: string): void {
    if (!gateId || typeof gateId !== 'string') {
      throw new Error('DependencyGateChain: gateId must be a non-empty string');
    }
    if (!this.deps.has(gateId)) {
      throw new Error(`DependencyGateChain: gate "${gateId}" not registered`);
    }
    this.passed.add(gateId);
  }

  canEvaluate(gateId: string): CanEvaluateResult {
    if (!gateId || typeof gateId !== 'string') {
      throw new Error('DependencyGateChain: gateId must be a non-empty string');
    }
    const depSet = this.deps.get(gateId);
    if (!depSet) {
      throw new Error(`DependencyGateChain: gate "${gateId}" not registered`);
    }
    const missing: string[] = [];
    for (const d of depSet) {
      if (!this.passed.has(d)) missing.push(d);
    }
    return { allowed: missing.length === 0, missing };
  }

  gateChain(): string[] {
    const visited = new Map<string, number>();
    const result: string[] = [];

    const visit = (id: string, stack: string[]): void => {
      const state = visited.get(id) ?? 0;
      if (state === 1) {
        throw new Error(`DependencyGateChain: cycle detected at "${id}" via ${stack.join(' -> ')} -> ${id}`);
      }
      if (state === 2) return;
      visited.set(id, 1);
      stack.push(id);
      const deps = this.deps.get(id);
      if (deps) {
        for (const d of deps) {
          if (this.deps.has(d)) visit(d, stack);
        }
      }
      stack.pop();
      visited.set(id, 2);
      result.push(id);
    };

    for (const id of this.deps.keys()) {
      if ((visited.get(id) ?? 0) === 0) visit(id, []);
    }
    return result;
  }

  isPassed(gateId: string): boolean {
    return this.passed.has(gateId);
  }

  reset(): void {
    this.passed.clear();
  }

  listGates(): string[] {
    return [...this.deps.keys()];
  }

  private detectCycle(): void {
    try {
      this.gateChain();
    } catch (e) {
      const last = [...this.deps.keys()].pop();
      if (last) this.deps.delete(last);
      throw e;
    }
  }
}
