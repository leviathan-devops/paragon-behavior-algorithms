// llm-generator.ts — Shared LLM call infrastructure for ALL layers (L1/L2/L3/T1/T2).
// Split generation via opencode SDK client. Blocking (callLLM) and async (callLLMAsync) modes.
// Front half: Sections 1-5 (Exec Summary through Defense Rules — code-heavy core that needs full output budget)
// Back half: Sections 6-15 (Algorithm Specs through What This Spec Does NOT Cover)
// Revisions also split. Type names and section headings passed as context to prevent duplication.

import { tridentLog } from '../utils.js';
import { getCurrentSessionModel } from '../hooks/agent-state.js';

let _getClient: (() => any) | null = null;

export function setClientGetter(getter: () => any): void {
  _getClient = getter;
}

export function getClient(): (() => any) | null {
  return _getClient;
}

const ALL_TOOLS_DISABLED: Record<string, boolean> = {
  'trident-deep-planning': false, 'trident-code-audit': false,
  'trident-poseidon': false, 'trident-problem-solving': false,
  'trident-context-synthesis': false, 'trident-build-status': false,
  'read': false, 'write': false, 'edit': false, 'bash': false,
  'task': false, 'glob': false, 'grep': false, 'webfetch': false,
  'question': false, 'ls': false, 'todowrite': false,
};

const SYSTEM = 'You are an elite engineering specification writer. ' +
  'You write the MOST comprehensive, code-rich engineering specs possible. ' +
  'REAL TypeScript code. REAL formulas with derivation. REAL worked examples with numbers. ' +
  'You NEVER abbreviate. NEVER summarize. NEVER use template phrases. ' +
  'CODE IS KING — 60%+ fenced TypeScript code blocks. ' +
  'Output ONLY markdown. Do NOT call tools. Do NOT write files.\n\n' +
  '## ANTI-SLOP RULES — ZERO TOLERANCE\n' +
  '1. NEVER fabricate statistics, percentages, benchmark numbers, or research citations. If you do not have real data, write "DATA NEEDED: measure X to determine Y" instead of inventing a number.\n' +
  '2. NEVER simulate, mock, or stub external API calls. If integration code is needed but the API is unknown, write "INTEGRATION POINT: connect to [service] via [method]" as a placeholder. Do NOT write fake implementation functions like simulateXxx().\n' +
  '3. NEVER invent type names, interface fields, or property names. Use ONLY types that appear in the reference material or data model section. If the existing codebase uses zone.ceiling, write zone.ceiling — NOT zone.top.\n' +
  '4. EVERY function and class MUST include an INTEGRATION NOTE specifying where it goes: "INTEGRATION: replaces getSniperSL() at src/zones.ts:3037" or "NEW FILE: src/path/file.ts" or "INTEGRATION: modify parameter list of constructBasicSetups() at src/setups.ts:4150". No orphan functions without placement.\n' +
  '5. PREFER modifying existing functions over rewriting from scratch. If an existing function can be parameterized or extended, specify the exact parameterization — do not create a duplicate implementation.\n' +
  '6. NEVER write hardcoded prices, dates, or market data in examples. Use placeholder variables: "At entry price E (e.g., 1.0850)..." not "At 1.0850..."';

const FRONT_SECTIONS = `## 1. Executive Summary
## 2. Architecture
## 3. Data Model
## 4. Engine Class
## 5. Defense Rules`;

const BACK_SECTIONS = `## 6. Algorithm Specs
## 7. Test Specs
## 8. Blind Spots
## 9. Integration
## 10. Evidence Format
## 11. File Manifest
## 12. Migration
## 13. Compliance Matrix
## 14. Operational Appendix
## 15. What This Spec Does NOT Cover`;

// Deferred session cleanup for parallel L3 calls.
// When skipDelete=true, session IDs are collected here instead of deleted immediately.
// Call drainPendingSessions() after Promise.allSettled to clean up all at once.
const _pendingSessions: Array<{ client: any; sid: string }> = [];

