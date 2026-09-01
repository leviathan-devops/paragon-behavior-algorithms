import type { ToolChainModule, ToolChainLayer, EnforcementEvent, PlatformAdapter } from "./types.js";
// @ts-ignore
import { PbaBridgeImpl, correlateEscalation } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-pba-bridge/index.js";
// @ts-ignore
import { classifyIntent } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-intent-classifier/index.js";
// @ts-ignore
import { step, createInitialRecord } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-state-machine/index.js";
// @ts-ignore
import { ChainTracker } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-chain-tracker/index.js";
// @ts-ignore
import { V2Synapse } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-synapse/index.js";
// @ts-ignore
import { ComplianceCollector } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-compliance-collector/index.js";
// @ts-ignore
import { resolveWarhead, dispatchTea, blockAtTeb } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-warhead-dispatcher/index.js";
// @ts-ignore
import { StructuredEnforcementError } from "../../../../../KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-warhead-dispatcher/types.js";
import type { BehaviorRecord } from "./types.js";
function isEscapeHatch(toolName: string, mod: ToolChainModule): boolean {
  return mod.compliance.escapeHatches.includes(toolName);
}
function isRemediation(toolName: string, mod: ToolChainModule): boolean {
  return mod.compliance.remediationTools.includes(toolName);
}
function buildThresholds(layers: ToolChainLayer[]): Record<string, number> {
  const fire: Record<string, number> = {};
  for (const l of layers) fire[l.id] = l.threshold;
  return fire;
}
export class ParagonToolEngine {
  public readonly pbaBridge: InstanceType<typeof PbaBridgeImpl>;
  private module: ToolChainModule;
  private layers: Map<string, ToolChainLayer> = new Map();
  private activeIds: Set<string> = new Set();
  private sessions: Map<string, { record: BehaviorRecord; synapse: InstanceType<typeof V2Synapse> }> = new Map();
  private chainTracker: InstanceType<typeof ChainTracker>;
  private collector: InstanceType<typeof ComplianceCollector>;
  private pendingTea: Map<string, string> = new Map();
  private dispatchCounts: Map<string, number> = new Map();
  private adapter: PlatformAdapter | null = null;
  constructor(mod: ToolChainModule) {
    if (!mod || typeof mod !== "object") throw new TypeError("ToolChainModule required");
    if (!mod.name || typeof mod.name !== "string") throw new TypeError("module.name required");
    if (!Array.isArray(mod.layers)) throw new TypeError("module.layers must be array");
    if (!mod.compliance || typeof mod.compliance !== "object") throw new TypeError("module.compliance required");
    if (!Array.isArray(mod.compliance.escapeHatches)) throw new TypeError("compliance.escapeHatches must be array");
    if (!Array.isArray(mod.compliance.remediationTools)) throw new TypeError("compliance.remediationTools must be array");
    if (!mod.pbaBridge || typeof mod.pbaBridge !== "object") throw new TypeError("module.pbaBridge required");
    this.module = mod;
    // @ts-ignore
    this.pbaBridge = new PbaBridgeImpl();
    // @ts-ignore
    this.chainTracker = new ChainTracker();
    // @ts-ignore
    this.collector = new ComplianceCollector();
    for (const l of mod.layers) {
      if (!l.id || typeof l.id !== "string") throw new TypeError("layer.id required");
      this.layers.set(l.id, l);
      this.activeIds.add(l.id);
      try {
        this.pbaBridge.registerLayer({ layerId: l.id, pbaContextBoost: l.pbaContextBoost });
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[PTA] registerLayer failed for ${l.id}: ${m}`);
        throw err;
      }
    }
  }
  setAdapter(adapter: PlatformAdapter): void {
    if (!adapter || typeof adapter !== "object") throw new TypeError("adapter required");
    this.adapter = adapter;
  }
  registerLayer(layer: ToolChainLayer): void {
    if (!layer || typeof layer !== "object") throw new TypeError("layer required");
    if (!layer.id || typeof layer.id !== "string") throw new TypeError("layer.id required");
    if (!layer.banks) throw new TypeError("layer.banks required");
    if (!layer.enforcement) throw new TypeError("layer.enforcement required");
    this.layers.set(layer.id, layer);
    this.activeIds.add(layer.id);
    try {
      this.pbaBridge.registerLayer({ layerId: layer.id, pbaContextBoost: layer.pbaContextBoost });
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] registerLayer failed: ${m}`);
      throw err;
    }
  }
  activateLayer(layerOrId: string | ToolChainLayer): void {
    if (typeof layerOrId === "string") {
      if (!this.layers.has(layerOrId)) throw new Error(`activateLayer: unknown layer ${layerOrId}`);
      this.activeIds.add(layerOrId);
      return;
    }
    if (layerOrId && typeof layerOrId === "object" && typeof (layerOrId as ToolChainLayer).id === "string") {
      const l = layerOrId as ToolChainLayer;
      if (!this.layers.has(l.id)) this.layers.set(l.id, l);
      this.activeIds.add(l.id);
      try {
        this.pbaBridge.registerLayer({ layerId: l.id, pbaContextBoost: l.pbaContextBoost });
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[PTA] activateLayer register failed: ${m}`);
        throw err;
      }
      return;
    }
    throw new TypeError("activateLayer: string id or ToolChainLayer required");
  }
  deactivateLayer(layerId: string): void {
    if (!layerId || typeof layerId !== "string") throw new TypeError("layerId required");
    this.activeIds.delete(layerId);
  }
  getTier(sessionId: string): number {
    if (!sessionId || typeof sessionId !== "string") throw new TypeError("sessionId required");
    const s = this.sessions.get(sessionId);
    if (!s) return 0;
    return s.record.tier;
  }
  private getActiveLayers(): ToolChainLayer[] {
    const out: ToolChainLayer[] = [];
    for (const id of this.activeIds) {
      const l = this.layers.get(id);
      if (l) out.push(l);
    }
    return out;
  }
  private createSession(sid: string): { record: BehaviorRecord; synapse: InstanceType<typeof V2Synapse> } {
    const rec = createInitialRecord() as BehaviorRecord;
    const thresholds = buildThresholds(this.getActiveLayers());
    const fire = Object.keys(thresholds).length > 0 ? thresholds : { __default: 0.9 };
    const syn = new V2Synapse({ fire, decayAlpha: 0.05, refractorySeq: 25 });
    const entry = { record: rec, synapse: syn };
    this.sessions.set(sid, entry);
    return entry;
  }
  private getOrCreateSession(sid: string): { record: BehaviorRecord; synapse: InstanceType<typeof V2Synapse> } {
    let s = this.sessions.get(sid);
    if (!s) s = this.createSession(sid);
    return s;
  }
  private classifyForEvent(sid: string, ev: EnforcementEvent): ReturnType<typeof classifyIntent> {
    const active = this.getActiveLayers();
    const previousTools = this.chainTracker.recentTools(sid, 10).map((r: { tool: string }) => r.tool);
    let chainViolations: string[] = [];
    try {
      const rules = [...(this.module.chainRules ?? []), ...active.flatMap((l) => l.chainRules ?? [])];
      const violations = this.chainTracker.evaluateRules(sid, ev.toolName, ev.args ?? {}, rules as unknown as never);
      chainViolations = violations.map((v: { layerId: string }) => v.layerId);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] evaluateRules failed: ${m}`);
      throw err;
    }
    const chainContext = { previousTools, chainViolations };
    let pbaContext: { activeFamilies: string[]; latestSignals: unknown[]; macroTier: number } = { activeFamilies: [], latestSignals: [], macroTier: 0 };
    try {
      if (this.module.pbaBridge.enabled) {
        const families = this.pbaBridge.getActiveFamilies(sid);
        const signals = this.pbaBridge.getRecentSignals(sid, 10);
        const macroTier = this.pbaBridge.getMacroTier(sid);
        pbaContext = { activeFamilies: families, latestSignals: signals, macroTier };
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] pbaBridge query failed: ${m}`);
      pbaContext = { activeFamilies: [], latestSignals: [], macroTier: 0 };
    }
    return classifyIntent({ toolName: ev.toolName, args: ev.args ?? {} }, chainContext, pbaContext as unknown as never, active as unknown as never);
  }
  private resolveBody(layer: ToolChainLayer, tier: number, ev: EnforcementEvent, sess: { record: BehaviorRecord }): string {
    const count = (this.dispatchCounts.get(layer.id) ?? 0) + 1;
    const chainViolations = this.chainTracker.recentTools(ev.sessionId, 5).map((r: { tool: string }) => r.tool).join(",") || "none";
    let pbaFamilies = "none";
    let pbaTier = 0;
    try {
      const fams = this.pbaBridge.getActiveFamilies(ev.sessionId);
      if (fams.length > 0) pbaFamilies = fams.join(",");
      pbaTier = this.pbaBridge.getMacroTier(ev.sessionId);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] pba families query failed: ${m}`);
    }
    const ctx = {
      count,
      toolName: ev.toolName,
      args: JSON.stringify(ev.args ?? {}),
      chainViolations,
      pbaFamilies,
      pbaTier,
      escalationCount: sess.record.escalationCount,
      correctTool: this.module.compliance.remediationTools[0] ?? "trident-container-test",
      anchor: `pta:${layer.id}:${Date.now()}`,
    };
    try {
      return resolveWarhead(layer as unknown as never, tier, ctx as unknown as never);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] resolveWarhead failed: ${m}`);
      const raw = (layer.enforcement as unknown as Record<string, string>)[`tier${Math.min(4, Math.max(1, tier))}`] ?? layer.enforcement.tier1;
      let out = raw;
      for (const [k, v] of Object.entries(ctx)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    }
  }
  private surfaceForTier(tier: number): string {
    if (tier <= 2) return "TEA";
    if (tier === 3) return "TEB";
    return "GATE";
  }
  private tryResetOnCompliance(sid: string, ev: EnforcementEvent): void {
    try {
      const sess = this.sessions.get(sid);
      if (!sess) return;
      if (!isRemediation(ev.toolName, this.module)) return;
      if ((ev.exitCode ?? 0) !== 0) return;
      const isGenuine = ev.output ? ev.output.length > 20 : false;
      sess.record = step(sess.record, "COMPLIANCE_VERIFIED", { isGenuine } as unknown as never);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA] tryResetOnCompliance failed: ${m}`);
    }
  }
  onToolEvent(event: EnforcementEvent): string | void {
    if (!event || typeof event !== "object") throw new TypeError("event required");
    if (!event.toolName || typeof event.toolName !== "string") throw new TypeError("event.toolName required");
    if (!event.sessionId || typeof event.sessionId !== "string") throw new TypeError("event.sessionId required");
    const sid = event.sessionId;
    const sess = this.getOrCreateSession(sid);
    if (isEscapeHatch(event.toolName, this.module) || isRemediation(event.toolName, this.module)) {
      if (event.type === "tool.call.completed" || event.type === "tool.execute.after") {
        try { this.chainTracker.recordResult(sid, event.toolName, event.exitCode ?? 0, event.output ?? ""); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordResult failed: ${m}`); throw err; }
        try { this.collector.measureCompliance(event.toolName, event.args ?? {}, event.exitCode ?? 0, event.output ?? ""); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] measureCompliance failed: ${m}`); }
        this.tryResetOnCompliance(sid, event);
      } else if (event.type === "tool.call.started" || event.type === "tool.execute.before") {
        try { this.chainTracker.recordCall(sid, event.toolName, event.args ?? {}); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordCall failed: ${m}`); throw err; }
      }
      return;
    }
    if (event.type === "tool.call.started") {
      try { this.chainTracker.recordCall(sid, event.toolName, event.args ?? {}); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordCall failed: ${m}`); throw err; }
      try {
        const intent = this.classifyForEvent(sid, event);
        if (intent.action !== "ALLOW" && intent.layerId) {
          try { sess.synapse.getNeuron(intent.layerId).accumulate(intent.confidence, sess.record.seq); } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("no threshold")) {
              try {
                const thresholds = buildThresholds(this.getActiveLayers());
                if (!(intent.layerId in thresholds)) thresholds[intent.layerId] = 0.5;
                sess.synapse = new V2Synapse({ fire: thresholds, decayAlpha: 0.05, refractorySeq: 25 });
                sess.synapse.getNeuron(intent.layerId).accumulate(intent.confidence, sess.record.seq);
              } catch (e2: unknown) { const m2 = e2 instanceof Error ? e2.message : String(e2); console.error(`[PTA] synapse retry failed: ${m2}`); }
            } else console.error(`[PTA] synapse accumulate failed: ${msg}`);
          }
          try {
            if (sess.record.state === "IDLE") sess.record = step(sess.record, "FIRST_TOOL_SIGNAL", { family: intent.layerId } as unknown as never);
            else sess.record = step(sess.record, "TOOL_SIGNAL", { family: intent.layerId } as unknown as never);
            if (intent.sources.chainContext.chainViolations.length > 0 && sess.record.state === "MONITORING") {
              sess.record = step(sess.record, "CHAIN_PATTERN_HIT", { patternId: intent.layerId } as unknown as never);
              if (sess.record.state === "PRIMED") sess.record = step(sess.record, "INTERVENE", { patternId: intent.layerId } as unknown as never);
            }
          } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] step failed: ${m}`); }
        }
      } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] classify failed: ${m}`); throw err; }
      return;
    }
    if (event.type === "tool.call.completed") {
      try { this.chainTracker.recordResult(sid, event.toolName, event.exitCode ?? 0, event.output ?? ""); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordResult failed: ${m}`); throw err; }
      try { this.collector.measureCompliance(event.toolName, event.args ?? {}, event.exitCode ?? 0, event.output ?? ""); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] measureCompliance failed: ${m}`); }
      this.tryResetOnCompliance(sid, event);
      return;
    }
    if (event.type === "tool.execute.before") {
      try { this.chainTracker.recordCall(sid, event.toolName, event.args ?? {}); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordCall failed: ${m}`); }
      if (sess.record.tier === 4) {
        const lastLayerId = (sess as unknown as Record<string, unknown>)._lastLayer as string | undefined;
        const active = this.getActiveLayers();
        let matched: typeof active[number] | undefined;
        if (lastLayerId) {
          const last = active.find((l) => l.id === lastLayerId);
          if (last) {
            const matches = !last.toolMatchers || last.toolMatchers.length === 0 || last.toolMatchers.some((m) => {
              const name = m.toolName;
              if (typeof name === "string") {
                if (name.includes("*") || name.includes("?")) {
                  const esc = name.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
                  return new RegExp(`^${esc}$`, "i").test(event.toolName);
                }
                return name === event.toolName;
              }
              if (name instanceof RegExp) return name.test(event.toolName);
              return false;
            });
            if (matches) matched = last;
          }
        } else {
          matched = active.find((l) => {
            if (!l.toolMatchers || l.toolMatchers.length === 0) return true;
            return l.toolMatchers.some((m) => {
              const name = m.toolName;
              if (typeof name === "string") {
                if (name.includes("*") || name.includes("?")) {
                  const esc = name.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
                  return new RegExp(`^${esc}$`, "i").test(event.toolName);
                }
                return name === event.toolName;
              }
              if (name instanceof RegExp) return name.test(event.toolName);
              return false;
            });
          });
        }
        if (matched) {
          const body = this.resolveBody(matched, 4, event, sess);
          const prefixed = `[PTA GATE] ${body}`;
          if (this.adapter) { try { this.adapter.inject({ type: "chat.message", content: prefixed, sessionId: sid }); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] inject failed: ${m}`); } }
          throw new StructuredEnforcementError({ detected: `${matched.id} at tier 4`, correction: prefixed });
        }
        return;
      }
      let intent: ReturnType<typeof classifyIntent>;
      try { intent = this.classifyForEvent(sid, event); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] classify failed: ${m}`); throw err; }
      if (intent.action === "ALLOW" || !intent.layerId) return;
      try { sess.synapse.getNeuron(intent.layerId).accumulate(intent.confidence, sess.record.seq); } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("no threshold")) {
          try {
            const thresholds = buildThresholds(this.getActiveLayers());
            if (!(intent.layerId in thresholds)) thresholds[intent.layerId] = 0.5;
            sess.synapse = new V2Synapse({ fire: thresholds, decayAlpha: 0.05, refractorySeq: 25 });
            sess.synapse.getNeuron(intent.layerId).accumulate(intent.confidence, sess.record.seq);
          } catch (e2: unknown) { const m2 = e2 instanceof Error ? e2.message : String(e2); console.error(`[PTA] synapse retry failed: ${m2}`); }
        } else console.error(`[PTA] synapse accumulate failed: ${msg}`);
      }
      try {
        if (sess.record.state === "IDLE") sess.record = step(sess.record, "FIRST_TOOL_SIGNAL", { family: intent.layerId } as unknown as never);
        else sess.record = step(sess.record, "TOOL_SIGNAL", { family: intent.layerId } as unknown as never);
        if (intent.sources.chainContext.chainViolations.length > 0 && sess.record.state === "MONITORING") {
          sess.record = step(sess.record, "CHAIN_PATTERN_HIT", { patternId: intent.layerId } as unknown as never);
          if (sess.record.state === "PRIMED") {
            const corr = correlateEscalation(1, this.pbaBridge.getMacroTier(sid));
            sess.record = step(sess.record, "INTERVENE", { patternId: intent.layerId } as unknown as never);
            if (corr > sess.record.tier) sess.record.tier = corr as BehaviorRecord["tier"];
          }
        }
        if (intent.action === "BLOCK") {
          if (sess.record.state !== "INTERVENING") {
            sess.record.state = "INTERVENING";
            const corr = correlateEscalation(3, this.pbaBridge.getMacroTier(sid));
            sess.record.tier = Math.max(3, corr) as BehaviorRecord["tier"];
          } else {
            if (sess.record.tier < 4) sess.record.tier = Math.min(4, sess.record.tier + 1) as BehaviorRecord["tier"];
            if (sess.record.tier < 3) sess.record.tier = 3 as BehaviorRecord["tier"];
          }
        } else if (intent.action === "ADVISE") {
          if (sess.record.state !== "INTERVENING") {
            sess.record.state = "INTERVENING";
            const corr = correlateEscalation(1, this.pbaBridge.getMacroTier(sid));
            sess.record.tier = Math.max(1, corr) as BehaviorRecord["tier"];
            if (sess.record.tier < 1) sess.record.tier = 1 as BehaviorRecord["tier"];
          } else {
            if (sess.record.tier < 4) sess.record.tier = Math.min(4, sess.record.tier + 1) as BehaviorRecord["tier"];
          }
        }
        (sess as unknown as Record<string, unknown>)._lastLayer = intent.layerId;
      } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] step failed: ${m}`); }
      const layer = this.layers.get(intent.layerId);
      if (!layer) return;
      const currentTier = sess.record.tier;
      this.dispatchCounts.set(layer.id, (this.dispatchCounts.get(layer.id) ?? 0) + 1);
      try { this.collector.recordOffense(layer.id, intent); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordOffense failed: ${m}`); }
      try { this.collector.recordDispatch(layer.id, currentTier, this.surfaceForTier(currentTier)); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] recordDispatch failed: ${m}`); }
      const body = this.resolveBody(layer, currentTier, event, sess);
      if (currentTier === 1 || currentTier === 2) {
        this.pendingTea.set(sid, body);
        return;
      }
      if (currentTier === 3) {
        blockAtTeb(body, layer.id);
      }
      if (currentTier === 4) {
        const prefixed = `[PTA GATE] ${body}`;
        if (this.adapter) { try { this.adapter.inject({ type: "chat.message", content: prefixed, sessionId: sid }); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] inject failed: ${m}`); } }
        throw new StructuredEnforcementError({ detected: `${layer.id} at tier 4`, correction: prefixed });
      }
      return;
    }
    if (event.type === "tool.execute.after") {
      const pending = this.pendingTea.get(sid);
      if (pending) {
        this.pendingTea.delete(sid);
        try { return dispatchTea(pending, event.output ?? ""); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] dispatchTea failed: ${m}`); return (event.output ?? "") + "\n\n" + pending; }
      }
      return event.output;
    }
    return;
  }
  handleToolAfter(sessionId: string, toolName: string, output: string): string {
    if (!sessionId || typeof sessionId !== "string") throw new TypeError("sessionId required");
    const pending = this.pendingTea.get(sessionId);
    if (pending) {
      this.pendingTea.delete(sessionId);
      try { return dispatchTea(pending, output); } catch (err: unknown) { const m = err instanceof Error ? err.message : String(err); console.error(`[PTA] handleToolAfter failed: ${m}`); return output + "\n\n" + pending; }
    }
    void toolName;
    return output;
  }
}
