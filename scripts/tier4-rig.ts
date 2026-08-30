// scripts/tier4-rig.ts — THE TIER-4 MECHANICAL WITNESS (the spec §2.4)
//
// Drives the PRODUCTION escalation path (pipeline.onSignals + maybeCoolFor +
// tryIntervene + handleComplianceVerified — the same modules the hooks load)
// to tier 4 SOLVE-MANDATE without a model, then closes the anti-lock arc.
//
// THE WIRING (per the explore-wiring forensic return, 2026-08-29):
//   - the hooks' tier>=3 branch reads getV2Record(sid)?.tier (hooks:2446-2448)
//     — the PIPELINE's record is the source of truth; this rig drives it.
//   - maybeCoolFor (pipeline:607) is the ONLY deadline clock; it ticks for
//     EVERY session key on EVERY onSignals call — even with EMPTY violations
//     (the starvation fix at :523). The deadline walk is onSignals([], ++seq).
//   - the escalate guard: seq >= deadline + COMPLIANCE_DEBOUNCE_WINDOW(5).
//   - the real exports: createInitialV2Record/stepV2 (NOT the spec draft's
//     createInitialRecord/step — the draft's names do not exist).
//
// Usage:
//   bun scripts/tier4-rig.ts                     # the full arc -> TIER4_RIG_PASS
//   bun scripts/tier4-rig.ts --with-compliance   # the trap variant: compliance
//                                                # mid-ladder must PREVENT tier 4

import {
  onSignals, tryIntervene, getV2Record, handleComplianceVerified,
  __resetPipelineForTests, __getRecordsForTests,
} from '../src/v2/integrate/pipeline.js';
import { setV2EnforcementLevel } from '../src/v2/shared-state.js';
import type { WeightedViolation, ViolationFamily } from '../src/v2/contracts.js';

const SID = 'tier4-rig-session';
const WITH_COMPLIANCE = process.argv.includes('--with-compliance');
let seq = 0;

const ticks: Array<{ seq: number; tier: number; state: string }> = [];
const rec = () => getV2Record(SID) ?? getV2Record('runtime');

const wv = (mid: string): WeightedViolation => ({
  memberId: mid,
  family: mid.split('.')[0] as ViolationFamily,
  plane: 'reasoning',
  excerpt: `tier4-rig ${mid}`,
  anchor: { seq, ts: Date.now(), sessionID: SID },
  weight: 0.9,
} as unknown as WeightedViolation);

function die(msg: string): never {
  const r = rec();
  console.error(`RIG FAIL: ${msg}`);
  console.error(`  record: state=${r?.state} tier=${r?.tier} denial=${r?.denialCount} seq=${r?.seq} deadline=${r?.complianceDeadlineSeq}`);
  process.exit(1);
}

// ── Phase 0 — the clean slate + the FULL dial ──────────────────────────────
__resetPipelineForTests('FULL');
setV2EnforcementLevel('FULL');

// ── Phase 1 — arm via the production signal path ───────────────────────────
// FIRST_SIGNAL lifts IDLE→MONITORING; repeated TEST_EVASION violations fill
// the fusion window (cap 50) — the macro fusion (ESCALATING_INSISTENCE-class)
// primes the machine naturally.
for (let i = 0; i < 12; i++) {
  seq++;
  onSignals([wv(`TEST_EVASION.probe-${i}`), wv(`TEST_EVASION.hold-${i}`)], seq);
}
let r = rec();
if (!r) die('no record after the signal phase — the sid keying is wrong');
if (r.state === 'IDLE') die('FIRST_SIGNAL never lifted — check the level/dial');
console.log(`RIG: signals fed seq=${seq} state=${r.state} TE=${r.counters['TEST_EVASION'] ?? 0}`);

// If the state is MONITORING/IDLE (fusion did not prime), seed PRIMED through
// the pipeline's own test seam (logged honestly). If ALREADY INTERVENING (the
// pipeline's internal surface fired during the signal phase — observed on
// dense signal bursts), skip straight to the walk: the deadline is armed.
if (r.state === 'MONITORING' || r.state === 'IDLE') {
  console.log(`RIG: natural fusion did not prime (state=${r.state}) — seeding PRIMED via the pipeline test seam`);
  const pipeline = await import('../src/v2/integrate/pipeline.js');
  const cur = rec()!;
  pipeline.__seedRecordForTests?.(SID, { ...cur, state: 'PRIMED' });
  r = rec();
  if (r?.state !== 'PRIMED') die(`the seed seam failed: state=${r?.state}`);
}

// ── Phase 2 — intervene on the eligible surface (tier 1, deadline armed) ──
if (rec()?.state === 'PRIMED') {
  let dispatched = '';
  seq++;
  tryIntervene('messages.transform', (t) => { dispatched += t; }, SID);
  r = rec();
  if (r?.state !== 'INTERVENING' || (r?.tier ?? 0) < 1)
    die(`intervene failed: state=${r?.state} tier=${r?.tier}`);
  if (dispatched.length === 0) die('the dispatch attached nothing — no steer/demand text');
  console.log(`RIG: intervened seq=${seq} tier=${r.tier} deadline=${r.complianceDeadlineSeq}`);
  console.log(`RIG: dispatched head: ${dispatched.slice(0, 70)}`);
} else {
  // already INTERVENING from the signal phase — record the armed state
  const armed = rec();
  const armedTier = armed?.tier ?? 0;
  if (armedTier < 1) die(`INTERVENING without a tier: ${armedTier}`);
  console.log(`RIG: already INTERVENING from the signal phase — tier=${armedTier} deadline=${armed?.complianceDeadlineSeq}`);
}

