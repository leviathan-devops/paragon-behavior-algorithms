import { describe, expect, it, beforeEach } from 'bun:test';
import {
  fireBlock,
  claimDemand,
  overAuditDemand,
  contradictionDemand,
  fakeReturnDemand,
  calibStaleDemand,
  teaNotTebDemand,
  substrateBlockDelivery,
  setDeliverySink,
  deliverySurface,
  deliveryLog,
  resetEventFirewalls,
  BLOCK_MARKERS,
  type BlockDeliveryRecord,
} from '../events/event-firewalls.ts';
import type { SlopClass, TriageVerdict } from '../events/event-substrate.ts';

// THE BATTERY GATE IS bash scripts/preflight.sh (tsc 0 + the live-src run) — verified by the
// preflight run, never by an in-file assertion. Every scenario below is MUTATION-CHECKED:
// each assertion FAILS if the mechanism it names is removed (the append, the marker check,
// the triad guard, the benign loud-fail).

/** THE VERDICT FIXTURE — a real {Pattern, State, Evidence} triad per slop class. */
function makeVerdict(slopClass: SlopClass, target?: 'message' | 'tool-output' | 'state'): TriageVerdict {
  return {
    slopClass,
    triad: { pattern: 'test-detector', state: 'CLASSIFIED', evidence: `the ${slopClass} evidence` },
    ...(target ? { block: { demand: '', target } } : {}),
  };
}

beforeEach(() => {
  resetEventFirewalls();
});

