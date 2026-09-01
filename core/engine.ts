import { step, createInitialRecord } from './machine.js';
import type { BehaviorRecord, ToolChainModule, ToolChainLayer, ToolIntent, ChainRule } from './types.js';
import { V2Synapse } from './synapse.js';
import { ChainTracker } from './chain-tracker.js';
import { PbaBridgeImpl, correlateEscalation } from './pba-bridge.js';
import { ComplianceCollector } from './collector.js';
import { classifyIntent } from './intent-classifier.js';
import { fillTemplate, resolveWarhead } from '../actuation/warhead-templates.js';
import { dispatchTea, blockAtTeb } from '../actuation/dispatch.js';

const SESSION_CAP = 256;

interface PtaSession {
  record: BehaviorRecord;
  synapse: V2Synapse;
  seq: number;
}

export class ParagonToolEngine {
  readonly pbaBridge = new PbaBridgeImpl();
  readonly chainTracker = new ChainTracker();
  readonly collector = new ComplianceCollector();

  private readonly sessions = new Map<string, PtaSession>();
  private seq = 0;
  private readonly layers = new Map<string, ToolChainLayer>();
  private readonly module: ToolChainModule;

  constructor(module: ToolChainModule) {
    if (!module || typeof module.name !== 'string' || !module.name) throw new Error('ParagonToolEngine: module.name required');
    if (!Array.isArray(module.layers)) throw new Error('ParagonToolEngine: module.layers must be array');
    this.module = module;
    for (const layer of module.layers) {
      this.registerLayer(layer);
    }
  }

  registerLayer(layer: ToolChainLayer): void {
    if (!layer || typeof layer.id !== 'string' || !layer.id) throw new Error('ParagonToolEngine.registerLayer: layer.id required');
    if (this.layers.has(layer.id)) throw new Error(`ParagonToolEngine.registerLayer: duplicate layer id '${layer.id}'`);
    this.layers.set(layer.id, layer);
    if (layer.pbaContextBoost) {
      this.pbaBridge.registerLayer({ layerId: layer.id, pbaContextBoost: layer.pbaContextBoost });
    }
  }

  getLayerCount(): number {
    return this.layers.size;
  }

  getLayers(): ToolChainLayer[] {
    return [...this.layers.values()];
  }

  private sessionFor(sessionId: string): PtaSession {
    const sid = sessionId && sessionId !== '' ? sessionId : 'default';
    let s = this.sessions.get(sid);
    if (!s) {
      if (this.sessions.size >= SESSION_CAP) {
        const oldest = this.sessions.keys().next().value;
        if (typeof oldest === 'string') this.sessions.delete(oldest);
      }
      const thresholds: Record<string, number> = {};
      for (const layer of this.layers.values()) {
        thresholds[layer.id] = layer.threshold;
      }
      if (Object.keys(thresholds).length === 0) thresholds['default'] = 0.9;
      s = {
        record: createInitialRecord(),
        synapse: new V2Synapse({ fire: thresholds, decayAlpha: 0.05, refractorySeq: 25 }),
        seq: 0,
      };
      this.sessions.set(sid, s);
    }
    return s;
  }

  getRecord(sessionId: string): BehaviorRecord {
    return this.sessionFor(sessionId).record;
  }

  getSynapse(sessionId: string): V2Synapse {
    return this.sessionFor(sessionId).synapse;
  }

  private isEscapeHatch(toolName: string): boolean {
    const hatches = this.module.compliance?.escapeHatches ?? [];
    const lower = toolName.toLowerCase();
    return hatches.some((h) => lower.includes(h.toLowerCase()) || h.toLowerCase().includes(lower));
  }

