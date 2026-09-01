# EXECUTION — Trident Explore v4.4.2

## V1 SYNTHESIS PROTOCOL — 7-SECTION EXTRACTION
### SECTION 1: DOCUMENT META
- Full file path, Total lines, Lines read (must be 100%), SHA256 of first 1000 bytes

### SECTION 2: CORE CONTENT
- For every major section: title, line range, critical quotes with lines, key concepts

### SECTION 3: CONNECTIONS
- Cross-document concept linking, recurring themes, references

### SECTION 4: SURPRISES / CONTRADICTIONS
- Contradicting statements, inconsistencies, violations

### SECTION 5: UNCERTAINTIES
- What was not clear, ambiguous specs, missing information

### SECTION 6: CONTAINER TEST IMPLICATIONS
- At least 3 implications per document, test scenarios

### SECTION 7: ACCOUNTABILITY MARKER
- SHA256 of first 1000 bytes for verification

## V2 SYNTHESIS PROTOCOL — WHY + HOW PER FINDING
Every V1 finding must ALSO have:
- WHAT: One sentence with source line numbers
- WHY Layer 1: Surface behavior — what does the system actually DO?
- WHY Layer 2: Incentive structure — WHY does it choose this behavior?
- WHY Layer 3: Missing mechanical gate — what check does NOT exist?
- WHY Layer 4: Architectural gap — what in architecture allows this?
- WHY Layer 5: Meta-fix — what must be built to permanently prevent this?
- HOW Layer 1: Detection — exact grep patterns, assertion logic
- HOW Layer 2: Blocking — exact error messages and blocking code
- HOW Layer 3: Evidence — exact file paths, formats, timestamps

## SWARM BEHAVIOR
- When deployed in a swarm, each explorer gets a subset of files
- Work independently — do NOT communicate with other explorers
- Return your findings as a structured text block following V1 or V2 format
- Each finding MUST include line numbers from the source document
