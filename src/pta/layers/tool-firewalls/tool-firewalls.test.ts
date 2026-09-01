import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
function loadLayer(jsonPath: string) {
  const text = fs.readFileSync(jsonPath, "utf8");
  const raw = JSON.parse(text);
  if (!raw.id || !raw.toolMatchers || !raw.banks || !raw.enforcement || typeof raw.threshold !== "number") throw new Error("invalid layer");
  const compileGlob = (p: string, anchored: boolean) => { const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"); let out=""; for(let i=0;i<esc.length;i++) out+= esc[i]==="*" ? ".*":esc[i]; return anchored ? new RegExp("^"+out+"$","i"): new RegExp(out,"i"); };
  const banks = { descriptive: raw.banks.descriptive.map((p:string)=>compileGlob(p,false)), suggestive: raw.banks.suggestive.map((p:string)=>compileGlob(p,false)), substitute: raw.banks.substitute.map((p:string)=>compileGlob(p,false)), use: raw.banks.use.map((p:string)=>compileGlob(p,false)) };
  const toolMatchers = raw.toolMatchers.map((m:any)=>({ toolName: m.toolName, argPatterns: m.argPatterns ? Object.fromEntries(Object.entries(m.argPatterns).map(([k,v]:[string,any])=> [k,(v as string[]).map((pp:string)=>compileGlob(pp,true))])): undefined }));
  return { id: raw.id, description: raw.description??"", toolMatchers, banks, pbaContextBoost: raw.pbaContextBoost, enforcement: raw.enforcement, threshold: raw.threshold, severity: raw.severity, chainRules: raw.chainRules??[] };
}
import { ParagonToolEngine } from "../../engine.ts";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".");
const ids = ["SMOKE_TEST_GUARD","CONFIG_LOCK","TOOL_PERMISSION","PHASE_ENFORCEMENT","HASH_AS_PROOF","CONTAINER_SUBSTITUTION","SHIP_EVIDENCE_GATE"] as const;