  private isDemandedTool(toolName: string): boolean {
    const tools = this.module.compliance?.remediationTools ?? [];
    const lower = toolName.toLowerCase();
    return tools.some((t) => lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower));
  }

  private getAllChainRules(): ChainRule[] {
    const rules: ChainRule[] = [...(this.module.chainRules ?? [])];
    for (const layer of this.layers.values()) {
      if (layer.chainRules) {
        for (const r of layer.chainRules) rules.push(r);
      }
    }
    return rules;
  }

  onToolEvent(sessionId: string, event: { type: 'started' | 'completed' | 'before'; toolName: string; args?: Record<string, unknown>; exitCode?: number; output?: string }): ToolIntent | string | null {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('onToolEvent: sessionId required');
    if (!event || typeof event.toolName !== 'string') throw new Error('onToolEvent: event.toolName required');

    const s = this.sessionFor(sessionId);
    this.seq++;
    s.seq = this.seq;

    if (event.type === 'started') {
      try {
        this.chainTracker.recordCall(sessionId, event.toolName, event.args ?? {});
      } catch (e) {
        console.error(`[ParagonToolEngine] recordCall failed: ${String(e)}`);
      }
      return null;
    }

    if (event.type === 'completed') {
      try {
        this.chainTracker.recordResult(sessionId, event.toolName, event.exitCode ?? 0, event.output ?? '');
        this.collector.measureCompliance(event.toolName, event.args ?? {}, event.exitCode ?? 0, event.output ?? '');
        if (s.record.state === 'INTERVENING' && this.isDemandedTool(event.toolName) && (event.exitCode ?? 0) === 0) {
          const out = event.output ?? '';
          const isGenuine = out.length > 50 || out.includes('artifact') || out.includes('PASS');
          s.record = step(s.record, 'COMPLIANCE_VERIFIED', { isGenuine, instrument: event.toolName });
        }
      } catch (e) {
        console.error(`[ParagonToolEngine] completed handling failed: ${String(e)}`);
      }
      return null;
    }

    if (event.type === 'before') {
      if (this.isEscapeHatch(event.toolName)) return null;
      if (this.isDemandedTool(event.toolName)) return null;

      if (s.record.state === 'INTERVENING' && s.record.tier >= 3) {
        const lastDirective = s.record.directives[s.record.directives.length - 1];
        const directiveLayerId = lastDirective?.patternOrMember ?? '';
        const layer = this.layers.get(directiveLayerId) ?? [...this.layers.values()][0];
        if (layer) {
          const pbaFamilies = this.pbaBridge.getActiveFamilies(sessionId).join(', ') || 'none';
          const pbaTier = this.pbaBridge.getMacroTier(sessionId);
          if (s.record.tier >= 4) {
            const body = fillTemplate(layer.enforcement.tier4, {
              count: s.record.counters[layer.id] ?? 1,
              toolName: event.toolName,
              args: JSON.stringify(event.args ?? {}),
              escalationCount: s.record.escalationCount,
              pbaFamilies,
              pbaTier,
              anchor: `pta:${layer.id}:${Date.now()}`,
            });
            blockAtTeb(`[PTA GATE] ${body}`, layer.id);
          } else {
            const body = fillTemplate(layer.enforcement.tier3, {
              count: s.record.counters[layer.id] ?? 1,
              toolName: event.toolName,
              args: JSON.stringify(event.args ?? {}),
              chainViolations: 'none',
              pbaFamilies,
              pbaTier,
              anchor: `pta:${layer.id}:${Date.now()}`,
            });
            blockAtTeb(body, layer.id);
          }
        }
        return null;
      }

      const allLayers = [...this.layers.values()];
      if (allLayers.length === 0) return null;

      const chainViolations = this.chainTracker.evaluateRules(sessionId, event.toolName, event.args ?? {}, this.getAllChainRules());
      const chainViolationIds = chainViolations.map((v) => v.layerId);

      let intent: ToolIntent;
      try {
        intent = classifyIntent(
          { toolName: event.toolName, args: event.args ?? {} },
          { previousTools: this.chainTracker.recentTools(sessionId, 10).map((r) => r.tool), chainViolations: chainViolationIds },
          { activeFamilies: this.pbaBridge.getActiveFamilies(sessionId), latestSignals: this.pbaBridge.getRecentSignals(sessionId, 10), macroTier: this.pbaBridge.getMacroTier(sessionId) },
          allLayers.map((l) => ({
            id: l.id,
            threshold: l.threshold,
            banks: l.banks,
            toolMatchers: l.toolMatchers,
            pbaContextBoost: l.pbaContextBoost,
          })),
        );
      } catch (e) {
        console.error(`[ParagonToolEngine] classifyIntent failed: ${String(e)}`);
        throw e;
      }

      if (intent.action === 'ALLOW') {
        if (s.record.state === 'IDLE') {
          s.record = step(s.record, 'FIRST_TOOL_SIGNAL', { family: event.toolName });
        } else {
          s.record = step(s.record, 'TOOL_SIGNAL', { family: event.toolName });
        }
        return intent;
      }

      const weight = intent.confidence * 2;
      const family = intent.layerId ?? event.toolName;
      try {
        s.synapse.accumulate({ familyId: family, weight, family }, this.seq);
      } catch (e) {
        console.error(`[ParagonToolEngine] synapse accumulate failed: ${String(e)}`);
      }

      let fired = false;
      try {
        const neuron = s.synapse.getNeuron(family);
        if (neuron.canFire()) {
          neuron.fire();
          fired = true;
        }
      } catch (e) {
        console.error(`[ParagonToolEngine] neuron fire check failed: ${String(e)}`);
      }

      if (fired) {
        if (s.record.state === 'IDLE') {
          s.record = step(s.record, 'FIRST_TOOL_SIGNAL', { family });
        } else if (s.record.state === 'MONITORING') {
          s.record = step(s.record, 'CHAIN_PATTERN_HIT', { patternId: family, memberId: family, family });
          if (s.record.state === 'PRIMED') {
            s.record = step(s.record, 'INTERVENE', { patternId: family, family });
            const pbaTier = this.pbaBridge.getMacroTier(sessionId);
            const correlated = correlateEscalation(s.record.tier, pbaTier);
            if (correlated !== s.record.tier) {
              s.record = { ...s.record, tier: correlated as BehaviorRecord['tier'] };
            }
          }
        } else if (s.record.state === 'PRIMED') {
          s.record = step(s.record, 'INTERVENE', { patternId: family, family });
          const pbaTier = this.pbaBridge.getMacroTier(sessionId);
          const correlated = correlateEscalation(s.record.tier, pbaTier);
          if (correlated !== s.record.tier) {
            s.record = { ...s.record, tier: correlated as BehaviorRecord['tier'] };
          }
        }
      } else {
        if (s.record.state === 'IDLE') {
          s.record = step(s.record, 'FIRST_TOOL_SIGNAL', { family });
        } else {
          s.record = step(s.record, 'TOOL_SIGNAL', { family });
        }
      }

      if (s.record.state === 'INTERVENING') {
        const tier = s.record.tier;
        const layer = intent.layerId ? this.layers.get(intent.layerId) ?? allLayers[0]! : allLayers[0]!;
        if (!layer) return intent;

        if (tier >= 3) {
          const body = resolveWarhead(layer as unknown as import('./types.js').WarheadLayer, tier, {
            count: s.record.counters[family] ?? 1,
            toolName: event.toolName,
            args: JSON.stringify(event.args ?? {}),
            chainViolations: chainViolationIds.join(', ') || 'none',
            pbaFamilies: this.pbaBridge.getActiveFamilies(sessionId).join(', ') || 'none',
            pbaTier: this.pbaBridge.getMacroTier(sessionId),
            escalationCount: s.record.escalationCount,
            correctTool: this.module.compliance?.remediationTools[0] ?? 'trident-container-test',
            anchor: `pta:${layer.id}:${Date.now()}`,
          });
          if (tier >= 4) {
            blockAtTeb(`[PTA GATE] ${body}`, layer.id);
          } else {
            blockAtTeb(body, layer.id);
          }
        }

        if (tier === 1 || tier === 2) {
          const body = resolveWarhead(layer as unknown as import('./types.js').WarheadLayer, tier, {
            count: s.record.counters[family] ?? 1,
            toolName: event.toolName,
            args: JSON.stringify(event.args ?? {}),
            chainViolations: chainViolationIds.join(', ') || 'none',
            pbaFamilies: this.pbaBridge.getActiveFamilies(sessionId).join(', ') || 'none',
            pbaTier: this.pbaBridge.getMacroTier(sessionId),
            escalationCount: s.record.escalationCount,
            correctTool: this.module.compliance?.remediationTools[0] ?? 'trident-container-test',
            anchor: `pta:${layer.id}:${Date.now()}`,
          });
          return dispatchTea(body, '');
        }
      }

      return intent;
    }

    return null;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getSeq(): number {
    return this.seq;
  }
}
