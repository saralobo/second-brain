# Slice 6 — Execution Log

```text
Slice: 6 (Feedback + Outcomes)
Status: COMPLETE
Date: 2026-08-31
Tasks: 8/8
Milestone 5: REACHED
External model calls: NONE — feedback never crosses the provider boundary
Architecture changes: NONE
ADR REQUIRED: none raised
```

Per-slice logs are the established pattern. The Implementation Plan has no
task-status field and is treated as immutable; nothing in it was rewritten.

## Task status

| ID | Status | Where |
| --- | --- | --- |
| `S6-T01` | COMPLETE | `packages/db/src/migrations/0008_feedback_and_outcome.sql` |
| `S6-T02` | COMPLETE | separate `epistemic` / `delivery` columns; no aggregate anywhere |
| `S6-T03` | COMPLETE | `artifact_verdict` enum, six values |
| `S6-T04` | COMPLETE | `packages/core/src/feedback/resolution.ts` |
| `S6-T05` | COMPLETE | `packages/app/src/feedback-service.ts`, `metrics-service.ts` |
| `S6-T06` | COMPLETE | `apps/web/app/feedback-forms.tsx`, Today, Why |
| `S6-T07` | COMPLETE | `SLICE_6_EVENTS`, `InterventionTimeline` |
| `S6-T08` | COMPLETE | `tests/golden/gs-08-intervention-loop.test.ts` |

## Invariants made structural

Enforced by the schema or by a function signature, not by convention:

- there is no aggregate column on `feedback` — no score, no rating, no reward;
- a feedback row must answer at least one dimension — `CHECK (epistemic IS NOT
  NULL OR delivery IS NOT NULL OR artifact_feedback IS NOT NULL)`;
- feedback and outcomes cannot be deleted — `DO INSTEAD NOTHING` on DELETE;
- `user_action` cannot be updated or deleted at all;
- only a `resolved` outcome may carry a resolution time —
  `CHECK ((state = 'resolved') = (resolved_at IS NOT NULL))`;
- an outcome must point at an opportunity or a DecisionRecord;
- no module under `core/opportunity` imports anything from `core/feedback`, so
  there is no path by which a verdict could reach a policy.

## Findings

- **F-11** — `impactedFrom` was written on the opportunity candidate in Slice 5
  and then hardcoded to `null` when reading the row back. It surfaced here
  because the intervention timeline looks up change events by the object the
  opportunity was raised about, and could never find them. The column was
  added in this migration and the read fixed. The Slice 5 tests did not catch
  it because nothing had read that field back yet.

- **F-12** — a correction erased verdicts it never mentioned. Marking the
  corrected row superseded and filtering it out of the projection meant that
  someone revising "was it useful?" silently lost their answer to "was it
  correct?". Supersession is now a history link only, and each dimension
  resolves to the most recent row that actually answered it. This also made
  reading an earlier instant correct for free.

- **F-13** — the `intervention` query pattern swallowed *"What is still
  unresolved?"*, a question about open work, and routed it to the feedback
  reader. The pattern now requires either an explicit feedback verb or a noun
  naming an intervention. Caught by an existing Slice 3 test, which is the
  outcome that test was written for.

- **F-14** — the feedback CLI completed its work and never exited: PGlite keeps
  the process alive, and a CLI that hangs is indistinguishable from one that
  failed. It stalled the Milestone 5 e2e `beforeAll` for four minutes before
  timing out. The database is now closed explicitly in a `finally`.

## Deviations

D-21 (migration `0008`) · D-22 (`intervention` query kind) · D-23 (grounding
recorded as not-applicable rather than as passed). Recorded in full in
`progress/slice-6-feedback-outcomes.md`.

## What is not claimed

- Nothing was learned from any feedback, and nothing was tuned by it. This is a
  boundary, not an omission.
- No hypothesis was tested. H-01 … H-06 remain `NOT TESTED`.
- ADR-21 Gate B remains `OPEN`. No real model call has been made.
- The counts in the read model come from synthetic scenarios. They are
  observations about test data and are not evidence about the product.
- No accuracy, usefulness or value claim is made anywhere in the code or the UI.
