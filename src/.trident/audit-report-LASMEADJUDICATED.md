# TRIDENT v4.3 — RUNTIME GRADE DEVOPS AUDIT

**Score:** 39/100 — NOT RUNTIME GRADE
**Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src (trident-v4.4)
**Agent:** 
**Files Scanned:** 460 source files
**Findings:** 96 CRITICAL | 352 HIGH | 1182 MEDIUM | 419 LOW
**Layers:** 27/17 active

---

## Mechanical Evidence (PREFLIGHT)

| Check | Result | Detail |
|-------|--------|--------|
| type-check | FAIL | bun run build:check failed: Command failed: bun run build:check
[0m[2m[35m$[0m [2m[1mtsc --noEmit[0m |

## Confidence Distribution

| Confidence | Count | % of Total |
|------------|-------|-----------|
| 0.95-1.00 (Definite) | 554 | 27.0% |
| 0.85-0.94 (High) | 800 | 39.0% |
| 0.70-0.84 (Moderate) | 649 | 31.7% |
| < 0.70 (Low/Noise) | 46 | 2.2% |

*(Findings below 0.70 confidence are excluded from scoring)*

## CRITICAL — Prevents First-Attempt Deployment

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `audit-engine/index.ts:235`
**Evidence:** `catch { /* the existsSync/stat checks above already govern readability */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* the existsSync/stat checks above already govern readability */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `audit-engine/index.ts:506`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `audit-engine/index.ts:653`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/audit-3d.test.ts:184`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/audit-3d.test.ts:211`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/pi-aether-agent.test.ts:185`
**Evidence:** `catch { /* the parse may reject the minimal judgment — irrelevant here */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* the parse may reject the minimal judgment — irrelevant here */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/r3-r10.fixtures.test.ts:24`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `r4-r11-r17/r4-golden-by-design.ts:3`
**Evidence:** `catch (e) {}`
**Problem:** Empty catch block swallows the error silently — catch (e) {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `r4-r11-r17/r4-golden-documented.ts:3`
**Evidence:** `catch (e) {
    // non-fatal: best-effort cleanup, documented idempotent retry
  }`
**Problem:** Empty catch block swallows the error silently — catch (e) {
    // non-fatal: best-effort cleanup, documented idempotent retry
  }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `r4-r11-r17/r4-violation.ts:2`
**Evidence:** `catch (e) {}`
**Problem:** Empty catch block swallows the error silently — catch (e) {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `aether-backend/agent.ts:292`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `aether-backend/agent.ts:301`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `aether-backend/tools.ts:76`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:48`
**Evidence:** `catch { /* cleanup best-effort */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* cleanup best-effort */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `ast/audit-ast-core.ts:909`
**Evidence:** `catch {
        // stat failure — let createProgram surface it
      }`
**Problem:** Empty catch block swallows the error silently — catch {
        // stat failure — let createProgram surface it
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `ast/audit-ast-core.ts:965`
**Evidence:** `catch {
        // stat failure — let createProgram surface it
      }`
**Problem:** Empty catch block swallows the error silently — catch {
        // stat failure — let createProgram surface it
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `events/audit-events.ts:506`
**Evidence:** `catch {
            // the malformed line is skipped — the ingest never crashes
          }`
**Problem:** Empty catch block swallows the error silently — catch {
            // the malformed line is skipped — the ingest never crashes
          }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:412`
**Evidence:** `catch { /* fall through */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* fall through */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r11-theatrical-integrity.ts:194`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:65`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:229`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:245`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r3-async-correctness.ts:26`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:913`
**Evidence:** `catch (e: unknown) { /* non-fatal parse */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal parse */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:949`
**Evidence:** `catch (e: unknown) { /* non-fatal parse */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal parse */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:954`
**Evidence:** `catch (e: unknown) { /* non-fatal */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:960`
**Evidence:** `catch (e: unknown) { /* non-fatal parse */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal parse */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:962`
**Evidence:** `catch (e: unknown) { /* non-fatal per-candidate */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal per-candidate */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:986`
**Evidence:** `catch (e: unknown) { /* non-fatal parse */ }`
**Problem:** Empty catch block swallows the error silently — catch (e: unknown) { /* non-fatal parse */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:1032`
**Evidence:** `catch { /* non-fatal parse */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* non-fatal parse */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:1507`
**Evidence:** `catch (pdErr: unknown) { /* non-fatal */ }`
**Problem:** Empty catch block swallows the error silently — catch (pdErr: unknown) { /* non-fatal */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hooks/trident-hooks.ts:2088`
**Evidence:** `catch (distErr: unknown) { /* the dist read failed — the current sha unknown → the marker cannot be trusted */ }`
**Problem:** Empty catch block swallows the error silently — catch (distErr: unknown) { /* the dist read failed — the current sha unknown → the marker cannot be trusted */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hydra/graph-mapper.ts:116`
**Evidence:** `catch {
      }`
**Problem:** Empty catch block swallows the error silently — catch {
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hydra/graph-mapper.ts:134`
**Evidence:** `catch {
      }`
**Problem:** Empty catch block swallows the error silently — catch {
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hydra/graph-mapper.ts:179`
**Evidence:** `catch {
      }`
**Problem:** Empty catch block swallows the error silently — catch {
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `hydra/graphify.ts:69`
**Evidence:** `catch {
      }`
**Problem:** Empty catch block swallows the error silently — catch {
      }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/aether-tools.test.ts:69`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1168`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1175`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1183`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1348`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1351`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1358`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1365`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1936`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1942`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/god-loop.ts:1946`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `poseidon/poseidon-state.ts:100`
**Evidence:** `catch { /* closing a closed db is fine */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* closing a closed db is fine */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `__tests__/poseidon-enforcer.test.ts:34`
**Evidence:** `catch { /* the no-phase state */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* the no-phase state */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:8`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:180`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `harness/map.ts:215`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `harness/trace.ts:134`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `harness/trace.ts:216`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `surface/lsp-injector.ts:247`
**Evidence:** `catch { }`
**Problem:** Empty catch block swallows the error silently — catch { }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `surface/lsp-injector.ts:254`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `surface/query-tool.ts:459`
**Evidence:** `catch {}`
**Problem:** Empty catch block swallows the error silently — catch {}
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `tools/container-test.ts:527`
**Evidence:** `catch { /* column already exists on fresh CREATE */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* column already exists on fresh CREATE */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `tools/container-test.ts:617`
**Evidence:** `catch { /* keep in-memory ledger */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* keep in-memory ledger */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `tools/trident-tools.ts:57`
**Evidence:** `catch { /* readonly probe — best effort */ }`
**Problem:** Empty catch block swallows the error silently — catch { /* readonly probe — best effort */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R4] r4.empty-catch — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `tools/trident-tools.ts:948`
**Evidence:** `catch (e) { /* non-fatal — the kick resolves lazily */ }`
**Problem:** Empty catch block swallows the error silently — catch (e) { /* non-fatal — the kick resolves lazily */ }
**Runtime Impact:** Lexicon r4.empty-catch flagged a pattern in the R4 layer (conf: 0.95)
**Fix:** Log the error (tridentLog) + rethrow or handle it — never swallow silently

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `aether/aether-store.ts:126`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function assertVerdictShape has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "assertVerdictShape" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to assertVerdictShape() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `aether-backend/phase-controller.ts:142`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function canProceed has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "canProceed" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to canProceed() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `layers/r11-theatrical-integrity.ts:210`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function checkCall has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "checkCall" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to checkCall() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `layers/r5-container-deploy.ts:42`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function isMacUsersPath has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "isMacUsersPath" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to isMacUsersPath() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `layers/r5-container-deploy.ts:51`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function isWindowsUsersPath has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "isWindowsUsersPath" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to isWindowsUsersPath() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `layers/r6-dependency-integrity.ts:146`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function verifyImportResolution has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "verifyImportResolution" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to verifyImportResolution() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `firewalls/semantic-smoke-firewall.ts:415`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function isPendingExpired has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "isPendingExpired" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to isPendingExpired() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `fsm/context-synthesis-machine.ts:38`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `Function budgetReady has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "budgetReady" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to budgetReady() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `fsm/deep-planning-machine.ts:53`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `Function principlesReady has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "principlesReady" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to principlesReady() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `fsm/deep-planning-machine.ts:54`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `Function componentsReady has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "componentsReady" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to componentsReady() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `fsm/deep-planning-machine.ts:55`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `Function libraryReady has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "libraryReady" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to libraryReady() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `shared/gates.ts:35`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function canAdvance has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "canAdvance" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to canAdvance() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `warheads/warhead-concurrency.ts:30`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function consume has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "consume" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to consume() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `warheads/warhead-concurrency.ts:136`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function isOpen has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "isOpen" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to isOpen() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `harness/audit-machine.ts:135`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Function defaultAcceptance has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "defaultAcceptance" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to defaultAcceptance() at enforcement points, or remove if unused

### [R10] INVOCATION_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `container-testing/container-manager.ts:77`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function teardown has 0 call sites and is not exported (call graph: 4623 entries)`
**Problem:** Enforcement function "teardown" is never called — dead code that provides no protection
**Runtime Impact:** Enforcement exists in source but never executes — provides zero runtime protection
**Fix:** Add calls to teardown() at enforcement points, or remove if unused

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:10`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'ok', data: { v: 10 } })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:70`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'ok', data: { v: 10.0004 } })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:98`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'ok', data: { v: 5 } })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:113`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'ok', data: { flag: false } })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:121`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'ok', data: { s: 'world' } })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:143`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { ok: true, detail: 'ok' };`
**Problem:** Return statement with {ok: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/runtime-verification.test.ts:180`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ ok: true, detail: 'x' })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `r3-r10/r10-golden-onHandle.ts:4`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return true;`
**Problem:** Enforcement function returns BooleanLiteral(true) without validation call preceding it — always passes with no real check performed
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Replace with actual validation logic that can fail (yield false) when checks fail

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `r4-r11-r17/r11-violation.ts:2`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { ok: true };`
**Problem:** Return statement with {ok: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `r4-r11-r17/r11-violation2.ts:2`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { valid: true };`
**Problem:** Return statement with {valid: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `r4-r11-r17/r17-violation.ts:2`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { success: true };`
**Problem:** Return statement with {success: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `r4-r11-r17/r17-violation2.ts:2`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { ok: true };`
**Problem:** Return statement with {ok: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/battery.test.ts:88`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ status: 200, ok: true, text: async () => 'ok' })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/ledger-artifacts.test.ts:44`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ status: 200, ok: true, text: async () => 'ok' })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:56`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `async () => ({ status: 200, ok: true, text: async () => 'ok' })`
**Problem:** Arrow function returns {ok: true} with no validation call preceding it — validation that always succeeds
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual logic before returning success

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:58`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { status: 200, ok: true, text: async () => 'ok' };`
**Problem:** Return statement with {ok: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R11] THEATRICAL_INTEGRITY — CRITICAL (confidence: 0.98 — CRITICAL)

**File:** `tools/container-test.ts:772`
**AST Construct:** RETURN_STATEMENT
**Evidence:** `return { ok: true, data };`
**Problem:** Return statement with {ok: true} in function with no validation call preceding it — validation that always succeeds without performing real work
**Runtime Impact:** Validation is theater — all inputs pass regardless of correctness
**Fix:** Implement actual validation logic before signaling success, or gate success on real validation results

### [R12] CROSS_PLUGIN_ISOLATION — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r1-hook-contract.ts:69`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Hook handler "isToolExecuteBeforeHandler" has no agent guard`
**Problem:** Hook handler "isToolExecuteBeforeHandler" fires for ALL agents — no identity check isolates it to this plugin
**Runtime Impact:** Hook fires for every plugin/agent — side effects leak across plugin boundaries
**Fix:** Add agent identity check at the top: if (input?.agent !== "trident" && input?.name !== "trident") return;

### [R12] CROSS_PLUGIN_ISOLATION — CRITICAL (confidence: 0.95 — CRITICAL)

**File:** `layers/r1-hook-contract.ts:107`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Hook handler "buildHookRegistry" has no agent guard`
**Problem:** Hook handler "buildHookRegistry" fires for ALL agents — no identity check isolates it to this plugin
**Runtime Impact:** Hook fires for every plugin/agent — side effects leak across plugin boundaries
**Fix:** Add agent identity check at the top: if (input?.agent !== "trident" && input?.name !== "trident") return;

## HIGH — Will Fail Container Test

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `audit-engine/layer-engine.ts:55`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.evaluateLayer(layer, ctx, evidence)`
**Problem:** Async function 'evaluateAll' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `aether/aether-brain.ts:132`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.composeNarrative(brief, verdicts)`
**Problem:** Async function 'compose' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `aether/agent-brain.ts:105`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await agent.run({
        promptFilePath: briefPath,
        systemPrompt: ADJUDICATOR_SYSTEM_PROMPT,
        demand: `Adjudicate the ${brief.findings`
**Problem:** Async function 'compose' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `aether/rpm-ledger.ts:170`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.sleepFn(Math.min(250, maxWaitMs - (now - t0)))`
**Problem:** Async function 'acquire' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `aether/step-x-orchestrator.ts:470`
**AST Construct:** METHOD_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/audit-engine/aether/step-x-orchestrator.ts:338
**Evidence:** `drive() returns Promise but is called without await outside try`
**Problem:** Async function 'drive' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before drive() completes — may process stale state, set flags too early
**Fix:** Add 'await' before drive() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/rpm-ledger.ts:84`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.sleepFn(Math.min(250, maxWaitMs - (now - t0)))`
**Problem:** Async function 'acquire' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/tools.ts:195`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await runRg('grep', ['-rn', '-E', p.pattern, r].concat(p.glob ? [`--include=${p.glob}`] : []))`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `context/audit-project-context.ts:49`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `await listTopLevelDirs(target)`
**Problem:** Async function 'detectProjectShape' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-audit-tools.ts:40`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await run('grep', ['-rn', '-E', p.pattern, targetRoot].concat(p.glob ? [`--include=${p.glob}`] : []))`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:94`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await mcp.callTool('query_graph', { question })`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:110`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await mcp.callTool('shortest_path', { source: from, target: to })`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:125`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await mcp.callTool('get_node', { label: concept })`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:142`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `await mcp.callTool('get_neighbors', { label: center })`
**Problem:** Async function 'execute' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/god-loop.ts:762`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.runPhase(targetPath, sessionId)`
**Problem:** Async function 'runLoop' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/god-loop.ts:2145`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.auditEngine.audit(targetPath)`
**Problem:** Async function 'runAudit' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/wave-verifier.ts:82`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.verifyAgent(agent.name, agent.files, claim)`
**Problem:** Async function 'verifyWave' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/wave-verifier.ts:120`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `await this.verifyNoRegression(files)`
**Problem:** Async function 'verifyAgent' contains await expressions but has no try/catch — rejected promises will be unhandled
**Runtime Impact:** Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed
**Fix:** Wrap await calls in try/catch, or chain .catch() on the promise

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `surface/lsp-injector.ts:312`
**AST Construct:** METHOD_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/subagents/trident-bug-hunter/surface/lsp-injector.ts:278
**Evidence:** `reparseChanged() returns Promise but is called without await outside try`
**Problem:** Async function 'reparseChanged' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before reparseChanged() completes — may process stale state, set flags too early
**Fix:** Add 'await' before reparseChanged() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/query-registration.ts:102`
**AST Construct:** FUNCTION_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/subagents/trident-bug-hunter/tools/query-registration.ts:50
**Evidence:** `runQueryTool() returns Promise but is called without await outside try`
**Problem:** Async function 'runQueryTool' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before runQueryTool() completes — may process stale state, set flags too early
**Fix:** Add 'await' before runQueryTool() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/container-test.ts:1023`
**AST Construct:** METHOD_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/tools/container-test.ts:1269
**Evidence:** `setupBasic() returns Promise but is called without await outside try`
**Problem:** Async function 'setupBasic' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before setupBasic() completes — may process stale state, set flags too early
**Fix:** Add 'await' before setupBasic() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/omni-vision.ts:317`
**AST Construct:** FUNCTION_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/tools/omni-vision.ts:165
**Evidence:** `callMiMoDirect() returns Promise but is called without await outside try`
**Problem:** Async function 'callMiMoDirect' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before callMiMoDirect() completes — may process stale state, set flags too early
**Fix:** Add 'await' before callMiMoDirect() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/omni-vision.ts:346`
**AST Construct:** FUNCTION_DECLARATION
**Call Graph:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/tools/omni-vision.ts:165
**Evidence:** `callMiMoDirect() returns Promise but is called without await outside try`
**Problem:** Async function 'callMiMoDirect' returns Promise but is called without await — caller continues before completion
**Runtime Impact:** Caller continues execution before callMiMoDirect() completes — may process stale state, set flags too early
**Fix:** Add 'await' before callMiMoDirect() or handle the returned Promise with .then().catch()

### [R3] ASYNC_CORRECTNESS — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/trident-tools.ts:1160`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `auditPromise.then(...) without .catch()`
**Problem:** .then() without .catch() — promise rejection will be unhandled
**Runtime Impact:** If the promise rejects, the rejection is unhandled — may crash process or silently fail
**Fix:** Chain .catch() after .then(), or use async/await with try/catch

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R5] CONTAINER_DEPLOY — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hydra/graph-mapper.ts:8`
**AST Construct:** STRING_LITERAL
**Evidence:** `/home/leviathan/.local/bin/graphify`
**Problem:** Hardcoded home-directory path in executable code: "/home/leviathan/.local/bin/graphify" — will break in container
**Runtime Impact:** Path does not exist in container — file operations fail silently or throw
**Fix:** Use path.resolve(process.env.HOME, ...) or relative paths

### [R5] CONTAINER_DEPLOY — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hydra/graphify.ts:6`
**AST Construct:** STRING_LITERAL
**Evidence:** `/home/leviathan/.local/share/uv/tools/graphifyy/bin/python`
**Problem:** Hardcoded home-directory path in executable code: "/home/leviathan/.local/share/uv/tools/graphifyy/bin/python" — will break in container
**Runtime Impact:** Path does not exist in container — file operations fail silently or throw
**Fix:** Use path.resolve(process.env.HOME, ...) or relative paths

### [R5] CONTAINER_DEPLOY — HIGH (confidence: 1.00 — CRITICAL)

**File:** `__tests__/checkpoint-gate.test.ts:22`
**AST Construct:** STRING_LITERAL
**Evidence:** `/home/leviathan/src/foo.ts`
**Problem:** Hardcoded home-directory path in executable code: "/home/leviathan/src/foo.ts" — will break in container
**Runtime Impact:** Path does not exist in container — file operations fail silently or throw
**Fix:** Use path.resolve(process.env.HOME, ...) or relative paths

### [R5] CONTAINER_DEPLOY — HIGH (confidence: 1.00 — CRITICAL)

**File:** `graph/corbell-embeddings.ts:97`
**AST Construct:** STRING_LITERAL
**Evidence:** `/home/leviathan`
**Problem:** Hardcoded home-directory path in executable code: "/home/leviathan" — will break in container
**Runtime Impact:** Path does not exist in container — file operations fail silently or throw
**Fix:** Use path.resolve(process.env.HOME, ...) or relative paths

### [R5] CONTAINER_DEPLOY — HIGH (confidence: 1.00 — CRITICAL)

**File:** `__tests__/corbell-native.test.ts:199`
**AST Construct:** STRING_LITERAL
**Evidence:** `http://localhost:7433`
**Problem:** Hardcoded localhost path in executable code: "http://localhost:7433" — will break in container
**Runtime Impact:** Hardcoded local path does not exist in container — file operations fail
**Fix:** Use environment variables or relative paths for container-compatible code

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/lexicons.test.ts:135`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require('../lexicons/lexicon-dispatch.ts')`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:77`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("../input/audit-spec.ts")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:115`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("../math/expr.ts")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:158`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("../input/spec-bindings.ts")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:159`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("node:os")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:276`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("../math/expr.ts")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:281`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require("../input/spec-bindings.ts")`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether/pi-report-write-tool.ts:16`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether/pi-report-write-tool.ts:17`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:1`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:23`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:24`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai/providers/opencode-go'`
**Problem:** Module "@earendil-works/pi-ai/providers/opencode-go" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:25`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai/api/openai-responses.lazy'`
**Problem:** Module "@earendil-works/pi-ai/api/openai-responses.lazy" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/tools.ts:4`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/tools.ts:5`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:37`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:38`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:46`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai/api/openai-responses.lazy'`
**Problem:** Module "@earendil-works/pi-ai/api/openai-responses.lazy" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-audit-tools.ts:6`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-audit-tools.ts:7`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/aether-tools.ts:4`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/aether-tools.ts:5`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graph-mapper.ts:6`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:1`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@modelcontextprotocol/sdk/client/index.js'`
**Problem:** Module "@modelcontextprotocol/sdk/client/index.js" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@modelcontextprotocol" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:2`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@modelcontextprotocol/sdk/client/stdio.js'`
**Problem:** Module "@modelcontextprotocol/sdk/client/stdio.js" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@modelcontextprotocol" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:3`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:4`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/pipeline.ts:1`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/types.ts:1`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/types.ts:2`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-ai'`
**Problem:** Module "@earendil-works/pi-ai" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/corbell-bridge.test.ts:87`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require('bun:sqlite')`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `__tests__/pipeline.test.ts:6`
**AST Construct:** IMPORT_DECLARATION
**Evidence:** `import '@earendil-works/pi-agent-core'`
**Problem:** Module "@earendil-works/pi-agent-core" imported but not in package.json dependencies
**Runtime Impact:** Import resolution fails at runtime — module not found error
**Fix:** Add "@earendil-works" to package.json dependencies or use a bundled alternative

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `poseidon/poseidon-watcher.ts:39`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require('node:fs')`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R6] DEPENDENCY_INTEGRITY — HIGH (confidence: 0.95 — CRITICAL)

**File:** `tools/trident-tools.ts:51`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `require('bun:sqlite')`
**Problem:** require() call found — CJS import in ESM module breaks bundling
**Runtime Impact:** esbuild may not bundle CJS require correctly — runtime import error
**Fix:** Replace require() with ES import statement

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `artifacts/deep-planning-artifact.ts:2187`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `audit-engine/run-status.ts:215`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `l: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "l" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "l" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/a3-real-target.test.ts:121`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `PREFLIGHT_STUB as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/a3-real-target.test.ts:232`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `PREFLIGHT_STUB as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/a3-real-target.test.ts:224`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `PREFLIGHT_STUB as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/a3-real-target.test.ts:210`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `PREFLIGHT_STUB as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/a3-real-target.test.ts:193`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `PREFLIGHT_STUB as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/ht-corpus-execution.test.ts:9`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `allSpecs as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/triad-roundtrip.test.ts:16`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `{} as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `r8-r1/r1-golden-config.ts:8`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "loadConfiguration" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:314`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/agent.ts:254`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/phase-controller.ts:39`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createPhaseController" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/runner.ts:326`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/runner.ts:264`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `v: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "v" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "v" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/runner.ts:251`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/tools.ts:185`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `err: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "err" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "err" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `aether-backend/tools.ts:135`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `events/audit-events.ts:497`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `l: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "l" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "l" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `events/enforcement-planes.ts:88`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `p: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "p" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "p" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `events/enforcement-planes.ts:87`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `p: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "p" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "p" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:129`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:391`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-aether-agent.ts:330`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/pi-audit-tools.ts:32`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `err: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "err" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "err" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r0-build-chain.ts:393`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `d: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "d" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "d" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r13-data-flow-analysis.ts:860`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r15-container-preflight.ts:128`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r15-container-preflight.ts:126`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r16-bible-enforcement.ts:766`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r16-bible-enforcement.ts:1227`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r16-bible-enforcement.ts:1368`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r16-bible-enforcement.ts:1439`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r5-container-deploy.ts:189`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `parent: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "parent" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "parent" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `ship-gate/checks.ts:28`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `e: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "e" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "e" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `ship-gate/checks.ts:114`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `e: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "e" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "e" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/context-synthesis-machine.ts:34`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/context-synthesis-machine.ts:33`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/context-synthesis-machine.ts:32`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/deep-planning-machine.ts:50`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `_: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "_" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "_" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/deep-planning-machine.ts:47`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/deep-planning-machine.ts:46`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/deep-planning-machine.ts:45`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/deep-planning-machine.ts:44`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `_: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "_" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "_" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/aether-tools.ts:125`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `err: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "err" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "err" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graph-mapper.ts:82`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `a: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "a" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "a" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `hydra/graphify.ts:40`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `t: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "t" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "t" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `instances/lasme.ts:391`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `a: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "a" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "a" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `instances/lasme.ts:376`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `instances/lasme.ts:380`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `g: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "g" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "g" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/checkpoint-manager.ts:125`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/checkpoint-manager.ts:246`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/god-loop.ts:1426`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `knowledge-graph/db.ts:722`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `knowledge-graph/db.ts:716`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:42`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `undefined as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.95 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:41`
**AST Construct:** CALL_EXPRESSION
**Evidence:** `null as any`
**Problem:** Explicit `as any` cast discards compile-time type safety
**Runtime Impact:** Untyped value flows unchecked — downstream property/method access may throw at runtime
**Fix:** Provide a concrete target type, or narrow the value with a type guard before casting

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `knowledge-graph/profile-loader.ts:476`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `issue: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "issue" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "issue" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/audit-machine.ts:467`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/audit-machine.ts:461`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/audit-machine.ts:448`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/audit.ts:97`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createAuditTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/build-done.ts:117`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createBuildDoneTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/fix-apply.ts:147`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createFixApplyTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `diagnostics/calibration.ts:493`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `f: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "f" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "f" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `diagnostics/fixture-calibration.ts:183`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `f: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "f" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "f" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `diagnostics/fixture-calibration.ts:180`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `f: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "f" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "f" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `graph/corbell-adapter.ts:80`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "defaultExec" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `graph/corbell-adapter.ts:497`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `m: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "m" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "m" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `graph/likec4-drift.ts:110`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `graph/native-ast-adapter.ts:187`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `c: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "c" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "c" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `extraction/mechanical.ts:218`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `child: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "child" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "child" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `extraction/mechanical.ts:83`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `sf: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "sf" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "sf" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/micro-loop-machine.ts:397`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/micro-loop-machine.ts:391`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/micro-loop-machine.ts:376`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/micro-loop-machine.ts:183`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `harness/scan.ts:39`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `entry: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "entry" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "entry" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `lexicon/compiler.ts:75`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `p: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "p" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "p" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/bug-hunt.ts:80`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createBugHuntTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/docs-patterns.ts:156`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/query-registration.ts:81`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createBugHunterQueryTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/report-writer.ts:1083`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createReportWriterTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `firewall/ast-rules.ts:139`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `child: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "child" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "child" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/build-status.ts:6`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createBuildStatusTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:53`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `a: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "a" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "a" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:49`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:45`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:41`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `s: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "s" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "s" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:37`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `arr: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "arr" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "arr" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:33`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `name: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "name" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "name" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:29`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `input: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "input" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "input" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:16`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `evt: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "evt" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "evt" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:78`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `mode: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "mode" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "mode" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:70`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `a: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "a" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "a" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:66`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:119`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `items: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "items" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "items" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:111`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `v: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "v" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "v" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:107`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `input: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "input" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "input" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:103`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:99`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `name: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "name" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "name" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:91`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `layerCount: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "layerCount" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "layerCount" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `deep/deep-properties.ts:88`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `input: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "input" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "input" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:16`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:11`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `e: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "e" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "e" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:37`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `input: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "input" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "input" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:33`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `layer: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "layer" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "layer" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:29`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `layer: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "layer" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "layer" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:52`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `ctx: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "ctx" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "ctx" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:67`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `reason: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "reason" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "reason" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/properties.ts:62`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `mode: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "mode" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "mode" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `identity/properties.ts:19`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `a: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "a" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "a" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `identity/properties.ts:16`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `v: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "v" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "v" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `identity/properties.ts:13`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `conf: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "conf" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "conf" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `identity/properties.ts:10`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `f: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "f" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "f" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `identity/properties.ts:7`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/properties.ts:11`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/properties.ts:8`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `n: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "n" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "n" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/omni-vision.ts:238`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createOmniVisionTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-poseidon.ts:22`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `c: any`
**Problem:** Exported function "setPoseidonClientRef" accepts parameter "c" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "c" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-poseidon.ts:155`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-preflight.ts:117`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createPreflightTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-preflight.ts:203`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `f: (implicit any)`
**Problem:** Exported function "<arrow>" accepts parameter "f" typed `any` without a runtime type guard
**Runtime Impact:** Public API accepts unstructured input — property access on callers' data may throw at runtime
**Fix:** Add a type guard for "f" (typeof/instanceof) or declare a concrete parameter type

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-ship-package.ts:719`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "createShipPackageTool" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-ship-package.ts:926`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-tools.ts:947`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `tools/trident-tools.ts:946`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `ts-compiler-api/program.ts:85`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R9] RUNTIME_CONTRACT — HIGH (confidence: 0.85 — HIGH)

**File:** `ts-compiler-api/program.ts:99`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `(no return type annotation — inferred any)`
**Problem:** Exported function "<arrow>" has an `any`/missing return type
**Runtime Impact:** Callers of the public API receive an untyped value — downstream usage is unchecked at compile time
**Fix:** Declare an explicit, concrete return type annotation

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `audit-engine/index.ts:235`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `audit-engine/index.ts:506`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `audit-engine/index.ts:653`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/audit-3d.test.ts:184`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/audit-3d.test.ts:211`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/pi-aether-agent.test.ts:185`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/r3-r10.fixtures.test.ts:24`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `r4-r11-r17/r4-golden-by-design.ts:3`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `r4-r11-r17/r4-golden-documented.ts:3`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `r4-r11-r17/r4-violation.ts:2`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `aether-backend/agent.ts:292`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `aether-backend/agent.ts:301`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `aether-backend/tools.ts:76`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:48`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `ast/audit-ast-core.ts:909`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `ast/audit-ast-core.ts:965`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `events/audit-events.ts:506`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:412`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r11-theatrical-integrity.ts:194`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:65`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:229`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r17-theatrical-integrity.ts:245`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r3-async-correctness.ts:26`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `layers/r5-container-deploy.ts:62`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `hostHasPort() called 3 times — return value discarded at every call site`
**Problem:** Enforcement function "hostHasPort" returns a value but it is never checked — result ignored
**Runtime Impact:** Enforcement function runs but its verdict is ignored — same as not running it
**Fix:** Capture and check the return value: const result = hostHasPort(); if (!result.valid) ...

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:913`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:949`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:954`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:960`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:962`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:986`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hooks/trident-hooks.ts:1032`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/graph-mapper.ts:116`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/graph-mapper.ts:134`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/graph-mapper.ts:179`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/graphify.ts:69`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.90 — CRITICAL)

**File:** `hydra/pipeline.ts:137`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Function dispatchSubagent has non-void return type but no ReturnStatement in body`
**Problem:** Function "dispatchSubagent" declares a non-void return type but never returns a value
**Runtime Impact:** Function returns undefined implicitly despite declaring a value return type
**Fix:** Add a return statement with the appropriate value

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/aether-tools.test.ts:69`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `instances/lasme.ts:84`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `outputContractBlock() called 1 times — return value discarded at every call site`
**Problem:** Enforcement function "outputContractBlock" returns a value but it is never checked — result ignored
**Runtime Impact:** Enforcement function runs but its verdict is ignored — same as not running it
**Fix:** Capture and check the return value: const result = outputContractBlock(); if (!result.valid) ...

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `poseidon/cycle-tracker.ts:203`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `loadFromDisk() called 1 times — return value discarded at every call site`
**Problem:** Enforcement function "loadFromDisk" returns a value but it is never checked — result ignored
**Runtime Impact:** Enforcement function runs but its verdict is ignored — same as not running it
**Fix:** Capture and check the return value: const result = loadFromDisk(); if (!result.valid) ...

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1168`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1175`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1183`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1348`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1351`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1358`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1365`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1936`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1942`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/god-loop.ts:1946`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `poseidon/poseidon-state.ts:100`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `__tests__/poseidon-enforcer.test.ts:34`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:8`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `knowledge-graph/family-store.test.ts:180`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `harness/map.ts:215`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `harness/trace.ts:134`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `harness/trace.ts:216`
**AST Construct:** ARROW_FUNCTION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `surface/lsp-injector.ts:247`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `surface/lsp-injector.ts:254`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `surface/query-tool.ts:459`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `firewall/plan-scope.ts:151`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `loadFromWellKnownPath() called 1 times — return value discarded at every call site`
**Problem:** Enforcement function "loadFromWellKnownPath" returns a value but it is never checked — result ignored
**Runtime Impact:** Enforcement function runs but its verdict is ignored — same as not running it
**Fix:** Capture and check the return value: const result = loadFromWellKnownPath(); if (!result.valid) ...

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `tools/container-test.ts:527`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `tools/container-test.ts:617`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `tools/trident-tools.ts:57`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.92 — CRITICAL)

**File:** `tools/trident-tools.ts:948`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `CatchClause with empty block (0 statements)`
**Problem:** Empty catch block silently swallows errors
**Runtime Impact:** Errors are silently swallowed — failures become invisible
**Fix:** Add error handling: log, rethrow, or handle the caught error

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R10] INVOCATION_INTEGRITY — HIGH (confidence: 0.85 — HIGH)

**File:** `container-testing/tmux-session.ts:52`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `kill() called 1 times — return value discarded at every call site`
**Problem:** Enforcement function "kill" returns a value but it is never checked — result ignored
**Runtime Impact:** Enforcement function runs but its verdict is ignored — same as not running it
**Fix:** Capture and check the return value: const result = kill(); if (!result.valid) ...

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `aether-backend/provider.ts:18`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Mutation of process.env.OPENCODE_GO_API_KEY`
**Problem:** Direct mutation of process.env — breaks isolation between plugins in shared runtime
**Runtime Impact:** Other plugins may read stale or modified env state
**Fix:** Use a local config object instead of mutating process.env

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `aether-backend/provider.ts:21`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Mutation of process.env.OPENCODE_GO_API_KEY`
**Problem:** Direct mutation of process.env — breaks isolation between plugins in shared runtime
**Runtime Impact:** Other plugins may read stale or modified env state
**Fix:** Use a local config object instead of mutating process.env

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:120`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `Mutation of process.env.OPENCODE_API_KEY`
**Problem:** Direct mutation of process.env — breaks isolation between plugins in shared runtime
**Runtime Impact:** Other plugins may read stale or modified env state
**Fix:** Use a local config object instead of mutating process.env

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:5`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/usr/local/bin/"`
**Problem:** Hardcoded absolute path "/usr/local/bin/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:6`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/home/"`
**Problem:** Hardcoded absolute path "/home/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:5`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/usr/bin/"`
**Problem:** Hardcoded absolute path "/usr/bin/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:5`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/usr/sbin/"`
**Problem:** Hardcoded absolute path "/usr/sbin/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:5`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/opt/"`
**Problem:** Hardcoded absolute path "/opt/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:6`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/Users/"`
**Problem:** Hardcoded absolute path "/Users/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:6`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/var/run/"`
**Problem:** Hardcoded absolute path "/var/run/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:6`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/etc/"`
**Problem:** Hardcoded absolute path "/etc/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `layers/r15-container-preflight.ts:6`
**AST Construct:** STRING_LITERAL
**Evidence:** `Hardcoded path: "/tmp/"`
**Problem:** Hardcoded absolute path "/tmp/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `lexicons/audit-calibration.ts:164`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Hardcoded path: "/tmp/calibration-fixture.ts"`
**Problem:** Hardcoded absolute path "/tmp/calibration-fixture.ts" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hooks/trident-hooks.ts:1918`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/tmp/"`
**Problem:** Hardcoded absolute path "/tmp/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hooks/trident-hooks.ts:3666`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/tmp/trident-tooldef-marker.txt"`
**Problem:** Hardcoded absolute path "/tmp/trident-tooldef-marker.txt" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hooks/trident-hooks.ts:3672`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/tmp/trident-tooldef-marker.txt"`
**Problem:** Hardcoded absolute path "/tmp/trident-tooldef-marker.txt" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hydra/graph-mapper.ts:8`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/home/leviathan/.local/bin/graphify"`
**Problem:** Hardcoded absolute path "/home/leviathan/.local/bin/graphify" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `hydra/graphify.ts:6`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/home/leviathan/.local/share/uv/tools/graphifyy/bin/python"`
**Problem:** Hardcoded absolute path "/home/leviathan/.local/share/uv/tools/graphifyy/bin/python" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `poseidon/poseidon-watcher.ts:39`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `require('node:fs') without try/catch`
**Problem:** require('node:fs') called without error handling — crashes if module missing in container
**Runtime Impact:** Module 'node:fs' may not be installed in container — require throws MODULE_NOT_FOUND
**Fix:** Wrap in try/catch or use dynamic import() with error handling

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `graph/corbell-adapter.ts:151`
**AST Construct:** FUNCTION_DECLARATION
**Evidence:** `Hardcoded path: "/home/leviathan/OPENCODE_WORKSPACE/"`
**Problem:** Hardcoded absolute path "/home/leviathan/OPENCODE_WORKSPACE/" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `graph/corbell-embeddings.ts:97`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `Hardcoded path: "/home/leviathan"`
**Problem:** Hardcoded absolute path "/home/leviathan" — will not exist in container
**Runtime Impact:** Path does not exist in container filesystem — file not found error at runtime
**Fix:** Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)

### [R15] CONTAINER_PREFLIGHT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `tools/trident-tools.ts:51`
**AST Construct:** VARIABLE_DECLARATION
**Evidence:** `require('bun:sqlite') without try/catch`
**Problem:** require('bun:sqlite') called without error handling — crashes if module missing in container
**Runtime Impact:** Module 'bun:sqlite' may not be installed in container — require throws MODULE_NOT_FOUND
**Fix:** Wrap in try/catch or use dynamic import() with error handling

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R16] OUTPUT_CONTRACT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `aether/aether-brain.ts:175`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `catch (err) {
        // THE CATCH LOGS + DRIVES THE RETRY (never an empty catch...`
**Problem:** catch(err) has no exit but function declares type 'Promise<ProbedVerdict[]>' — yields undefined implicitly
**Runtime Impact:** Function returns undefined instead of 'Promise<ProbedVerdict[]>' — callers get TypeError
**Fix:** Add an exit statement in catch matching the function's declared type 'Promise<ProbedVerdict[]>'

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R16] OUTPUT_CONTRACT — HIGH (confidence: 1.00 — CRITICAL)

**File:** `aether/aether-brain.ts:231`
**AST Construct:** METHOD_DECLARATION
**Evidence:** `catch (err) {
        lastError = err;
        void tridentLog(
          'WARN'...`
**Problem:** catch(err) has no exit but function declares type 'Promise<string>' — yields undefined implicitly
**Runtime Impact:** Function returns undefined instead of 'Promise<string>' — callers get TypeError
**Fix:** Add an exit statement in catch matching the function's declared type 'Promise<string>'

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `artifacts/context-synthesis-artifact.ts:641`
**Evidence:** `(p: string): string => {
    switch (p) {
      case 'THEATRICAL_IMPLEMENTATION':
        return '```typescript\n'
     `
**Problem:** Function returns a hardcoded success without doing the work — (p: string): string => {
    switch (p) {
      case 'THEATRICAL_IMPLEMENTATION':
        return '```typescript\n'
     
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `audit-engine/evidence-gate.ts:65`
**Evidence:** `support(layer: string): boolean {
    switch (layer) {
      case 'R0':
        return !this.preflight.buildPassed || !t`
**Problem:** Function returns a hardcoded success without doing the work — support(layer: string): boolean {
    switch (layer) {
      case 'R0':
        return !this.preflight.buildPassed || !t
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:51`
**Evidence:** `function probeExists(p: string): boolean {
  try { return fs.existsSync(p); } catch (err: unknown) { void err; return fa`
**Problem:** Function returns a hardcoded success without doing the work — function probeExists(p: string): boolean {
  try { return fs.existsSync(p); } catch (err: unknown) { void err; return fa
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `r3-r10/r10-golden-isRunning.ts:2`
**Evidence:** `export function isRunning(): boolean { return true; }`
**Problem:** Function returns a hardcoded success without doing the work — export function isRunning(): boolean { return true; }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `r3-r10/r10-golden-onHandle.ts:4`
**Evidence:** `export function checkDynamicViaBracket(): boolean { return true; }`
**Problem:** Function returns a hardcoded success without doing the work — export function checkDynamicViaBracket(): boolean { return true; }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `r4-r11-r17/r11-golden-validated.ts:8`
**Evidence:** `function queryDb(u: string){ return true; }`
**Problem:** Function returns a hardcoded success without doing the work — function queryDb(u: string){ return true; }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `aether/step-x-orchestrator.ts:195`
**Evidence:** `export function anchorExistsWithinScope(targetPath: string, file: string, line: number): boolean {
  try {
    const roo`
**Problem:** Function returns a hardcoded success without doing the work — export function anchorExistsWithinScope(targetPath: string, file: string, line: number): boolean {
  try {
    const roo
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `aether-backend/runner.ts:251`
**Evidence:** `() => { try { return fs.existsSync(path.join(ledgerRoot, 'verdicts.json')); } catch (err: unknown) { void (err instanceo`
**Problem:** Function returns a hardcoded success without doing the work — () => { try { return fs.existsSync(path.join(ledgerRoot, 'verdicts.json')); } catch (err: unknown) { void (err instanceo
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `aether-backend/runner.ts:326`
**Evidence:** `() => { try { return fs.existsSync(outPath); } catch { return false; } }`
**Problem:** Function returns a hardcoded success without doing the work — () => { try { return fs.existsSync(outPath); } catch { return false; } }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `context/audit-project-context.ts:129`
**Evidence:** `(name) => {
      try {
        return fs.statSync(path.join(target, name)).isDirectory();
      } catch {
        retur`
**Problem:** Function returns a hardcoded success without doing the work — (name) => {
      try {
        return fs.statSync(path.join(target, name)).isDirectory();
      } catch {
        retur
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `graph/audit-graph.ts:249`
**Evidence:** `nodeCount(): number {
    try {
      const db = this.connect();
      const rows = db.prepare('SELECT COUNT(*) as c FRO`
**Problem:** Function returns a hardcoded success without doing the work — nodeCount(): number {
    try {
      const db = this.connect();
      const rows = db.prepare('SELECT COUNT(*) as c FRO
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:379`
**Evidence:** `() => { try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; } }`
**Problem:** Function returns a hardcoded success without doing the work — () => { try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; } }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:391`
**Evidence:** `() => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').includes('### FINDING'); } catch { return false; `
**Problem:** Function returns a hardcoded success without doing the work — () => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').includes('### FINDING'); } catch { return false; 
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `harness/pi-aether-agent.ts:394`
**Evidence:** `() => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; }
    `
**Problem:** Function returns a hardcoded success without doing the work — () => {
      try { return fs.readFileSync(opts.judgmentPath, 'utf-8').trim().length > 0; } catch { return false; }
    
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `input/audit-spec.ts:40`
**Evidence:** `export function isTemplateShell(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    if (type`
**Problem:** Function returns a hardcoded success without doing the work — export function isTemplateShell(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    if (type
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `input/audit-spec.ts:66`
**Evidence:** `function hasTsFilesRecursive(root: string): boolean {
  try {
    const stack: string[] = [root];
    const skip = new S`
**Problem:** Function returns a hardcoded success without doing the work — function hasTsFilesRecursive(root: string): boolean {
  try {
    const stack: string[] = [root];
    const skip = new S
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `hooks/agent-state.ts:95`
**Evidence:** `export function hasValidContainerTestPlanFile(): boolean {
  try {
    if (ctPlanFileChecked) return ctPlanFileValid;
  `
**Problem:** Function returns a hardcoded success without doing the work — export function hasValidContainerTestPlanFile(): boolean {
  try {
    if (ctPlanFileChecked) return ctPlanFileValid;
  
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `hooks/agent-state.ts:304`
**Evidence:** `export function initAgentStateDb(): boolean {
  try {
    getEvidenceDb();
    return evidenceDbHandle.ready;
  } catch `
**Problem:** Function returns a hardcoded success without doing the work — export function initAgentStateDb(): boolean {
  try {
    getEvidenceDb();
    return evidenceDbHandle.ready;
  } catch 
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `hooks/poseidon-enforcer-hook.ts:300`
**Evidence:** `() => {
    try {
      const st = fs.statSync(path.join(resolvedTarget as string, '.trident', 'god-loop', 'state.json')`
**Problem:** Function returns a hardcoded success without doing the work — () => {
    try {
      const st = fs.statSync(path.join(resolvedTarget as string, '.trident', 'god-loop', 'state.json')
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `hooks/trident-hooks.ts:1273`
**Evidence:** `function resumeSessionExists(taskId: string): boolean {
  try {
    if (!taskId || taskId.trim().length === 0) return fa`
**Problem:** Function returns a hardcoded success without doing the work — function resumeSessionExists(taskId: string): boolean {
  try {
    if (!taskId || taskId.trim().length === 0) return fa
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `poseidon/cycle-tracker.ts:203`
**Evidence:** `loadFromDisk(archiveBase: string): boolean {
    try {
      var data = cast<{ findings: [string, FindingState][]; cycle`
**Problem:** Function returns a hardcoded success without doing the work — loadFromDisk(archiveBase: string): boolean {
    try {
      var data = cast<{ findings: [string, FindingState][]; cycle
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `poseidon/wave-verifier.ts:171`
**Evidence:** `private verifyTscBuild(): boolean {
    try {
      execSync('bun build src/index.ts --outdir /tmp/wave-verify-build --t`
**Problem:** Function returns a hardcoded success without doing the work — private verifyTscBuild(): boolean {
    try {
      execSync('bun build src/index.ts --outdir /tmp/wave-verify-build --t
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 3 times across: Trident v4.1, Kraken v1.2.
**Proven Fix:** Switch to esbuild --bundle for single-file output. tsc produces multi-file dist that breaks container deployment.
**Source:** Trident BUILD_LOG: "Multi-file tsc output — only index.js copied to container, imports fail"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `shared/evidence-gate.ts:15`
**Evidence:** `hasContainerTestEvidence(): boolean {
    try {
      const resultPath = path.join(this.evidenceDir, 'ContainerTestResul`
**Problem:** Function returns a hardcoded success without doing the work — hasContainerTestEvidence(): boolean {
    try {
      const resultPath = path.join(this.evidenceDir, 'ContainerTestResul
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `warheads/warhead-testing.ts:41`
**Evidence:** `private checkContainerTestEvidence(): boolean {
    try {
      return evidenceGate.hasContainerTestEvidence();
    } ca`
**Problem:** Function returns a hardcoded success without doing the work — private checkContainerTestEvidence(): boolean {
    try {
      return evidenceGate.hasContainerTestEvidence();
    } ca
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:90`
**Evidence:** `function probeExists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}`
**Problem:** Function returns a hardcoded success without doing the work — function probeExists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `harness/hunt-lock.ts:18`
**Evidence:** `function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
`
**Problem:** Function returns a hardcoded success without doing the work — function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {

**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:25`
**Evidence:** `() => {
    try { createTridentTools(); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — () => {
    try { createTridentTools(); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:29`
**Evidence:** `(input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:33`
**Evidence:** `(name) => {
    try { setCurrentAgent(name); clearCurrentAgent(); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (name) => {
    try { setCurrentAgent(name); clearCurrentAgent(); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:37`
**Evidence:** `(arr) => {
    try { deduplicateFindings(arr as unknown as Finding[]); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (arr) => {
    try { deduplicateFindings(arr as unknown as Finding[]); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:41`
**Evidence:** `(s) => {
    try { shortFile(s); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (s) => {
    try { shortFile(s); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:45`
**Evidence:** `(n) => {
    try { confidenceLabel(n); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (n) => {
    try { confidenceLabel(n); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:49`
**Evidence:** `(s) => {
    try { parseVersion(s); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (s) => {
    try { parseVersion(s); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:53`
**Evidence:** `(a, b, cc) => {
    try { formatVersion(a, b, cc); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (a, b, cc) => {
    try { formatVersion(a, b, cc); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:88`
**Evidence:** `(input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (input) => {
    try { detectIntent(input); return true; } catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:91`
**Evidence:** `(layerCount) => {
    try {
      const m = new OrchestratorMachineV2();
      m.startMode('CODE_REVIEW');
      for (le`
**Problem:** Function returns a hardcoded success without doing the work — (layerCount) => {
    try {
      const m = new OrchestratorMachineV2();
      m.startMode('CODE_REVIEW');
      for (le
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:99`
**Evidence:** `(name) => {
    try { setCurrentAgent(name); const a = getCurrentAgent(); clearCurrentAgent(); return a !== undefined; }`
**Problem:** Function returns a hardcoded success without doing the work — (name) => {
    try { setCurrentAgent(name); const a = getCurrentAgent(); clearCurrentAgent(); return a !== undefined; }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 1 times across: Shark v4.8.1.
**Proven Fix:** Call setCurrentAgent() in the session-hook or chat.message hook before any identity check
**Source:** SHARK_DUMP: "setCurrentAgent() was defined but NEVER called — all guardian hooks checked getCurrentAgent() which always returned null"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:103`
**Evidence:** `(n) => {
    try { return typeof confidenceLabel(n) === 'string'; }
    catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (n) => {
    try { return typeof confidenceLabel(n) === 'string'; }
    catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:107`
**Evidence:** `(input) => {
    try { detectIntent(input); return true; }
    catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (input) => {
    try { detectIntent(input); return true; }
    catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:111`
**Evidence:** `(v) => {
    try { const p = parseVersion(v); return typeof p.major === 'number'; }
    catch { return false; }
  }`
**Problem:** Function returns a hardcoded success without doing the work — (v) => {
    try { const p = parseVersion(v); return typeof p.major === 'number'; }
    catch { return false; }
  }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:115`
**Evidence:** `() => {
    try { const tools = createTridentTools(); return Object.keys(tools).length >= 8; }
    catch { return false;`
**Problem:** Function returns a hardcoded success without doing the work — () => {
    try { const tools = createTridentTools(); return Object.keys(tools).length >= 8; }
    catch { return false;
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `deep/deep-properties.ts:119`
**Evidence:** `(items) => {
    try { const r = deduplicateFindings(items as unknown as Finding[]); return Array.isArray(r); }
    catc`
**Problem:** Function returns a hardcoded success without doing the work — (items) => {
    try { const r = deduplicateFindings(items as unknown as Finding[]); return Array.isArray(r); }
    catc
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/omni-vision.ts:72`
**Evidence:** `function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch { return false; }`
**Problem:** Function returns a hardcoded success without doing the work — function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch { return false; }
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/trident-ship-package.ts:719`
**Evidence:** `export function createShipPackageTool() {
  return tool({
    description: 'Ship Package Generator v4 (manifest-driven):`
**Problem:** Function returns a hardcoded success without doing the work — export function createShipPackageTool() {
  return tool({
    description: 'Ship Package Generator v4 (manifest-driven):
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/trident-ship-package.ts:734`
**Evidence:** `async (args: {
      targetPath: string; projectName?: string; distSha?: string; outputPath?: string; blocksFile?: strin`
**Problem:** Function returns a hardcoded success without doing the work — async (args: {
      targetPath: string; projectName?: string; distSha?: string; outputPath?: string; blocksFile?: strin
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/trident-ship-package.ts:916`
**Evidence:** `(f: string): number => {
          try { return fsSync.readFileSync(f, 'utf-8').split('\n').length; } catch { return 0; `
**Problem:** Function returns a hardcoded success without doing the work — (f: string): number => {
          try { return fsSync.readFileSync(f, 'utf-8').split('\n').length; } catch { return 0; 
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `tools/trident-tools.ts:866`
**Evidence:** `function validateFindingLocation(filePath: string, line: number): boolean {
  try {
    const content = fsSync.readFileS`
**Problem:** Function returns a hardcoded success without doing the work — function validateFindingLocation(filePath: string, line: number): boolean {
  try {
    const content = fsSync.readFileS
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `container-testing/container-manager.ts:8`
**Evidence:** `fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      const out = execSync(`docker exe`
**Problem:** Function returns a hardcoded success without doing the work — fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      const out = execSync(`docker exe
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `container-testing/deploy-verifier.ts:44`
**Evidence:** `isProcessRunning(containerId: string, processName: string): boolean {
    try {
      const raw = execSync(`docker exec `
**Problem:** Function returns a hardcoded success without doing the work — isProcessRunning(containerId: string, processName: string): boolean {
    try {
      const raw = execSync(`docker exec 
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.fake-return — HIGH (confidence: 0.90 — CRITICAL)

**File:** `container-testing/deploy-verifier.ts:56`
**Evidence:** `fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      const testOut = execSync(`docker`
**Problem:** Function returns a hardcoded success without doing the work — fileExistsInContainer(containerId: string, filePath: string): boolean {
    try {
      const testOut = execSync(`docker
**Runtime Impact:** Lexicon r17.fake-return flagged a pattern in the R17 layer (conf: 0.90)
**Fix:** Perform the real work + return the real result — never a fake success

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/lexicons.test.ts:32`
**Evidence:** `() => {
  it('the r4.empty-catch FIRES on the empty catch construct', () => {
    const { construct, ctx } = ctxWithCons`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
  it('the r4.empty-catch FIRES on the empty catch construct', () => {
    const { construct, ctx } = ctxWithCons
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/lexicons.test.ts:68`
**Evidence:** `() => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.FUNCTION_DECLARATION,
      name: 't`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
    const { construct, ctx } = ctxWithConstruct({
      kind: ConstructType.FUNCTION_DECLARATION,
      name: 't
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:244`
**Evidence:** `() => {
  test("extracts 12 contracts and writes honest artifact with stale-guard", () => {
    try { fs.unlinkSync(ARTI`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
  test("extracts 12 contracts and writes honest artifact with stale-guard", () => {
    try { fs.unlinkSync(ARTI
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:285`
**Evidence:** `() => {
    try { fs.unlinkSync(ARTIFACT_PATH); } catch (err: unknown) { void err; }
    try { fs.unlinkSync(ARTIFACT_PA`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
    try { fs.unlinkSync(ARTIFACT_PATH); } catch (err: unknown) { void err; }
    try { fs.unlinkSync(ARTIFACT_PA
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/aether-report-reader.test.ts:21`
**Evidence:** `() => {
  test('fenced json parse path', async () => {
    const obj = { candidates: [{ file: 'a.ts' }], summary: 'ok' }`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
  test('fenced json parse path', async () => {
    const obj = { candidates: [{ file: 'a.ts' }], summary: 'ok' }
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/aether-report-reader.test.ts:126`
**Evidence:** `async () => {
    const abs = absRel(R23_REL);
    if (!fs.existsSync(abs)) { expect(true).toBe(true); return; }
    con`
**Problem:** Test asserts a constant against itself — it can never fail — async () => {
    const abs = absRel(R23_REL);
    if (!fs.existsSync(abs)) { expect(true).toBe(true); return; }
    con
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:341`
**Evidence:** `() => {
  test("extracts 10 contracts and writes honest artifact with stale-guard", () => {
    try { fs.unlinkSync(ARTI`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
  test("extracts 10 contracts and writes honest artifact with stale-guard", () => {
    try { fs.unlinkSync(ARTI
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

### [R17] r17.always-pass — HIGH (confidence: 0.95 — CRITICAL)

**File:** `__tests__/meta-audit.test.ts:392`
**Evidence:** `() => {
    try { fs.unlinkSync(ARTIFACT_PATH); } catch { void 0; }
    try { fs.unlinkSync(ARTIFACT_PATH); } catch { vo`
**Problem:** Test asserts a constant against itself — it can never fail — () => {
    try { fs.unlinkSync(ARTIFACT_PATH); } catch { void 0; }
    try { fs.unlinkSync(ARTIFACT_PATH); } catch { vo
**Runtime Impact:** Lexicon r17.always-pass flagged a pattern in the R17 layer (conf: 0.95)
**Fix:** Assert the REAL behavior — a test that cannot fail is theater

**Cross-Project Evidence:** This pattern occurred 25 times across: Kraken v1.2.
**Proven Fix:** Add console.error("[Component] operation failed:", err) in every catch block. Never swallow errors silently.
**Source:** KRAKEN_V1.2_FORENSIC: "25+ instances of catch {} — Docker failures, brain wiring errors ALL hidden"

### [R18-lasme-lexicon] lexicon.family.Lexicon — HIGH (confidence: 0.92 — CRITICAL)

**File:** `layers/r-lexicon.ts:147`
**Evidence:** `for (const req of ['triggerCondition', 'severity', 'messageTemplate', 'remediationHook', 'exampleHits'])`
**Problem:** lexicon.family Lexicon at src/audit-engine/layers/r-lexicon.ts:147
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** Lexicon_Grade_Intelligent_Systems_Engineering_Bible.md:PART 1.2 PatternFamily { id, kind, matcher, triggerCondition, severity, messageTemplate, remediationHook } + INTELLIGENT_SYSTEMS_ENGINEERING_T1.md:30 PatternFamily member id/kind/matcher/triggerCondition/severity/messageTemplate/remediationHook/exampleHits

### [R19-lasme-actor] violates.Actor — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/pipeline.ts:101`
**Evidence:** `void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method`
**Problem:** violates Actor at src/hydra/pipeline.ts:101
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, createActor/createMachine/send/subscribe calls, missing subscriptions, message flow integrity

### [R19-lasme-actor] violates.Actor — HIGH (confidence: 0.88 — HIGH)

**File:** `layers/r-actor.ts:61`
**Evidence:** `if (isCallByName(node, sf, 'subscribe')) subscribeCount += 1;`
**Problem:** violates Actor at src/audit-engine/layers/r-actor.ts:61
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, missing subscriptions, message flow integrity

### [R20-lasme-state-machine] state-machine.scattered-flags.Orchestrator — HIGH (confidence: 0.88 — HIGH)

**File:** `src/orchestrator.ts:42`
**Evidence:** `private states = new Map<string, OrchestratorState>();`
**Problem:** state-machine.scattered-flags Orchestrator at src/orchestrator.ts:42
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §2.2 R20 (a) SCATTERED BOOLEAN FLAGS — boolean flags alongside an XState machine that duplicate or shadow machine states

### [R20-lasme-state-machine] state-machine.unreachable.OrchestratorMachineV2 — HIGH (confidence: 0.85 — HIGH)

**File:** `fsm/orchestrator-machine-v2.ts:136`
**Evidence:** `if (this.state.status === 'ERROR' || this.state.status === 'TIMEOUT') {`
**Problem:** state-machine.unreachable OrchestratorMachineV2 at src/fsm/orchestrator-machine-v2.ts:136
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md §2.3 R20 (c) UNREACHABLE STATES / state machine integrity — TIMEOUT defined in STATUS_TRANSITIONS at line 50 but `timeout()` has zero call sites (grep 0 hits), unreachable trigger; and this branch executes `this.state = this.defaultState(); return;` at line 137 bypassing `transition()` gate that otherwise throws `[ORCHESTRATOR GATE] Illegal transition`, losing mode/maxLayers diagnostic context

### [R20-lasme-state-machine] state-machine.topology-drift.Orchestrator — HIGH (confidence: 0.86 — HIGH)

**File:** `src/orchestrator.ts:88`
**Evidence:** `orchestratorMachineV2.startMode('CODE_REVIEW');`
**Problem:** state-machine.topology-drift Orchestrator at src/orchestrator.ts:88
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md §2.2 R20 (d) STATE TOPOLOGY DRIFT — spec declares single source of truth via gate, code maintains parallel `Map<string,OrchestratorState>` at line 42 and after gated `startMode` manually copies `state.mode = 'CODE_REVIEW'; state.currentLayer = orchestratorMachineV2.getLayer(); state.status = orchestratorMachineV2.getStatus();` at lines 91-93; when V2 throws Illegal transition the Map stays stale, and AuditFSM at line 44 `public auditFSM: AuditFSM;` can diverge (e.g., V2=RUNNING while AuditFSM=failed)

### [R21-lasme-engine] engine.silentDegrade.Contract — HIGH (confidence: 0.89 — HIGH)

**File:** `hydra/aether-tools.ts:23`
**Evidence:** `catch (e) { void (e as Error).message; }`
**Problem:** engine.silentDegrade Contract at src/hydra/aether-tools.ts:23
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:156 r-engine | writeFileSync/degrade paths, engine-level side effects without guards, container deploy surface

### [R21-lasme-engine] engine.silentDegrade.Contract — HIGH (confidence: 0.78 — HIGH)

**File:** `hydra/aether-auditor.ts:1`
**Evidence:** `import * as fs from 'node:fs';`
**Problem:** engine.silentDegrade Contract at src/hydra/aether-auditor.ts:1
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:156 r-engine | writeFileSync/degrade paths, engine-level side effects without guards, container deploy surface

### [R22-lasme-adapter] violates.Adapter — HIGH (confidence: 0.92 — CRITICAL)

**File:** `hydra/pipeline.ts:144`
**Evidence:** `void tools; // tools assembled but unused — the primary path (runMetaLayer) bypasses this method`
**Problem:** violates Adapter at src/hydra/pipeline.ts:144
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.1 adapter must delegate tool set to engine — assembled spread merge must be consumed, not voided

### [R22-lasme-adapter] violates.Adapter — HIGH (confidence: 0.88 — HIGH)

**File:** `hydra/aether-auditor.ts:94`
**Evidence:** `buildAuditorTools(resolvedLedger, graph, targetRoot);`
**Problem:** violates Adapter at src/hydra/aether-auditor.ts:94
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** src/hydra/aether-auditor.ts:divergences Q1-tools — assembled buildAuditorTools result must be delegated to AetherAgent, not used only for side-effects

### [R22-lasme-adapter] wraps.Adapter — HIGH (confidence: 0.86 — HIGH)

**File:** `hydra/aether-meta.ts:233`
**Evidence:** `try { buildMetaTools(doc1Path, doc2Path, graph); } catch (e) { void (e as Error).message; }`
**Problem:** wraps Adapter at src/hydra/aether-meta.ts:233
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/AETHER_CODE_AUDIT_OVERHAUL_ARCHITECTURE.md:§2.4 meta tools must include graphify×4+write_meta_doc+children_status — discarding buildMetaTools violates wrapper contract

### [R23-lasme-mpse-threshold] mpse.threshold.Contract — HIGH (confidence: 0.88 — HIGH)

**File:** `math/oracle.ts:24`
**Evidence:** `const eps = decl.epsilon ?? 0;`
**Problem:** mpse.threshold Contract at src/audit-engine/math/oracle.ts:24
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** MASTER_CONTEXT/V443_PLAN_A_CODE_AUDIT_TOOL_L2_SPEC.md:142 epsilon REQUIRED at registration (PARAGON oracle.ts:43's law)

### [r-lexicon] violates.magic threshold 0.1 + default confidence 0.5 without calibration — HIGH (confidence: 0.90 — CRITICAL)

**File:** `instances/lasme.ts:116`
**Evidence:** `const conf = c.confidence ?? 0.5; return { ...c, confidence: Math.min(conf + 0.1, 1.0), crossReferenced: true, crossReferencedBy: otherLayers, };`
**Problem:** violates magic threshold 0.1 + default confidence 0.5 without calibration at /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/instances/lasme.ts:116
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** LASME §2.3 R18 — ISE named-threshold law: thresholds must be named constants with calib: comment; 0.5 default + 0.1 boost are decision thresholds

### [r-engine] violates.dead code path that always throws AETHER_MIGRATION, claims to be engine seam but has no guard — HIGH (confidence: 0.93 — CRITICAL)

**File:** `hydra/pipeline.ts:142`
**Evidence:** `private async dispatchSubagent(spec: SubagentSpec<TInput, TSubResult>, input: TInput, graph: GraphifyGraph, graphifyTools: AgentTool[]): Promise<TSubR`
**Problem:** violates dead code path that always throws AETHER_MIGRATION, claims to be engine seam but has no guard at /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/src/hydra/pipeline.ts:142
**Runtime Impact:** Hydra gate finding — requires adjudication
**Fix:** LASME §2.3 R21 — unguarded engine side effect / dead degrade path that silently carries behavior (the theatrical stub class); Spec §2.1 says pipeline IS the dispatcher, not a throw-stub

## MEDIUM — Quality Issues

- [R0] `dist/:0` — Build script defined but dist/ output directory does not exist — build may never have run (conf: 1.00)
- [R1] `src/index.ts:83` — Hook handler missing the output contract — function chainBeforeHook(
  hooks: Record<string, unknown>,
  buildHooks: Record<string, unknown>,
): void {
  if (!buil (conf: 0.60)
- [R1] `r8-r1/r1-golden-config.ts:18` — Hook handler missing the output contract — export function documentationHelper() {
  return "See tool.execute.before for hook docs";
} (conf: 0.60)
- [R1] `layers/r-engine.ts:162` — Hook handler missing the output contract — function hasHookHandlerHeavyWork(sf: ts.SourceFile): boolean {
  try {
    let hasHookHandler = false;
    let hasHeavyC (conf: 0.60)
- [R1] `layers/r-engine.ts:167` — Hook handler missing the output contract — function visit(n: ts.Node): void {
      if (ts.isCallExpression(n)) {
        const expr = n.expression;
        if (ts (conf: 0.60)
- [R1] `layers/r1-hook-contract.ts:69` — Hook handler missing the output contract — function isToolExecuteBeforeHandler(literals: Set<string>): boolean {
  const hasBefore = referencesHookEvent(literals,  (conf: 0.60)
- [R1] `layers/r1-hook-contract.ts:107` — Hook handler missing the output contract — function buildHookRegistry(ctx: AnalysisContext): Map<string, Set<string>> {
  const cacheKey = ctx.projectRoot;
  const (conf: 0.60)
- [R1] `layers/r1-hook-contract.ts:244` — Hook handler missing the output contract — (ev) => TOOL_EXECUTE_BEFORE_EVENTS.has(ev) || ev === 'tool.execute.before' (conf: 0.60)
- [R1] `layers/r12-cross-plugin-isolation.ts:90` — Hook handler missing the output contract — function detectHookHandler(node: ts.Node): boolean {
  let found = false;
  walkAst(node, (child): void => {
    if (fou (conf: 0.60)
- [R1] `layers/r12-cross-plugin-isolation.ts:92` — Hook handler missing the output contract — (child): void => {
    if (found) return;

    if (ts.isCallExpression(child)) {
      const expr = child.expression;
   (conf: 0.60)
- [R1] `hooks/trident-hooks.ts:3680` — Hook handler missing the output contract — export function createTridentHooks() {
  // R12 CROSS_PLUGIN ISOLATION: Agent identity guard.
  // Each hook handler wir (conf: 0.60)
- [R1] `identity/index.ts:856` — Hook handler missing the output contract — export function formatIdentityHeader(_bundle: IdentityBundle): string {
  return `[TRIDENT IDENTITY BINDING]

You are Tr (conf: 0.60)
- [R1] `nlp/intent-parser.ts:71` — Hook handler missing the output contract — export function detectIntent(message: string): IntentResult {
  // v2 (2026-08-05 — the totality fix): detectIntent MUST (conf: 0.60)
- [R1] `poseidon/poseidon-kick.ts:117` — Hook handler missing the output contract — async kickAwake(): Promise<KickResult> {
    this.kickCount++;
    const attempt = this.kickCount;
    const escalated = (conf: 0.60)
- [R1] `shared/trident-warhead-synthesizer.ts:479` — Hook handler missing the output contract — export async function registerWarheadHooks(): Promise<void> {
  // R12: Agent identity guard — warhead hooks run only fo (conf: 0.60)
- [R1] `hooks/index.ts:97` — Hook handler missing the output contract — export function createBugHunterHooks(options: BugHunterHookOptions = {}): BugHunterHooks {
  const server = resolveDiagn (conf: 0.60)
- [R1] `hooks/index.ts:107` — Hook handler missing the output contract — async (params: unknown): Promise<unknown> => {
      try {
        const p = hookParams<{ tool?: string; agent?: string; (conf: 0.60)
- [R1] `hooks/index.ts:8` — Hook handler missing the output contract — export function createTridentBuildHooks() {
  var guardianHooks = createGuardianHooks();
  var gateHook = createGateHook (conf: 0.60)
- [R3] `aether/aether-brain.ts:179` — void operator applied to Promise — explicitly discarding promise, errors will be unhandled (conf: 0.90)
- [R3] `aether/aether-brain.ts:233` — void operator applied to Promise — explicitly discarding promise, errors will be unhandled (conf: 0.90)

... and 1162 more medium findings

---

## Layer Summary

| Layer | Name | Findings | Avg Confidence | Evidence Suppressed |
|-------|------|----------|---------------|--------------------|
| R0 | Build Chain | 1 | 0.75 | no |
| R1 | Hook Contract | 17 | 0.60 | no |
| R2 | State Machine | 0 | 0.00 | no |
| R3 | Async Correctness | 27 | 0.87 | no |
| R4 | Error Handling | 61 | 0.95 | no |
| R5 | Container Deploy | 5 | 0.80 | no |
| R6 | Dependency Integrity | 64 | 0.84 | no |
| R7 | Config Schema | 58 | 0.81 | no |
| R8 | Source Hygiene | 302 | 0.80 | no |
| R9 | Runtime Contract | 662 | 0.84 | no |
| R10 | Invocation Integrity | 145 | 0.83 | no |
| R11 | Theatrical Integrity | 17 | 0.98 | no |
| R12 | Cross-Plugin Isolation | 2 | 0.95 | no |
| R13 | Data Flow Analysis | 26 | 0.75 | no |
| R14 | Control Flow Graph | 62 | 0.95 | no |
| R15 | Container Preflight | 30 | 0.89 | no |
| R16 | Bible Enforcement (P1-P11) | 481 | 0.64 | no |
| R17 | Theatrical Integrity (D1-D10) | 58 | 0.91 | no |
| r-lexicon | LASME Lexicon (structural) | 3 | 0.84 | no |
| r-actor | LASME Actor (structural) | 1 | 0.55 | no |
| r-state-machine | LASME State Machine (structural) | 1 | 0.62 | no |
| r-engine | LASME Engine (structural) | 1 | 0.93 | no |
| r-adapter | LASME Adapter (structural) | 2 | 0.85 | no |
| r-mpse | MPSE Contract | 1 | 0.74 | no |
| r-graph | SRO Graph Wiring (structural) | 0 | 0.00 | no |
| r-dh-feed | Hunter Feed (re-adjudicated) | 0 | 0.00 | no |
| r-provenance | Spec Provenance (TRACE_GAP) | 0 | 0.00 | no |

## Audit Meta — Transparency Report

| Metric | Value |
|--------|-------|
| Call Graph Coverage | 74% (33295/45033 resolved) |
| Type Checker | Available |
| Self-Audit | YES — blind spot: cannot find bugs in itself |
| Suppressed Below Floor | 0 findings below 0.50 confidence |

### Known Blind Spots

- Self-audit mode — Trident cannot find bugs in itself by definition. Only structural issues detected.
- Oracle: calibratedPredicateRatio=1.00 oraclePassRate=0.99 density=1.00 health=0.99

*Generated by Trident v4.3 AST-Powered Audit Engine*
*Confidence-weighted | Call-graph-aware | Mechanical-evidence-gated*


[LASME-ADJUDICATED]