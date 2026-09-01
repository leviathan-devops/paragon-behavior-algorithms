# DEBUG GUIDE — Paragon V3 Tool-Chain Algorithms

> Version: 1.0.0 · 2026-08-31 · Status: ACTIVE
> Package: paragon-v3-tool-chain-algorithms
> Specs: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L)
> F-AW data: Master Spec §9 Artifact 4 (10 real failures from PBA build, 2026-08)
> Purpose: Real debug data — every failure is from the actual build, not invented

---

## Table of Contents

1. F-AW-1: Test-Expectation Over-Generalization
2. F-AW-2: CT distPath is FILE not DIR
3. F-AW-3: Ledger Flush Lag
4. F-AW-4: Model-Alignment Gravity
5. F-AW-5: Excerpt/Count Gap at t3/4
6. F-AW-6: Checkpoint-DB Malformed
7. F-AW-7: Ghost Record sess-A t4
8. F-AW-8: Tester-as-Subject t4
9. F-AW-9: Sid Mismatch
10. F-AW-10: Lexicon Drift
11. PTA-Specific: Layer Not Firing
12. PTA-Specific: Bridge Not Connecting
13. PTA-Specific: Intent Classifier Misclassifying
14. PTA-Specific: Chain Tracker Desync
15. Diagnostic Commands

---

## F-AW-1: Test-Expectation Over-Generalization

Source: Master Spec §9 Artifact 4.

**What happened:** The harness suite generalized from spec text examples, assuming coverage the spec never promised. Harness expected behavior for patterns not in the 4-bank lexicon — the spec examples were illustrative, not exhaustive.

**Symptom:** Harness assertions for patterns outside the defined banks. Spec says "just quickly check" (suggestive), harness assumed "check quickly" also covered.

**Root cause:** Spec text authority vs suite assumption. The spec IS the authority — only patterns explicitly in banks are enforced.

**Fix:** Spec text is authority, never the suite assumption. Banks are explicit — only defined patterns fire. Novel paraphrases need FI-1 batch scan, not direct bank match.

**PTA relevance:** When a layer doesn't fire on a novel paraphrase, check: is the wording in suggestive/substitute? If not, does FI-1 batch scan catch it? The 4-bank lexicon is explicit — only defined patterns score. FI-1 catches cross-family paraphrases via pos > neg synthesis.

**How to diagnose:**

```
scoreSignals(textBlob, layer.banks) -> {pos, neg, evidence}
If pos == 0: wording not in banks, no violation detected.
If FI-1 batchScan -> pos>0 + conf>=0.5 + pos>neg -> synthesized violation catches paraphrase.
Check: does your layer banks cover the semantic class or only exact phrases?
```

---

## F-AW-2: CT distPath is FILE not DIR

Source: Master Spec §9 Artifact 4.

**What happened:** Container harness (CT) distPath parameter was treated as a directory when it is actually a file path. The dir-hash walked to the wrong artifact — hashed the directory listing instead of the file content.

**Symptom:** Container harness computed a hash that didn't match the expected artifact hash. Dir-hash vs file-hash mismatch.

**Root cause:** API contract confusion — distPath semantics. The harness assumed directory semantics; the contract specifies file semantics.

**Fix:** distPath is the FILE, never the dir. The dir-hash approach hashes directory metadata, not file content. Use file-level hashing for distPath verification.

**PTA relevance:** When wiring PTA layers that check for artifact existence (e.g. SHIP_EVIDENCE_GATE checking for container-test-results.json), ensure paths reference the actual artifact file, not its parent directory. The evidence gate checks for file existence matching verificationPatterns — glob patterns like `container-test-results\.json` match files.

**How to diagnose:**

```
Check: does your verificationPatterns regex match the actual file path or the directory?
Pattern /container-test-results\.json/ matches the file.
Pattern /container-test-results/ alone could match a directory listing — less precise.
```

---

## F-AW-3: Ledger Flush Lag

Source: Master Spec §9 Artifact 4.

**What happened:** After an enforcement event, reading the ledger (pta-ledger.jsonl or interventions.jsonl) returned empty or stale data — the write hadn't flushed to disk yet. The read happened before the O_APPEND completed.

**Symptom:** Empty read immediately after dispatch. Subsequent reads (after flush) showed the data.

**Root cause:** Timing — ledger is O_APPEND with async flush. An empty read is a TIMING claim, not a STATE claim. The data exists but hasn't been fsync'd.

