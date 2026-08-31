# Prospective Validation Readiness Audit v0.1

```text
Status: READY WITH LIMITATIONS
Date: 2026-08-31
Slice: 7 — Prospective Validation Audit
Scope: instrumentation coverage only
Verdict scope: MEASURABLE / NOT MEASURABLE — never GO / PIVOT / STOP
Hypotheses: H-01 … H-06 ALL NOT TESTED
ADR-21 Gate B: OPEN
Prospective Validation Protocol: NOT CREATED
```

## Scope

This audit answers one question: **when AVA is used for real, will the record
support finding out whether she is any good?**

It does not answer whether she is good. It assigns no verdict to any
hypothesis, computes no rate as a finding, and creates no protocol. Every
number produced during the audit came from synthetic scenarios and is evidence
about the code, not about the product.

Two instrumentation gaps were found and fixed, because without them the audit
would have been asserting that unmeasurable things were measurable. They are
recorded as F-15 and F-16.

## Timeline audit

| Event / timestamp | Producer | Persistence | First slice | Required fields | Can be missing? | Validation use |
| --- | --- | --- | --- | --- | --- | --- |
| `evidence_arrived_at` | `capture()` | `validation_event`, `evidence.observed_at` | 1 | subject, workstream, strength | no, once capture succeeds | detection latency baseline |
| `change_detectable_at` | `applyCapture()` | `validation_event` (`reported`) | 2 | subject, strength | no | **anticipation denominator** |
| `change_detected_at` | `applyCapture()` | `validation_event` (`system_clock`) | 2 | subject, change id | no | detection latency |
| `opportunity_generated_at` | `generateOpportunities()` | `opportunity_generation.generated_at` (append-only) | 5 | rule, policy version, known evidence | no | reasoning latency, anti-retroactivity anchor |
| `opportunity_shown_at` | `buildBriefing({deliver:true})` | `opportunity.shown_at` + event | 5 | class, health, strength | yes — never shown | exposure delay, exposure denominator |
| `user_seen_at` | — | — | — | — | **UNOBSERVABLE** | would sharpen timing; absent |
| `feedback_at` | `recordFeedback()` | `feedback.given_at` + one event per dimension | 6 | target, dimension | yes — `not_provided` | correctness, value, novelty |
| `user_action_at` | `recordUserAction()` | `user_action.acted_at` (`reported`) | 6 | opportunity, kind | yes — `not_observed` | anticipation window |
| `outcome_at` | `recordOutcome()` / `resolveOutcome()` | `outcome.recorded_at` (append-only chain) | 6 | opportunity, state, resolved_by | yes — `not_observed` | loop closure |

All nine have a producer except `user_seen_at`, which has none by decision.

### `change_detectable_at` — audited deeply, and found broken

This timestamp is the denominator of anticipation, so it was audited hardest.
It must mean *the first moment sufficient evidence existed for the current
mechanism to detect the change* — not when evidence arrived at the system, not
when detection ran, and never a value reconstructed afterwards.

It is emitted at `evidence.observedAt` of the capture that completed the
change, which is the correct semantics: sufficiency is reached with the last
piece needed, and multi-evidence changes therefore date from that piece.

**It was wrong in practice.** `CaptureRequest` had no `observedAt` field, so
every manual capture was dated at the instant it was typed. Detection latency
was therefore identically zero, and anticipation was unmeasurable by
construction — while looking perfect. Fixed as F-15, with a test that reports a
day-old decision and asserts a latency above one minute.

### Clock semantics

Fixing F-15 exposed F-16: `validation_event` forbade any `occurred_at` more
than 60 seconds before the write. That rule is right for events the machine
observes about itself and wrong for events a person reports about the world,
and it left only two options — lose the event, or date it at the write. The
second is what had been happening.

Events now carry `time_basis`:

- `system_clock` — AVA observed it herself; still cannot be backdated.
- `reported` — a person stated when it happened; may precede the write.

Neither may be dated in the future. The table remains append-only. Analysis can
tell an observation from an assertion, which it previously could not.

