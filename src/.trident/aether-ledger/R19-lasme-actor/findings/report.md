# R19 LASME Actor Hunt — Findings Report

## FINDING: detector counts any subscribe callee as actor subscription — hides missing actor.subscribe
- layer: R19-lasme-actor
- predicate: violates
- object: Actor
- file: src/audit-engine/layers/r-actor.ts:23
- evidence: "subscribe: 'subscribeCount',"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, createActor/createMachine/send/subscribe calls, missing subscriptions, message flow integrity
- severity: HIGH
- confidence: 0.88

## FINDING: phantom topology-drift shouldBe fires on any class/send/subscribe without actor when spec declares actor — overly broad non-actor signals
- layer: R19-lasme-actor
- predicate: shouldBe
- object: Actor
- file: src/audit-engine/layers/r-actor.ts:184
- evidence: "if (specInfo.declared && stats.createActorCount === 0 && (stats.classDecls > 0 || stats.sendCount > 0 || stats.subscribeCount > 0)) {"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology drift — spec declares actor must exist but code omits
- severity: MEDIUM
- confidence: 0.85

## FINDING: AuditFSM actor lifecycle uses interpret+start+send+getSnapshot polling with zero subscribe handlers — missing subscription violates actor message-flow integrity
- layer: R19-lasme-actor
- predicate: violates
- object: Actor
- file: src/warheads/xstate-fsm/index.ts:133
- evidence: "this.actor = interpret(auditMachine);"
- spec: MASTER_CONTEXT/V443_SHADOW_HYDRA_CODE_AUDIT_L2_SPEC.md:195 Actor topology, missing subscriptions, message flow integrity
- severity: MEDIUM
- confidence: 0.78

## SUMMARY
3 finding(s) — 1 HIGH, 2 MEDIUM. Adjudicated 6 candidates: 3 TRUE_DEFECT, 3 RED_HERRING, 0 UNCLEAR. Investigated 4 actor-relevant modules (hydra/pipeline.ts, fsm/orchestrator-machine-v2.ts, warheads/xstate-fsm/index.ts, audit-engine/layers/r-actor.ts) via capped read(320)+grep(120) + template graphify queries [show all createMachine and createActor call sites / trace send() to subscribe() paths / find actors without subscription handlers]. TRUE_DEFECTS: (0) r-actor.ts:23 generic ACTOR_CALL_TARGETS map counts any subscribe callee via isCallByName('subscribe') without actor receiver check — hides true missing actor.subscribe, HIGH 0.88; (1) r-actor.ts:184 shouldBe fires on any classDecl/send/subscribe when spec declares actor — sendCount via broad isCallByName('send') captures non-actor sends and classDecls not actor-specific, causing phantom topology-drift, MEDIUM 0.85; (2) warheads/xstate-fsm/index.ts:133 AuditFSM via interpret(auditMachine) calls start()+send() for 5-state machine but never subscribe() — polling getSnapshot replaces subscription yet per-spec (a)(b) requires handler, long-lived not single-fire exempt, MEDIUM 0.78. RED_HERRINGS suppressed: (3) lasme-actor.ts:48 literal in graphQueries not CallExpression — calibration shot 3; (4) hydra/pipeline.ts:145 intentional AETHER_MIGRATION stub (void tools; throw) with JSDoc actor.orphan intentional, live path runMetaLayer owns lifecycle — no orphan; (5) r-actor.ts:245 global actor vs machine count mismatch is legitimate reuse (one machine spawns many actors). Spec: V443 §2.3 r-actor roster (a) missing subscriptions (b) broken message flow (c) topology drift (d) orphan actors. Graph: EXTRACTED preferred, INFERRED flagged — no fabrication.
