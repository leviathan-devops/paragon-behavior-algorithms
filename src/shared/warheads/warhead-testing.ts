import { Warhead } from '../warhead-interface.js';
import { tridentLog } from '../../utils.js';
import { loadKnowledgeTechniqueWithCode } from '../knowledge-loader.js';
import { evidenceGate } from '../evidence-gate.js';

/**
 * TESTING WARHEAD — Loads KB-05 technique reference code for T1 injection.
 * Tracks verify operations and container test evidence status.
 * No runtime test execution — loads KB-05 content as reference.
 */

class TestingWarhead implements Warhead {
  id = 'testing-warhead';
  priority = 5;
  type = 'static' as const;

  private verifyCount = 0;

  private kbLoaded = false;
  private techniqueCount = 0;
  private evidenceFound = false;
  private evidenceChecked = false;

  async init(): Promise<void> {
    try {
      let c = 0;
      for (let i = 1; i <= 4; i++) {
        const t = loadKnowledgeTechniqueWithCode('KB-05', i);
        if (t.loaded) c++;
      }
      this.techniqueCount = c;
      this.kbLoaded = c > 0;
      await tridentLog('INFO', 'warhead-testing', `KB-05: ${c}/4 techniques loaded`);
    } catch (e: unknown) {
      tridentLog('WARN', 'warhead-testing', `init failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    return undefined; // R10 FIX: explicit Promise<void> completion value
}

  private checkContainerTestEvidence(): boolean {
    try {
      return evidenceGate.hasContainerTestEvidence();
    } catch (e: unknown) {
      tridentLog('ERROR', 'warhead-testing', `Evidence check failed: ${e instanceof Error ? e.message : String(e)}`);
      this.evidenceChecked = true;
      this.evidenceFound = false;
      return false;
    }
  }


  getT0(): string {
    const kbInfo = this.kbLoaded
      ? `${this.techniqueCount} KB-05 techniques (testing reference)`
      : 'KB-05 unavailable';
    const evidenceStatus = this.evidenceChecked
      ? (this.evidenceFound ? 'evidence: PASS' : 'evidence: NONE')
      : 'evidence: unchecked';
    return `[TESTING] ${this.verifyCount} operations. ${kbInfo}. ${evidenceStatus}. No runtime test execution.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      kbLoaded: Number(this.kbLoaded),
      techniques: this.techniqueCount,
      transforms: this.verifyCount,
      evidenceFound: Number(this.evidenceFound),
      evidenceChecked: Number(this.evidenceChecked),
    };
  }
}

export const testingWarhead = new TestingWarhead();
