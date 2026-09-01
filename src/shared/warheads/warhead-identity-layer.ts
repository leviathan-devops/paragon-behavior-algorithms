import { Warhead } from '../warhead-interface.js';
import { getFirewallAudit } from '../../hooks/guardian-hook.js';

class IdentityLayerWarhead implements Warhead {
  id = 'identity-layer-engine';
  priority = 7;
  type = 'static' as const;

  // No init() — pure aggregator, nothing to load.
  // register() exists to satisfy Warhead interface — prevents registration chain break.
  // Without it, trident-warhead-synthesizer.ts:315 throws TypeError, aborting
  // registration for warheads 8-12 (focus, recovery, auditState).


  getT0(): string {
    const fw = getFirewallAudit();
    return `[LAYER ENGINE] F1: ${fw.layerEntryCount('F1_ISOLATION')} blocks | Total enforcement: ${fw.totalCount()} blocks. L5 (11 classes) + CFW + Zone active.`;
  }

  getStatus(): Record<string, number | string> {
    const fw = getFirewallAudit();
    return {
      f1Blocks: fw.layerEntryCount('F1_ISOLATION'),
      totalBlocks: fw.totalCount(),
    };
  }
}

export const identityLayerWarhead = new IdentityLayerWarhead();
