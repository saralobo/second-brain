# Slice 5 — Execution Log

```text
Slice: 5 (Opportunity + Briefing)
Status: COMPLETE
Date: 2026-08-30
Tasks: 15/15
Milestone 4: REACHED
External model calls: NONE — the opportunity engine is deterministic end to end
Architecture changes: NONE
ADR REQUIRED: none raised
```

Per-slice logs are the established pattern. The Implementation Plan has no task-status field
and is treated as immutable; nothing in it was rewritten.

## Task status

| ID | Status | Where |
| --- | --- | --- |
| `S5-T01` | COMPLETE | `packages/db/src/migrations/0007_opportunity_and_checkpoint.sql` |
| `S5-T02` | COMPLETE | `packages/core/src/opportunity/value-vector.ts` |
| `S5-T03` | COMPLETE | `packages/core/src/opportunity/gates.ts` |
| `S5-T04` | COMPLETE | `detectUnpropagatedDecision` |
| `S5-T05` | COMPLETE | `detectUpcomingCommitment` |
| `S5-T06` | COMPLETE | `detectInvalidatedWork` |
| `S5-T07` | COMPLETE | `detectUnresolvedQuestion` |
| `S5-T08` | COMPLETE | `detectClosingRisk` |
| `S5-T09` | COMPLETE | `packages/core/src/opportunity/policies.ts` |
| `S5-T10` | COMPLETE | `evaluateShow` signature; separate DecisionRecords in `preparation-service.ts` |
| `S5-T11` | COMPLETE | `packages/core/src/opportunity/attention.ts` |
| `S5-T12` | COMPLETE | `apps/web/app/workstreams/[id]/today/`, `apps/web/app/why/opportunity/[id]/` |
| `S5-T13` | COMPLETE | `packages/db/src/repositories/checkpoint.ts` |
| `S5-T14` | COMPLETE | `prepareForOpportunity` → `BudgetController`, tested both ways |
| `S5-T15` | COMPLETE | `tests/golden/gs-02-invalidated-artifact.test.ts`, `gs-03-unresolved-question-opportunity.test.ts`, `gs-05-insufficient-context-blocks-proactivity.test.ts` |

## Invariants made structural

Enforced by the schema or by a function signature, not by convention:

- `opportunity_generation` is append-only — `DO INSTEAD NOTHING` on UPDATE and DELETE, so an
  opportunity cannot be re-judged later with information that arrived afterwards;
- an opportunity cannot exist without evidence — `CHECK (jsonb_array_length(origin_evidence_ids) > 0)`;
- `opportunity.content_origin` and `prepared_artifact.content_origin` are pinned to `system`
  by CHECK, so neither can be readmitted as independent evidence;
- `opportunity_class` is an enum of exactly five values;
- there is no aggregate column anywhere — the Value Vector is stored whole;
- `evaluateShow` takes the vector and the gates and nothing else, so preparation status has no
  route into the show decision;
- `evaluatePrepare` has no parameter for a behavioural hypothesis;
- `attachDecisionRecord()` throws: a rationale attached after the fact is a fabricated one.

## Findings

- **F-07** — Context Health made the engine mute. Wiring `expected_sources_available` and
  `artifacts_without_current_version` into the proactive materiality set produced
  `INSUFFICIENT` on every run: the first measures a retrieval that does not happen on this
  path, and the second counts outdated artifacts, which is exactly the condition an
  `unpropagated_decision` reports. AVA would have declared herself unfit to raise the thing she
  had just detected. Both were removed from the proactive set, with the reasoning recorded in
  `OPPORTUNITY_GENERATION_DIMENSIONS`.

- **F-08** — a declared autonomy limit silenced Show. Driving the permission gate from
  `permissionScope = not_allowed` meant "never draft anything for me unasked" also stopped AVA
  from *telling* the user their proposal rested on a decision that changed. A limit on action
  became a limit on honesty. The limit now binds in the Prepare Policy only (D-20).

- **F-09** — opportunity identity depended on the path taken to reach an object. The
  `unresolved_question` rule could reach one commitment along two relations and write it twice
  into the identity key, so the same condition produced a new opportunity at the next
  checkpoint. Fixed by deduplicating affected objects in both the rule and `identityKeyFor`.

- **F-10** — `markStatus` sent an unused parameter to PGlite on non-timestamped transitions,
  which failed with *could not determine data type of parameter $3*. It surfaced only on the
  supersession path, which is the one that matters least often and is hardest to notice.

## Deviations

D-17 (migration `0007`) · D-18 (`artifact` capture type) · D-19 (impact marks a dependent
artifact `outdated`) · D-20 (autonomy limit binds Prepare, not the permission gate). Recorded
in full in `progress/slice-5-opportunity-briefing.md`.

## What is not claimed

- No hypothesis was tested. H-01 … H-06 remain `NOT TESTED`.
- ADR-21 Gate B remains `OPEN`. No real model call has been made.
- The golden scenarios are synthetic. They show the code does what it was written to do and
  say nothing about whether the product thesis holds.
- The number of opportunities generated is not a result and is not reported as one.
