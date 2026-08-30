export interface InspectableService {
  getSnapshot(): { value: unknown; context: unknown } | object;
}

export class StateInspector {
  private services = new Map<string, InspectableService>();

  register(name: string, service: InspectableService): void {
    if (!name || typeof name !== 'string') throw new Error('StateInspector.register: name is required');
    if (!service || typeof service.getSnapshot !== 'function') throw new Error('StateInspector.register: service must have getSnapshot()');
    this.services.set(name, service);
  }

  getSnapshot(name: string): object | null {
    const svc = this.services.get(name);
    if (!svc) return null;
    try {
      const snap = svc.getSnapshot();
      if (snap === null || snap === undefined) return null;
      if (typeof snap !== 'object') return { value: snap } as object;
      return snap as object;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[StateInspector] getSnapshot(${name}) failed: ${msg}`);
      return null;
    }
  }

  getAllSnapshots(): Record<string, object> {
    const out: Record<string, object> = {};
    for (const [name, svc] of this.services.entries()) {
      try {
        const snap = svc.getSnapshot();
        if (snap !== null && snap !== undefined && typeof snap === 'object') out[name] = snap as object;
        else if (snap !== null && snap !== undefined) out[name] = { value: snap } as object;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[StateInspector] getAllSnapshots getSnapshot(${name}) failed: ${msg}`);
      }
    }
    return out;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  unregister(name: string): boolean {
    return this.services.delete(name);
  }

  clear(): void {
    this.services.clear();
  }
}
