# Failure Modes — trident-brain-v4.3.3

**Generated:** 2026-06-18T18:38:16.738Z
**Discovered:** 20 failure modes

---

## Overview

This file catalogs every known failure mode in the system. Each entry
includes: name, location, the failing pattern, root cause, impact,
recommended fix, and a prevention rule.

Failure modes are discovered by scanning for:
- `console.error()` calls (potential error swallowing)
- `throw new Error()` (explicit error paths)
- `catch` blocks (error handling patterns)

## Discovered Failure Modes

### 1. [OrchestratorMachine] ${errorMsg}

**Location:** `orchestrator-machine-v2.ts:79`

**Pattern:** `throw new Error(`[OrchestratorMachine] ${errorMsg}``

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 2. [OrchestratorMachine] Cannot advance layer from status ${this.state.status}

**Location:** `orchestrator-machine-v2.ts:115`

**Pattern:** `throw new Error(`[OrchestratorMachine] Cannot advance layer from status ${this.s`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 3. [Component] operation failed:

**Location:** `hive-loader.ts:50`

**Pattern:** `console.error("[Component] operation failed:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 4.  console.log('caught:', e.message);

**Location:** `scoring.ts:43`

**Pattern:** `catch(e) { console.log('caught:', e.message); }`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 5. LOAD FAILED:

**Location:** `scoring.ts:46`

**Pattern:** `console.error('LOAD FAILED:'`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 6.  console.log('MISSING:', e.message);

**Location:** `scoring.ts:48`

**Pattern:** `catch(e) { console.log('MISSING:', e.message); }`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 7. [Context] failed:

**Location:** `r14-control-flow-graph.ts:395`

**Pattern:** `console.error("[Context] failed:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 8. [component] failed:

**Location:** `r16-bible-enforcement.ts:214`

**Pattern:** `console.error("[component] failed:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 9. config.${propName} required

**Location:** `r16-bible-enforcement.ts:448`

**Pattern:** `throw new Error('config.${propName} required'`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 10. [Component] operation failed:

**Location:** `r4-error-handling.ts:26`

**Pattern:** `console.error("[Component] operation failed:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 11. [Component] failed:

**Location:** `r4-error-handling.ts:50`

**Pattern:** `console.error("[Component] failed:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 12. [Component] fallback triggered:

**Location:** `r4-error-handling.ts:175`

**Pattern:** `console.error("[Component] fallback triggered:"`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 13. ${varName} required

**Location:** `r15-container-preflight.ts:63`

**Pattern:** `throw new Error('${varName} required'`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 14. No container spawned

**Location:** `container-manager.ts:54`

**Pattern:** `throw new Error('No container spawned'`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 15.  /* skip unreadable dirs */

**Location:** `program.ts:49`

**Pattern:** `catch (e) { /* skip unreadable dirs */ }`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 16. targetPath does not exist: 

**Location:** `trident-tools.ts:203`

**Pattern:** `throw new Error('targetPath does not exist: '`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 17. [TIMEOUT] Audit exceeded 120s

**Location:** `trident-tools.ts:207`

**Pattern:** `throw new Error('[TIMEOUT] Audit exceeded 120s'`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 18. targetPath does not exist: 

**Location:** `trident-tools.ts:320`

**Pattern:** `throw new Error('targetPath does not exist: '`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 19. requirements required when targetPath is omitted (forward-mapping mode). Pass a minimal idea like 

**Location:** `trident-tools.ts:324`

**Pattern:** `throw new Error('requirements required when targetPath is omitted (forward-mappi`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 20. targetPath does not exist: 

**Location:** `trident-tools.ts:456`

**Pattern:** `throw new Error('targetPath does not exist: '`

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 21. [OrchestratorMachine] ${errorMsg} — orchestrator-machine-v2.ts:79 [pattern: throw new Error(`[OrchestratorMachine] ${errorMsg}`]

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 22. [OrchestratorMachine] Cannot advance layer from status ${this.state.status} — orchestrator-machine-v2.ts:115 [pattern: throw new Error(`[OrchestratorMachine] Cannot advance layer from status ${this.s]

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 23. [Component] operation failed: — hive-loader.ts:50 [pattern: console.error("[Component] operation failed:"]

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 24.  console.log('caught:', e.message); — scoring.ts:43 [pattern: catch(e) { console.log('caught:', e.message); }]

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

### 25. LOAD FAILED: — scoring.ts:46 [pattern: console.error('LOAD FAILED:']

**Root Cause:**
This failure mode occurs when error handling is incomplete. The code
catches or encounters an error condition but does not fully handle it
— either swallowing it silently, logging without acting, or throwing
without sufficient context for debugging.

**Impact:**
- **Runtime:** May cause silent failures or undefined behavior
- **Debugging:** Makes root cause analysis harder (no stack trace context)
- **User Experience:** Errors appear without actionable information

**Recommended Fix:**

```typescript
// BEFORE (problematic):
try {
  doSomething();
} catch (e) {
  console.error(e); // Silent — error swallowed
}

// AFTER (fixed):
try {
  doSomething();
} catch (e) {
  const error = e instanceof Error ? e : new Error(String(e));
  tridentLog('ERROR', moduleName, `${error.message} | stack: ${error.stack}`);
  throw error; // re-throw for upstream handling
  // OR: return defaultValue; // with documented fallback
}
```

**Prevention Rule:**
- Every catch block MUST either re-throw, log with context, or have a
  documented fallback (comment explaining why the error is safe to ignore)
- Audit layer R5 automatically flags empty catch blocks as CRITICAL
- Code review should verify catch blocks have explicit error handling

---

## System-Level Failure Modes

These failure modes apply to the system architecture regardless of discovery.

### FM-S1: Bundle Contains Relative Imports
- **Location:** `dist/index.js`
- **Pattern:** `import { x } from '../../../src/module.js'`
- **Root Cause:** esbuild was not configured with `--bundle` or
  `--external` flags correctly. Internal modules not inlined.
- **Impact:** Plugin fails to load in container — Node ESM resolution
  fails on cross-directory imports.
- **Fix:** Add `--bundle --format=esm` to esbuild command.
  Mark `@opencode-ai/plugin` and `zod` as `--external`.
- **Prevention:** `grep "from '\\.\." dist/index.js` must return 0 matches.

### FM-S2: Identity Drift After Compaction
- **Location:** Runtime (after 50+ turns or explicit compaction)
- **Pattern:** Agent responds with generic identity
- **Root Cause:** `system.transform` hook not firing on compaction,
  or identity block not using SCAN+REPLACE (using unshift instead).
- **Impact:** Agent loses behavioral constraints, may use wrong tools.
- **Fix:** Verify hook registration. Verify SCAN+REPLACE logic.
  Test: trigger compaction and check "who are you" response.
- **Prevention:** Container test #4 (identity after compaction).

### FM-S3: State Machine Crash on Sequential Calls
- **Location:** `orchestrator.ts`
- **Pattern:** `Error: Layer N out of range [1, M]`
- **Root Cause:** Orchestrator not reset between mode invocations.
- **Impact:** Second tool call in a session crashes with state error.
- **Fix:** Call `orchestrator.reset()` before `startMode()`.
- **Prevention:** Container test #6 (sequential tool calls).

### FM-S4: Config Instructions Ignored
- **Location:** Agent configuration JSON
- **Pattern:** Behavioral rules in `config.instructions` have no effect
- **Root Cause:** The opencode runtime does not process the
  `instructions` field. Known platform limitation.
- **Impact:** Developer thinks rules are active; they aren't.
- **Fix:** Move all behavioral rules to `system.transform` hook.
- **Prevention:** Never use `config.instructions` for behavioral rules.

### FM-S5: Array Unshift Creates Duplicates
- **Location:** `hooks/*-hooks.ts` identity injection
- **Pattern:** `output.system.unshift(identityBlock)` called on every
  transform event, accumulating duplicate blocks.
- **Root Cause:** Not checking for existing identity block before push.
- **Impact:** System prompt grows unboundedly, wasting context tokens.
- **Fix:** Use SCAN+REPLACE: find existing block, replace in-place.
- **Prevention:** Code review checks for unshift without findIndex.

### FM-S6: Empty Catch Block
- **Location:** Any catch block in the codebase
- **Pattern:** `catch (e) { }`
- **Root Cause:** Placeholder error handling never filled in.
- **Impact:** Errors silently swallowed, impossible to debug.
- **Fix:** Add logging, re-throw, or documented fallback.
- **Prevention:** Audit layer R5 flags as CRITICAL.


---
*Generated by Trident v4.3.3*