export async function drainPendingSessions(): Promise<void> {
  const pending = _pendingSessions.splice(0, _pendingSessions.length);
  for (const { client, sid } of pending) {
    try { await client.session.delete({ path: { id: sid } }); } catch (e: unknown) {
      tridentLog('WARN', 'llm-gen', `Deferred session delete failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (pending.length > 0) tridentLog('INFO', 'llm-gen', `Drained ${pending.length} deferred sessions`);
  return undefined; // R10 FIX: explicit Promise<void> completion
}

async function callLLM(client: any, prompt: string, systemOverride?: string, skipDelete?: boolean): Promise<string> {
  const sessionResult = await client.session.create({ body: { title: 'L2 Gen' } });
  const sid = sessionResult?.data?.id;
  if (!sid) throw new Error('Failed to create LLM session');

  try {
    const sys = systemOverride || SYSTEM;
    const model = getCurrentSessionModel();
    tridentLog('INFO', 'l2-llm', `LLM call: ${prompt.split('\n').length} lines prompt (system: ${sys.substring(0, 60)}...)`);
    // THE TOKEN CAP (2026-08-07 — the operator's ruling: "MAX TOKENS 300K
    // ACROSS THE FUCKING BOARD ANYWHERE DEEPSEEK IS THE MODEL" → corrected
    // "deepseek has a max tokens of 384,000"; "everywhere ELSE that is NOT
    // deepseek max tokens should be 128,000"; "purge all this fuckin 8k max
    // tokens slop"). The session model resolves at runtime — the cap follows
    // the model: deepseek → 384000, anything else → 128000.
    const isDeepSeek = typeof model === 'object' && model !== null
      && typeof model.modelID === 'string'
      && model.modelID.toLowerCase().indexOf('deepseek') !== -1;
    const maxTokens = isDeepSeek ? 384000 : 128000;
    const response = await client.session.prompt({
      body: {
        parts: [{ type: 'text', text: prompt }],
        system: sys,
        tools: ALL_TOOLS_DISABLED,
        max_tokens: maxTokens,
        ...(model ? { model } : {}),
      },
      path: { id: sid },
    });

    const parts = response?.data?.parts || response?.parts || [];
    const text = (Array.isArray(parts) ? parts : [])
      .filter((p: any) => p?.type === 'text' && p?.text?.length > 10)
      .map((p: any) => p.text).join('\n');

    tridentLog('INFO', 'l2-llm', `Response: ${text.split('\n').length} lines, ${text.length} chars`);

    if (!text || text.trim().length < 200) {
      throw new Error(`LLM returned ${text?.length || 0} chars — insufficient`);
    }
    return text;
  } finally {
    if (skipDelete) {
      _pendingSessions.push({ client, sid });
    } else {
      try { await client.session.delete({ path: { id: sid } }); } catch (e: unknown) { tridentLog('WARN', 'l2-llm', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
    }
  }
}

/** Extract all interface/type names from text */
function extractTypeNames(text: string): string[] {
  const names = new Set<string>();
  const pattern = /(?:interface|type)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    names.add(m[1]);
  }
  return [...names];
}

/** Extract all section headings from text */
function extractSectionHeadings(text: string): string[] {
  const headings: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (/^##\s+\d+\./.test(line.trim())) {
      headings.push(line.trim());
    }
  }
  return headings;
}

export async function generateSpecViaLLM(
  brief: string,
  revisionFeedback?: string,
  useSplit: boolean = true,
  systemOverride?: string,
  skipDelete?: boolean,
  continuationTarget: number = 0,
): Promise<string> {
  try {
    if (!_getClient) throw new Error('Client getter not set');
    const client = _getClient();
    if (!client) throw new Error('Opencode client not available');

  // SINGLE call for short outputs (L1/T1) or any revision pass
  if (!useSplit || revisionFeedback) {
    const prompt = revisionFeedback
      ? brief + '\n\n---\n\n## REVISION REQUIRED\n\n' + revisionFeedback + '\n\nFix ALL issues. Output the COMPLETE spec.'
      : brief;
    tridentLog('INFO', 'l2-llm', useSplit ? '=== SINGLE CALL (revision) ===' : '=== SINGLE CALL ===');
    const first = await callLLM(client, prompt, systemOverride, skipDelete);

    // CONTINUATION LOOP (opt-in via continuationTarget): single calls yield
    // 500-700 lines naturally. L2 specs need 2000+. Continue until target
    // or convergence. Applies to BOTH normal and revision paths — a
    // line-count revision must itself reach the threshold.
    // L1 callers leave continuationTarget=0 (off).
    let content = first;
    let lines = content.split('\n').length;
    for (let i = 0; i < 5 && lines < continuationTarget; i++) {
      const tail = content.split('\n').slice(-60).join('\n');
      const continuationPrompt =
        'You are writing an engineering specification. Below are the LAST 60 LINES of what you have written so far.\n\n' +
        '=== LAST 60 LINES ===\n' + tail + '\n=== END ===\n\n' +
        'CONTINUE the spec from exactly where you stopped. Rules:\n' +
        '- Do NOT repeat any content already written. Do NOT write a new introduction or title.\n' +
        '- Continue the current section numbering and engineering style.\n' +
        '- Expand each remaining component with full depth: interfaces, data flow, failure modes, rationale.\n' +
        '- Same grounding rules: no invented interfaces, paths, versions, or evidence. Unknown → CONTEXT NEEDED.\n' +
        '- Write AT LEAST 600 more lines.';
      const before = lines;
      const more = await callLLM(client, continuationPrompt, systemOverride, skipDelete);
      // RESTART DEDUP: if the continuation RESTARTED the document (new title +
      // executive summary near its start) instead of continuing, and the restart
      // is substantial (>=80% of accumulated length), the restart is the complete
      // document — replace accumulated content instead of concatenating a dead
      // partial draft before the clean full version.
      const nextHead = more.slice(0, 3000);
      const isRestart = /^#{1,2}\s+/m.test(nextHead) &&
        /executive summary|system overview|engineering specification|detailed workflow/i.test(nextHead);
      const accLines = content.split('\n').length;
      const moreLines = more.split('\n').length;
      if (isRestart && moreLines >= accLines * 0.8) {
        tridentLog('INFO', 'l2-llm', `Continuation ${i + 1}: RESTART detected (${moreLines} lines) — replacing ${accLines}-line partial draft`);
        content = more;
      } else {
        content += '\n\n' + more;
      }
      lines = content.split('\n').length;
      tridentLog('INFO', 'l2-llm', `Continuation ${i + 1}: +${lines - before} lines (total ${lines})`);
      if (lines - before < 120) {
        tridentLog('INFO', 'l2-llm', 'Continuation converged (<120 new lines) — stopping');
        break;
      }
    }
    if (continuationTarget > 0) {
      tridentLog('INFO', 'l2-llm', `=== SINGLE+CONTINUE COMPLETE: ${lines} lines (target ${continuationTarget}) ===`);
    }
    return content;
  }

  const revisionNote = revisionFeedback
    ? `\n\n## REVISION REQUIRED\n${revisionFeedback}\n\nFix ALL issues above. Keep the SAME section structure.\n`
    : '';

  // === CALL 1: Front sections (1-5) ===
  tridentLog('INFO', 'l2-llm', '=== CALL 1: Sections 1-5 ===');
  const prompt1 = brief + revisionNote +
    `\n\n## OUTPUT INSTRUCTION\nOutput ONLY these sections:\n${FRONT_SECTIONS}\n` +
    `Write each section FULLY with maximum code depth. Do NOT write sections 6-15 yet.`;
  const front = await callLLM(client, prompt1);

  // Extract context from front half to prevent duplication in back half
  const typeNames = extractTypeNames(front);
  const frontHeadings = extractSectionHeadings(front);

  // === CALL 2: Back sections (6-15) ===
  tridentLog('INFO', 'l2-llm', '=== CALL 2: Sections 6-15 ===');
  const prompt2 = brief + revisionNote +
    `\n\n## CONTEXT — SECTIONS 1-5 ALREADY WRITTEN\n` +
    `The following sections are ALREADY WRITTEN. Do NOT regenerate them:\n` +
    frontHeadings.map(h => `- ${h}`).join('\n') + '\n\n' +
    `The following TypeScript types are ALREADY DEFINED in the Data Model above. ` +
    `Use these EXACT names. Do NOT redefine them:\n` +
    typeNames.map(n => `- ${n}`).join('\n') + '\n\n' +
    `For reference, here are sections 3-5 (Data Model through Defense Rules):\n` +
    '```markdown\n' + front.substring(0, 12000) + '\n```\n\n' +
    `## OUTPUT INSTRUCTION\nYou MUST output ALL of the following sections. Do NOT skip any. Do NOT abbreviate. Each section must be complete:\n${BACK_SECTIONS}\n` +
    `Be CONSISTENT with sections 1-5 above. Use their EXACT type names and threshold values.\n` +
    `Write each section FULLY with maximum depth. Do NOT stop until ALL sections above are written. ` +
    `Sections 11 (File Manifest) and 12 (Migration) are CRITICAL — you MUST reach them. Do NOT run out of budget before them.`;
  const back = await callLLM(client, prompt2);

  const combined = front.trim() + '\n\n' + back.trim();
  tridentLog('INFO', 'l2-llm',
    `=== COMBINED: ${combined.split('\n').length} lines ` +
    `(${front.split('\n').length} front + ${back.split('\n').length} back) ===`);

  return combined;
  } catch (e: unknown) {
    tridentLog('ERROR', 'l2-llm', `generateSpecViaLLM failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

// ============================================================================
// ASYNC LLM CALL — For L3 parallel domain generation
// Uses promptAsync + polling instead of blocking prompt
// ============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call LLM asynchronously — fires prompt via promptAsync, polls until complete.
 * Used by L3 for parallel domain generation. Non-blocking — allows multiple
 * concurrent calls to the opencode server.
 */
async function callLLMAsync(client: any, prompt: string): Promise<string> {
  const sessionResult = await client.session.create({ body: { title: 'L3 Domain Gen' } });
  const sid = sessionResult?.data?.id;
  if (!sid) throw new Error('Failed to create LLM session (async)');

  try {
    // Fire prompt — returns immediately (HTTP 204)
    // THE TOKEN CAP (2026-08-07 — the operator's ruling: deepseek → 384000,
    // everything else → 128000; the 8K slop is purged). The L3 domains run
    // the session model — the same model-aware cap as callLLM.
    const model = getCurrentSessionModel();
    const isDeepSeek = typeof model === 'object' && model !== null
      && typeof model.modelID === 'string'
      && model.modelID.toLowerCase().indexOf('deepseek') !== -1;
    const maxTokens = isDeepSeek ? 384000 : 128000;
    await client.session.promptAsync({
      body: {
        parts: [{ type: 'text', text: prompt }],
        system: SYSTEM,
        tools: ALL_TOOLS_DISABLED,
        max_tokens: maxTokens,
      },
      path: { id: sid },
    });
    tridentLog('INFO', 'l2-llm-async', `Prompt fired for session ${sid} — polling for completion`);

    // Poll until session is idle (LLM finished)
    const maxWait = 600000; // 10 minute timeout per call
    const start = Date.now();
    let idle = false;

    while (Date.now() - start < maxWait) {
      await sleep(5000); // poll every 5 seconds

      try {
        const status = await client.session.status({ path: { id: sid } });
        const statusStr = status?.data?.status || status?.data?.state || '';
        if (statusStr === 'idle' || statusStr === 'completed' || statusStr === 'ready') {
          idle = true;
          break;
        }
      } catch (e: unknown) {
        tridentLog('WARN', 'l2-llm', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    if (!idle) {
      throw new Error(`Session ${sid} did not complete within ${maxWait / 1000}s`);
    }

    // Get the messages — extract assistant response text
    const msgResult = await client.session.messages({ path: { id: sid } });
    const messages = msgResult?.data || msgResult || [];
    const allMessages = Array.isArray(messages) ? messages : [];

    // Find the last assistant message with text parts
    let generatedText = '';
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      if (msg?.role === 'assistant' || msg?.type === 'assistant') {
        const parts = msg?.parts || msg?.content || [];
        const textParts = (Array.isArray(parts) ? parts : [])
          .filter((p: any) => p?.type === 'text' && p?.text?.length > 10);
        if (textParts.length > 0) {
          generatedText = textParts.map((p: any) => p.text).join('\n');
          break;
        }
      }
    }

    tridentLog('INFO', 'l2-llm-async',
      `Session ${sid} complete: ${generatedText.split('\n').length} lines, ${generatedText.length} chars`);

    if (!generatedText || generatedText.trim().length < 200) {
      throw new Error(`Async LLM returned ${generatedText?.length || 0} chars — insufficient`);
    }

    return generatedText;
  } finally {
    try { await client.session.delete({ path: { id: sid } }); } catch (e: unknown) { tridentLog('WARN', 'l2-llm', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
  }
}

/**
 * Generate spec via async LLM call — for L3 parallel domain generation.
 * Same split logic as generateSpecViaLLM but uses non-blocking callLLMAsync.
 */
export async function generateSpecViaLLMAsync(
  brief: string,
  revisionFeedback?: string,
  useSplit: boolean = true,
): Promise<string> {
  try {
    if (!_getClient) throw new Error('Client getter not set');
    const client = _getClient();
    if (!client) throw new Error('Opencode client not available');

  // SINGLE call for revisions or short outputs
  if (!useSplit || revisionFeedback) {
    const prompt = revisionFeedback
      ? brief + '\n\n---\n\n## REVISION REQUIRED\n\n' + revisionFeedback + '\n\nFix ALL issues. Output the COMPLETE spec.'
      : brief;
    tridentLog('INFO', 'l2-llm-async', '=== ASYNC SINGLE CALL ===');
    return await callLLMAsync(client, prompt);
  }

  // SPLIT: front + back (sequential within one domain, but concurrent ACROSS domains)
  tridentLog('INFO', 'l2-llm-async', '=== ASYNC CALL 1: Front ===');
  const prompt1 = brief +
    `\n\n## OUTPUT INSTRUCTION\nOutput ONLY these sections:\n${FRONT_SECTIONS}\n` +
    `Write each section FULLY. Do NOT write sections 6-15 yet.`;
  const front = await callLLMAsync(client, prompt1);

  const typeNames = extractTypeNames(front);
  const frontHeadings = extractSectionHeadings(front);

  tridentLog('INFO', 'l2-llm-async', '=== ASYNC CALL 2: Back ===');
  const prompt2 = brief +
    `\n\n## CONTEXT — SECTIONS 1-5 ALREADY WRITTEN\n` +
    `Do NOT regenerate: ${frontHeadings.join(', ')}\n` +
    `Types ALREADY DEFINED (do NOT redefine): ${typeNames.join(', ')}\n\n` +
    '```markdown\n' + front.substring(0, 12000) + '\n```\n\n' +
    `## OUTPUT INSTRUCTION\nYou MUST output ALL sections:\n${BACK_SECTIONS}\n` +
    `Be CONSISTENT with sections 1-5. Reach sections 11-12 (File Manifest, Migration).`;
  const back = await callLLMAsync(client, prompt2);

  const combined = front.trim() + '\n\n' + back.trim();
  tridentLog('INFO', 'l2-llm-async', `=== ASYNC COMBINED: ${combined.split('\n').length} lines ===`);
  return combined;
  } catch (e: unknown) {
    tridentLog('ERROR', 'l2-llm-async', `generateSpecViaLLMAsync failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
