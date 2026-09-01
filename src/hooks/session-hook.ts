import { appendFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Hooks } from '@opencode-ai/plugin';
import { isTridentAgent } from '../identity/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent } from './agent-state.js';
import { orchestrator } from '../orchestrator.js';

export function createSessionHook(): Hooks['event'] {
  return async (input: { event: import('@opencode-ai/sdk').Event }): Promise<void> => {
    if (!input) return undefined;
    // DEBUG: session event trace
    // THE R16 TYPE_CERTAINTY GUARD — the SDK Event union's runtime shape is
    // read through typeof/null-guarded accessors (the assertions are earned by
    // the checks, never bare casts on the discriminated union).
    const eventType = typeof input.event === 'object' && input.event !== null && (input.event as { type?: string }).type !== undefined
      ? (input.event as { type?: string }).type
      : '';
    try { appendFileSync(path.join(os.tmpdir(), 'trident-hook-debug.log'), `[${Date.now()}] SESSION_EVENT: fired | type=${String(eventType)}\n`); } catch (e: unknown) { console.error('[SessionHook] error:', e); return undefined; }
    const event = hookEvent(input);
    if (!event?.type) return undefined;
    const sessionId = event.sessionId || '';
    // FIXED: Add fallback chain — opencode may pass agent via different paths
    const agent = event.agent || hookAgent(input);
    // Events with NO agent info must NOT touch state — session.updated/diff/message
    // events fire constantly without agent data, and writing undefined with an empty
    // sessionId lands on the shared 'default' key, nulling the trident identity that
    // hooks without sessionID (messages.transform) depend on.
    if (!agent) return undefined;
    if (!isTridentAgent(agent)) {
      // Only clear the SPECIFIC session — never the shared 'default' fallback key.
      if (sessionId && sessionId !== 'default') setCurrentAgent(undefined, sessionId);
      return undefined;
    }
    setCurrentAgent(agent, sessionId || 'default');
    if (event.type === 'session.created') {
      handleSessionCreated();
    } else if (event.type === 'session.ended') {
      handleSessionEnded(sessionId);
    }
  };
}

function handleSessionCreated(): void {
}

function handleSessionEnded(sessionId?: string): void {
  // Only clear the SPECIFIC session — never the shared 'default' fallback key.
  if (sessionId && sessionId !== 'default') {
    clearCurrentAgent(sessionId);
    orchestrator.resetSession(sessionId);
  }
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the SDK Event union's runtime shape is
 *  narrowed through typeof/null guards (the assertions are earned by the checks,
 *  never bare casts on the discriminated union). */
function hookEvent(input: { event: unknown }): { type?: string; sessionId?: string; agent?: string } {
  if (typeof input.event !== 'object' || input.event === null) return {};
  const evt = input.event as { type?: string; sessionId?: string; agent?: string };
  return {
    type: typeof evt.type === 'string' ? evt.type : undefined,
    sessionId: typeof evt.sessionId === 'string' ? evt.sessionId : undefined,
    agent: typeof evt.agent === 'string' ? evt.agent : undefined,
  };
}

/** THE R16 TYPE_CERTAINTY GUARDED READ — the input's agent (via the top-level
 *  agent field or the session nested field) is read through typeof guards. */
function hookAgent(input: { event: unknown; agent?: unknown; session?: { agent?: unknown } }): string {
  if (typeof input.agent === 'string') return input.agent;
  if (typeof input.session?.agent === 'string') return input.session.agent;
  return '';
}