## Provenance audit

Navigable in both directions, by reference:

```text
Outcome → opportunity_id, decision_record_id
User Action → opportunity_id, related_artifact_id
Feedback → target_type/target_id, opportunity_id, decision_record_id
Opportunity → trigger_change_ids, origin_evidence_ids, impacted_from, checkpoint_id
opportunity_generation → rule_id, rule_version, policy_version, value_vector, gates
DecisionRecord → retrieval_result_ids, context_health_id, model_run_id, prompt_version
ChangeRecord → evidence_ids, before/after version refs
Evidence → source_record_id, lineage
```

No critical event is orphaned. `impacted_from` was being dropped on read — the
column existed only in memory — which left the timeline unable to find the
change events of the object an opportunity was about. Fixed as F-11 in Slice 6
and now persisted.

## Anti-retroactivity

| | Invariant | Result |
| --- | --- | --- |
| **AR-01** | future evidence does not enter a past opportunity | PASS |
| **AR-02** | future feedback does not enter a past DecisionRecord | PASS |
| **AR-03** | a future outcome does not alter historical state | PASS |
| **AR-04** | a future correction does not alter historical cognition | PASS |
| **AR-05** | a future memory rebuild does not raise historical support | PASS |
| **AR-06** | a future policy version does not replace a past one | PASS |
| **AR-07** | a future price table does not alter historical cost | PASS |

Each is enforced structurally, not by convention: `opportunity_generation`,
`decision_record`, `validation_event`, `feedback`, `user_action` and `outcome`
all refuse UPDATE, DELETE or both, and the tests attempt the write directly in
SQL rather than through the service that would refuse it.

## Feedback / outcome observability

Three independent axes in three independently nullable columns, with no
aggregate anywhere. `correct + already_known`, `correct + too_late` and
`incorrect + valuable` are all recorded distinctly.

Corrections append. The outcome chain reconstructs: `outcomeAsOf(t2)` returns
what was known at t2 and cannot see t3.

`not_provided` is preserved as its own state everywhere and is never counted as
a negative.

## False-positive observability

Directly measurable later, for shown interventions:

`shown + incorrect` · `shown + irrelevant` · `shown + already_known` ·
`shown + not_verifiable` · `shown + not_provided`

The denominator is explicit: interventions that were shown AND carry a verdict.
No rate is computed here.

## False-negative observability

**This is the weakest area, and it is weak for a real reason.** Nothing can
observe an important thing that AVA never noticed; a detector that claimed to
would be inventing omniscience.

What the V0 does preserve is the population a later investigation must work
from:

- every candidate, including `suppressed`, with the gate that blocked it;
- every `show` verdict with its reasons, including the failures;
- items held back by the top-k cap, with the reason;
- ChangeRecords that produced no opportunity at all (`unraisedChanges`);
- impacts recorded as `dependency_impacted` changes.

**Limitation, explicit:** a miss caused by an absent declared relation leaves no
trace at all. AVA follows relations the user declared; a dependency never
stated is invisible to detection and equally invisible to this audit. Serious
false negatives will require human review of a real period, not a query.

## Memory / cognition observability

Answerable later: which declaration was current at t, the full correction chain
with versions and origins, superseded and revoked declarations, rejected
hypotheses with reasons, promotions with their DecisionRecord, and views marked
stale and rebuilt.

`declaredCognitionAsOf(t)` answers *"did AVA remember correctly what I had told
her at that moment?"* from the version chain rather than from current state.

The export carries chain shape — ids, versions, types, origins, evidence counts
— and deliberately not the declaration text.

## Context Health

Recorded per task in `context_health` and copied onto the opportunity at
generation. Later feedback provably does not move it (tested).

Derivable later: opportunities shown under `HEALTHY` versus `DEGRADED`,
candidates suppressed under `INSUFFICIENT`, and answer abstentions by health.

## Cost / latency