describe('THE EVENT FIREWALLS (SPEC-3 §9.8 E4 — the C7 + the adversarial corpus)', () => {
  // ── THE C7: fireBlock appends the claim demand ──
  it('E4-C7: the CLAIM_SLOP block APPENDS the [SSTF EVENT: CLAIM] demand to the visible surface', () => {
    const rec = fireBlock(claimDemand(), makeVerdict('CLAIM_SLOP'));
    expect(rec.appended).toContain('[SSTF EVENT: CLAIM]');
    expect(rec.appended).toContain('the claim is un-evidenced');
    expect(deliverySurface()).toEqual([rec.appended]);
  });

  // ── THE C7: the over-audit block targets 'state' ──
  it("E4-C7: the OVER_AUDIT block's target is 'state' (the loop-routing injection)", () => {
    const rec = fireBlock(overAuditDemand(), makeVerdict('OVER_AUDIT', 'state'));
    expect(rec.target).toBe('state');
    expect(rec.marker).toBe('[LOOP: OVER_FIRED]');
  });

  it('E4: the OVER_AUDIT default target is state even when the verdict carries no block target', () => {
    const rec = fireBlock(overAuditDemand(), makeVerdict('OVER_AUDIT'));
    expect(rec.target).toBe('state');
  });

  // ── THE AUTONOMY LAW: append-never-delete ──
  it('E4: the block APPENDS — the surface grows monotonically and prior content is NEVER deleted (§10.5 #3)', () => {
    const first = fireBlock(claimDemand(), makeVerdict('CLAIM_SLOP'));
    const second = fireBlock(fakeReturnDemand(), makeVerdict('FAKE_RETURN'));
    // the append-only proof: each record's surfaceAfter exceeds its surfaceBefore by exactly the appended length
    expect(first.surfaceAfter).toBe(first.surfaceBefore + first.appended.length);
    expect(second.surfaceBefore).toBe(first.surfaceAfter);
    expect(second.surfaceAfter).toBe(second.surfaceBefore + second.appended.length);
    // the first demand is STILL on the surface — never erased by the second block
    expect(deliverySurface()[0]).toBe(first.appended);
    expect(deliverySurface().length).toBe(2);
  });

  // ── THE SIX MARKERS — every constructor delivers its bound marker ──
  it('E4: the six demand constructors carry the six markers (SPEC-3 §2.4)', () => {
    expect(claimDemand()).toContain(BLOCK_MARKERS.CLAIM_SLOP);
    expect(overAuditDemand()).toContain(BLOCK_MARKERS.OVER_AUDIT);
    expect(contradictionDemand()).toContain(BLOCK_MARKERS.DESTRUCTIVE_PLAN);
    expect(fakeReturnDemand()).toContain(BLOCK_MARKERS.FAKE_RETURN);
    expect(calibStaleDemand('r3.todo-marker')).toContain(BLOCK_MARKERS.CALIB_STALE);
    expect(calibStaleDemand('r3.todo-marker')).toContain('r3.todo-marker'); // the matcher id is IN the demand
    expect(teaNotTebDemand()).toContain(BLOCK_MARKERS.TEA_NOT_TEB);
  });

  it('E4: every slop class blocks with its bound marker delivered (the full-class sweep)', () => {
    const classes = ['CLAIM_SLOP', 'OVER_AUDIT', 'DESTRUCTIVE_PLAN', 'FAKE_RETURN', 'CALIB_STALE', 'TEA_NOT_TEB'] as const;
    const demands = [claimDemand(), overAuditDemand(), contradictionDemand(), fakeReturnDemand(), calibStaleDemand('m1'), teaNotTebDemand()];
    classes.forEach((klass, i) => {
      const rec = fireBlock(demands[i], makeVerdict(klass));
      expect(rec.marker).toBe(BLOCK_MARKERS[klass]);
      expect(rec.slopClass).toBe(klass);
    });
    expect(deliveryLog().length).toBe(6);
  });

  // ── THE LOUD-FAIL-OR-CLEAR-PASS (no silent skip) ──
  it('E4-ADV: an EMPTY demand LOUD-FAILS (EVENT_BLOCK_EMPTY_DEMAND) — never a contentless mutation', () => {
    expect(() => fireBlock('', makeVerdict('CLAIM_SLOP'))).toThrow('EVENT_BLOCK_EMPTY_DEMAND');
    expect(deliveryLog().length).toBe(0); // nothing was appended
  });

  it('E4-ADV: a block without its triad LOUD-FAILS (EVENT_TRIAD_MISSING) — no triad, no block', () => {
    const bare = { slopClass: 'CLAIM_SLOP', triad: { pattern: '', state: 'CLASSIFIED', evidence: 'x' } } as TriageVerdict;
    expect(() => fireBlock(claimDemand(), bare)).toThrow('EVENT_TRIAD_MISSING');
    expect(deliveryLog().length).toBe(0);
  });

  it('E4-ADV: a null verdict LOUD-FAILS — never a silent skip', () => {
    expect(() => fireBlock(claimDemand(), null as unknown as TriageVerdict)).toThrow('EVENT_TRIAD_MISSING');
  });

  it('E4-ADV: a BENIGN verdict is RETURNED, never blocked — the block attempt LOUD-FAILS (EVENT_BLOCK_BENIGN)', () => {
    expect(() => fireBlock(claimDemand(), makeVerdict('BENIGN'))).toThrow('EVENT_BLOCK_BENIGN');
    expect(deliveryLog().length).toBe(0); // the benign-block false positive never lands
  });

  it('E4-ADV: a class/marker MISMATCH LOUD-FAILS (EVENT_BLOCK_MARKER_MISMATCH) — the wiring drift is named', () => {
    // a CLAIM_SLOP verdict carrying the CONTRADICTION demand = the triage/demand wiring drifted
    expect(() => fireBlock(contradictionDemand(), makeVerdict('CLAIM_SLOP'))).toThrow('EVENT_BLOCK_MARKER_MISMATCH');
    expect(deliveryLog().length).toBe(0);
  });

  // ── THE BOUNDARY: the explicit verdict target wins over the class default ──
  it('E4-BOUNDARY: an explicit verdict block target overrides the class default', () => {
    const rec = fireBlock(claimDemand(), makeVerdict('CLAIM_SLOP', 'tool-output'));
    expect(rec.target).toBe('tool-output');
  });

  // ── THE SUBSTRATE ADAPTER (the E-PB1 seam — setBlockDelivery) ──
  it('E4: substrateBlockDelivery delivers block + inject actions and ignores the return clear-pass', () => {
    substrateBlockDelivery({ kind: 'block', demand: claimDemand() }, makeVerdict('CLAIM_SLOP'));
    substrateBlockDelivery({ kind: 'inject', demand: overAuditDemand() }, makeVerdict('OVER_AUDIT', 'state'));
    substrateBlockDelivery({ kind: 'return', reason: 'benign' }, makeVerdict('BENIGN'));
    expect(deliveryLog().length).toBe(2); // the return is recorded nowhere here — the ledger owns it
    expect(deliveryLog()[0].marker).toBe('[SSTF EVENT: CLAIM]');
    expect(deliveryLog()[1].marker).toBe('[LOOP: OVER_FIRED]');
  });

  // ── THE DELIVERY SINK (the E-PB5 seam) ──
  it('E4: the injected sink receives every appended record (the E-PB5 stream seam)', () => {
    const captured: BlockDeliveryRecord[] = [];
    setDeliverySink((r) => captured.push(r));
    fireBlock(teaNotTebDemand(), makeVerdict('TEA_NOT_TEB', 'state'));
    expect(captured.length).toBe(1);
    expect(captured[0].marker).toBe('[HOOK: TEA_NOT_TEB]');
    expect(deliverySurface().length).toBe(1); // the buffer remains the durable record
  });

  it('E4-ADV: a THROWING sink never breaks the block — the buffer record is the durable truth (the OBSERVER law)', () => {
    setDeliverySink(() => { throw new Error('the sink exploded'); });
    const rec = fireBlock(claimDemand(), makeVerdict('CLAIM_SLOP'));
    expect(rec.appended).toContain('[SSTF EVENT: CLAIM]');
    expect(deliveryLog().length).toBe(1);
  });

  // ── THE CONCURRENT ORDERING: interleaved blocks keep the append order ──
  it('E4-ADV: interleaved blocks across classes preserve the strict append order (no overwrite)', () => {
    const seq: Array<[string, ReturnType<typeof makeVerdict>]> = [
      [claimDemand(), makeVerdict('CLAIM_SLOP')],
      [calibStaleDemand('r2.empty-catch'), makeVerdict('CALIB_STALE', 'state')],
      [teaNotTebDemand(), makeVerdict('TEA_NOT_TEB', 'state')],
    ];
    for (const [d, v] of seq) fireBlock(d, v);
    const surface = deliverySurface();
    expect(surface[0]).toContain('[SSTF EVENT: CLAIM]');
    expect(surface[1]).toContain('[AUDIT: CALIB_STALE]');
    expect(surface[1]).toContain('r2.empty-catch');
    expect(surface[2]).toContain('[HOOK: TEA_NOT_TEB]');
  });
});
