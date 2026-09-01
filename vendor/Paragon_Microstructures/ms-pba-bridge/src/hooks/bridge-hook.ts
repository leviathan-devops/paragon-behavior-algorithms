// ms-pba-bridge — src/hooks/bridge-hook.ts (PBA→PTA bridge wiring hook)
// Copy-and-customize: wire your PBA onSignal/onStateChange into the bridge here.
import type { PbaBridgeImpl } from '../core/engine.js';
import type { PbaSignal, PbaStateChange } from '../core/types.js';

export function wireBridgeHooks(bridge: PbaBridgeImpl, opts?: { targetAgent?: string }) {
  const target = opts?.targetAgent ?? 'trident';
  return {
    // chat.message or PBA signal surface → bridge ingress
    onPbaSignal: (signal: PbaSignal, agent?: string) => {
      if (agent && agent !== target) return;
      bridge.onPbaSignal(signal);
    },
    onPbaStateChange: (state: PbaStateChange & { sessionId?: string }, agent?: string) => {
      if (agent && agent !== target) return;
      bridge.onPbaStateChange(state);
    },
    // Query surface for intent classifier
    getRecentSignals: (sessionId: string, limit: number) => bridge.getRecentSignals(sessionId, limit),
    getActiveFamilies: (sessionId: string) => bridge.getActiveFamilies(sessionId),
    getMacroTier: (sessionId: string) => bridge.getMacroTier(sessionId),
    getLayersToPrearm: (family: string) => bridge.getLayersToPrearm(family),
  };
}
