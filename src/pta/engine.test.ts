import { describe, it, expect } from "bun:test";
import { ParagonToolEngine } from "./engine.js";
import { wirePbaBridge } from "./bridge-wiring.js";
import { ToolEventRouter } from "./hooks/tool-event-router.js";
import { OpencodeAdapter } from "./hooks/opencode-adapter.js";
import { MockAdapter } from "./hooks/mock.js";
import type { ToolChainModule, ToolChainLayer } from "./types.js";

function makeLayer(overrides?: Partial<ToolChainLayer>): ToolChainLayer {
  return {
    id: "TEST_LAYER",
    description: "test layer",
    toolMatchers: [{ toolName: "bash", argPatterns: { command: ["*node -e*"] } }],
    banks: {
      descriptive: [/for the container test/i],
      suggestive: [/\bquick test\b/i],
      substitute: [/instead of the container/i],
      use: [/trident-container-test/i],
    },
    pbaContextBoost: { families: ["TEST_EVASION"], boostAmount: 0.2 },
    enforcement: {
      tier1: "DETECTED tier1 WHY THIS FIRED tier1 WHAT THIS MEANS tier1 CORRECT BEHAVIOR tier1 SELF-CHECK tier1 RESET PATH tier1 count={count} tool={toolName}",
      tier2: "DETECTED tier2 WHY THIS FIRED tier2 WHAT THIS MEANS tier2 CORRECT BEHAVIOR tier2 SELF-CHECK tier2 RESET PATH tier2 count={count}",
      tier3: "DETECTED tier3 WHY THIS FIRED tier3 WHAT THIS MEANS tier3 CORRECT BEHAVIOR tier3 SELF-CHECK tier3 RESET PATH tier3 tool={toolName}",
      tier4: "DETECTED tier4 WHY THIS FIRED tier4 WHAT THIS MEANS tier4 CORRECT BEHAVIOR tier4 SELF-CHECK tier4 RESET PATH tier4 escalation={escalationCount}",
    },
    threshold: 0.5,
    severity: "HIGH",
    chainRules: [],
    ...overrides,
  };
}

function makeModule(layers?: ToolChainLayer[], pbaEnabled = true): ToolChainModule {
  return {
    name: "test-module",
    brandPrefix: "PTA",
    layers: layers ?? [makeLayer()],
    chainRules: [],
    compliance: {
      escapeHatches: ["read", "grep", "glob"],
      remediationTools: ["trident-container-test"],
      verificationPatterns: [/PASS/i],
    },
    pbaBridge: { enabled: pbaEnabled, signalFilter: undefined, contextWindowSize: 20, confidenceBoost: 0.2 },
  };
}