**Fix:** An empty read is a TIMING claim, not a STATE claim. Retry after a tick or wait for flush. In harness, add a small delay or poll after dispatch before asserting ledger content. In production, the ledger is audit trail — reads are eventually consistent.

**PTA relevance:** pta-ledger.jsonl uses the same O_APPEND pattern. If you check the ledger immediately after an enforcement event and find it empty, retry. The harness should poll or delay, not assert immediately. Collector TTL 600s, gate TTL 300s — both tolerate brief staleness.

**How to diagnose:**

```
After dispatch, before asserting ledger:
  await new Promise(r => setTimeout(r, 50)); // or poll
  const ledger = readFileSync('pta-ledger.jsonl', 'utf-8');
  // Now ledger contains the enforcement event
```

---

## F-AW-4: Model-Alignment Gravity

Source: Master Spec §9 Artifact 4.

**What happened:** During harness harness, second-family baits (testing whether a family fires when baited with content from another family) reframed the harness intent — the harness phrase for family B inadvertently matched family A's suggestive patterns due to overlapping vocabulary.

**Symptom:** Family B harness unexpectedly triggered family A enforcement. Cross-family contamination in harness fixtures.

**Root cause:** Overlapping vocabulary between families' suggestive banks. The bait text for one family contains words that match another family's patterns. Like testing "scope" patterns but the bait contains "just quickly" which also matches TEST_EVASION.

**Fix:** Second-family baits need careful vocabulary isolation — each family's suggestive bank vocabulary should be distinct, or the harness must account for cross-family FI-1 batch scan firing. FI-1 scans ALL families, so bait for one family can trigger another via batch scan.

**PTA relevance:** PTA layers share the same vocabulary space. A layer's suggestive patterns should be semantically distinct from other layers' patterns. If two layers share vocabulary (e.g. both use "just check"), the FI-1 batch scan may cause cross-layer firing. Mitigation: keep suggestive banks domain-specific, check for overlap during layer creation.

**How to diagnose:**

```
For each pair of layers, check bank overlap:
  sharedWords = layerA.banks.suggestive.join(' ') intersect layerB.banks.suggestive.join(' ')
  if sharedWords.length > 0: potential cross-layer contamination
Solution: make suggestive patterns domain-specific, use longer phrase patterns.
```

---

## F-AW-5: Excerpt/Count Gap at t3/4 — FIXED in 9eac1529

Source: Master Spec §9 Artifact 4 — verified digit-for-digit.

**What happened:** At tier 3/4, the warhead template's excerpt and count fields were empty or stale — the dispatch count wasn't updated before fill, and the PBA excerpt was from a previous signal rather than the triggering signal.

**Symptom:** Warhead at tier 3 showed count=0 or excerpt from a different violation. Tier 4 showed stale escalationCount.

**Root cause:** Dispatch count not incremented before template fill. Excerpt captured at wrong sequence point.

**Fix:** FIXED in commit 9eac1529 — verified digit-for-digit. Dispatch count incremented BEFORE fill, excerpt captured at the triggering signal's seq. Warhead fill fields now reflect the current violation's data.

**PTA relevance:** PTA warheads use the same fill system — {count}, {excerpt}, {pbaFamilies}, {anchor}. The fix ensures count reflects the current dispatch count and excerpt reflects the triggering signal. If a PTA warhead shows stale data at tier 3/4, check that the fix from 9eac1529 is present in the PTA dispatch path (actuation/dispatch.ts, actuation/warhead-templates.ts).

**How to diagnose:**

```
After dispatch at tier 3/4:
  Check warhead body: does {count} match getDispatchCount(layerId)?
  Check {pbaFamilies} matches pbaBridge.getActiveFamilies(sessionId)?
  Check {anchor} is unique per dispatch (pta:<layerId>:<timestamp>)?
  If stale: the dispatch count or PBA context wasn't refreshed before fill.
```

---

## F-AW-6: Checkpoint-DB Malformed

Source: Master Spec §9 Artifact 4.

**What happened:** The checkpoint database file (used for multi-session state recovery) was corrupted — partial write during a crash left a truncated JSON. Loading the file threw a parse error instead of handling gracefully.

**Symptom:** Engine startup failed with JSON parse error when checkpoint file was corrupt. Session recovery broke.

**Root cause:** Non-atomic write without corruption handling. The file was written directly without tmp+rename, and loading didn't handle parse failure.

**Fix:** Corrupt -> null held gracefully. Loading wraps JSON.parse in try/catch, returns null on failure (fail-closed). Writing uses atomic tmp+rename. The engine starts fresh if the checkpoint is corrupt — no crash.

