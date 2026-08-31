# Slice 4 — Memory + Declared Cognition

```text
Status: COMPLETE
Tasks: S4-T01 … S4-T11 (11/11)
Date: 2026-08-30
Milestone: 3 — Inspectable Personal Cognition, REACHED
External model calls: NONE — mock mode only, no API key available
Personal questions: answered LOCALLY, no provider contacted
Hypotheses: H-01 … H-06 ALL NOT TESTED
```

## Status

AVA can now hold explicit personal knowledge that is correctable, temporal and traceable,
without turning observations into false certainties. The distinction the slice exists to
protect — what the user *told* AVA versus what AVA *noticed* — is enforced by the schema,
the authority rules, the answer path and the UI, not by intent.

Nothing here says the architecture works. No hypothesis has been tested.

## Tasks

| ID | Task | Where |
| --- | --- | --- |
| `S4-T01` | `declared_cognition`, `memory_record`, `behavioral_hypothesis` | `0006_memory_and_cognition.sql` (D-11) |
| `S4-T02` | nine categories, versioning, authority | `core/cognition/types.ts`, `db/repositories/cognition.ts` |
| `S4-T03` | declared > hypothesis, with conflict recorded | `core/cognition/authority.ts` |
| `S4-T04` | episodic + stabilized semantic, promotion rules | `core/cognition/memory.ts`, `app/memory-service.ts` |
| `S4-T05` | `evidence_reachable` always true | enforced on write in `db/repositories/memory.ts` |
| `S4-T06` | diversity dedup by `lineage.root_run_id` | `countIndependentSupport` |
| `S4-T07` | hypotheses in shadow mode, `alternatives_available` mandatory | schema CHECK + `core/cognition/hypothesis.ts` |
| `S4-T08` | third-party exclusion filter | `assessHypothesis`, `app/hypothesis-service.ts` |
| `S4-T09` | correction: new event + view rebuild | `app/cognition-service.ts`, `rebuildStaleViews` |
| `S4-T10` | Memory UI: five sections, five actions | `apps/web/app/memory/` |
| `S4-T11` | **GS-04** and **GS-06** | `tests/golden/gs-04-*`, `gs-06-self-poisoning-cycle` |

## Milestone 3

```text
declare a preference → ask AVA what it knows → AVA answers "you explicitly told me…"
→ correct/contextualize → original stays readable → new declaration authoritative
→ ask again → the answer changes → Why shows the declaration and its provenance
```

Works end to end against the built server. `tests/e2e/milestone-3.test.ts`.

### How to see it

```bash
npm run db:reset && npm run db:migrate && npm run db:seed -- --cognition
npm run dev            # http://localhost:3210
```

Open **What AVA knows**. The five sections are visually distinct: a declaration reads
*declared by you*, a hypothesis reads *a guess — you never told me this*. Declare something
of your own, then ask in the workstream chat *What have I told you about my preferences?*.
Correct the declaration from the Memory page and ask again — the answer changes and the
original moves to **Superseded**, still readable.

From the command line:

```bash
npm run cognition -- declare <workstreamId> "For strategy work I prioritise features."
npm run cognition -- correct <workstreamId> "…except for craft projects."
npm run cognition -- list
npm run ask -- <workstreamId> "What are you only guessing about me?"
```

## Memory classes

Exactly three, as the baseline requires. No fourth was introduced.

| Class | What it holds | How it gets there |
| --- | --- | --- |
| `episodic` | events and state versions, situated in time | written as evidence arrives |
| `semantic_stabilized` | claims that passed the promotion rules | deterministic promotion only |
| `declared_cognition` | what the user stated or confirmed | only by the user |

Every record carries `derived_from_evidence_ids` and must resolve to level-zero evidence.
`evidence_reachable` is enforced on **write**: a record whose sources cannot be reached is
an unfalsifiable belief — the user could neither check it nor correct it — so it must be
impossible to store, not merely flagged.

**Promotion** is conservative and entirely deterministic: at least two independent sources,
not all system-origin, `HEALTHY` context, no unresolved material conflict, a declared scope,
and no `SPECULATIVE` link. High-misapplication-risk claims additionally require `ESTABLISHED`.
Failing promotion is not an error — the claim stays episodic, which is a correct resting
state. No model score participates anywhere.

## Declared Cognition

