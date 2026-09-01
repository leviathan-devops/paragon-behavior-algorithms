# Hook API — trident-brain-v4.3.3

**Version:** v4.3.3
**Generated:** 2026-06-18T18:38:16.739Z

---

## Overview

This file documents every hook contract: the event name, when it fires,
the input shape, the output mutation, a code example showing correct usage,
and an anti-pattern showing incorrect usage.

## Hook Registration Table

| Hook | Handler | Purpose | Fires On |
|------|---------|---------|----------|
| `event` | sessionHook | Session lifecycle | Session start/end |
| `chat.message` | onChatMessage | Session tracking, intent detection | Every user message |
| `tool.execute.before` | onToolBefore | Pre-tool audit trail, firewall | Before every tool call |
| `tool.execute.after` | onToolAfter | Post-tool verification, evidence | After every tool call |
| `experimental.chat.system.transform` | onSystemTransform | Identity injection (SCAN+REPLACE) | Every system prompt transform |
| `experimental.chat.messages.transform` | onMessagesTransform | Backup identity injection | Every messages transform |
| `experimental.session.compacting` | onCompacting | Cache invalidate + re-inject | Before compaction |
| `command.execute.before` | onCommandBefore | Guardian enforcement | Before commands |

## Hook Contracts

### 1. chat.message

**When it fires:** On every user message in the chat.
**Input shape:**
```typescript
{ agent: string; sessionID: string; message: { role: string; content: string } }
```

**Output mutation:** None (side effects only — session tracking).

**Correct Usage:**
```typescript
async onChatMessage(input: any, _output: any): Promise<void> {
  const { sessionID, message } = input;
  if (!sessionID || !message) return; // Guard
  // Track session for context persistence (side effect only)
  this.sessionTracker.track(sessionID, message.content);
}
```

**Anti-Pattern:**
```typescript
// WRONG: Mutating output.message (breaks user message integrity)
async badChatMessage(input: any, output: any): Promise<void> {
  output.message.content = "modified"; // Never modify user messages
}
```

### 2. tool.execute.before

**When it fires:** Before every tool execution.
**Input shape:**
```typescript
{ tool: string; sessionID: string; callID: string; args: Record<string, unknown> }
```

**Output mutation:** `output.args` can be modified (inject defaults).

**Correct Usage:**
```typescript
async onToolBefore(input: any, output: any): Promise<void> {
  const { tool, sessionID } = input;
  if (!tool || !sessionID) return;
  // Firewall: validate tool is allowed in current mode
  if (!this.isToolAllowed(tool)) {
    throw new Error(`Tool ${tool} not allowed in mode ${this.currentMode}`);
  }
  // Optionally inject defaults into output.args
  if (output.args && !output.args.targetPath) {
    output.args.targetPath = this.defaultPath;
  }
}
```

**Anti-Pattern:**
```typescript
// WRONG: Blocking all tools (kills functionality)
async badToolBefore(_input: any, _output: any): Promise<void> {
  throw new Error("Blocked"); // Blocks EVERY tool call
}
```

### 3. tool.execute.after

**When it fires:** After every tool execution completes.
**Input shape:**
```typescript
{ tool: string; sessionID: string; result: unknown }
```

**Output mutation:** None (logging/evidence side effects only).

**Correct Usage:**
```typescript
async onToolAfter(input: any, _output: any): Promise<void> {
  const { tool, sessionID, result } = input;
  // Record evidence for audit trail
  this.evidenceStore.record({
    tool, sessionID, result, timestamp: Date.now(),
  });
}
```

### 4. experimental.chat.system.transform (IDENTITY)

**When it fires:** On every system prompt transform event (including compaction).
**Input shape:**
```typescript
{ agent: string; agentName?: string; name?: string }
```

**Output mutation:** `output.system` array — SCAN+REPLACE identity block.

**Correct Usage (SCAN+REPLACE):**
```typescript
async onSystemTransform(input: any, output: any): Promise<void> {
  const agent = input?.agent || input?.agentName;
  if (!agent) return; // Guard: do not inject before agent is known
  const identity = this.buildIdentityBlock();
  if (!output.system) output.system = [];
  // SCAN for existing block
  const startIdx = output.system.findIndex((s: string) =>
    s.includes('[IDENTITY_BLOCK_START]'));
  if (startIdx >= 0) {
    // REPLACE in-place
    const endIdx = output.system.findIndex((s: string, i: number) =>
      i > startIdx && s.includes('[IDENTITY_BLOCK_END]'));
    if (endIdx >= 0) {
      output.system.splice(startIdx, endIdx - startIdx + 1, identity);
      return;
    }
  }
  // PUSH if not found (first injection)
  output.system.push(identity);
}
```

**Anti-Pattern (ARRAY UNSHIFT):**
```typescript
// WRONG: unshift without checking (creates duplicates on repeated calls)
async badSystemTransform(_input: any, output: any): Promise<void> {
  output.system.unshift(identity); // DUPLICATES on every call!
}
```

### 5. experimental.session.compacting

**When it fires:** Before session compaction occurs.
**Input shape:**
```typescript
{ sessionID: string }
```

**Output mutation:** None (cache invalidation side effect).

**Correct Usage:**
```typescript
async onCompacting(input: any, _output: any): Promise<void> {
  const { sessionID } = input;
  if (!sessionID) return;
  // Invalidate caches that will be rebuilt after compaction
  this.cache.invalidate(sessionID);
  // Identity will be re-injected by system.transform on next cycle
}
```

## Common Mistakes

1. **Forgetting to bind `this`:** Hooks must use `.bind(hooks)` or arrow
   functions. Without binding, `this` is `undefined` inside the handler.
2. **Not guarding input:** Always check for required fields before using
   them. Hooks can fire with partial data during edge cases.
3. **Mutating output incorrectly:** Only documented mutations are safe.
   Mutating `output.message` or `output.result` corrupts data.
4. **Using unshift for identity:** Creates duplicates. Always SCAN+REPLACE.


---
*Generated by Trident v4.3.3*