`model_run` records archetype, purpose, provider, model, prompt version,
tokens, latency, retries, estimated and actual cost, `price_table_version`,
status and denial reason.

- Null token counts stay null. An unmeasured call is not a free call.
- Cost is a number written at the time, so a later price table cannot move it.
- `execution_mode` distinguishes a deterministic intervention that genuinely
  cost nothing from a ModelRun missing because something failed.

**No real call has ever been made.** Every cost and latency figure in the
system is either zero or synthetic.

## Missingness

Five distinct meanings, preserved rather than collapsed:

| | Meaning |
| --- | --- |
| `not_observed` | it may have happened; AVA cannot see it |
| `not_provided` | the user was asked and did not answer |
| `not_applicable` | the question does not arise for this record |
| `unknown` | recorded explicitly as unknown by the reporter |
| `unobservable` | structurally impossible in this version, by decision |

The read model returns `{ value, missing }` and never substitutes `0`, epoch or
`now()` for an absent value. Tested.

## Durability — deviation D-02 resolved

PGlite was never in doubt as a database: genuine PostgreSQL, same SQL, same
migrations, and it is what keeps ADR-22 local-first honest. What was open was
whether a longitudinal record survives months of real use — and until this
slice there was no backup, no export and no restore, so one lost directory
would have taken the entire evidence trail with it.

Added and tested:

- `npm run db:backup` — a gzipped snapshot, written locally, nothing uploaded;
- `npm run db:restore -- <path> --verify` — opens the snapshot and counts rows
  without touching the live directory;
- a test that round-trips the full loop and asserts that generation timestamps,
  policy versions, feedback verdicts and `reported` clock basis all survive,
  and that the restored database is still append-only.

**Concurrency remains a real constraint**: PGlite allows a single writer. The
web server holds the directory, so CLI writes require it to be stopped. This is
a known operational limit, documented, and it is why the e2e suite drives
writes through the CLI before starting the server (D-08).

`D-02` moves from `REVISIT BEFORE PROSPECTIVE VALIDATION` to
**`ACCEPT WITH BACKUP`**. Recommended practice before real use: a scheduled
`db:backup` and one verified restore.

## E2E coverage — deviation D-05 revisited

V0 ships no streaming, which removes the reason D-05 was raised: there is no
partial-token rendering that could show an ungrounded fragment.

Slice 6 introduced genuinely interactive forms, so the question was re-asked:
*is there client behaviour the current harness cannot observe?*

Yes, one thing: the server-action round-trip. The harness asserts rendered HTML
and cannot click. A renamed input would not throw — it would silently record
nothing, and the validation data would go missing unnoticed.

Mitigation added without a browser: the e2e suite now asserts that every field
name and every enum value the server actions read is present in the rendered
form. That catches the silent-drift failure. It does not catch a broken action
handler, which remains covered only by integration tests.

`D-05` classification: **IMPORTANT BUT NON-BLOCKING**. A minimal browser e2e
covering feedback submit, outcome submit and correction is recommended before
real use begins. Playwright was not installed, because installing it to satisfy
a checklist rather than a risk is how test suites become theatre.

## Provider status

`npm run provider:smoke` → `PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED`,
reason: `ANTHROPIC_API_KEY is not set`.

- ADR-21 **Gate A**: ACTIVE. Caps are enforced on the production path and the
  controller is closed when unconfigured.
- ADR-21 **Gate B**: OPEN.
- **REAL MODEL QUALITY VALIDATION: NOT READY.**
- **REAL MODEL COST VALIDATION: NOT READY.**

No external call has ever been made. Whether this blocks a Prospective
Validation Protocol depends on that protocol's scope: the deterministic
opportunity loop — which is the whole of Milestone 4 and 5 — needs no provider,
and could be validated first.

## Readiness matrix