Nine categories: `principle`, `quality_criterion`, `contextual_preference`, `autonomy_limit`,
`must_confirm_action`, `never_infer_subject`, `positive_example`, `negative_example`,
`exception`.

Three routes in, and observation is not one of them: `declared`, `confirmed`, `corrected`.
The enum has no fourth value, so a pattern AVA noticed cannot enter this table at all.

Every declaration carries evidence — the schema refuses an empty `evidence_ids`. Declared
Cognition is a **projection over the ledger**, never a parallel store: the user's words go
into evidence first and the declaration points at them. A `preference` or `principle`
capture produces both through one code path, so the two cannot drift apart.

**Scope** carries `workType`, `workstreamId`, `activity`, `decisionCategory`, `artifactType`,
temporal validity and explicit exceptions. A constrained dimension with no value in the
asking context **does not match** — the conservative reading, and the one that keeps a
contextual preference from silently becoming a global one. Exceptions are checked first: a
carve-out the user wrote beats the rule it carves out of. When two declarations apply, the
more specific one wins.

## Behavioral Hypotheses

**Can:** exist, be shown in the Memory surface, be reported in chat as explicitly labelled
guesses, be rejected by the user, carry counter-evidence, and record the conflict when they
disagree with a declaration.

**Cannot:** outrank a declaration · govern autonomy or ranking · become a principle
automatically · be applied outside the observed context · be formed without at least two
usable observations · be formed with no alternatives available · be formed from AVA's own
output · be formed about a third party · be formed about a `never_infer_subject` · be
phrased as a trait · rise above `SPECULATIVE` while unconfirmed · be sent to a provider.

`shadow_mode = true` and the strength ceiling are CHECK constraints, and
`alternatives_available` is non-empty by constraint: choosing the least bad available option
is not a positive preference, and a hypothesis that cannot say what else was on offer has
not observed a choice at all.

**Confirmation does not promote it.** Confirming creates a *declaration* from it, in the
user's own words; the hypothesis is marked `confirmed` and keeps the audit trail. Authority
comes from the user saying so, never from the system's accumulated confidence in its guess.

## Correction / supersession

```text
correct/contextualize
  → new evidence written to the ledger
  → new version appended to the chain (root_id, version + 1)
  → previous version marked superseded, pointing at the successor
  → every view built on the old wording marked stale
  → stale views rebuilt from the ledger, not patched
```

The original is never edited and never deleted. Correcting a version that has already been
replaced is **refused** with the current version named — redirecting silently would let the
user think she had corrected the sentence she was looking at, and forking the chain would
leave two "current" positions, neither trustworthy.

Rebuilding re-reads the evidence rather than patching the old summary; a patched summary
would still carry the sentence the user came back to fix.

## Chat integration

| Question | Behaviour |
| --- | --- |
| *What have I explicitly told you about how I evaluate X?* | declarations, in her own voice |
| *What do you know about my preferences for X?* | declared / evidence-backed / hypotheses, separated |
| *What are you only guessing about me?* | hypotheses only, labelled as guesses |
| *Why do you think that?* | Why surface: declaration, scope, match reason, evidence |

**Personal questions are answered locally.** No provider is contacted. Two independent
reasons: personal cognition is the most sensitive thing AVA holds (ADR-22, baseline §26),
and sending a behavioural profile of the user to a provider to have it read back to her is
a poor trade; and the answer is an enumeration of what she declared and what AVA guessed,
where deterministic composition is the correct implementation rather than a downgrade.

For work-state questions, declarations still travel — but as **metadata plus a pointer**.
The wording crosses exactly once, through the redacted evidence block. Hypotheses never
cross at all; their existence is disclosed without their content so the model does not fill
the silence by speculating.

## Authority behavior

```text
Declared Cognition  >  Confirmed Personal Knowledge  >  Behavioral Hypotheses
                                                     >  Raw Behavioral Observations
```

This ladder ranks claims **about the person** only. Work-state facts are not on it and are
never compared against it — "the release moved to October" and "you prefer concise updates"
are different kinds of statement, and one hierarchy over both would let a preference
outrank a fact, or the reverse.

The **language contract** is enforced in code, not just in the prompt. `grounded-answer/v2`
states the rules; `validateGrounding` rejects an answer that says *you prefer X* when no
declaration applies, with failure kind `unsupported_preference_claim`. That failure
discards the answer rather than softening it.

## Context Health

An eleventh dimension, `declared_cognition_coverage`, material only for personal questions.

