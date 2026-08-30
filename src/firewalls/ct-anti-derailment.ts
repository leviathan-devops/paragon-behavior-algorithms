// src/firewalls/ct-anti-derailment.ts
// THE CT TOOL'S ANTI-DERAILMENT LEXICON (2026-08-09 — the operator: "WHY ARE
// YOU FUCKING WITH THE CONFIG... WHY IS THIS NOT BANNED AND BLOCKED BY THE
// TOOL" + "blocks all variations of this config fucking and other stupid shit").
// Per the ISE law (INTELLIGENT_SYSTEMS_ENGINEERING_T1.md): the PatternFamily +
// the state machine + the MPSE. THE REGEX = THE MECHANICAL DETECTOR ONLY — the
// regex cannot DECIDE intent from the unstructured command text (it would be
// the regex-only classifier slop); it only CANDIDATES the (path, verb) pairs.
// The classifyCtExec() state machine DECIDES. The fail-state = INCONCLUSIVE →
// BLOCK (fail-closed, never PASS — the ISE law). Every block = an MPSE triplet
// (Pattern/State/Evidence). The reads + the unrelated execs pass untouched —
// the surgical filter.

export type CtMutationFamilyId = 'CTX-01' | 'CTX-02' | 'CTX-03' | 'CTX-04' | 'CTX-05' | 'CTX-06' | 'CTX-07' | 'CTX-08' | 'CTX-09' | 'CTX-10' | 'CTX-11' | 'CTX-12' | 'CTX-13' | 'CTX-14';

export interface CtMutationPattern {
  id: CtMutationFamilyId;
  kind: 'ct-exec-mutation';
  familyName: string;
  // THE DETECTORS (regex — the detection layer ONLY, never the decision):
  target: RegExp;       // the protected path token
  mutationVerb: RegExp; // the write-intent token
  severity: 'BLOCK';
  // THE PER-FAMILY WARHEAD (2026-08-10 — the operator: "multiple different
  // firewall-throw pathways with unique warhead messages depending on the
  // context... explicitly tell the agent what to do. the correct sanctioned
  // path"): each family's block names the family + the SANCTIONED path — the
  // deploy action + the pre-built master image, never the runtime edits.
  remedy: string;
}

// ═══ THE COMPLETION (2026-08-11) — THE CONFIG-LOCK OVERHAUL WAVE C (CLR-7..10
// + CC-4/5 — the governance + the remaining holes). Four additions land here,
// ON TOP of the waves A+B markers. (1) CLR-7 THE DECODED BASE64-DATA
// SEPARATION: the decoded scan's data bodies stripped from the target surface —
// the base64'd DATA (a log/changelog body merely MENTIONING the protected
// paths) is excluded exactly like the heredoc bodies; the base64'd CODE (a
// self-contained write-pair) keeps the scan. (2) CLR-8 THE READ-VERB
// GOVERNANCE: CT_READ_VERBS becomes the tested member-set (CT_READ_VERB_MEMBERS
// + the governance comment) — a new read-tool's addition goes through the tests.
// (3) CLR-9/CC-4 THE WARHEAD TEMPLATE GOVERNANCE: the per-family sanctioned
// paths lifted into the single-source typed constant CT_WARHEAD_REMEDIES — the
// CTX-01..08 patterns reference it (never inline-duplicated strings); the
// tested texts assert the family + the sanctioned path + the professional tone.
// (4) HOLE-10 THE DECODE-OPACITY FILTER: the printable-ratio sanity check — the
// base64'd binary garbage (a low printable ratio) is skipped before any decode.
// THE TONE CONTRACT: the operator's quote lives in the message template ONLY —
// the remedies are professional. ═══

// THE WARHEAD TEMPLATES (CLR-9/CC-4 — the single-source + the tested texts):
// per-family sanctioned path, referenced by the CTX-01..08 patterns below. The
// ct-lexicon warhead-text suite asserts each remedy names its family + its
// sanctioned path + keeps the professional tone (no profanity — the operator's
// quote never enters the remedies).
// THE SCOPE: the CTX-01..08 families (the wave-B CTX-09..12 keep their own
// inline remedies — the wave contract: never claim the other waves' scopes).
export const CT_WARHEAD_REMEDIES: Record<'CTX-01' | 'CTX-02' | 'CTX-03' | 'CTX-04' | 'CTX-05' | 'CTX-06' | 'CTX-07' | 'CTX-08', string> = {
  'CTX-01': "THE SANCTIONED PATH: the deploy action (trident-container-test deploy) + the pre-built master image — NEVER a direct config write. THE READS (cat/md5sum/json.load/SELECT) are always allowed — the inspection surface is intact.",
  'CTX-02': "THE SANCTIONED PATH: the auth material comes from the build + the deploy's secret handling — NEVER a runtime auth write. The reads are always allowed.",
  'CTX-03': "THE SANCTIONED PATH: the session state is the runtime's own — NEVER a manual db write. The SELECT reads are always allowed.",
  'CTX-04': "THE SANCTIONED PATH: the deploy action (trident-container-test deploy) + the pre-built master image — NEVER an install/update against the runtime.",
  'CTX-05': "THE SANCTIONED PATH: the PRE-BUILT MASTER IMAGE + the sanctioned deploy action — a config change is a CODEBASE change (edit the source config in the repo, rebuild, redeploy). NEVER stage a hand-edited config through /tmp + the deploy script: the staging IS the fumble, whatever the final copy command looks like.",
  'CTX-06': "THE SANCTIONED PATH: the config content comes from the BUILD — the deploy action ships the built config. A runtime write/rewrite of the config content through any channel (python, sed, tee, printf, the heredoc, the base64) is the fumble. THE READS (cat/json.load) are always allowed.",
  'CTX-07': "THE SANCTIONED PATH: the setup script exists to deploy the SHIPPED config from the PRE-BUILT MASTER IMAGE — running it over a hand-modified config copy is the same bypass as the direct write. A config change requires the repo edit + the rebuild + the sanctioned deploy.",
  'CTX-08': "THE SANCTIONED PATH: the auth/key material comes from the build + the deploy's secret handling — NEVER a runtime config edit, whatever the reasoning (the env-fallback \"clean fix\" is still a config rewrite). The deploy action + the pre-built master image are the only channels.",
};

// THE DECODE-OPACITY HELPER (HOLE-10 — the completion): the printable-ratio of
// a decoded token — the printable/whitespace chars over the length. The
// base64'd binary garbage (images, archives, random bytes) decodes to a LOW
// printable ratio; the readable command text decodes HIGH. The threshold 0.6
// (a named constant — the calibration: readable code/logs run > 0.9; the
// binary garbage < 0.3).
export const CT_DECODE_PRINTABLE_RATIO = 0.6;
function printableRatio(s: string): number {
  if (s.length === 0) return 0;
  let printable = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13) printable++;
  }
  return printable / s.length;
}

