// t2-brief-builder.ts — Builds the brief for T2 Knowledge Transfer Bible.
// Produces a DOGMATIC, BATTLE-SCARRED bible matching the format of the
// Plutus Architecture Bible, Visual Cortex Bible, and Web Agent Engineering Bible.
// T2 describes the TARGET system (not Trident). Imperative voice. Compaction-proof.

import type { AnalysisResult } from './analysis-engine.ts';
import type { DiscoveryResult } from '../shared/auto-discover.js';
import type { L2Strategy } from './l2-strategy.ts';

export function buildT2Brief(
  analysis: AnalysisResult,
  discovery: DiscoveryResult,
  strategy: L2Strategy,
  projectName: string,
): string {
  const L: string[] = [];

  // ===========================================================================
  // BRIEF HEADER — What this document is and who writes it
  // ===========================================================================
  L.push(`# KNOWLEDGE TRANSFER BIBLE BRIEF — ${projectName}`);
  L.push('');
  L.push(`You are writing a KNOWLEDGE TRANSFER BIBLE for the system: **${projectName}**.`);
  L.push(`This document describes the TARGET SYSTEM (${projectName}), NOT Trident the generator.`);
  L.push(`Trident is the tool that analyzed ${projectName} and produced the data below.`);
  L.push(`The bible you write describes what ${projectName} IS, how it works, what kills it,`);
  L.push(`what is broken, what is working, and how to keep it alive after context loss.`);
  L.push('');
  L.push('## BIBLE FORMAT SPECIFICATION');
  L.push('');
  L.push('This is NOT a spec. It is NOT documentation. It is NOT academic.');
  L.push('It is a BIBLE — dogmatic, battle-scarred, and compaction-proof.');
  L.push('Voice: IMPERATIVE and AUTHORITATIVE. Use "DO NOT", "NEVER", "ALWAYS".');
  L.push('Perspective: Second person ("You MUST", "You will encounter").');
  L.push('Tone: Corrective — destroy wrong mental models before installing correct ones.');
  L.push('Every rule is earned by a regression. Every warning is a scar.');
  L.push('');
  L.push('This bible MUST be at LEAST 2,000 lines. If you finish all sections in fewer lines,');
L.push('you are NOT being detailed enough. EXPAND each section with: more code examples,');
L.push('more Iron Laws (aim for 20+), more Illusions (aim for 7), more component documentation');
L.push('depth, more behavioral pattern pseudocode. Every section should be 150+ lines minimum.');
L.push('CODE IS KING — 60%+ fenced code blocks.');
  L.push('');

  // ===========================================================================
  // SECTION INSTRUCTIONS — The exact 10-section bible structure
  // ===========================================================================
  L.push('## MANDATORY SECTIONS (write ALL of them)');
  L.push('');
  L.push('### ## 1. TITLE BLOCK');
  L.push('```markdown');
  L.push(`# ${projectName.toUpperCase()} BIBLE`);
  L.push('');
  L.push('**Version:** [derived from strategy data]');
  L.push('**Status:** AUTHORITATIVE — READ FIRST BEFORE ANY ENGINEERING');
  L.push('**Audience:** Engineers maintaining, extending, or debugging this system');
  L.push('**Read Time:** [estimated from totalTargetLines in strategy]');
  L.push('**Line Count:** [actual line count of this document]');
  L.push('```');
  L.push('');
  L.push('### ## 2. EPIGRAPH');
  L.push('A blockquote manifesto. 3-5 sentences. Declare WHY this system exists.');
  L.push('What it destroys. What it protects against. What happens without it.');
  L.push('Format:');
  L.push('> [Manifesto sentences — imperative, declarative, no hedging]');
  L.push('');
  L.push('### ## 3. THE RED PILL — READ THIS FIRST OR FAIL');
  L.push('Three subsections, ALL mandatory:');
  L.push('');
  L.push('**3a. What [System] Actually Is**');
  L.push('- Bold one-sentence declaration of what this system IS.');
  L.push('- Bullet list of 5-10 "IS" statements (concrete, verifiable).');
  L.push('');
  L.push('**3b. What [System] Is NOT**');
  L.push('A two-column table. Header: `| Myth | Reality |`');
  L.push('Derive rows from the threats below — each threat pattern is a myth someone believes.');
  L.push('Example: Myth: "The system handles X" → Reality: "The system CLAIMS to handle X but Y is theatrical"');
  L.push('');
  L.push('**3c. The 5-7 Illusions That Kill [System] Projects**');
  L.push('Derive these from the threat patterns and failure modes below.');
  L.push('Each illusion MUST have:');
  L.push('- **Illusion N: [Name]** — the false belief');
  L.push('- **What goes wrong:** A paragraph explaining what happens when you believe this.');
  L.push('  Reference real file:line evidence from the threats/findings data.');
  L.push('- **Fix:** What you must do instead. Cross-reference the Iron Law or section that covers it.');
  L.push('');
  L.push('### ## 4. ARCHITECTURE IN ONE DIAGRAM');
  L.push('ASCII art component diagram using box-drawing characters (┌─┐│└┘├┤┬┴┼).');
  L.push('Show the major components and data flow. NO images. NO Mermaid. ASCII ONLY.');
  L.push('');
  L.push('Then provide:');
  L.push('- **Data Flow Walkthrough:** Step-by-step how data moves through the diagram.');
  L.push('  Use REAL function/class names from the discovered patterns below.');
  L.push('- **Why This Architecture — Not Another:** Q&A format.');
  L.push('  For each major architectural choice: "Why X not Y?" → [answer with rationale]');
  L.push('  Derive these from the design tensions and decisions below.');
  L.push('');
  L.push('### ## 5. COMPONENT DOCUMENTATION');
  L.push('For EACH major component in the system (derive from discovered patterns):');
  L.push('- **Role:** What this component does in one sentence.');
  L.push('- **Implementation:** How it works internally. Reference real file paths.');
  L.push('- **Code:** Real TypeScript/JavaScript code snippets (from the code sections).');
  L.push('- **Edge Cases & Gotchas:** What breaks when you touch this component.');
  L.push('');
  L.push('### ## 6. BEHAVIORAL PATTERNS');
  L.push('For EACH defense rule below:');
  L.push('- **Trigger Condition:** When this defense activates.');
  L.push('- **Detection Method:** How it detects the threat (use the checkMethod).');
  L.push('- **Response:** What happens when triggered (pass/warn/fail + thresholds).');
  L.push('- **Pseudocode Implementation:** Real-ish code showing the detection logic.');
  L.push('');
  L.push('### ## 7. THE IRON LAWS');
  L.push('10-20 numbered inviolable rules. Derive from threats, defenses, and failure modes.');
  L.push('Format for EACH:');
  L.push('- **Iron Law N: [RULE STATEMENT]** — because [the regression, failure, or consequence');
  L.push('  that earned this rule. Be specific — name the file, the bug, the crash.]');
  L.push('');
  L.push('### ## 8. WHAT IS BROKEN vs WHAT IS WORKING');
  L.push('Two subsections:');
  L.push('');
  L.push('**✅ WHAT IS WORKING**');
  L.push('- List components, defenses, and patterns that function correctly.');
  L.push('- For each: what it does, why it works, what it protects.');
  L.push('');
  L.push('**❌ WHAT IS BROKEN**');
  L.push('- Derive from threat findings and discovered failure modes.');
  L.push('- For each broken item: root cause (with file:line) + fix reference (Iron Law or section).');
  L.push('');
  L.push('### ## 9. APPENDICES');
  L.push('');
  L.push('**Appendix A: Constants Reference**');
  L.push('Table of EVERY threshold, budget, limit, and constant:');
  L.push('| Constant | Value | Domain | Purpose |');
  L.push('Derive from defense thresholds (pass/warn/fail values) below.');
  L.push('');
  L.push('**Appendix B: Bug/Failure Inventory**');
  L.push('Table of known bugs and failures:');
  L.push('| # | Bug | Symptom | Fix |');
  L.push('Derive from the discovered failure modes below.');
  L.push('');
  L.push('**Appendix C: File Manifest**');
  L.push('Table of every source file with purpose:');
  L.push('| File | Purpose |');
  L.push('Derive from discovered patterns and code sections.');
  L.push('');
  L.push('### ## 10. CLOSING: THE FINAL WORD (MANDATORY — DOCUMENT IS REJECTED WITHOUT THIS)');
  L.push('- What you learned from building and auditing this system.');
  L.push('- **The N Things That Must Never Change** — numbered list of inviolable constants.');
  L.push('- Manifesto paragraph — why this system matters.');
  L.push('- **CRITICAL — COMPACTTION-PROOF MARKING (MANDATORY):** The document MUST contain the exact phrase');
  L.push('  "This document is compaction-proof" in the closing section. Without this marking,');
  L.push('  the bible CANNOT serve its purpose as compaction-proof context synthesis.');
  L.push('  Format: "This document is **compaction-proof** — read it after context loss.');
  L.push('  Every rule was earned by regression. No excuse for regression."');
  L.push('');

  // ===========================================================================
  // HEADING LEVEL REQUIREMENT
  // ===========================================================================
  L.push('## HEADING LEVEL REQUIREMENT (CRITICAL)');
  L.push('');
  L.push('This bible MUST have ALL sections at ## level heading. Format: `## 1. TITLE BLOCK`,');
  L.push('`## 2. EPIGRAPH`, `## 3. THE RED PILL`, `## 4. ARCHITECTURE IN ONE DIAGRAM`,');
  L.push('`## 5. COMPONENT DOCUMENTATION`, `## 6. BEHAVIORAL PATTERNS`,');
  L.push('`## 7. THE IRON LAWS`, `## 8. WHAT IS BROKEN vs WHAT IS WORKING`,');
  L.push('`## 9. APPENDICES`, `## 10. CLOSING: THE FINAL WORD`.');
  L.push('Do NOT use ### for top-level bible sections.');
  L.push('');

  // ===========================================================================
  // ANTI-SLOP RULES
  // ===========================================================================
  L.push('## ANTI-SLOP RULES (VIOLATION = AUTOMATIC FAILURE)');
  L.push('');
  L.push('1. Describe the TARGET SYSTEM (' + projectName + '), NEVER Trident the generator.');
  L.push('2. ZERO "implement actual logic" — if you reference code, SHOW the code.');
  L.push('3. ZERO "add proper error handling" — show the specific handling.');
  L.push('4. ZERO template phrases — every sentence must contain specific information.');
  L.push('5. Every Illusion MUST have a "What goes wrong:" paragraph with file:line evidence.');
  L.push('6. Every Iron Law MUST end with "because [specific reason]".');
  L.push('7. ASCII diagrams ONLY — no images, no Mermaid, no external references.');
  L.push('8. Heavy table usage for constants, thresholds, failure modes.');
  L.push('9. Imperative voice throughout — "DO NOT", "NEVER", "ALWAYS", "MUST".');
  L.push('10. Use the EXACT type names and threshold values from the analysis data below.');
  L.push('11. Do NOT redefine types that appear in the Generated Types section.');
  L.push('12. **MANDATORY:** The document MUST contain "compaction-proof" in the closing section. This is non-negotiable — the entire purpose of a T2 bible is compaction-proof context synthesis.');
  L.push('');

  // ===========================================================================
  // ANALYSIS DATA — Reference material for the LLM
  // ===========================================================================
  L.push('---');
  L.push('');
  L.push('## REFERENCE DATA — USE THESE EXACT VALUES');
  L.push('');

  // -- Threats (for Illusions, Broken sections, Iron Laws)
  L.push('### THREAT PATTERNS (source for Illusions, Myth/Reality table, Broken section)');
  L.push('');
  for (const threat of analysis.threats) {
    const t = threat;
    L.push(`#### ${t.pattern} — ${t.severity} (score: ${t.score})`);
    if (t.defeatVectors?.length) {
      L.push(`Defeat vectors: ${t.defeatVectors.join('; ')}`);
    }
    L.push('Findings (first 15):');
    for (const f of (t.findings || []).slice(0, 15)) {
      L.push(`- \`${f.file || '?'}:${f.line || '?'}\` — ${f.description}`);
    }
    L.push('');
  }

  // -- Defense rules (for Behavioral Patterns, Iron Laws, Constants table)
  L.push('### DEFENSE RULES (source for Behavioral Patterns, Constants Reference)');
  L.push('');
  for (const d of analysis.defenses) {
    const dd = d;
    L.push(`- **${dd.rule}** — domain: ${dd.domain}, check: ${dd.checkMethod}`);
    L.push(`  Thresholds: pass ${dd.thresholds?.passThreshold?.operator} ${dd.thresholds?.passThreshold?.value},` +
      ` warn ${dd.thresholds?.warnThreshold?.operator} ${dd.thresholds?.warnThreshold?.value},` +
      ` fail ${dd.thresholds?.failThreshold?.operator} ${dd.thresholds?.failThreshold?.value}`);
    L.push(`  Weight: ${dd.weight}, Severity: ${dd.violationSeverity}, Analysis Order: ${dd.analysisOrder}`);
  }
  L.push('');

  // -- Algorithm pseudocode (for Component Documentation code snippets)
  if (analysis.algorithms?.length > 0) {
    L.push('### ALGORITHM PSEUDOCODE (source for Component Documentation)');
    L.push('');
    for (let i = 0; i < analysis.algorithms.length; i++) {
      L.push(`#### Algorithm ${i + 1}:`);
      L.push('```');
      L.push(analysis.algorithms[i]);
      L.push('```');
      L.push('');
    }
  }

  // -- Test specs (for Component Documentation edge cases)
  if (analysis.tests?.length > 0) {
    L.push('### TEST SPECIFICATIONS (source for Edge Cases & Gotchas)');
    L.push('');
    for (let i = 0; i < analysis.tests.length; i++) {
      const t = analysis.tests[i];
      L.push(`#### Test ${i + 1}: Input: \`${JSON.stringify(t.input).substring(0, 200)}\``);
      L.push(`Expected: ${t.expectedResult || 'See defense rule'}`);
      L.push('');
    }
  }

  // -- Types (reference only — do NOT redefine)
  if (analysis.types?.length > 0) {
    L.push('### GENERATED TYPES (reference — do NOT redefine in the bible)');
    L.push('```typescript');
    for (const type of analysis.types.slice(0, 15)) L.push(type);
    L.push('```');
    L.push('');
  }

  // -- Discovered patterns (for Component Documentation, File Manifest)
  if (discovery.patterns?.length > 0) {
    L.push('### DISCOVERED PATTERNS (source for Component Documentation, File Manifest)');
    L.push('');
    for (const p of discovery.patterns.slice(0, 25)) {
      L.push(`- \`${p.file}:${p.line}\` — ${p.type} — ${p.name}`);
      if (p.signature) L.push(`  Signature: \`${p.signature}\``);
    }
    L.push('');
  }

  // -- Failure modes (for Bug Inventory, Broken section, Illusions)
  if (discovery.failureModes?.length > 0) {
    L.push('### DISCOVERED FAILURE MODES (source for Bug Inventory, Broken section)');
    L.push('');
    for (const fm of discovery.failureModes.slice(0, 20)) {
      L.push(`- \`${fm.file}:${fm.line}\` — ${fm.message}`);
      if (fm.pattern) L.push(`  Pattern: ${fm.pattern}`);
    }
    L.push('');
  }

  // -- Design decisions (for "Why This Architecture" section)
  if (discovery.decisions?.length > 0) {
    L.push('### DESIGN DECISIONS (source for Architecture rationale)');
    L.push('');
    for (const d of discovery.decisions.slice(0, 10)) {
      L.push(`- ${d.rationale || d} (\`${d.file || '?'}:${d.line || '?'}\`)`);
    }
    L.push('');
  }

  // -- Code sections (for real code snippets in Component Documentation)
  if (discovery.codeSections?.length > 0) {
    L.push('### CODE SECTIONS (source for real code snippets)');
    L.push('');
    for (const cs of discovery.codeSections.slice(0, 15)) {
      L.push(`#### \`${cs.filePath}\` (${cs.sectionName}, lines ${cs.lineStart}-${cs.lineEnd}, type: ${cs.type})`);
      L.push('```typescript');
      const code = cs.code.length > 800 ? cs.code.substring(0, 800) + '\n// ... truncated' : cs.code;
      L.push(code);
      L.push('```');
      L.push('');
    }
  }

  // -- Project metadata (for Title Block)
  L.push('### PROJECT METADATA (source for Title Block)');
  L.push('');
  L.push(`- Total files: ${discovery.totalFiles}`);
  L.push(`- Total lines: ${discovery.totalLines}`);
  L.push(`- Languages: ${JSON.stringify(discovery.languages)}`);
  if (discovery.entryPoints?.length) {
    L.push(`- Entry points: ${discovery.entryPoints.join(', ')}`);
  }
  if (discovery.warheads?.length) {
    L.push(`- Warheads: ${discovery.warheads.join(', ')}`);
  }
  if (discovery.auditLayers?.length) {
    L.push(`- Audit layers: ${discovery.auditLayers.join(', ')}`);
  }
  L.push('');

  // -- Design tensions (for "Why This Architecture" Q&A)
  L.push('### DESIGN TENSIONS (source for "Why This Architecture — Not Another")');
  L.push('');
  for (const t of strategy.tensions) {
    L.push(`- **${t.rule}**: ${t.cost} → Resolution: ${t.resolution}`);
  }
  L.push('');

  // -- Adversarial challenges (for Illusions and Iron Laws)
  L.push('### ADVERSARIAL CHALLENGES (source for Illusions, Iron Laws)');
  L.push('');
  for (const c of strategy.challenges) {
    L.push(`- **${c.type}**: ${c.challenge.substring(0, 300)}`);
    L.push(`  Required defense: ${c.requiredDefense.substring(0, 200)}`);
  }
  L.push('');

  // -- Complexity (for Title Block metadata)
  L.push('### COMPLEXITY PROFILE (source for Title Block)');
  L.push('');
  L.push(`- Complexity score: ${strategy.complexity.score}`);
  L.push(`- Complexity tier: ${strategy.complexity.tier}`);
  L.push(`- Domain type: ${strategy.complexity.domainType}`);
  L.push(`- Target lines: ${strategy.complexity.totalTargetLines}`);
  L.push('');

  // ===========================================================================
  // FINAL OUTPUT INSTRUCTION
  // ===========================================================================
  L.push('---');
  L.push('');
  L.push('## OUTPUT INSTRUCTION');
  L.push('');
  L.push(`Write the ${projectName.toUpperCase()} BIBLE NOW.`);
  L.push(`Use the EXACT 10-section structure above.`);
  L.push(`Start with the TITLE BLOCK.`);
  L.push(`End with the CLOSING: THE FINAL WORD.`);
  L.push(`Every claim must trace to real data from the REFERENCE DATA above.`);
  L.push(`Output ONLY markdown.`);

  return L.join('\n');
}
