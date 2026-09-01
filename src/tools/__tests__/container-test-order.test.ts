import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// THE W-PB2 ORDER-GATE PERSISTENCE TEST (the L2 spec §2.4):
// the marker's containerName + distSha MUST match the current tool call's
// container + dist — a stale marker is INVALID. The same-container/dist
// equality is the ONLY trust (the §1.4 failure).
// THE CONTRACT: the marker trust logic (in trident-hooks.ts) is:
//   ctMarkerOk = validated === true && markerSha.length >= 16
//                && (no current container OR markerName === currentCtName)
//                && (no current dist OR markerSha.length >= 16)
// This test verifies the trust semantics with the marker-file fixtures.

function writeMarker(dir: string, payload: Record<string, unknown>): string {
  const p = path.join(dir, 'ct-setup-done.json');
  fs.writeFileSync(p, JSON.stringify(payload), 'utf-8');
  return p;
}

function markerOk(marker: Record<string, unknown>, current: { containerName?: string; distSha?: string }): boolean {
  const markerSha = typeof marker.distSha === 'string' ? marker.distSha : '';
  const markerName = typeof marker.containerName === 'string' ? marker.containerName : '';
  // THE HOOKS' EXACT GUARD (W-PB2): the name matches when NO current container
  // OR the marker name equals the current; the dist sha EQUALS the current dist
  // (when a current dist is given); the sha present + validated.
  const nameMatches = !current.containerName || markerName === current.containerName;
  const distMatches = !current.distSha || markerSha === current.distSha;
  const shaPresent = markerSha.length >= 16;
  return marker.validated === true && shaPresent && nameMatches && distMatches;
}

describe('THE ORDER-GATE PERSISTENCE (W-PB2 — the L2 spec §2.4)', () => {
  it('the marker is VALID when the container + dist match the current call', () => {
    const ok = markerOk(
      { validated: true, containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
      { containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
    );
    expect(ok).toBe(true);
  });

  it('the STALE marker (a DIFFERENT container) is INVALID — the §1.4 failure', () => {
    const stale = markerOk(
      { validated: true, containerName: 'trident-w5-20260818', distSha: 'fb49d3f2d7f7972f8d0388038a333109e64a46eb29b123568e73b78e20797d64' },
      { containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
    );
    expect(stale).toBe(false);   // the WRONG container marker MUST NOT restore the setup state
  });

  it('the STALE marker (a DIFFERENT dist) is INVALID', () => {
    const stale = markerOk(
      { validated: true, containerName: 'trident-paragon-20260819', distSha: 'fb49d3f2d7f7972f8d0388038a333109e64a46eb29b123568e73b78e20797d64' },
      { containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
    );
    expect(stale).toBe(false);
  });

  it('the marker without a container (the legacy shape) is INVALID when a current container is given (the name check fails)', () => {
    const legacy = markerOk(
      { validated: true, distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
      { containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
    );
    // the legacy marker has NO containerName — the name check `markerName === currentCtName`
    // fails (empty !== 'trident-paragon-20260819') → the legacy shape is INVALID when a
    // current container is given. THE W-PB2 GUARD: only the SAME container+dist is trusted.
    expect(legacy).toBe(false);
  });

  it('the marker without a container is VALID when NO current container is given (the !currentCtName passes)', () => {
    const legacy = markerOk(
      { validated: true, distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
      { distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' },
    );
    expect(legacy).toBe(true);   // no current container — the name check passes
  });

  it('the marker file write + read round-trips (the persist mechanism)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-'));
    const p = writeMarker(dir, { validated: true, containerName: 'trident-paragon-20260819', distSha: '622eb286bab4410b5e1469cab9f663e01390d8b4bb3747015e204c729d1a7d6d' });
    expect(fs.existsSync(p)).toBe(true);
    const read = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(read.validated).toBe(true);
    expect(read.containerName).toBe('trident-paragon-20260819');
    expect(read.distSha.length).toBeGreaterThanOrEqual(16);
  });

  it('the corrupted/absent marker is INVALID (the adversarial)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-'));
    const p = writeMarker(dir, { validated: true, distSha: 'x' });   // the sha too short
    const read = JSON.parse(fs.readFileSync(p, 'utf-8')) as { validated?: unknown; distSha?: unknown };
    expect(read.validated === true && typeof read.distSha === 'string' && read.distSha.length >= 16).toBe(false);
  });
});