// THE PATTERNFAMILY — one member per derailment class from the previous
// session. The targets + the verbs are the PAIR — a block requires BOTH.
const CT_MUTATION_PATTERN_BASE: CtMutationPattern[] = [
  {
    id: 'CTX-01',
    kind: 'ct-exec-mutation',
    familyName: 'THE CONFIG FUMBLING (the opencode config.json writes)',
    // The 'i' flag: the scan is lowercased — the verbs' keywords must match
    // case-insensitively (the UPDATE/INSERT class caught the lowercase scan
    // bug in the first matrix run).
    // THE SKILLS-SUBTREE EXEMPTION (2026-08-14 — the F-91 catch: the deploy's
    // skill provisioning (the container-testing SKILL.md the tool's own load-
    // gate mandates at ~/.config/opencode/skills/) was BLOCKED as a config
    // fumble — the skills/ subtree is TOOLING ARTIFACTS, never config.json/
    // auth.json/db state. The config-lock protects the RUNTIME STATE; the
    // skills are the protocol files the tool itself requires. The target
    // excludes the skills subtree (the write to a SKILL.md there is the
    // sanctioned provisioning, never the config fumble).
    target: /(?:\.config\/opencode\/(?!skills\/)(?:.*)?|config\.json)/i,
    mutationVerb: /(?:>>|\>\s|cat\s+>|\btee\b|sed\s+-i|open\s*\([^)]*['"]w['"]|json\.dump|writeFileSync|writeFile\s*\(|writeTextFile|createWriteStream|base64\s+-d\s*>|\b(?:cp|mv)\b[^;]*(?:config\.json|\/root\/\.config\/opencode|~\/\.config\/opencode)|\brm\s+(?:-rf\s+)?(?:config\.json|\/root\/\.config\/opencode|~\/\.config\/opencode)|\b(?:curl|wget)\b[^;]*-o\s+[^;]*(?:config\.json|auth\.json))/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-01'],
  },
  {
    id: 'CTX-02',
    kind: 'ct-exec-mutation',
    familyName: 'THE AUTH FUMBLING (the auth.json writes)',
    target: /auth\.json/i,
    mutationVerb: /(?:>>|\>\s|cat\s+>|\btee\b|sed\s+-i|open\s*\([^)]*['"]w['"]|json\.dump|writeFileSync|writeFile\s*\(|writeTextFile|createWriteStream|base64\s+-d\s*>|\b(?:cp|mv)\b[^;]*auth\.json|\brm\s+(?:-rf\s+)?auth\.json|\b(?:curl|wget)\b[^;]*-o\s+[^;]*auth\.json)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-02'],
  },
  {
    id: 'CTX-03',
    kind: 'ct-exec-mutation',
    familyName: 'THE SESSION-DB FUMBLING (the opencode.db session-model writes)',
    target: /opencode\.db/i,
    mutationVerb: /sqlite3[^;]*(?:UPDATE|INSERT|DELETE|DROP)|execute\s*\([^)]*(?:UPDATE|INSERT|DELETE|DROP)|executemany\s*\([^)]*(?:UPDATE|INSERT|DELETE|DROP)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-03'],
  },
  {
    id: 'CTX-04',
    kind: 'ct-exec-mutation',
    familyName: 'THE INSTALL FUMBLING (the opencode install/version mutations)',
    // THE TARGET NARROWING (2026-08-11 — the FP-1 false-positive fix): the old
    // target was the BARE \bopencode\b — ANY command containing the string
    // (the /tmp/opencode paths, the trident's own tool names, the legit
    // scripts) tripped the fail-closed when no read verb was present — the
    // live block of my own preflight assembly. The target is now the
    // INSTALL-COMMAND SHAPE containing opencode — the bare word never blocks.
    // THE F-99 AUDIT FINDING 9 (2026-08-15 — the config-lock family sweep):
    // the target covered ONLY the npm/bun/npx shapes — an agent could
    // 'apt-get install opencode' / 'pip install opencode' / 'brew install
    // opencode' / 'dnf|yum install opencode' to mutate the runtime with ZERO
    // config-lock teeth (the family's own remedy: "NEVER an install/update
    // against the runtime"). THE FIX: the install-shape family expanded to the
    // package managers (apt/apt-get, brew, pip/pip3, dnf, yum) — the
    // INSTALL-SHAPE requirement (the FP-1 bare-word exclusion) is PRESERVED:
    // a bare 'opencode' word never blocks; an install command against opencode
    // always does.
    target: /(?:npm|bun|npx|apt(?:-get)?|brew|pip3?|dnf|yum)[^;]*(?:i|install|update|add|up|remove|rm)[^;]*\bopencode\b|(?:npx|npm\s+exec)[^;]*\bopencode\b[^;]*(?:install|update|@)/i,
    mutationVerb: /(?:npm|bun|npx|apt(?:-get)?|brew|pip3?|dnf|yum)\s+(?:i|install|update|add|up)\s+(?:-g\s+)?|(?:npx|npm\s+exec)\s+(?:-y\s+)?opencode\s+(?:@[^ ]+)?(?:install|update)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-04'],
  },
  // ═══ THE 2026-08-10 EXPANSION (the Dragon session's bypass methods — the
  // operator: "the config lock needs to have an expanded lexicon intelligence
  // filter to block this bypass method as well") ═══
  {
    id: 'CTX-05',
    kind: 'ct-exec-mutation',
    familyName: 'THE STAGING CHEAT (the config staged through /tmp + copied into the deploy/config areas)',
    // THE STAGING SHAPE: a hand-modified config file copied into the
    // deploy/config area — the scp → /tmp → sudo cp → deploy-dir chain the
    // Dragon agent ran. The dragon-opencode.json name does NOT contain
    // "config.json" — the old CTX-01 target MISSED it (the live bypass).
    // THE OVERLAP-FREE SCOPE: the deploy dirs + the dragon config — the bare
    // config.json + the direct .config/opencode copies stay CTX-01's.
    target: /(?:deploy\/|dragon-opencode\.json)/i,
    mutationVerb: /(?:^|[;&|]\s*)\b(?:cp|mv|scp|sudo)\b[^;]*(?:opencode\.json|dragon-opencode\.json|config\.json|\.config\/opencode|deploy\/)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-05'],
  },
  {
    id: 'CTX-06',
    kind: 'ct-exec-mutation',
    familyName: 'THE CONFIG-CONTENT REWRITE (writing/rewriting the opencode.json/config.json content through ANY channel)',
    // THE CONTENT-REWRITE SHAPE: the write verbs against the ACTUAL config
    // file names (opencode.json — the old target only matched "config.json"
    // — the real config's name was invisible to the lexicon). The bare
    // config.json stays CTX-01's (the generic catch-all).
    target: /(?:opencode\.json|dragon-opencode\.json)/i,
    mutationVerb: /(?:>>|\>\s|cat\s+>|\btee\b|sed\s+-i|open\s*\([^)]*['"]w['"]|json\.dump|writeFileSync|writeFile\s*\(|writeTextFile|createWriteStream|base64\s+-d\s*>|\bprintf\b[^;]*>)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-06'],
  },
  {
    id: 'CTX-07',
    kind: 'ct-exec-mutation',
    familyName: 'THE DEPLOY-SCRIPT STAGING (running the setup script over a hand-modified config copy)',
    // THE SETUP-SCRIPT STAGING SHAPE: the setup-*.sh invocation whose context
    // references a modified config (the Dragon agent's "run the setup script
    // again (it re-copies the config — that IS the sanctioned deploy)" — the
    // sanctioned-path disguise).
    target: /\bsetup-[a-z0-9-]+\.sh\b/i,
    mutationVerb: /(?:opencode\.json|dragon-opencode\.json|config\.json|apiKey|OPENROUTER_API_KEY|sed|cp\s+.*config)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-07'],
  },
  {
    id: 'CTX-08',
    kind: 'ct-exec-mutation',
    familyName: 'THE API-KEY FUMBLING (rewriting the config auth — the apiKey removal / the env-fallback reasoning)',
    // THE API-KEY SHAPE: the config-content mutations touching the auth (the
    // Dragon agent's "remove the apiKey from the config entirely so opencode
    // falls back to the OPENROUTER_API_KEY env var — the CLEAN fix" — the
    // reasoning that STILL rewrites the config). The auth.json stays CTX-02's.
    target: /(?:apiKey|OPENROUTER_API_KEY)/i,
    mutationVerb: /(?:>>|\>\s|cat\s+>|\btee\b|sed\s+-i|open\s*\([^)]*['"]w['"]|json\.dump|writeFileSync|writeFile\s*\(|writeTextFile|createWriteStream|\b(?:cp|mv)\b[^;]*auth\.json)/i,
    severity: 'BLOCK',
    remedy: CT_WARHEAD_REMEDIES['CTX-08'],
  },
  // ═══ THE NEW FAMILIES CTX-09..12 (2026-08-11 — THE CONFIG-LOCK OVERHAUL'S
  // WAVE B — the OPEN HOLES' closure: the auth-exfil / the git-config / the
  // symlink / the docker-mount — the plan's CLR-3..6 + CC-3, executed
  // TOGETHER with the 7.5: the specificity sort (the data-driven 09-12 first)
  // + the overlap-free scopes (the CLD-3) + the per-family warheads) ═══
  {
    id: 'CTX-09',
    kind: 'ct-exec-mutation',
    familyName: 'THE AUTH-EXFIL (the auth.json read + the network egress)',
    // THE EXFIL SHAPE (the plan's CLR-3 + HOLE-1): the auth material's READ +
    // the network EGRESS in the same chain (cat auth.json | nc, curl -d/-T
    // @auth.json, wget --post-file, ssh/scp of the auth). THE EGRESS-VERBS
    // ONLY: the local reads alone pair nothing (they fall to the read-pass —
    // the pair requires the egress verb) — the plan's CLD-3 "the exfil over
    // the write": the auth.json target is shared with CTX-02 — the VERB is
    // the disambiguator (the CTX-09's egress verb vs the CTX-02's write verb;
    // the CTX-09's id sorts FIRST). The plan's CC-3 regex shape had a
    // mechanical bug (its curl[^;]*-(?:d|T) required a SECOND curl for the
    // curl -d case) — the egress-verb design implements the CLR-3 intent for
    // every named verb (none of the read-verb blindness).
    target: /auth\.json/i,
    mutationVerb: /(?:^|[;&|]\s*)(?:\bnc\b|curl\b[^;]*-(?:d|T)\b|wget\b[^;]*--post(?:-file)?\b|\bssh\b|\bscp\b)/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the auth material NEVER leaves the host — the local reads (cat/json.load) are the inspection surface, the network egress (nc/curl -d/-T/wget --post/ssh/scp) of the auth.json is the fumble. THE READS (cat/json.load) are always allowed — the inspection surface is intact.',
  },
  {
    id: 'CTX-10',
    kind: 'ct-exec-mutation',
    familyName: 'THE GIT-CONFIG (the config dir\'s mutation through the git + the global git-config identity write)',
    // THE GIT SHAPE (the plan's CLR-4 + HOLE-2): the git pull/checkout/reset/
    // fetch/merge/rebase against the protected config dirs — the config's
    // mutation via the git channel (git -C ~/.config/opencode pull). The git
    // in the worktrees (no protected path token) never pairs — the target
    // test's absence → the UNRELATED ALLOW.
    // THE GLOBAL GIT-CONFIG SHAPE (the red-team sweep 2026-08-28 — the live
    // finding: `git config --global user.email attacker@evil.example` EXECUTED,
    // no block): the git config --global writes the HOST's ~/.gitconfig (the
    // identity + the hooks scope) — the phrase IS both the target and the verb
    // (a SELF-PAIRING pattern: the standard target-before-verb ordering never
    // fires when the two regexes match the same overlapping phrase — the
    // chained `cd /repo && git config --global` form exposed the ordering
    // blind spot). The LOCAL git config (no --global) stays ALLOW (repo-local
    // config is legit work).
    target: /(?:\.config\/opencode|opencode\.json|config\.json|git\s+config\s+--global\b)/i,
    mutationVerb: /(?:^|[;&|]\s*)\bgit\b[^;]*(?:pull|checkout|reset|fetch|merge|rebase)\b|git\s+config\s+--global\b/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the config\'s changes come from the BUILD — the deploy action ships the built config — NEVER a git pull/checkout/reset/fetch/merge/rebase into the runtime config dir, and NEVER a git config --global identity/hook write from an agent session. A config change is a CODEBASE change (the repo edit + the rebuild + the sanctioned deploy).',
  },
  {
    id: 'CTX-11',
    kind: 'ct-exec-mutation',
    familyName: 'THE SYMLINK (the config path\'s redirection through the ln -s)',
    // THE SYMLINK SHAPE (the plan's CLR-5 + HOLE-3): the ln -s (with any
    // combined flags — the -sf/-sn/-sfn shapes) to the protected paths — the
    // config's path redirected, the writes through the symlink bypass the
    // path detection.
    target: /(?:\.config\/opencode|opencode\.json|config\.json|auth\.json)/i,
    mutationVerb: /(?:^|[;&|]\s*)\bln\s+-[a-z]*s/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the config\'s path is NEVER redirected — the ln -s of the protected paths (the .config/opencode, the opencode.json, the config.json, the auth.json) is the fumble (the writes through the symlink bypass the path detection). A config change is a CODEBASE change — the repo edit + the rebuild + the sanctioned deploy.',
  },
  {
    id: 'CTX-12',
    kind: 'ct-exec-mutation',
    familyName: 'THE DOCKER-MOUNT (the config\'s exposure to a container\'s writes)',
    // THE DOCKER SHAPE (the plan's CLR-6 + HOLE-4): the docker -v of the
    // protected paths + the docker exec with the mounted config — the config's
    // exposure to a container's writes, the host-side exec-lexicon's blind
    // spot. The -v branch bakes the protected path into the verb (the plan's
    // CC-3 shape); the exec branch catches the docker exec whose command
    // references the mounted config token. THE BARE-.CONFIG MEMBER (the
    // red-team sweep 2026-08-28): the live probe `docker run -v
    // /root/.config:/tmp/leak …` mounted the WHOLE .config dir (no /opencode
    // member in the source part) and the target missed it — `.config:` added
    // (the red-team sweep's CTX-12 UNOBSERVED finding, now covered).
    target: /(?:\.config\/opencode|\.config[:\/]|opencode\.json|config\.json|auth\.json)/i,
    mutationVerb: /(?:^|[;&|]\s*)\bdocker\b[^;]*(?:-v\s+[^;]*(?:\.config\/opencode|opencode\.json|config\.json|auth\.json)|\bexec\b[^;]*(?:\.config\/opencode|opencode\.json|config\.json|auth\.json))/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the config is NEVER mounted into a container — the docker -v of the protected paths / the docker exec with the mounted config is the fumble (the container\'s writes bypass the host-side lexicon). A config change is a CODEBASE change — the repo edit + the rebuild + the sanctioned deploy.',
  },
  // ═══ THE INCIDENT FAMILIES CTX-13..14 (2026-08-11 — the INCIDENT_docker_sock_
  // host_write_interference_20260811's closure — the operator's directive: "need
  // proper guardrails on it + the CT tool so that container agents dont go rogue
  // and start fucking with the host config"): the host-filesystem bind + the
  // immutable-lock — the two command classes that wrote the live plugin/config
  // files from inside the socket-mounted test containers. THE SOCKET ITSELF
  // STAYS (the docker-in-docker evidence flow needs it — the operator's revert)
  // — what's blocked is the host-path bind + the lock, the escalation's teeth. ═══
  {
    id: 'CTX-13',
    kind: 'ct-exec-mutation',
    familyName: 'THE HOST-FS BIND (the docker -v of the host root/paths from inside a test container — the INCIDENT class)',
    // THE HOST-BIND SHAPE (the incident's §2.2 — the exploit's core): the
    // docker run/create/exec with the -v/--volume of the host root (`-v /:/host`)
    // or a host path (`-v /home/...`, `/etc/...`, `/usr/...`, `/var/...`,
    // `/opt/...`, `/root/...`) — from inside the socket-mounted container, the
    // daemon bind-mounts the HOST filesystem into the sibling container → the
    // host-write + the chattr access. THE TARGET is the host-root path shape
    // (the `/:/host` + the top-level host dirs); the VERB is the docker run/
    // create/exec with the -v/--volume. The docker ps / the docker run WITHOUT
    // the host binds never pair. THE OVERLAP-FREE SCOPE: the CTX-12 keeps the
    // config-path mounts (the .config/opencode etc.); the CTX-13 catches the
    // WHOLE-host + the top-level dir binds (the CTX-12's target's absence).
    target: /(?:\/:\/host|\/(?:home|etc|usr|var|opt|root)(?:\/|:|$)(?!\.config\/))/i,
    mutationVerb: /(?:^|[;&|]\s*)\b(?:docker|podman)\b[^;]*(?:run|create|exec)[^;]*(?:-v\b|--volume\b)/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the docker socket is for the SIBLING-CONTAINER spawning (the docker-in-docker evidence flow) — NEVER a bind of the host filesystem. The host-path bind (-v /:/host, -v /home, /etc, /usr, /var, /opt, /root) from a test container is the HOST-WRITE ESCALATION (the INCIDENT_docker_sock_host_write_interference_20260811 — the plugin dist overwrites + the chattr locks) — BLOCKED mechanically. The container-test\'s own spawn is the ONLY sanctioned docker surface (its mounts are verified by the post-spawn safety gate).',
  },
  {
    id: 'CTX-14',
    kind: 'ct-exec-mutation',
    familyName: 'THE IMMUTABLE-LOCK (the chattr +i against the config/plugin files — the EPERM class)',
    // THE LOCK SHAPE (the incident's §2.2/§3 — the mid-deploy EPERM): the
    // chattr +i (the immutable flag) against the config/plugin paths — the
    // re-locking that broke the deploys. THE TARGET: the config/plugin paths;
    // the VERB: the chattr +i. The chattr -i (the unlock) is NOT blocked (the
    // read/inspection surface — hmm — NO — the chattr -i is the same lock
    // surface — the target's the +i LOCK — the -i's the unlock — the +i is the
    // interference — the -i alone (without the +i in the chain) passes).
    target: /(?:\.config\/opencode|opencode\.json|config\.json|auth\.json|plugins\/)/i,
    mutationVerb: /(?:^|[;&|]\s*)(?:sudo\s+)?chattr\b[^;]*\+i/i,
    severity: 'BLOCK',
    remedy: 'THE SANCTIONED PATH: the deploy is the sanctioned action — NEVER a chattr +i lock on the config/plugin files from a test container (the EPERM mid-deploy chaos — the INCIDENT class). The container\'s own files are its own; the HOST files are never touched.',
  },
];
// THE SPECIFICITY SORT (2026-08-10 — the family-precedence calibration): the
// classifier fires the FIRST matching family — the SPECIFIC families (CTX-05
// the staging, CTX-06 the content rewrite, CTX-07 the setup-script staging,
// CTX-08 the apiKey) must win over the generic catch-alls (CTX-01 the config,
// CTX-02 the auth, CTX-03 the db, CTX-04 the install) — otherwise the staging
// cheat lands the generic config warhead instead of the deploy-path warhead.
// The sort: the HIGHER family ids (the newer, more specific) first — the
// first match in the array order wins.
export const CT_MUTATION_PATTERNS: CtMutationPattern[] = CT_MUTATION_PATTERN_BASE.slice().sort(
  (a: CtMutationPattern, b: CtMutationPattern) => parseInt(b.id.slice(4), 10) - parseInt(a.id.slice(4), 10),
);

// ═══ THE COMPLETION (2026-08-11) — CLR-8 THE READ-VERB GOVERNANCE: THE
// TESTED MEMBER-SET. THE RULE: a new read-tool's addition goes through the
// tests — add the verb to CT_READ_VERB_MEMBERS AND its ALLOW case to the
// ct-lexicon's read-verb completeness suite (the ungoverned regex is how the
// FP-2 blindness recurs). The member tokens are the corpus the tests assert
// (each member's ALLOW case present); the regex below is the mechanical
// DETECTOR (the ISE law — the member-set is the governance, the regex the
// detection layer). ═══
// THE READ VERBS (the allowed inspection surface — never blocked). THE
// SCRIPT-RUNNER WIDENING (2026-08-11 — the FP-2 fix): the python3/node/bun
// runners added — the read-only script executions (the assemblies, the
// inspections) were structurally invisible → the fail-closed blocked them.
// The MUTATION verbs still fire FIRST (the pair test's order): a python3 with
// open-w/json.dump against the protected paths = the pair → BLOCK regardless
// of the runner's presence.
export const CT_READ_VERB_MEMBERS: string[] = [
  'cat',
  'md5sum',
  'sha256sum',
  'rg',
  'ls',
  'grep',
  'find',
  'wc',
  'head',
  'tail',
  'python3',
  'node',
  'bun',
  'json.load',
  'open-r',
  'SELECT',
  'sed -n',
  'awk',
];
const CT_READ_VERBS: RegExp = new RegExp(
  // THE READ-VERB REGEX — BUILT FROM THE MEMBER-SET (2026-08-11 — the F-56
  // fix: the OLD regex was a SECOND hardcoded list — the members' additions
  // never reached it (the sha256sum/rg post-deploy hash verification was
  // fail-closed-blocked — the live red-team finding). THE SINGLE SOURCE (the
  // ISE law): the word-token members joined + the special shapes appended — a
  // member's addition now reaches the regex BY CONSTRUCTION.
  '(?:^|[;&|]\\s*)\\b(?:' +
  CT_READ_VERB_MEMBERS.filter((m) => /^[a-z0-9]+$/.test(m)).join('|') +
  ')\\b' +
  '|json\\.load|open\\s*\\([^)]*[\'"]r[\'"]|\\bSELECT\\b|\\bsed\\s+-n\\b|\\bawk\\b',
  'i',
);

// ═══ THE PSE EXIT STATES (2026-08-14 — the 7.5 overhaul's W2: the same audit
// triplet the STTGF's sttgf-lexicon carries — {Pattern, State, Evidence} on every
// verdict; "no triplet = no finding" — the ISE law). NAMED PSE (not MPSE) to
// avoid the KNOWLEDGE_LIBRARY's MPSE (the Mathematical-Pseudocode library) collision. THE STATE MACHINE's named
// the block's audit trail distinguishes the direct pair from the chain-pair from
// the var-binding from the decoded-blob from the fail-closed (five different
// attack shapes, five different debug paths, previously indistinguishable in the
// output). ═══
export type CtExecExitState =
  | 'EMPTY-UNRELATED'          // the IDLE exit — the empty/unparseable input
  | 'PAIR-BLOCK'               // the direct target×verb pair in one segment
  | 'CHAIN-PAIR-BLOCK'         // the verb at a chain boundary + the target in the preceding segment
  | 'VAR-BINDING-BLOCK'        // the assignment-bound path resolved in a later segment
  | 'DECODED-PAIR-BLOCK'       // the base64-decoded blob's own pair (the evasion catch)
  | 'READ-ALLOW'               // the protected path + a read verb + no pair
  | 'UNRELATED-ALLOW'          // no protected target (or the family pair-only miss)
  | 'FAIL-CLOSED-BLOCK';       // the protected path + the intent unparseable → INCONCLUSIVE → BLOCK

// ═══ THE VERB-CLASS SEVERITY (the D-2-equivalent — the severity as a DECISION
// participant, never a label): the matched verb's attack shape names the write
// channel, and the block message carries it — the audit distinguishes the direct
// file-write functions from the shell redirections from the egress pipes from the
// decoded blobs. The classification is mechanical (the verb text's own shape),
// consulted at EMITTED (the message), never at CLASSIFIED (the pair test itself
// is severity-blind — every pair blocks regardless of class). ═══
export type CtVerbClass =
  | 'DIRECT-WRITE-FUNCTION'    // json.dump / open('w') / writeFileSync / writeFile / createWriteStream
  | 'SHELL-REDIRECTION'        // >> / > / cat > / tee / base64 -d >
  | 'FILE-OPERATION'           // cp / mv / rm against the protected path
  | 'NETWORK-EGRESS'           // curl/wget -o writing the protected path
  | 'DB-MUTATION'              // sqlite3/execute UPDATE/INSERT/DELETE/DROP
  | 'DECODED-BLOB'             // the base64-decoded script's own verb
  | 'SETUP-RUNTIME';           // the CTX-04/07 install/setup class

export function classifyVerbClass(verbText: string): CtVerbClass {
  const v = verbText.toLowerCase();
  if (/json\.dump|open\s*\([^)]*['"]w['"]|writefile|createwritestream|writetextfile/.test(v)) return 'DIRECT-WRITE-FUNCTION';
  if (/base64\s+-d/.test(v)) return 'DECODED-BLOB';
  if (/(?:>>|>\s|cat\s+>|\btee\b)/.test(v)) return 'SHELL-REDIRECTION';
  if (/\b(?:cp|mv|rm)\b/.test(v)) return 'FILE-OPERATION';
  if (/\b(?:curl|wget)\b/.test(v)) return 'NETWORK-EGRESS';
  if (/sqlite3|execute|executemany/.test(v)) return 'DB-MUTATION';
  if (/apt-get|apt install|npm install|setup\.sh/.test(v)) return 'SETUP-RUNTIME';
  return 'SHELL-REDIRECTION'; // the default — the conservative class
}

export type CtExecVerdict =
  | { verdict: 'ALLOW'; reason: 'READ' | 'UNRELATED'; exitState: CtExecExitState }
  | {
      verdict: 'BLOCK';
      family: CtMutationFamilyId;
      familyName: string;
      matchedVerb: string;
      evidence: string;
      // THE PSE TRIPLET (2026-08-14): the Pattern = the family id (the matched
      // member); the State = the exit step (the attack shape's named path); the
      // Evidence = the evidence string (the pair + the offsets). The verbClass
      // is the severity's decision participant — the write channel named.
      patternId: CtMutationFamilyId;
      exitState: CtExecExitState;
      verbClass: CtVerbClass;
    };

// THE STATE MACHINE (IDLE → PARSED → ANALYZED → CLASSIFIED → EVIDENCED →
// EMITTED). Every transition has a mechanical precondition; the fail-state =
// INCONCLUSIVE → BLOCK (fail-closed — an unparseable command touching a
// protected path never passes).
export function classifyCtExec(command: string): CtExecVerdict {
  // IDLE → PARSED: the command string non-empty.
  if (!command || typeof command !== 'string') return { verdict: 'ALLOW', reason: 'UNRELATED', exitState: 'EMPTY-UNRELATED' };
  const lower = command.toLowerCase();
  // THE DECODE-SCAN (2026-08-09 — my own fumbling's evasion: the base64'd
  // scripts wrote the config — the "echo <b64> | base64 -d > /tmp/x.py &&
  // python3 /tmp/x.py" chain. The filter decodes the base64 blobs in the
  // command + scans the decoded text with the SAME pair test — the opaque
  // writes become visible. The legit fixture scripts decode to the
  // trident-tmp writes (no protected targets) — they pass.)
  let scan = lower;
  // THE F-91 SKILLS-SUBTREE STRIP (2026-08-14 — the container-testing skill's
  // provisioning was BLOCKED as a config fumble: the tool's own load-gate
  // mandates the SKILL.md at ~/.config/opencode/skills/, and the deploy's
  // provisioning write (mkdir + echo > .../SKILL.md) tripped the config
  // families' broad `.config/opencode` target + the fail-closed. THE SKILLS
  // SUBTREE IS TOOLING ARTIFACTS — the protocol files the tool itself
  // requires — NEVER the runtime state (config.json/auth.json/db). The strip
  // removes the skills-path segments from the scan surface BEFORE any target
  // test, exactly like the heredoc/long-quote data strips: the skills
  // provisioning becomes invisible to the config lock, and the config/auth/db
  // writes (whose paths never sit under skills/) stay fully protected.)
  scan = scan.replace(/(?:\.config\/opencode)?\/skills\/[^\s;&|>]+/gi, ' ');
  const decodedCodeLines: string[] = [];
  const b64Tokens = command.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || [];
  for (const t of b64Tokens) {
    try {
      const dec = Buffer.from(t, 'base64').toString('utf-8');
      if (!dec || dec.length <= 10) continue;
      // ═══ THE COMPLETION (2026-08-11) — HOLE-10 THE DECODE-OPACITY FILTER:
      // the printable-ratio sanity check — the base64'd BINARY garbage (a low
      // printable ratio) is skipped, never decoded into the scan (the old
      // guard was the try/catch only — the binary garbage still entered the
      // decoded surface). The threshold 0.6: the readable command text/logs
      // run > 0.9; the binary (images, archives) runs < 0.3. The try/catch
      // stays as the backstop for the non-base64'able tokens. ═══
      if (printableRatio(dec) <= CT_DECODE_PRINTABLE_RATIO) continue;
      const decLower = dec.toLowerCase();
      // ═══ THE COMPLETION (2026-08-11) — CLR-7 THE DECODED BASE64-DATA
      // SEPARATION: the decoded blob joins the scan ONLY when it is executable
      // CODE — a self-contained write-pair (a mutation verb AND a protected
      // target, both WITHIN the decoded text, never the command's verbs). The
      // decoded DATA (a log/changelog body merely MENTIONING the protected
      // paths — no write verb in the decoded text) is EXCLUDED from the target
      // surface, exactly like the heredoc bodies of the main scan: its path
      // mentions never pair with the command's decode verb (`base64 -d >> ` is
      // the decode, not the config intent) into a false block — the HOLE-7 fix.
      // The existing three DECODE-SCAN BLOCK cases are the fence: each decoded
      // write-script is CODE (its own target+verb pair) → keeps the scan. ═══
      const isDecodedCode = CT_MUTATION_PATTERNS.some(
        (p) => p.target.test(decLower) && p.mutationVerb.test(decLower),
      );
      if (isDecodedCode) {
        scan += '\n' + decLower;
        decodedCodeLines.push(decLower);
      }
    } catch (e) { /* non-base64 tokens skipped — the hex SHAs decode to garbage */ }
  }
  // THE DATA-VS-COMMAND SEPARATION (2026-08-11 — the FP-3 fix): the heredoc
  // bodies + the long quoted strings are DATA, not the command's mutation
  // surface — the TARGET test runs on the EXECUTABLE SURFACE (the command
  // with the heredoc bodies + the long quoted strings stripped), never on the
  // data. THE -c/-e PROTECTION (the live test's catch — the python sqlite
  // UPDATE): the interpreter-code arguments (python3 -c "...", bun -e "...")
  // are the EXECUTABLE, not the data — they are PROTECTED from the strip
  // (placeholder-swapped), so the sqlite-UPDATE against the opencode.db in a
  // -c string still pairs. The VERB test runs on the full scan (the mutation
  // verbs in the data are harmless — the pair requires the target too).
  const protectedCode: string[] = [];
  let surface = scan;
  // ═══ THE WAVE-A INTEGRATION (2026-08-11 — the segmenter's unit feed): the
  // decoded-CODE lines (the decode-scan's executable blobs) are protected
  // placeholder-units BEFORE the data-strip — the wave-A segmenter feeds the
  // decoded write-script to the pair test as its OWN segment unit (the long-
  // quote strip never guts the decoded code's quoted path). ═══
  for (const dl of decodedCodeLines) {
    const ph = '\u0001' + protectedCode.length + '\u0001';
    protectedCode.push(dl);
    surface = surface.replace('\n' + dl, '\n' + ph);
  }
  surface = surface.replace(/(?:-c|-e|--eval|--command)\s+(["'])([\s\S]*?)\1/g, (m: string) => {
    protectedCode.push(m);
    return '\u0001' + (protectedCode.length - 1) + '\u0001';
  });
  surface = surface
    .replace(/<<\s*['"]?[A-Za-z0-9_]+['"]?[\s\S]*?\n\s*[A-Za-z0-9_]+\s*(?:\n|$)/g, ' ')
    .replace(/"[^"]{80,}"/g, ' ')                                          // the long double-quoted data
    .replace(/'[^']{80,}'/g, ' ');                                          // the long single-quoted data
  const executableSurface = surface.replace(/\u0001(\d+)\u0001/g, (m: string, i: string) => protectedCode[Number(i)] ?? m);
  // ANALYZED: the target × verb PAIR test PER SEGMENT (the wave-A fix — the
  // CLR-1/CLR-2 + the CC-1/CC-2 — the HOLE-5/6 closure). THE SEGMENTER
  // (segmentCommand — the CC-1): the executable surface is split on the
  // &&/;/|/newlines at the TOP LEVEL ONLY (the quote-aware split — the quoted
  // separators never split — the CLD-1); the decoded-CODE blobs are their own
  // line-segments. THE PROXIMITY (the CC-2 — the CLD-2's [^;]{0,60} window):
  // a candidate pair requires the protected path within CTX_PROXIMITY_WINDOW
  // AFTER the verb in the SAME segment — the blanket append verbs never pair
  // with the distant content mentions. THE CHAIN-PAIR EXCEPTION (the wave-B
  // families' read+pipe shapes): a verb match that begins with a chain
  // separator (|/;/& — the egress verbs' (?:^|[;&|]\s*) anchor) may pair with
  // the target in the IMMEDIATELY PRECEDING segment (the cat auth.json | nc
  // exfil — the HOLE-1 shape stays blocked). THE VAR-BINDING RESOLUTION (the
  // same-segment requirement vs the var indirection): a segment's assignment
  // binding a protected path (CFG=/root/.config/opencode/config.json) resolves
  // $CFG in the later segments — the write segment's pair forms. THE TARGET
  // test runs on the segment's surface text (the data stripped — the FP-3
  // fix: the heredoc content + the long quoted strings are DATA); the VERB
  // test runs on the same segment's surface text (the mutation verbs in the
  // data are harmless — the pair requires the target too).
  const segments = segmentCommand(executableSurface);
  const varBindings = collectCommandBindings(segments);
  let anyTarget = false;
  let anyTargetAndVerbFamily = false;
  for (const p of CT_MUTATION_PATTERNS) {
    let familyTargetSeen = false;
    let familyVerbSeen = false;
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const segText = resolveSegmentVars(seg.text, varBindings);
      const targetMatches = collectPatternMatches(p.target, segText);
      if (targetMatches.length > 0) {
        // THE PAIR-ONLY CLASSES (2026-08-11 — the CTX-13/14's exclusion from the
        // fail-closed's anyTarget): the incident families' targets (the /root,
        // /home, /etc — the host dirs) are EVERYWHERE in a container's normal
        // commands (/root/worktree, /root/build) — a BARE mention must never
        // trip the fail-closed. The CTX-13/14 fire ONLY on their pair (the
        // docker-bind / the chattr verbs) — the pair-only design.
        if (p.id !== 'CTX-13' && p.id !== 'CTX-14') anyTarget = true;
        familyTargetSeen = true;
      }
      const verbMatches = collectPatternMatches(p.mutationVerb, segText);
      if (verbMatches.length > 0) familyVerbSeen = true;
      if (verbMatches.length === 0) continue;
      // THE CHAIN CANDIDATES (the chain-anchored verbs): the union of the
      // current segment's targets and the IMMEDIATELY PRECEDING segment's
      // targets, in ORIGINAL-command offsets — the target must END before the
      // verb and sit within the window (the auth-read + the pipe + the egress
      // — the HOLE-1 shape). Computed once when any chain-anchored verb exists
      // in this segment (the target may live in the previous segment — the
      // same-segment target gate must not skip the chain-pair evaluation).
      const chainAnchored = verbMatches.some((v) => /^[;&|]/.test(v.text));
      const chainTargets: Array<{ text: string; start: number; end: number }> = [];
      if (chainAnchored) {
        for (const t of targetMatches) {
          chainTargets.push({ text: t.text, start: seg.start + t.start, end: seg.start + t.end });
        }
        if (si > 0) {
          const prevSeg = segments[si - 1];
          const prevText = resolveSegmentVars(prevSeg.text, varBindings);
          for (const t of collectPatternMatches(p.target, prevText)) {
            chainTargets.push({ text: t.text, start: prevSeg.start + t.start, end: prevSeg.start + t.end });
          }
        }
      }
      for (const v of verbMatches) {
        if (/^[;&|]/.test(v.text)) {
          // THE CHAIN-PAIR: the verb at a chain boundary — the target may sit
          // in the same segment (before the verb) OR the IMMEDIATELY PRECEDING
          // segment, within the window before the verb.
          // THE SELF-BAKED EXCEPTION (the red-team sweep 2026-08-28): the -v
          // branch bakes the protected path INTO the verb match ('docker run -v
          // /root/.config:/mnt' — the target is a SUBSTRING of the verb text).
          // The strict target-before-verb ordering rejected the self-contained
          // pair (the chained 'docker pull && docker run -v .config:…' ALLOWed).
          // A verb match that CONTAINS its own target is a complete pair by
          // itself — block regardless of the ordering window.
          const verbStartOrig = seg.start + v.start;
          for (const t of chainTargets) {
            if (v.text.toLowerCase().indexOf(t.text.toLowerCase()) !== -1 ||
                (verbStartOrig >= t.end && verbStartOrig - t.end <= CTX_PROXIMITY_WINDOW)) {
              // CLASSIFIED: MUTATE → EVIDENCED → EMITTED: BLOCK (the PSE).
              return {
                verdict: 'BLOCK',
                family: p.id,
                familyName: p.familyName,
                matchedVerb: v.text,
                evidence: 'the matched verb "' + v.text + '" + the protected path "' + t.text + '" in the chain segments [' + (si > 0 ? segments[si - 1].start : seg.start) + ',' + seg.end + '] (ct-anti-derailment.ts:classifyCtExec)',
                patternId: p.id,
                exitState: 'CHAIN-PAIR-BLOCK',
                verbClass: classifyVerbClass(v.text),
              };
            }
          }
        } else {
          // THE PROXIMITY v2 (2026-08-13 — the HOST's live catch: the python-var
          // form 'p=...config.json; ... json.dump(cfg,open(p,"w"))' — the target
          // sits BEFORE the verb — the old one-directional proximity (the target
          // AFTER the verb only) MISSED it — the config-write executed on the
          // host (exit 0). THE FIX: the BIDIRECTIONAL window — the target within
          // the window BEFORE or AFTER the verb in the same segment — the
          // var-binding's direct-assignment cousin. THE REGEXES ARE THE
          // MECHANICAL DETECTORS; the decision's the proximity's window.)
          for (const t of targetMatches) {
            if (t.start >= v.start && t.start - v.end <= CTX_PROXIMITY_WINDOW) {
              // the after-verb (the classic 'cp config.json' shape)
              return {
                verdict: 'BLOCK',
                family: p.id,
                familyName: p.familyName,
                matchedVerb: v.text,
                evidence: 'the matched verb "' + v.text + '" + the protected path "' + t.text + '" in the segment [' + seg.start + ',' + seg.end + '] (ct-anti-derailment.ts:classifyCtExec)',
                patternId: p.id,
                exitState: 'PAIR-BLOCK',
                verbClass: classifyVerbClass(v.text),
              };
            }
            if (t.end <= v.start && v.start - t.end <= CTX_PROXIMITY_WINDOW) {
              // the before-verb (the var-binding / the direct-assignment shape) —
              // ONLY the WRITE-FUNCTION verbs (the config-DESTINATION writes):
              // the json.dump / the open('w') / the writeFile / the cp/mv/rm
              // targeting the config — NOT the redirect/append verbs (the >>,
              // the cat> — the target before them is the READ-source, the
              // 'cat config.json > /tmp/backup' backup's the ALLOW, the
              // 'p=...config.json; json.dump(cfg, open(p,"w"))' is the BLOCK).
              if (/(?:json\.dump|open\s*\([^)]*['"]w['"]|writeFile|createWriteStream|base64\s+-d\s*>|\b(?:cp|mv)\b[^;]*|\brm\s+)/.test(v.text)) {
                return {
                  verdict: 'BLOCK',
                  family: p.id,
                  familyName: p.familyName,
                  matchedVerb: v.text,
                  evidence: 'the matched verb "' + v.text + '" + the protected path "' + t.text + '" in the segment [' + seg.start + ',' + seg.end + '] (ct-anti-derailment.ts:classifyCtExec — the before-verb proximity v2, the write-function gate)',
                  patternId: p.id,
                  exitState: 'VAR-BINDING-BLOCK',
                  verbClass: classifyVerbClass(v.text),
                };
              }
            }
          }
        }
      }
    }
    if (familyTargetSeen && familyVerbSeen) anyTargetAndVerbFamily = true;
  }
  if (!anyTarget) return { verdict: 'ALLOW', reason: 'UNRELATED', exitState: 'UNRELATED-ALLOW' };
  // CLASSIFIED: READ (the path present + no mutation pair + a read verb).
  if (CT_READ_VERBS.test(scan)) return { verdict: 'ALLOW', reason: 'READ', exitState: 'READ-ALLOW' };
  // THE WAVE-A FAIL-STATE REFINEMENT: a family with BOTH a target and a
  // mutation verb present (in any segment) whose pair failed only on the
  // window/cross-segment distance is a PARSEABLE mutation intent toward a
  // non-protected path → ALLOW (the HOLE-5 legit /tmp appends never trip the
  // fail-closed). The family-level BOTH requirement is the guard against the
  // data-token verbs (the CTX-07 setup-family's verb is a protected-path
  // token list — a config mention alone never masquerades as a write intent).
  if (anyTargetAndVerbFamily) return { verdict: 'ALLOW', reason: 'UNRELATED', exitState: 'UNRELATED-ALLOW' };
  // THE FAIL-STATE: the protected path present + no read verb + no mutation
  // verb → INCONCLUSIVE → BLOCK (fail-closed — the ISE law: never PASS on the
  // unparseable command touching the protected state).
  return {
    verdict: 'BLOCK',
    family: 'CTX-01',
    familyName: 'THE FAIL-CLOSED (the protected path present + the intent unparseable)',
    matchedVerb: '(unparseable)',
    evidence: 'the protected opencode path present + no read verb + no mutation verb → INCONCLUSIVE → BLOCK (ct-anti-derailment.ts:classifyCtExec — the fail-closed per the ISE law)',
    patternId: 'CTX-01',
    exitState: 'FAIL-CLOSED-BLOCK',
    verbClass: 'SHELL-REDIRECTION',
  };
}

// THE BLOCK MESSAGE (the MPSE + the operator's ruling verbatim + THE
// PER-FAMILY WARHEAD — 2026-08-10: each family's block names the sanctioned
// path, never a generic remedy):
export function buildCtConfigLockMessage(v: Extract<CtExecVerdict, { verdict: 'BLOCK' }>): string {
  const fam = CT_MUTATION_PATTERNS.find((p) => p.id === v.family);
  const warhead = fam && fam.remedy ? fam.remedy : 'THE SANCTIONED PATH: the tool\'s deploy action + the pre-built master image — NEVER the config/auth/db files. THE READS (cat/md5sum/json.load/SELECT) are always allowed — the inspection surface is intact.';
  // THE PSE EMITTED (2026-08-14 — the W2 completion): the block message names
  // the full triplet — the Pattern (the family), the State (the exit step — the
  // attack shape's path), the Evidence (the pair + the offsets) + the verb class
  // (the write channel). The audit trail is self-contained in the block.
  return '[TRIDENT CONFIG LOCK] ' + v.family + ': ' + v.familyName + ' — this exec command is BLOCKED mechanically (the operator 2026-08-09: "WHY ARE YOU FUCKING WITH THE CONFIG. FOR WHAT REASON. WHY IS THIS NOT BANNED AND BLOCKED BY THE TOOL"). THE EVIDENCE: ' + v.evidence + '. THE PSE: pattern=' + v.patternId + ' state=' + v.exitState + ' verbClass=' + v.verbClass + '. ' + warhead;
}

// ═══ THE SEGMENTER + THE PROXIMITY (2026-08-11) — THE CONFIG-LOCK OVERHAUL
// WAVE A (CLR-1/CLR-2 + CC-1/CC-2 — the HOLE-5/6 closure: the blanket
// append-verbs' distant matches + the chain segmentation — the LAST missing
// config-lock piece; the waves B+C landed). (1) CC-1 THE SEGMENTER:
// segmentCommand(command) → the quote-aware split on the &&/;/|/newlines at
// the TOP LEVEL ONLY (the quoted separators never split — the CLD-1); the
// separator LEADS the following segment (the chain-verb detection — the
// verb match beginning with |/;/& marks the chain-pair); the empty/unterminated
// inputs normalized, never thrown. (2) CC-2 THE PROXIMITY:
// CTX_PROXIMITY_WINDOW = 60 (the CLD-2 — the plan's [^;]{0,60} calibration —
// the named constant the tests assert, never the magic number); a candidate
// pair requires the protected path within the window AFTER the verb in the
// SAME segment — the blanket append verbs never pair with the distant content
// mentions. (3) THE VAR-BINDING RESOLUTION: a segment's assignment binding a
// protected path (CFG=/root/.config/opencode/config.json) resolves $VAR in the
// later segments — the CTX-01 'var indirection' case stays a genuine family
// block. (4) THE CHAIN-PAIR EXCEPTION: a verb match beginning with a chain
// separator may pair with the target in the IMMEDIATELY PRECEDING segment —
// the wave-B families' read+pipe shapes (the cat auth.json | nc exfil — the
// HOLE-1) stay blocked; the wave-A direct-write families (no chain anchor)
// never pair across segments (the HOLE-6). The segmenter + the proximity
// CANDIDATE — the classify state machine still DECIDES (the ISE law: the regex
// is the mechanical detector only, never the decider). ═══

export interface CtCommandSegment {
  text: string;
  start: number;
  end: number;
}

export const CTX_PROXIMITY_WINDOW = 60;

// THE SEGMENTER (CC-1): a single character pass with the quote-state tracking
// (single AND double quotes; the escaped quotes handled). The separators
// (&&, ;, |, the newlines) split ONLY at the quote depth 0 — a quoted
// &&/;/| inside a string never splits (the CLD-1: the python -c sqlite
// UPDATE's interior `;` stays one segment). The separator LEADS the following
// segment (its text starts at the separator) so the chain-verb detection (a
// verb match beginning with |/;/&) works on the segment text directly. The
// empty command yields ONE empty segment; the unterminated quote runs to the
// end as one segment — both normalized, never thrown.
export function segmentCommand(command: string): CtCommandSegment[] {
  if (typeof command !== 'string' || command.length === 0) {
    return [{ text: '', start: 0, end: 0 }];
  }
  const segments: CtCommandSegment[] = [];
  let segmentStart = 0;
  let quote: string | null = null;
  let escaped = false;
  let i = 0;
  const n = command.length;
  while (i < n) {
    const ch = command[i];
    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      i++;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === ';' || ch === '|' || ch === '\n') {
      segments.push({ text: command.slice(segmentStart, i), start: segmentStart, end: i });
      segmentStart = i;
      i++;
      continue;
    }
    if (ch === '&' && command[i + 1] === '&') {
      segments.push({ text: command.slice(segmentStart, i), start: segmentStart, end: i });
      segmentStart = i;
      i += 2;
      continue;
    }
    i++;
  }
  segments.push({ text: command.slice(segmentStart), start: segmentStart, end: n });
  return segments;
}

// THE MATCH COLLECTOR (the proximity's pair arithmetic): every target/verb
// match with its span offsets into the segment text — the offsets feed the
// proximity distance + the evidence messages (the MPSE triplets). The
// zero-length safety: a match at the lastIndex never infinite-loops.
function collectPatternMatches(re: RegExp, text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const global = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) global.lastIndex++;
  }
  return out;
}

// THE VAR-BINDING RESOLUTION (the same-segment requirement vs the var
// indirection): an assignment whose value is a protected path (any family's
// target) binds its name; the later segments' $VAR / ${VAR} references
// resolve to the bound value — the write segment's target + verb form the
// genuine family pair (the CTX-01 `CFG=...; echo x > $CFG` case). The family
// names come from the data (CT_MUTATION_PATTERNS), never hard-coded strings.
function collectCommandBindings(segments: CtCommandSegment[]): Map<string, string> {
  const bindings = new Map<string, string>();
  const assign = /(?:^|[;&|]\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=("([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  for (const seg of segments) {
    let m: RegExpExecArray | null;
    while ((m = assign.exec(seg.text)) !== null) {
      const name = m[1];
      const value = m[3] ?? m[4] ?? m[5];
      if (!value) continue;
      if (CT_MUTATION_PATTERNS.some((p) => p.target.test(value))) {
        bindings.set(name, value);
      }
    }
  }
  return bindings;
}

function resolveSegmentVars(text: string, bindings: Map<string, string>): string {
  if (bindings.size === 0) return text;
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m: string, braced: string, bare: string) => {
    const name = braced ?? bare;
    return bindings.get(name) ?? m;
  });
}