**PTA relevance:** PTA persistence uses the same pattern — atomic tmp+rename for writes, fail-closed null for corrupt reads. If pta-state-<sid>.json or pta-synapse-<sid>.json is corrupt, loadState/loadSynapse returns null, and the engine creates a fresh session state. No crash, no data leakage.

**How to diagnose:**

```
If engine fails to start or session state seems lost:
  Check: is pta-state-<sid>.json valid JSON? (cat + jq or JSON.parse)
  If corrupt: the engine returns null and creates fresh state — expected behavior.
  If valid but unexpected tier/state: check that persistence files weren't manually edited.
```

---

## F-AW-7: Ghost Record sess-A t4

Source: Master Spec §9 Artifact 4 — E-09 watch target.

**What happened:** A ghost record persisted for session-A at tier 4 — a session that was never properly initialized appeared in the state store at the highest enforcement tier, with no corresponding synapse or chain state.

**Symptom:** Session-A showed tier 4 enforcement without any prior violations or escalations. The record had no synapse data and empty call history.

**Root cause:** Uninitialized session record created at tier 4 by a code path that set tier before initializing the full PtaSessionState. E-09 watch target.

**Fix:** Ghost record detection — if a session record exists at tier>0 but has no synapse data and empty call history, it is a ghost. The engine should reinitialize the session. E-09 watches for this pattern.

**PTA relevance:** PTA per-sid state (PtaSessionState) has multiple components — record, synapse, chainState, pbaSignals. If any component exists without the others at a non-zero tier, it is a ghost. The engine validates consistency on load.

**How to diagnose:**

```
Check: does pta-state-<sid>.json exist at tier>0 while pta-synapse-<sid>.json is missing or empty?
  If yes: ghost record — reinitialize session.
  Verify: record.state and synapse should always be consistent per session.
```

---

## F-AW-8: Tester-as-Subject t4

Source: Master Spec §9 Artifact 4 — never-lock held.

**What happened:** During harness where the harness itself acts as the enforcement subject (testing tier 4 behavior), the harness's own tool calls were blocked by the enforcement under test — the harness couldn't run its assertions because tier 4 gates blocked the harness tools.

**Symptom:** Harness at tier 4 blocked its own assertion tools (read, verification checks). The harness couldn't verify the enforcement it was testing.

**Root cause:** Tier 4 T.E.B. gate blocked tools matching the violating layer's toolMatchers, which included tools the harness needed for assertions.

**Fix:** Never-lock held — escape hatches (read, grep, glob) ALWAYS transit even at tier 4. The harness uses these tools for assertions, so they must never be blocked regardless of tier. The gate only blocks tools matching the violating layer's toolMatchers.

**PTA relevance:** PTA tier 4 gates ONLY the violating layer's toolMatchers. read/grep/glob + remediationTools ALWAYS transit. If your harness or any tool is blocked at tier 4 when it shouldn't be, check: does its toolName match the violating layer's toolMatchers? If not, it should transit — this is a gate bug.

**How to diagnose:**

```
At tier 4, check: does the blocked tool's toolName match the violating layer's toolMatchers?
  If no match: gate bug — the tool should transit.
  If match but is escape hatch: escape hatches (read/grep/glob) are excluded from gating.
  The remediationTools are also excluded at every tier.
```

---

## F-AW-9: Sid Mismatch — FIXED in eb769ed9

Source: Master Spec §9 Artifact 4.

**What happened:** The session ID used for PBA signals didn't match the session ID used for PTA state — PBA signals were stored under one sid while PTA looked them up under another, so the bridge appeared to have no signals.

**Symptom:** PTA bridge showed no active families even though PBA was firing. Intent classifier PBA context was always empty.

**Root cause:** Session ID inconsistency between PBA and PTA — different sid values for the same logical session.

**Fix:** FIXED in commit eb769ed9. Session ID is now consistent across PBA and PTA — same sid for the same session in both engines, bridge ring buffer, and persistence files.

**PTA relevance:** The bridge ring buffer is per-session. If PBA and PTA use different sids, the bridge appears empty. Verify that the same sessionId flows through PBA.onSignal -> PtaBridge.onPbaSignal -> IntentClassifier PBA context query.

**How to diagnose:**

