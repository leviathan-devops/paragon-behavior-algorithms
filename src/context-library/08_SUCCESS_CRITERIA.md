# Success Criteria — trident-brain-v4.3.3

**Version:** v4.3.3
**Generated:** 2026-06-18T18:38:16.739Z

---

## Overview

This file defines the ship gate requirements with exact thresholds,
mechanical verification commands, and pass/fail criteria for each check.
No subjective criteria. Every check is binary: pass or fail.

## Ship Gate Requirements

### Gate 1: TypeScript Compilation

- **Threshold:** 0 errors
- **Command:** `tsc --noEmit`
- **Pass:** Exit code 0
- **Fail:** Exit code non-zero. Fix type errors before proceeding.

### Gate 2: Bundle Creation

- **Threshold:** Bundle file exists, size > 0
- **Command:** `ls -la dist/index.js`
- **Pass:** File exists with non-zero size
- **Fail:** Run esbuild command, check for errors

### Gate 3: No Relative Imports in Bundle

- **Threshold:** 0 matches
- **Command:** `grep -c "from '\\.\." dist/index.js`
- **Pass:** 0 (or command exits non-zero = no matches)
- **Fail:** Rebuild with `--bundle` flag. Check `--external` flags.

### Gate 4: Plugin Load Test

- **Threshold:** Module exports without error
- **Command:** `node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"`
- **Pass:** Prints array of exported keys
- **Fail:** Check for missing dependencies or syntax errors

### Gate 5: Hook Registration Count

- **Threshold:** >= 4 hooks
- **Command:** `grep -c "ctx.hook" dist/index.js`
- **Pass:** Count >= 4
- **Fail:** Add missing hook registrations in init()

### Gate 6: Tool Registration Count

- **Threshold:** >= 3 tools
- **Command:** `grep -c "ctx.tool" dist/index.js`
- **Pass:** Count >= 3
- **Fail:** Add missing tool definitions

### Gate 7: Identity Block Markers

- **Threshold:** >= 2 matches (start + end markers)
- **Command:** `grep -c "IDENTITY_BLOCK" dist/index.js`
- **Pass:** Count >= 2
- **Fail:** Add IDENTITY_BLOCK_START and IDENTITY_BLOCK_END markers

### Gate 8: Container Load Test

- **Threshold:** Plugin loads, no errors in container
- **Command:** `docker exec test-trident-brain-v4-3-3 node -e "import('/root/.config/opencode/plugins/trident-brain-v4-3-3/dist/index.js').then(m => console.log('OK'))"`
- **Pass:** Prints "OK"
- **Fail:** Check container Node version, file permissions, paths

### Gate 9: Identity Test (Container)

- **Threshold:** Response contains project name
- **Command:** Ask "who are you" in container TUI
- **Pass:** Response contains "trident-brain-v4.3.3"
- **Fail:** Check system.transform hook registration

### Gate 10: Sequential Tool Calls

- **Threshold:** 0 throws on 5+ sequential calls
- **Command:** Call 5+ tools in sequence in container
- **Pass:** All succeed without errors
- **Fail:** Check orchestrator.reset() before startMode()

### Gate 11: Self-Audit Score

- **Threshold:** Score >= 80 (target: >= 90)
- **Command:** Run `trident-brain-v4-3-3-audit` tool
- **Pass:** Score >= 80
- **Fail:** Fix CRITICAL findings, re-run audit

### Gate 12: Context Library Completeness

- **Threshold:** 9 files, each 200+ lines
- **Command:** `ls context-library/ | wc -l` and `wc -l context-library/*.md`
- **Pass:** 9 files, each >= 200 lines
- **Fail:** Check generateContextLibraryManifest writes all 9 files

## Regression Test Requirements

Before each release, run the full test suite:

| # | Test | Command | Pass |
|---|------|---------|------|
| 1 | tsc | `tsc --noEmit` | Exit 0 |
| 2 | esbuild | `esbuild ...` | Exit 0 |
| 3 | Import | `node -e "import(...)"` | Prints keys |
| 4 | No relative imports | `grep "from '\\.\." dist/index.js` | 0 matches |
| 5 | Hook count | `grep -c "ctx.hook" dist/index.js` | >= 4 |
| 6 | Tool count | `grep -c "ctx.tool" dist/index.js` | >= 3 |
| 7 | Identity markers | `grep "IDENTITY_BLOCK" dist/index.js` | >= 2 |
| 8 | Container identity | Ask "who are you" | Contains name |
| 9 | Container sequential | 5+ tool calls | 0 throws |
| 10 | Self-audit | Run audit tool | Score >= 80 |
| 11 | Context library | `ls context-library/ | wc -l` | 9 |
| 12 | File density | `wc -l context-library/*.md` | Each >= 200 |

## Release Checklist

- [ ] All 12 gates pass
- [ ] No CRITICAL findings (or all justified)
- [ ] Self-audit score >= 80
- [ ] Context library: 9 files, each 200+ lines
- [ ] Container TUI: identity loaded
- [ ] Container TUI: all tools functional
- [ ] Container TUI: no state machine errors
- [ ] Container TUI: no permission prompts
- [ ] Artifact written to disk (writeArtifactFile returns path)
- [ ] Deep-planning: context-library/ has 9 files
- [ ] Bundle has no relative imports

## Discovery-Based Targets

Based on discovery of 149 files:

- Patterns to preserve: 50
- Failure modes to fix: 20
- Decisions to document: 0
- Audit layers to implement: 18
- Warheads to wire: 16

## Quality Metrics (Post-Ship)

| Metric | Target | Measurement |
|--------|--------|------------|
| Self-audit score | >= 90 | Code-audit tool |
| Critical findings | 0 | Code-audit tool |
| Test coverage | >= 80% | tsc + grep analysis |
| Artifact density | 200+ lines each | wc -l |
| Bundle size | < 1MB | ls -la |
| Load time | < 500ms | node import timing |


---
*Generated by Trident v4.3.3*