// ── Phase 2b — THE TRAP VARIANT (OR-9): comply mid-ladder ──────────────────
if (WITH_COMPLIANCE) {
  seq++;
  handleComplianceVerified(SID);
  r = rec();
  if (r?.state !== 'MONITORING' || r?.tier !== 0)
    die(`the trap: compliance mid-ladder should reset, got state=${r?.state} tier=${r?.tier}`);
  // walk several ticks — the tier must NOT climb from a MONITORING record
  for (let i = 0; i < 12; i++) { seq++; onSignals([], seq); }
  r = rec();
  if ((r?.tier ?? 0) >= 3) die(`the trap: tier climbed to ${r?.tier} AFTER compliance — the guard is broken`);
  console.log('RIG: the OR-9 trap held — compliance reset and NO escalation followed');
  console.log('TIER4_RIG_TRAP_PASS');
  process.exit(0);
}

// ── Phase 3 — the deadline walk: NO compliance; tick to tier 4 ─────────────
// Each tick carries ONE violation: the SIGNAL feed re-arms (INTERVENING→
// INTERVENING, always allowed) which ADVANCES THE RECORD'S seq via withTriad
// — the escalate guard reads the RECORD's seq (r.seq >= r.deadline+5), and
// the record's seq only moves on successful transitions. An empty tick calls
// maybeCoolFor but cannot advance the record — the first run's lesson.
// After the SIGNAL, maybeCoolFor evaluates the deadline and feeds
// COMPLIANCE_FAILED when the guard window is met; each escalation re-arms
// deadline = seq + 1 + ESCALATION_DEADLINE_WINDOW(5).
let guardTier = 1;
let hold = 0;
let lastRecordSeq = -1;
let stallTicks = 0;
let totalTicks = 0;
while ((rec()?.tier ?? 0) < 4) {
  seq++;
  totalTicks++;
  onSignals([wv(`TEST_EVASION.walk-${hold++}`)], seq);
  const now = rec();
  if (!now) die('the record vanished mid-walk');
  // the stall detector: the record's seq MUST keep advancing (the rearm
  // transition bumps it every tick) — 50 frozen ticks = a true deadlock.
  if (now.seq === lastRecordSeq) {
    stallTicks++;
    if (stallTicks > 50) die(`the walk stalled at tier ${now.tier}: recordSeq ${now.seq} frozen (deadline ${now.complianceDeadlineSeq})`);
  } else {
    stallTicks = 0;
    lastRecordSeq = now.seq;
  }
  if (now.tier !== guardTier) {
    guardTier = now.tier;
    ticks.push({ seq, tier: now.tier, state: now.state });
    console.log(`RIG: tick seq=${seq} recordSeq=${now.seq} -> tier ${now.tier} (denial ${now.denialCount})`);
  }
  if (totalTicks > 3000) die(`tier 4 unreachable in 3000 ticks (stalled at tier ${guardTier}, recordSeq ${lastRecordSeq})`);
}
r = rec();
if (!r || r.tier !== 4) die(`tier ${r?.tier} != 4`);
if ((r.denialCount ?? 0) < 1) die(`denialCount ${r.denialCount} < 1 at tier 4 — the tier>=3 denial increment is broken`);
console.log(`RIG: TIER 4 reached at seq=${seq}; denialCount=${r.denialCount}; state=${r.state}`);

// ── Phase 4 — the record snapshot (the CH-1 evidence fields) ───────────────
console.log(`RIG: tier-4 record: ${JSON.stringify({
  state: r.state, tier: r.tier, denialCount: r.denialCount,
  deadline: r.complianceDeadlineSeq, lastComplianceVerified: r.lastComplianceVerified,
})}`);

// ── Phase 5 — the reset arc (the anti-lock law: S14 immutable) ─────────────
seq++;
handleComplianceVerified(SID);
r = rec();
if (r?.state !== 'MONITORING' || r?.tier !== 0 || r?.lastComplianceVerified !== true)
  die(`the reset arc broken: state=${r?.state} tier=${r?.tier} lcv=${r?.lastComplianceVerified}`);
console.log('RIG: COMPLIANCE_VERIFIED -> MONITORING tier 0 — the anti-lock arc closes');

// ── Phase 6 — the artifact (the witness binds to the bytes) ────────────────
const { writeFileSync, readFileSync, existsSync } = await import('node:fs');
let distSha = 'unknown';
try {
  const manifest = JSON.parse(readFileSync('.trident/artifact-manifest.json', 'utf8'));
  distSha = manifest.dist_sha256;
} catch { /* the manifest may be absent — the artifact records 'unknown' honestly */ }
writeFileSync('.trident/tier4-rig-result.json', JSON.stringify({
  passed: true, mode: WITH_COMPLIANCE ? 'trap' : 'full-arc',
  variant: 'mechanical (pipeline entry — onSignals/maybeCoolFor/tryIntervene/handleComplianceVerified)',
  primed: 'natural-fusion-or-seam (see the log above)',
  ticks, finalRecord: r, dist_sha256: distSha, ts: new Date().toISOString(),
}, null, 2));
console.log('TIER4_RIG_PASS');
