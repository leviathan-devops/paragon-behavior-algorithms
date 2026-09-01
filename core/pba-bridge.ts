import type { PbaSignal, PbaStateChange, PrearmTarget, LayerBoostConfig, PbaBridge } from './types.js';
export type { PbaSignal, PbaStateChange, PrearmTarget, LayerBoostConfig, PbaBridge } from './types.js';

const RING_CAP = 20;

export function correlateEscalation(ptaNaturalTier: number, pbaMacroTier: number): number {
  if (!Number.isFinite(ptaNaturalTier) || !Number.isFinite(pbaMacroTier)) throw new Error('correlateEscalation: tiers must be finite numbers');
  const floor = pbaMacroTier >= 3 ? 2 : pbaMacroTier >= 2 ? 1 : 0;
  return Math.max(ptaNaturalTier, floor);
}

export class PbaBridgeImpl implements PbaBridge {
  private signals = new Map<string, PbaSignal[]>();
  private states = new Map<string, PbaStateChange>();
  private layers: LayerBoostConfig[] = [];
  private globalState: PbaStateChange | null = null;

  registerLayer(config: LayerBoostConfig): void {
    if (!config.layerId || typeof config.layerId !== 'string') throw new Error('PbaBridge.registerLayer: layerId required');
    this.layers.push(config);
  }

  registerLayers(configs: LayerBoostConfig[]): void {
    if (!Array.isArray(configs)) throw new Error('PbaBridge.registerLayers: configs must be array');
    for (const c of configs) this.registerLayer(c);
  }

  onPbaSignal(signal: PbaSignal): void {
    if (!signal || typeof signal.family !== 'string' || !signal.family) throw new Error('PbaBridge.onPbaSignal: signal.family required');
    if (typeof signal.sessionId !== 'string' || !signal.sessionId) throw new Error('PbaBridge.onPbaSignal: signal.sessionId required');
    const sid = signal.sessionId;
    let buf = this.signals.get(sid);
    if (!buf) { buf = []; this.signals.set(sid, buf); }
    buf.push({ ...signal });
    if (buf.length > RING_CAP) buf.shift();
  }

  onPbaStateChange(state: PbaStateChange & { sessionId?: string }): void {
    if (state === null || typeof state !== 'object') throw new Error('PbaBridge.onPbaStateChange: state required');
    if (typeof state.tier !== 'number' || !Number.isFinite(state.tier)) throw new Error('PbaBridge.onPbaStateChange: tier must be finite number');
    if (!Array.isArray(state.activeFamilies)) throw new Error('PbaBridge.onPbaStateChange: activeFamilies must be array');
    const sid = (state as { sessionId?: string }).sessionId ?? '__global__';
    const stored: PbaStateChange = {
      tier: state.tier,
      escalationCount: state.escalationCount ?? 0,
      activeFamilies: [...state.activeFamilies],
      lastWarheadBody: state.lastWarheadBody ?? null,
    };
    if (sid === '__global__') {
      this.globalState = stored;
    } else {
      this.states.set(sid, stored);
    }
  }

  getRecentSignals(sessionId: string, limit: number): PbaSignal[] {
    if (!Number.isFinite(limit) || limit < 0) throw new Error('PbaBridge.getRecentSignals: limit must be non-negative');
    const buf = this.signals.get(sessionId);
    if (!buf || buf.length === 0) return [];
    if (limit === 0) return [];
    return buf.slice(-limit).map(s => ({ ...s }));
  }

  getActiveFamilies(sessionId: string): string[] {
    const st = this.states.get(sessionId) ?? this.globalState;
    if (!st) return [];
    return [...st.activeFamilies];
  }

  getMacroTier(sessionId: string): number {
    const st = this.states.get(sessionId) ?? this.globalState;
    if (!st) return 0;
    return st.tier;
  }

  getLayersToPrearm(family: string): PrearmTarget[] {
    if (!family || typeof family !== 'string') throw new Error('PbaBridge.getLayersToPrearm: family required');
    const out: PrearmTarget[] = [];
    for (const l of this.layers) {
      if (l.pbaContextBoost?.families.includes(family)) {
        out.push({ layerId: l.layerId, boostAmount: l.pbaContextBoost.boostAmount });
      }
    }
    return out;
  }

  getEscalationCount(sessionId: string): number {
    const st = this.states.get(sessionId) ?? this.globalState;
    if (!st) return 0;
    return st.escalationCount ?? 0;
  }
}
