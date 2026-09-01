
import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GodLoopOrchestrator } from "./god-loop.js";
import { ParagonToolEngine } from "../pta/engine.js";

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pta/layers/god-loop");
const home = process.env.HOME || "/tmp";
const loaderRel = path.join(home, "OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/Paragon_Microstructures/ms-layer-loader/src/core/engine.ts");
const { loadLayer } = await import(loaderRel);

const PHASES = ["INIT","AUDIT","SCORE","DECIDE","PLAN","DISPATCH","COLLECT","VERIFY","AUDIT_RECHECK","PROBLEM_SOLVE","CONTAINER_TEST"] as const;

function makeLayers() {
  const files = fs.readdirSync(base).filter((f:string)=>f.endsWith(".json")).sort();
  return files.map((f:string)=>{
    const raw = JSON.parse(fs.readFileSync(path.join(base,f),"utf8"));
    return {
      id: raw.id,
      description: raw.description,
      toolMatchers: raw.toolMatchers.map((m:any)=>({toolName:m.toolName})),
      banks: { descriptive: [/x/], suggestive: [/y/], substitute: [/z/], use: [/w/] },
      pbaContextBoost: raw.pbaContextBoost,
      enforcement: raw.enforcement,
      threshold: raw.threshold,
      severity: raw.severity,
      chainRules: raw.chainRules,
    };
  });
}

describe("god-loop layer JSONs", () => {
  it(">=8 layer JSONs exist", () => {
    const files = fs.readdirSync(base).filter((f:string)=>f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(8);
  });
  it("each layer validates + loads + 6-section warhead + gate prefix", async () => {
    const files = fs.readdirSync(base).filter((f:string)=>f.endsWith(".json")).sort();
    for (const f of files) {
      const full = path.join(base,f);
      const c = loadLayer(full);
      expect(c.id.startsWith("GOD_LOOP_")).toBe(true);
      expect(c.toolMatchers.length).toBeGreaterThan(0);
      expect(c.banks.descriptive.length).toBeGreaterThan(0);
      expect(c.enforcement.tier1.includes("DETECTED")).toBe(true);
      expect(c.enforcement.tier1.includes("WHY THIS FIRED")).toBe(true);
      expect(c.enforcement.tier1.includes("WHAT THIS MEANS")).toBe(true);
      expect(c.enforcement.tier1.includes("CORRECT BEHAVIOR")).toBe(true);
      expect(c.enforcement.tier1.includes("SELF-CHECK")).toBe(true);
      expect(c.enforcement.tier1.includes("RESET PATH")).toBe(true);
      expect(c.enforcement.tier4.startsWith("[PTA GATE")).toBe(true);
      expect(typeof c.threshold).toBe("number");
    }
  });
  it("adversarial: empty/null/boundary layer load rejects", () => {
    expect(()=>loadLayer("" as any)).toThrow();
    expect(()=>loadLayer(null as any)).toThrow();
    expect(()=>loadLayer(path.join(base,"nope.json"))).toThrow();
  });
});

describe("enterPhase wiring", () => {
  it("activates layer per phase and deactivates previous", () => {
    const layers = makeLayers();
    const mod = { name:"t", brandPrefix:"PTA", layers, chainRules:[], compliance:{escapeHatches:["read","grep","glob"], remediationTools:["trident-container-test"], verificationPatterns:[/PASS/]}, pbaBridge:{enabled:false} } as any;
    const pta = new ParagonToolEngine(mod);
    const orch = new GodLoopOrchestrator("/tmp");
    orch.setPtaEngine(pta);
    for (const ph of PHASES) {
      orch.enterPhase(ph as any);
      expect(orch.getCurrentGodLoopLayerId()).toBe("GOD_LOOP_" + ph);
    }
    const active = (pta as any).activeIds as Set<string>;
    expect(active.has("GOD_LOOP_CONTAINER_TEST")).toBe(true);
    expect(active.has("GOD_LOOP_INIT")).toBe(false);
  });
  it("standalone mode without PTA still sets current layer", () => {
    const orch = new GodLoopOrchestrator("/tmp");
    orch.enterPhase("INIT" as any);
    expect(orch.getCurrentGodLoopLayerId()).toBe("GOD_LOOP_INIT");
    orch.enterPhase("AUDIT" as any);
    expect(orch.getCurrentGodLoopLayerId()).toBe("GOD_LOOP_AUDIT");
  });
  it("adversarial invalid phase handled without throw", () => {
    const layers = makeLayers();
    const mod = { name:"t", brandPrefix:"PTA", layers, chainRules:[], compliance:{escapeHatches:["read"], remediationTools:["trident-container-test"], verificationPatterns:[/PASS/]}, pbaBridge:{enabled:false} } as any;
    const pta = new ParagonToolEngine(mod);
    const orch = new GodLoopOrchestrator("/tmp");
    orch.setPtaEngine(pta);
    expect(()=>orch.enterPhase(null as any)).not.toThrow();
    expect(()=>orch.enterPhase("" as any)).not.toThrow();
    expect(()=>orch.enterPhase("FAKE" as any)).not.toThrow();
  });
  it("concurrent enterPhase calls isolated", async () => {
    const layers = makeLayers();
    const mod = { name:"t", brandPrefix:"PTA", layers, chainRules:[], compliance:{escapeHatches:["read"], remediationTools:["trident-container-test"], verificationPatterns:[/PASS/]}, pbaBridge:{enabled:false} } as any;
    const pta = new ParagonToolEngine(mod);
    const orch = new GodLoopOrchestrator("/tmp");
    orch.setPtaEngine(pta);
    await Promise.all(PHASES.map((ph:string)=>Promise.resolve().then(()=>orch.enterPhase(ph as any))));
    expect(orch.getCurrentGodLoopLayerId()).toBeTruthy();
  });
});