describe("tool-firewalls: 7 layer JSONs", () => {
  for (const id of ids) {
    it(`${id} validates + loads via loadLayer with required fields`, () => {
      const p = path.join(dir, `${id}.layer.json`);
      const layer = loadLayer(p);
      expect(layer.id).toBe(id);
      expect(layer.toolMatchers.length).toBeGreaterThan(0);
      expect(layer.banks.descriptive).toBeDefined();
      expect(layer.banks.suggestive).toBeDefined();
      expect(layer.banks.substitute).toBeDefined();
      expect(layer.banks.use).toBeDefined();
      expect(layer.enforcement.tier1).toContain("DETECTED");
      expect(layer.enforcement.tier1).toContain("WHY THIS FIRED");
      expect(layer.enforcement.tier1).toContain("WHAT THIS MEANS");
      expect(layer.enforcement.tier1).toContain("CORRECT BEHAVIOR");
      expect(layer.enforcement.tier1).toContain("SELF-CHECK");
      expect(layer.enforcement.tier1).toContain("RESET PATH");
      expect(layer.enforcement.tier4).toContain("DETECTED");
      expect(layer.enforcement.tier4).toContain("R6");
      expect(typeof layer.threshold).toBe("number");
      expect(layer.severity).toBeDefined();
    });
  }

  it("SMOKE_TEST_GUARD fires on inline-exec (node -e) and suppresses on legitimate read", () => {
    const smoke = loadLayer(path.join(dir, "SMOKE_TEST_GUARD.layer.json"));
    const mod = {
      name: "test-smoke",
      brandPrefix: "PTA",
      layers: [{ id: smoke.id, description: smoke.description, toolMatchers: smoke.toolMatchers, banks: smoke.banks, pbaContextBoost: smoke.pbaContextBoost, enforcement: smoke.enforcement, threshold: smoke.threshold, severity: smoke.severity as "HIGH", chainRules: smoke.chainRules }],
      chainRules: [],
      compliance: { escapeHatches: ["read","grep","glob"], remediationTools: ["trident-container-test"], verificationPatterns: [/PASS/i] },
      pbaBridge: { enabled: false }
    };
    const eng = new ParagonToolEngine(mod as never);
    eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'console.log(1)'" }, sessionId: "smoke-fire" } as never);
    expect(eng.getTier("smoke-fire")).toBeGreaterThanOrEqual(1);
    eng.onToolEvent({ type: "tool.execute.before", toolName: "read", args: { filePath: "/tmp/x" }, sessionId: "smoke-legit" } as never);
    expect(eng.getTier("smoke-legit")).toBe(0);
  });

  it("SMOKE_TEST_GUARD fires on bun -e and bundle inspect", () => {
    const smoke = loadLayer(path.join(dir, "SMOKE_TEST_GUARD.layer.json"));
    const mod = {
      name: "test-smoke2",
      brandPrefix: "PTA",
      layers: [{ id: smoke.id, description: smoke.description, toolMatchers: smoke.toolMatchers, banks: smoke.banks, pbaContextBoost: smoke.pbaContextBoost, enforcement: smoke.enforcement, threshold: smoke.threshold, severity: smoke.severity as "HIGH", chainRules: smoke.chainRules }],
      chainRules: [],
      compliance: { escapeHatches: ["read","grep","glob"], remediationTools: ["trident-container-test"], verificationPatterns: [/PASS/i] },
      pbaBridge: { enabled: false }
    };
    const eng = new ParagonToolEngine(mod as never);
    eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "bun -e 'test'" }, sessionId: "bun-fire" } as never);
    expect(eng.getTier("bun-fire")).toBeGreaterThanOrEqual(1);
  });

  it("adversarial: empty/null/concurrent/boundary", async () => {
    const smoke = loadLayer(path.join(dir, "SMOKE_TEST_GUARD.layer.json"));
    const mod = {
      name: "test-adv",
      brandPrefix: "PTA",
      layers: [{ id: smoke.id, description: smoke.description, toolMatchers: smoke.toolMatchers, banks: smoke.banks, pbaContextBoost: smoke.pbaContextBoost, enforcement: smoke.enforcement, threshold: smoke.threshold, severity: smoke.severity as "HIGH", chainRules: smoke.chainRules }],
      chainRules: [],
      compliance: { escapeHatches: ["read","grep","glob"], remediationTools: ["trident-container-test"], verificationPatterns: [/PASS/i] },
      pbaBridge: { enabled: false }
    };
    const eng = new ParagonToolEngine(mod as never);
    expect(() => eng.onToolEvent(null as never)).toThrow();
    expect(() => eng.onToolEvent({} as never)).toThrow();
    expect(() => eng.onToolEvent({ toolName: "", sessionId: "x", type: "tool.execute.before", args: {} } as never)).toThrow();
    const tiers = await Promise.all(Array.from({ length: 5 }, (_, i) => Promise.resolve().then(() => {
      const sid = `conc-${i}`;
      try { eng.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'x'" }, sessionId: sid } as never); } catch {}
      return eng.getTier(sid);
    })));
    expect(tiers.every((t) => t >= 1)).toBe(true);
    const eng2 = new ParagonToolEngine(mod as never);
    for (let i = 0; i < 4; i++) { try { eng2.onToolEvent({ type: "tool.execute.before", toolName: "bash", args: { command: "node -e 'x'" }, sessionId: "bound" } as never); } catch {} }
    expect(eng2.getTier("bound")).toBe(4);
    let threw = false;
    try { eng2.onToolEvent({ type: "tool.execute.before", toolName: "read", args: { filePath: "/tmp/a" }, sessionId: "bound" } as never); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("all 7 layers load into engine together without error", () => {
    const all = ids.map((id) => {
      const l = loadLayer(path.join(dir, `${id}.layer.json`));
      return { id: l.id, description: l.description, toolMatchers: l.toolMatchers, banks: l.banks, pbaContextBoost: l.pbaContextBoost, enforcement: l.enforcement, threshold: l.threshold, severity: l.severity, chainRules: l.chainRules };
    });
    const mod = { name: "all-layers", brandPrefix: "PTA", layers: all, chainRules: [], compliance: { escapeHatches: ["read","grep","glob"], remediationTools: ["trident-container-test"], verificationPatterns: [/PASS/i] }, pbaBridge: { enabled: false } };
    const eng = new ParagonToolEngine(mod as never);
    expect(eng.getTier("fresh")).toBe(0);
  });
});