```
Check: do PBA and PTA use the same sessionId?
  Log: PBA signal sessionId vs PTA ptaBridge.getRecentSignals(sid, 10) sid
  If mismatch: the bridge wiring has a sid mapping error.
  Verify: the sid in pba.onSignal callback matches the sid in pta.pbaBridge.onPbaSignal.
```

---

## F-AW-10: Lexicon Drift

Source: Master Spec §9 Artifact 4 — naming-contract gate.

**What happened:** Over time, layer/family names drifted between the implementation and the spec — the TMS tool generated layer names that didn't match the registered layer IDs, causing enforcement to fire under unexpected names.

**Symptom:** TMS generated a layer with id DIFFERENT_LAYER but the spec referenced ORIGINAL_LAYER. Enforcement appeared absent for the spec's layer.

**Root cause:** No naming contract between spec, TMS output, and runtime registration. Names were free-form strings without validation.

**Fix:** Naming-contract gate — every layer ID in the TMS output must match a registered layer ID. The gate validates at registration time: loadLayer checks that the JSON id matches the expected pattern, and registerLayer checks for duplicates.

**PTA relevance:** PTA layer IDs are SCREAMING_SNAKE (e.g. SMOKE_SUBSTITUTION, CONFIG_LOCK). The loader validates at registration. If a layer doesn't fire, first check: does the layer ID in the JSON match what the engine has registered? (pta.layers.map(l => l.id)).

**How to diagnose:**

```
Check: pta.layers.map(l => l.id) — does your layer ID appear?
Check: does the JSON file's "id" field match the file name?
  layers/sstf-smoke-substitution.layer.json should have "id": "SMOKE_SUBSTITUTION"
Check: does the warhead template reference the correct layer ID?
  resolveWarhead(layer, tier, context) uses layer.id for anchor generation.
```

---

## 11. PTA-Specific: Layer Not Firing

### Symptom

Layer registered but never fires on expected violation input.

### Diagnosis Checklist

1. **Registered?** — `pta.layers.map(l => l.id)` — does your layer ID appear? If not: loadLayer threw LOADER_VALIDATION_FAILED or registerLayer wasn't called.

2. **Tool matcher matches?** — Evaluate toolName + argPatterns regex against actual tool call:
   ```
   Does toolCall.toolName match layer.toolMatchers[].toolName?
   If argPatterns: does JSON.stringify(args) match the argPatterns regex?
   If no match: layer doesn't watch this tool call — no scoring happens.
   ```

3. **Banks score?** — `scoreSignals(textBlob, layer.banks) -> {pos, neg, confidence}`:
   ```
   textBlob = toolName + JSON.stringify(args) + PBA excerpt (if bridge)
   confidence = pos / (pos + neg + 1)
   If confidence < 0.5: SUPPRESS -> no enforcement.
   Log pos, neg, evidence to see which banks matched.
   ```

4. **Use-bank short-circuit?** — If tool call text matches any `use` pattern: neg+=3, SHORT-CIRCUIT return {pos:0, neg, evidence}. Always SUPPRESS regardless of suggestive/substitute matches. Most common cause of unexpected suppression.

5. **Descriptive suppression?** — Check descriptive bank: neg may be suppressing confidence below 0.5. Legitimate context patterns reduce confidence.

6. **Threshold too high?** — Compare totalConfidence vs layer.threshold. totalConfidence = (toolConf x 0.5) + (chainConf x 0.3) + (pbaConf x 0.2). Must exceed threshold (e.g. 0.9) to fire. DAMPEN at threshold x 0.6.

7. **Bridge wired?** — `pta.pbaBridge.getActiveFamilies(sid)` — is the PBA family in pbaContextBoost.families active? If not wired or family not active: pbaConfidence = 0, totalConfidence lower by 0.2 x boostAmount.

8. **Chain rule window?** — `chainTracker.wasCalled(sid, req.tool, req.withinMs)` — was the prerequisite recorded? If not in history: chain violation fires. If in history but withinMs expired: also violation.

---

## 12. PTA-Specific: Bridge Not Connecting

### Symptom

PBA signals not appearing in PTA, intent classifier PBA context always empty.

### Diagnosis

| Check | Action |
|-------|--------|
| pbaBridge.enabled | module.pbaBridge.enabled === true? If false: bridge disabled, standalone mode |
| Signal filter | If signalFilter set, is the PBA family in the filter? |
| Wiring order | pba.onSignal() wired BEFORE either engine processes? |
| Session ID | PBA and PTA same sessionId? Ring buffer is per-session |
| PBA firing? | Does PBA family have λ >= threshold? If tier 0: no signals sent |
| Ring buffer | Last 20 signals kept; if >20, oldest evicted — check getRecentSignals(sid, 20) |

