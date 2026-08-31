# Slice 4 — Execution Log

```text
Slice: 4 (Memory + Declared Cognition)
Status: COMPLETE
Date: 2026-08-30
Tasks: 11/11
Milestone 3: REACHED
External model calls: NONE — no API key available
Architecture changes: NONE
```

Per-slice logs are the established pattern (`slice-3-execution-log.md`). The Implementation
Plan has no task-status field and is treated as immutable; nothing in it was rewritten.

## Task status

| ID | Status | Where |
| --- | --- | --- |
| `S4-T01` | COMPLETE | `packages/db/src/migrations/0006_memory_and_cognition.sql` |
| `S4-T02` | COMPLETE | `packages/core/src/cognition/types.ts`, `packages/db/src/repositories/cognition.ts` |
| `S4-T03` | COMPLETE | `packages/core/src/cognition/authority.ts` |
| `S4-T04` | COMPLETE | `packages/core/src/cognition/memory.ts`, `packages/app/src/memory-service.ts` |
| `S4-T05` | COMPLETE | `packages/db/src/repositories/memory.ts` — enforced on write |
| `S4-T06` | COMPLETE | `countIndependentSupport` |
| `S4-T07` | COMPLETE | schema CHECKs + `packages/core/src/cognition/hypothesis.ts` |
| `S4-T08` | COMPLETE | `assessHypothesis`, `packages/app/src/hypothesis-service.ts` |
| `S4-T09` | COMPLETE | `packages/app/src/cognition-service.ts`, `rebuildStaleViews` |
| `S4-T10` | COMPLETE | `apps/web/app/memory/` |
| `S4-T11` | COMPLETE | `tests/golden/gs-04-*.test.ts`, `tests/golden/gs-06-self-poisoning-cycle.test.ts` |

## Invariants made structural

Each of these is enforced by the schema or by a pure function, not by convention:

- a declaration cannot exist without evidence — `CHECK (jsonb_array_length(evidence_ids) > 0)`;
- `cognition_origin` has three values and observation is not one of them;
- a hypothesis cannot exist without alternatives — `CHECK (jsonb_array_length(alternatives_available) > 0)`;
- an unconfirmed hypothesis cannot exceed `SPECULATIVE` — CHECK constraint;
- `shadow_mode` cannot be false — CHECK constraint;
- a memory record cannot exist with unreachable evidence — refused on write;
- a memory view is always `content_origin = system` — CHECK constraint;
- a view flattens to level-zero evidence ids, so summary-of-summary adds nothing.

## Deviations

| ID | Deviation | Effect |
| --- | --- | --- |
| D-11 | migration numbered `0006`, not `0005` | none; `0005` was Slice 3 |
| D-12 | personal questions answered locally, no provider | narrows the boundary |
| D-13 | declaration wording crosses only via the redacted evidence block | closes an unredacted path |
| D-14 | hypotheses never cross the boundary | no behavioural profile leaves the machine |
| D-15 | declaration evidence retrieved by scope, not keyword | personal questions become answerable |
| D-16 | `grounded-answer/v2` added; `v1` frozen | prompt versioning honoured |

## Findings made during execution

**F-05 — personal cognition would have crossed the boundary unredacted.** The first working
version printed `declaredCognition[].content` and `behavioralHypotheses[].falsifiableDescription`
straight into the user message. Both bypassed classification, minimization and redaction
entirely — a second, unguarded path out of the machine for the most sensitive text AVA
holds. Found by writing a payload-inspection test rather than trusting the eligibility
list. Fixed by D-12, D-13 and D-14.

**F-06 — the provider boundary refused answerable personal questions.** Its first gate
demands non-empty `evidenceIds`, and lexical retrieval finds nothing when the user phrased
her preference differently from the question. The declaration that answered the question was
in the ledger and unreachable. Fixed by D-15: applicable declarations bring their evidence
into retrieval by scope match.

**Observation — correcting a superseded version is refused, not redirected.** Redirecting to
the current version would let the user think she had corrected the sentence she was looking
at. Forking the chain would produce two "current" positions. The operation now fails and
names the current version.

**Observation — `capture` gained a `cognition` field.** `preference` and `principle`
captures now return the declaration they produced. Existing callers are unaffected; the
field is `null` for every other type.

## Verification

```text
npm run lint            import boundaries: ok
npm run typecheck       exit 0
npm test                225 passed, 27 files
npm run build:web       exit 0
npm run test:e2e        13 passed, 3 files
npm run eval:answers    6/6 expected behaviour, 0 unsupported assertions
npm run provider:smoke  PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED
```

## Blockers

None.

## Not done, deliberately

No Opportunity Engine, Value Vector, proactive briefing, attention ranking, preparation,
feedback learning, Outcome Resolution, connectors, Work Graph, embeddings, learned ranking
or statistical personalization. No personality score, Big Five, archetype, psychological
label or global preference vector — the system models contextual cognition, not a person's
essence.

No automatic hypothesis generation runs in the background; hypotheses are formed only when
called with explicit evidence and alternatives.

## Architecture integrity

`architecture-v0.2-final` unchanged. ADR-21 and ADR-22 unchanged. No ADR was required: the
authority order implemented here is the one the baseline already specifies, and nothing was
re-ranked. H-01 … H-06 remain `NOT TESTED`; ADR-21 Gate B remains `OPEN`.
