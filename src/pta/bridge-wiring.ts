import type { ParagonToolEngine } from "./engine.js";

export interface PbaEngineLike {
  onSignal(cb: (signal: { family: string; confidence: number; excerpt: string; seq: number; sessionId: string }) => void): void;
  onStateChange(cb: (state: { tier: number; escalationCount: number; activeFamilies: string[]; lastWarheadBody: string | null; sessionId?: string }) => void): void;
}

export function wirePbaBridge(pba: PbaEngineLike, pta: ParagonToolEngine): void {
  if (!pba || typeof pba !== "object") throw new TypeError("pba required");
  if (!pta || typeof pta !== "object") throw new TypeError("pta required");
  if (typeof pba.onSignal !== "function") throw new TypeError("pba.onSignal must be function");
  if (typeof pba.onStateChange !== "function") throw new TypeError("pba.onStateChange must be function");
  if (!pta.pbaBridge || typeof pta.pbaBridge.onPbaSignal !== "function") throw new TypeError("pta.pbaBridge.onPbaSignal required");
  pba.onSignal((signal) => {
    try {
      pta.pbaBridge.onPbaSignal(signal);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA bridge] onPbaSignal failed: ${m}`);
      throw err;
    }
  });
  pba.onStateChange((state) => {
    try {
      pta.pbaBridge.onPbaStateChange(state);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[PTA bridge] onPbaStateChange failed: ${m}`);
      throw err;
    }
  });
}