---

## 13. PTA-Specific: Intent Classifier Misclassifying

### Symptom: Legitimate Blocked

Chain violation weight dominant (0.8), PBA clean -> total confidence high even for legitimate calls.

Fix: Add "legitimate usage" patterns to `use` bank with neg+3 short-circuit, or increase threshold, or narrow toolMatchers argPatterns.

### Symptom: Violation Passes as ALLOW

Descriptive suppressing, or threshold too high. Check scoreSignals output, reduce threshold, narrow descriptive patterns.

### Symptom: Paraphrased Evasion Not Caught

Novel wording not in suggestive/substitute. FI-1 batch scan should catch via pos > neg synthesis — verify suggestive covers the semantic class, not just exact phrases.

---

## 14. PTA-Specific: Chain Tracker Desync

### Symptom: Violation When Prerequisite Was Called

Check withinMs — if set, prerequisite may have expired. Default (no withinMs) = session-start, never expires. Avoid short windows (AP-5). Check that recordCall was called for the prerequisite tool — was it attributed to the same sessionId?

### Symptom: No Violation When Prerequisite Missing

Verify chainRules registered with ChainTracker — registerLayer() does this automatically. Check evaluateRules(sid, tool, args, rules) directly. Check that the rule violation.layerId matches the expected layer.

### Symptom: Loop Not Detected

detectLoop() requires 3+ same-tool calls with uniqueOutputs.size <= 1 within window 10. Verify tool names match exactly and outputs are identical/empty. Check windowSize parameter.

---

## 15. Diagnostic Commands

### Check Layer Registration

```typescript
pta.layers.map(l => l.id)  // all registered layer IDs
pta.layers.map(l => ({ id: l.id, threshold: l.threshold, severity: l.severity }))
```

### Check Bank Scoring

```typescript
import { scoreSignals } from 'paragon-v3-tool-chain-algorithms/core/synapse';
const textBlob = toolName + ' ' + JSON.stringify(args) + ' ' + (pbaExcerpt || '');
const result = scoreSignals(textBlob, layer.banks);
console.log({ pos: result.pos, neg: result.neg, conf: result.pos / (result.pos + result.neg + 1) });
```

### Check Synapse State

```typescript
const neuron = pta.getSynapse(sessionId).getNeuron(layerId);
console.log({ lambda: neuron.value(), canFire: neuron.canFire() });
const snapshot = pta.getSynapse(sessionId).snapshot();
console.log(snapshot); // all families' λ and primed state
```

### Check Bridge State

```typescript
pta.pbaBridge.getRecentSignals(sessionId, 10);   // last 10 PBA signals
pta.pbaBridge.getActiveFamilies(sessionId);       // families with λ above threshold
pta.pbaBridge.getMacroTier(sessionId);            // PBA tier 0-4
```

### Check Chain State

```typescript
chainTracker.recentTools(sessionId, 10);          // last 10 tool calls
chainTracker.wasCalled(sessionId, 'trident-code-audit');  // prerequisite check
chainTracker.detectLoop(sessionId);               // loop detection
chainTracker.evaluateRules(sessionId, 'bash', args, rules);  // rule evaluation
```

### Check State Machine

```typescript
console.log(pta.getSessionState(sessionId).record);
// { state, tier, denialCount, escalationCount, complianceDeadlineSeq, seq }
```

### Check Evidence Pool

```typescript
collector.getRecords();  // all ToolEvidenceRecords
gateEngine.evaluateCompliance('trident-container-test', collector.getRecords(), 300000);
// { verdict: 'PASS'|'INCONCLUSIVE'|'FAIL', criteria, poolSize }
```

### Check Persistence

```typescript
// Files: pta-state-<sid>.json, pta-synapse-<sid>.json, pta-chain-<sid>.json, pta-ledger.jsonl
// Validate JSON: cat pta-state-<sid>.json | jq .  (or JSON.parse)
// Corrupt -> loadState returns null (fail-closed, fresh state created)
```

---

*End of DEBUG_GUIDE.md — Paragon V3 Tool-Chain Algorithms v1.0.0*
*Sources: PTA_L2_SPEC.md 2.1-2.13 (2,441L) · PBA_PTA_MASTER_L1_SPEC.md 0-9 (1,410L) · F-AW-1..10: Master Spec §9 Artifact 4 (real failures from PBA build)*
