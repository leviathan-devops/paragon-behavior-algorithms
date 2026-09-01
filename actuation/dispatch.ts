import { StructuredEnforcementError } from '../core/types.js';
import type { PlatformAdapter } from '../core/types.js';

export function dispatchTea(body: string, toolOutput: string): string {
  return toolOutput + '\n\n' + body;
}

export function blockAtTeb(body: string, layerId?: string): never {
  throw new StructuredEnforcementError({ detected: `${layerId ?? 'unknown'} at tier 3`, correction: body });
}

export function dispatchDirective(body: string, adapter: PlatformAdapter): void {
  const prefixed = `[PTA GATE] ${body}`;
  adapter.inject({ type: 'chat.message', content: prefixed });
}
