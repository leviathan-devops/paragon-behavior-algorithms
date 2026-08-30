// core/role-gate.ts — THE SOURCE FIREWALL
//
// Only the AGENT's own emissions feed the classifier — never the user's.
// The role gate caches messageID → role from the platform's message metadata
// events. Part events MUST resolve to role=assistant — anything else is
// DROPPED + COUNTED. FAIL-CLOSED: a part whose message role is unknown is
// also dropped.

const ROLE_CACHE_CAP = 512;

export interface RoleGateEvent {
  type: string;
  properties?: unknown;
}

export interface RuntimeMessagePart {
  type?: string;
  sessionID?: string;
  messageID?: string;
  id?: string;
  text?: string;
  [key: string]: unknown;
}

export function readPart(event: RoleGateEvent | null | undefined): RuntimeMessagePart | null {
  if (event === null || event === undefined) return null;
  const props = event.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== 'object') return null;
  const part = props['part'];
  if (part !== null && typeof part === 'object') return part as RuntimeMessagePart;
  return null;
}

export class RoleGate {
  private readonly roles = new Map<string, string>();
  nonAssistantPartDrops = 0;

  /** Feed EVERY event — message metadata events build the role cache. */
  observe(event: RoleGateEvent | null | undefined): void {
    if (event === null || event === undefined) return;
    if (event.type !== 'message.updated' && event.type !== 'message.created') return;
    const props = event.properties as Record<string, unknown> | undefined;
    const info = props !== undefined && typeof props['info'] === 'object' && props['info'] !== null
      ? (props['info'] as Record<string, unknown>)
      : props !== undefined && typeof props['message'] === 'object'
        ? (props['message'] as Record<string, unknown>)
        : undefined;
    if (info === undefined) return;
    const id = typeof info['id'] === 'string' ? info['id'] : '';
    const role = typeof info['role'] === 'string' ? info['role'] : '';
    if (id === '' || role === '') return;
    if (this.roles.size >= ROLE_CACHE_CAP && !this.roles.has(id)) {
      const oldest = this.roles.keys().next().value;
      if (typeof oldest === 'string') this.roles.delete(oldest);
    }
    this.roles.set(id, role);
  }

  /** The role for a part-bearing event: 'assistant' | 'user' | '' (unknown → drop). */
  roleFor(event: RoleGateEvent | null | undefined): string {
    if (event === null || event === undefined) return '';
    const props = event.properties as Record<string, unknown> | undefined;
    if (props !== undefined && typeof props['info'] === 'object' && props['info'] !== null) {
      const info = props['info'] as Record<string, unknown>;
      if (typeof info['role'] === 'string' && info['role'] !== '') return info['role'];
    }
    const part = readPart(event);
    const mid = typeof part?.messageID === 'string' ? part.messageID : '';
    if (mid === '') return '';
    return this.roles.get(mid) ?? '';
  }

  /** Convenience: should this part event be processed? (assistant-only) */
  shouldProcess(event: RoleGateEvent | null | undefined): boolean {
    const role = this.roleFor(event);
    if (role !== 'assistant') {
      this.nonAssistantPartDrops++;
      return false;
    }
    return true;
  }

  reset(): void { this.roles.clear(); this.nonAssistantPartDrops = 0; }
}