describe("ParagonToolEngine", () => {
  it("engine init exposes pbaBridge", () => {
    const eng = new ParagonToolEngine(makeModule());
    expect(eng.pbaBridge).toBeDefined();
    expect(typeof eng.pbaBridge.onPbaSignal).toBe("function");
    expect(eng.getTier("sid-1")).toBe(0);
  });

  it("tool event routing via ToolEventRouter", () => {
    const eng = new ParagonToolEngine(makeModule());
    const router = new ToolEventRouter(eng);
    router.route({ toolName: "read", args: {}, sessionId: "s1", type: "tool.execute.before" });
    expect(eng.getTier("s1")).toBe(0);
  });

  it("tier-1 TEA append via pending queue", () => {
    const eng = new ParagonToolEngine(makeModule());
    const before = { type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: "tea-sid" };
    eng.onToolEvent(before as never);
    const tier = eng.getTier("tea-sid");
    expect(tier).toBe(1);
    const after = eng.onToolEvent({ type: "tool.execute.after", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: "tea-sid", output: "1" } as never) as string;
    expect(typeof after).toBe("string");
    expect(after.includes("DETECTED")).toBe(true);
  });

  it("tier-3 TEB throw with StructuredEnforcementError", () => {
    const layerWithChain = makeLayer({
      id: "CHAIN_LAYER",
      chainRules: [{ name: "need-container", description: "need", requires: [{ tool: "trident-container-test" }], violation: { layerId: "CHAIN_LAYER" } }],
      threshold: 0.4,
    });
    const eng = new ParagonToolEngine(makeModule([layerWithChain]));
    let threw = false;
    try {
      eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: "teb-sid" } as never);
    } catch (e: unknown) {
      const err = e as { name?: string; tier?: number; machine?: string };
      threw = true;
      expect(err.name).toBe("StructuredEnforcementError");
      expect(err.tier).toBe(3);
      expect(err.machine).toBe("pta");
    }
    expect(threw).toBe(true);
  });

  it("tier-4 directive with [PTA GATE] prefix", () => {
    const eng = new ParagonToolEngine(makeModule());
    const adapter = new OpencodeAdapter(eng);
    const sid = "gate-sid";
    for (let i = 0; i < 4; i++) {
      try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never); } catch {}
    }
    const tier = eng.getTier(sid);
    expect(tier).toBe(4);
    let threw = false;
    try {
      eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never);
    } catch (e: unknown) {
      threw = true;
      const err = e as { correction?: string };
      expect(err.correction?.startsWith("[PTA GATE]")).toBe(true);
    }
    expect(threw).toBe(true);
    expect(adapter.getInjected().some((m) => m.content.startsWith("[PTA GATE]"))).toBe(true);
  });

  it("escape hatches pass at tier 4", () => {
    const eng = new ParagonToolEngine(makeModule());
    const sid = "escape-sid";
    for (let i = 0; i < 4; i++) { try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never); } catch {} }
    expect(eng.getTier(sid)).toBe(4);
    let threw = false;
    try { eng.onToolEvent({ type: "tool.execute.before", toolName: "read", args: { filePath: "/tmp/x" }, sessionId: sid } as never); } catch { threw = true; }
    expect(threw).toBe(false);
    threw = false;
    try { eng.onToolEvent({ type: "tool.execute.before", toolName: "trident-container-test", args: {}, sessionId: sid } as never); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("bridge signal reception increments classification", () => {
    const eng = new ParagonToolEngine(makeModule());
    const sid = "bridge-sid";
    eng.pbaBridge.onPbaSignal({ family: "TEST_EVASION", confidence: 0.8, excerpt: "quick test", seq: 1, sessionId: sid });
    eng.pbaBridge.onPbaStateChange({ tier: 2, escalationCount: 1, activeFamilies: ["TEST_EVASION"], lastWarheadBody: null, sessionId: sid });
    expect(eng.pbaBridge.getActiveFamilies(sid)).toContain("TEST_EVASION");
    expect(eng.pbaBridge.getMacroTier(sid)).toBe(2);
    expect(eng.pbaBridge.getRecentSignals(sid, 5).length).toBe(1);
  });

  it("layer activate/deactivate", () => {
    const eng = new ParagonToolEngine(makeModule());
    const sid = "layer-sid";
    eng.deactivateLayer("TEST_LAYER");
    try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never); } catch {}
    expect(eng.getTier(sid)).toBe(0);
    eng.activateLayer("TEST_LAYER");
    eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never);
    expect(eng.getTier(sid)).toBe(1);
  });

  it("standalone mode bridge disabled still enforces", () => {
    const eng = new ParagonToolEngine(makeModule(undefined, false));
    const sid = "standalone-sid";
    eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never);
    expect(eng.getTier(sid)).toBe(1);
  });

  it("wirePbaBridge connects signals", () => {
    const eng = new ParagonToolEngine(makeModule());
    let sigCb: (s: never) => void = () => {};
    let stateCb: (s: never) => void = () => {};
    const fakePba = {
      onSignal(cb: never) { sigCb = cb as never; },
      onStateChange(cb: never) { stateCb = cb as never; },
    };
    wirePbaBridge(fakePba as never, eng);
    // @ts-ignore
    sigCb({ family: "TEST_EVASION", confidence: 0.9, excerpt: "x", seq: 1, sessionId: "wired-sid" });
    expect(eng.pbaBridge.getRecentSignals("wired-sid", 5).length).toBe(1);
    // @ts-ignore
    stateCb({ tier: 1, escalationCount: 0, activeFamilies: ["TEST_EVASION"], lastWarheadBody: null, sessionId: "wired-sid" });
    expect(eng.pbaBridge.getActiveFamilies("wired-sid")).toContain("TEST_EVASION");
  });

  it("adversarial empty/null rejects", () => {
    const eng = new ParagonToolEngine(makeModule());
    expect(() => eng.onToolEvent(null as never)).toThrow();
    expect(() => eng.onToolEvent({} as never)).toThrow();
    expect(() => eng.onToolEvent({ toolName: "", sessionId: "x", type: "tool.execute.before", args: {} } as never)).toThrow();
    expect(() => eng.getTier("" as never)).toThrow();
    expect(() => eng.activateLayer("" as never)).toThrow();
  });

  it("adversarial concurrent sessions isolated", async () => {
    const eng = new ParagonToolEngine(makeModule());
    const promises = Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() => {
      const sid = `concurrent-${i}`;
      try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never); } catch {}
      return eng.getTier(sid);
    }));
    const tiers = await Promise.all(promises);
    expect(tiers.every((t) => t === 1)).toBe(true);
    expect(eng.getTier("concurrent-0")).toBe(1);
    expect(eng.getTier("concurrent-9")).toBe(1);
  });

  it("adversarial boundary tier 4 gates only violating layer", () => {
    const eng = new ParagonToolEngine(makeModule());
    const otherLayer = makeLayer({ id: "OTHER", toolMatchers: [{ toolName: "write" }], threshold: 0.9 });
    eng.registerLayer(otherLayer);
    const sid = "boundary-sid";
    for (let i=0;i<4;i++) { try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'quick test'" }, sessionId: sid } as never);} catch{} }
    expect(eng.getTier(sid)).toBe(4);
    let threwWrite = false;
    try { eng.onToolEvent({ type: "tool.execute.before", toolName: "write", args: { filePath: "/tmp/a" }, sessionId: sid } as never);} catch { threwWrite = true; }
    expect(threwWrite).toBe(false);
  });

  it("mock adapter records calls", () => {
    const mock = new MockAdapter();
    mock.normalizeEvent({ toolName: "bash", args: {}, sessionId: "m1", type: "tool.execute.before" });
    mock.inject({ type: "chat.message", content: "hi" });
    mock.interceptTool({ type: "tool.execute.before", toolName: "bash", args: {}, sessionId: "m1" } as never);
    mock.observeTool({ type: "tool.call.started", toolName: "bash", args: {}, sessionId: "m1" } as never);
    mock.observeCompletion({ type: "tool.call.completed", toolName: "bash", args: {}, sessionId: "m1" } as never);
    const calls = mock.getCalls();
    expect(calls.normalized).toBe(1);
    expect(calls.injected).toBe(1);
    expect(calls.intercepted).toBe(1);
  });

  it("opencode adapter normalize/inject/intercept/observe", () => {
    const eng = new ParagonToolEngine(makeModule());
    const adapter = new OpencodeAdapter(eng);
    const ev = adapter.normalizeEvent({ toolName: "bash", args: { command: "hi" }, sessionId: "op-sid", type: "tool.execute.before" });
    expect(ev?.toolName).toBe("bash");
    adapter.observeTool({ type: "tool.call.started", toolName: "bash", args: {}, sessionId: "op-sid2" } as never);
    adapter.observeCompletion({ type: "tool.call.completed", toolName: "bash", args: {}, sessionId: "op-sid2", exitCode: 0, output: "ok" } as never);
    expect(adapter.getInjected().length).toBe(0);
  });
});