| Validation question | Required observations | Available? | Quality | Limitation |
| --- | --- | --- | --- | --- |
| Was the intervention correct? | shown + `epistemic` | YES | good | needs the user to answer |
| Was it useful? | shown + `delivery` | YES | good | needs the user to answer |
| Was it already known? | `delivery = already_known` | YES | good | explicit only; never inferred |
| Was the timing appropriate? | `too_early` / `too_late` + `shown_at` | YES | adequate | measured from delivery, not from reading |
| How early could AVA have acted? | `change_detectable_at` → `opportunity_generated_at` | YES | good **after F-15** | depends on the user reporting real observation times |
| Did the user act? | `user_action` | YES | adequate | reported, not observed; `unknown` is common |
| What outcome followed? | `outcome` chain | YES | adequate | causality not established; `ambiguous` exists for that |
| Did memory stay correct? | cognition chain + `declaredCognitionAsOf` | YES | good | — |
| Did Context Health limit behaviour correctly? | `context_health` + gate results | YES | good | — |
| What did an intervention cost? | `model_run` | PARTIAL | untested | no real call has been made |
| How long did it take? | `latency_ms` | PARTIAL | untested | mock latencies only |
| Can serious misses be investigated? | candidates, suppressions, unraised changes | PARTIAL | limited | undeclared relations leave no trace |
| Can personalization lift be evaluated? | context, declarations, class, policies, feedback, outcome, timestamps | YES (data) | adequate | no ML, no feature vectors, no dataset built |

## Gaps

### BLOCKER FOR PROSPECTIVE VALIDATION

None outstanding. Two were found during this audit and fixed:

- **F-15** — manual capture could not record when something actually happened,
  making detection latency identically zero and anticipation unmeasurable.
- **F-16** — the telemetry constraint refused legitimately backdated reported
  observations, forcing the write time to stand in for the real one.

### IMPORTANT BUT NON-BLOCKING

- **Real provider verification.** Cost and latency instrumentation is complete
  and entirely unexercised. Blocks any protocol whose scope includes model
  quality or economics.
- **Browser-level e2e** for the feedback and outcome forms (D-05).
- **Undeclared relations are invisible**, so serious false negatives need human
  review rather than a query.
- **Reported timestamps depend on the user.** A person who dates everything
  "now" will produce a zero-latency record that looks excellent and means
  nothing. The `time_basis` column makes this detectable, not preventable.

### CAN DEFER

- `user_seen_at` (see below).
- Scheduled automatic backups; the manual path is tested.
- A richer export format; JSONL with a schema version is sufficient.
- Per-dimension feedback timestamps are derivable from the row set but are not
  surfaced separately in the read model.

## `user_seen_at` — recommendation

**Option A: Prospective Validation v0.1 does not use `user_seen_at`.**

Timing is measured from `opportunity_shown_at`, whose meaning is exact: *the
server marked this opportunity as delivered into a rendered checkpoint*. That
is a lower bound on exposure delay and an upper bound on anticipation.

Options B (explicit acknowledgement) and C (client visibility observation) were
considered and are not recommended now. B adds a click whose absence is
ambiguous — an unacknowledged item is not an unseen one, so it would replace a
known unknown with a plausible-looking wrong number. C requires client-side
tracking that ADR-22's local-first posture does not need and that a person
using this on their own work has not asked for.

`user_seen_at` therefore stays `UNOBSERVABLE IN CURRENT V0` — recorded as a
decision, not an omission. **Consequence:** any metric described as "time to
notice" is in fact "time to delivery", and must be labelled that way in the
protocol.

## Final readiness verdict

**READY WITH LIMITATIONS.**

The prospective evidence trail reconstructs end to end from records written at
the time, with no inference, no fabricated timestamp, no reading of current
state as a substitute for historical state, and no retroactive edit — verified
by AR-01 through AR-07 attempting each violation directly against the database.

The limitations are named above and are not defects to be worked around: the
absent real provider call, the invisibility of undeclared relations, the
dependence of reported timestamps on honest reporting, and `user_seen_at`.

Nothing in this document is a result about AVA. H-01 through H-06 remain
`NOT TESTED`, ADR-21 Gate B remains `OPEN`, and no Prospective Validation
Protocol exists.