| State | Example |
| --- | --- |
| `HEALTHY` | a declaration applies to the context asked about |
| `DEGRADED` | nothing declared, but observed patterns exist — enough to say "I have a guess", never to assert |
| `INSUFFICIENT` | nothing declared and nothing observed for this context — AVA abstains |

A history of behaviour is explicitly **not** coverage. Answering "what do I prefer" from
observed patterns would put words in the user's mouth, so a hypothesis alone can never
lift the state to `HEALTHY`.

## Telemetry

`cognition_declared` · `cognition_confirmed` · `cognition_corrected` ·
`cognition_contextualized` · `cognition_superseded` · `cognition_revoked` ·
`hypothesis_created` · `hypothesis_rejected` · `hypothesis_conflict_recorded` ·
`knowledge_promoted` · `memory_view_rebuilt`.

Every one corresponds to something that actually happened. There is no event for "AVA
inferred a preference", because inferring one is not permitted. Anti-retroactivity is
unchanged.

## Tests

```text
lint                                   import boundaries: ok
typecheck                              exit 0
unit + integration + golden            225 passed, 27 files
build:web                              exit 0
e2e                                    13 passed, 3 files
eval:answers                           6/6, 0 unsupported assertions
provider:smoke                         PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED
```

Added: 35 core unit tests (scope, authority, language contract, hypothesis admissibility,
recursive-summarisation, reachability, promotion); 6 integration (capture → declaration →
answer, correction, scope matching, hypothesis subordination); 2 golden GS-04; 6 golden
GS-06 extended; 2 provider-payload privacy; 2 prompt-registry; 5 E2E.

## Deviations

| ID | Deviation |
| --- | --- |
| D-11 | `S4-T01` names migration `0005`; that number was taken by Slice 3, so this is `0006`. Content unchanged. |
| D-12 | Personal questions never reach a provider. Narrows the boundary; does not widen it. |
| D-13 | Declaration wording reaches a provider only through the redacted evidence block. |
| D-14 | Behavioral Hypotheses are excluded from the provider payload entirely. |
| D-15 | Declaration-backing evidence enters retrieval by **scope**, not by keyword. |
| D-16 | `grounded-answer/v2` registered; `v1` frozen and untouched. |

### D-15 — why scope-based retrieval was necessary

Lexical retrieval misses a declaration whenever the user phrased her preference differently
from the question. A personal question then arrived at the provider boundary with nothing to
answer from, even though the declaration that answered it was sitting in the ledger. The
words behind an applicable declaration are now retrieved by scope match, and they still pass
through classification and redaction like any other evidence.

### D-12, D-13, D-14 — found by writing the payload test

The first working version printed declaration content and hypothesis descriptions directly
into the user message. Both would have crossed the boundary **unredacted**, bypassing the
classification pipeline entirely — the most sensitive text AVA holds taking a second,
unguarded path out. Caught by writing a test that inspects the payload rather than the
eligibility list. All three deviations narrow what leaves the machine.

## Known limitations

- **No automatic hypothesis generation.** Hypotheses are formed only when something calls
  `proposeHypothesis` with explicit evidence and alternatives. There is no background
  process watching behaviour, which is the conservative reading of S4-T07 and matches the
  brief's instruction to start simple.
- **Scope matching is exact-string.** "craft" and "craft work" are different work types.
  Normalisation beyond trim-and-lowercase would be inference about what the user meant.
- **Trait-claim detection is lexical.** It catches the obvious phrasings and would miss a
  carefully worded personality claim. It is a guard rail, not a proof.
- **The user must supply the asking context.** A declaration scoped to `architecture`
  applies only when the caller says the situation is architectural. AVA does not infer the
  category from the question, so a scoped declaration can be missed.
- **Promotion is never triggered automatically.** `promoteToStabilized` exists and is
  tested, but nothing in the capture path calls it yet; the Evidence-backed section fills
  only when a caller asks for promotion.
- **No conversational memory.** Each question is still answered from the ledger alone.
- **Mock answers are composed locally** and say nothing about how a real model behaves.

## Blockers for Slice 5

None.

Outstanding but not blocking: run `npm run provider:smoke` with a real key to move the
provider gate to `CLOSED — VERIFIED BY CONTROLLED REAL CALL`.

ADR-21 Gate B remains **OPEN**. No hypothesis has been tested.
