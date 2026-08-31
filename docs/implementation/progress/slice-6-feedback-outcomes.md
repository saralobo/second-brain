# Slice 6 — Feedback + Outcomes

```text
Status: COMPLETE
Tasks: S6-T01 … S6-T08 (8/8)
Date: 2026-08-31
Milestone: 5 — Closed Intervention Loop, REACHED
External model calls: NONE — feedback never leaves this machine
Provider: mock only; Anthropic smoke NOT EXECUTED — no API key
Hypotheses: H-01 … H-06 ALL NOT TESTED
ADR-21 Gate B: OPEN
Learning: NONE — feedback is data, not policy
```

## Status

The observational loop closes. AVA can now record what a person thought of an
intervention, what they did about it, and how it ended — and can be asked to
read that record back.

It learns nothing from any of it. That is the point of the slice, not a gap in
it: there is no evaluation protocol yet, and a system that started tuning
itself on an unvalidated signal would be optimising for a number nobody has
justified.

Nothing here says the architecture works. No hypothesis has been tested, and
the counts this slice produces are observations, not results.

## Tasks

| ID | Task | Where |
| --- | --- | --- |
| `S6-T01` | Migration with `feedback` and `outcome` | `packages/db/src/migrations/0008_feedback_and_outcome.sql` (D-21) |
| `S6-T02` | Two dimensions in separate columns, no aggregate | `packages/core/src/feedback/types.ts`, schema columns |
| `S6-T03` | Artifact feedback — six states | `ARTIFACT_VERDICTS`, `artifact_verdict` enum |
| `S6-T04` | Outcome Resolution — four states, resolver + explicit review | `packages/core/src/feedback/resolution.ts` |
| `S6-T05` | Feedback/outcome ↔ Opportunity and DecisionRecord | `packages/app/src/feedback-service.ts`, `metrics-service.ts` |
| `S6-T06` | Feedback UI on Home and in Why | `apps/web/app/feedback-forms.tsx`, Today, `/why/opportunity/[id]` |
| `S6-T07` | `feedback_at`, `user_action_at`, `outcome_at` | `SLICE_6_EVENTS`, `InterventionTimeline` |
| `S6-T08` | GS-08 | `tests/golden/gs-08-intervention-loop.test.ts` |

## Milestone 5

```bash
npm run db:reset && npm run db:migrate
npm run db:seed -- --proactive --supersede
npm run today -- <workstreamId>                      # generates and delivers
npm run feedback -- give <opportunityId> correct valuable
npm run feedback -- action <opportunityId> reviewed "Reviewed and updated it."
npm run feedback -- history <opportunityId>
```

Or in the browser: Today → answer the two questions → open **Why** → record
what you did → the outcome resolves on the action. Why then shows what AVA
detected, when it showed it, what you thought, what you did and how it ended.

## Feedback dimensions

Three independent axes, three independently nullable columns, no aggregate.

| Epistemic — *was AVA right?* | Delivery — *did this deserve attention now?* |
| --- | --- |
| `correct` | `valuable` |
| `partially_correct` | `already_known` |
| `incorrect` | `irrelevant` |
| `not_verifiable` | `too_early` |
| | `too_late` |

`correct + already_known` is the combination that justifies the whole design:
AVA was right and added nothing. A single rating would have to call that a
success or a failure, and it is neither. `correct + too_late` and
`incorrect + valuable` are equally real and equally preserved.

A `NULL` means **NOT PROVIDED**. It is never counted, rendered or read as a
negative.

## Artifact feedback

`used_as_is` · `used_after_edit` · `not_used` · `not_shown` · `expired` ·
`replaced`

A third axis, not a substitute: `correct + valuable + used_after_edit` is a
valid row. Editing does not reveal why it was edited, so it says nothing about
correctness (baseline §23).

Using a prepared artifact proves it was used. It does not make its claims true,
and it does not turn the artifact into evidence — `content_origin` stays
`system`, and the self-poisoning protection survives the feedback loop.

## User actions

`reviewed` · `updated_artifact` · `made_decision` · `dismissed` · `other` ·
`unknown`

Separate from feedback, and separate from outcome. Thinking something was
valuable and acting on it are different observations, and neither is evidence
for the other. `unknown` is first-class: when an action is not observable, that
is what gets written down.

## Outcome Resolution

`resolved` · `unresolved` · `expired` · `ambiguous`

The resolver uses deterministic events where they exist and hands everything
else to a person. Silence produces `unresolved`, never resolution and never
rejection. A dismissal produces `ambiguous` — it ends AVA's involvement without
saying whether the underlying condition was dealt with.

Only `resolved` carries a resolution time, enforced by a CHECK constraint. An
outcome change writes a new row; `unresolved` at t1 stays readable after
`resolved` at t2, and `outcomeAt(history, t1)` reconstructs it.

## Timeline

| Timestamp | Available |
| --- | --- |
| `evidence_arrived_at` | yes |
| `change_detectable_at` | yes |
| `change_detected_at` | yes |
| `opportunity_generated_at` | yes |
| `opportunity_shown_at` | yes |
| `user_seen_at` | **no — deliberately** |
| `feedback_at` | when given |
| `user_action_at` | when recorded |
| `outcome_at` | when recorded |

`user_seen_at` was re-evaluated for this slice and remains unavailable. There is
still no client acknowledgement, and page render, response delivery and
`opportunity_shown` are all proxies rather than observations. Missing
timestamps are left missing; `anticipationWindowMs` returns `null` rather than
zero when an end is absent, because "we do not know" is not zero.

## Metrics read model

`interventionMetrics` returns counts and `{ numerator, denominator, basis }`
ratios — never a percentage. Derivable: total shown, correctness distribution,
delivery distribution, artifact distribution, outcome distribution, actions
recorded, prepared-and-used.

Every report carries `NOT_A_RESULT` verbatim. Nothing consumes it: no policy,
no ranking, no threshold reads this module.

## Why integration

Four new sections: **What you said** (both verdicts, kept apart, with the full
history including corrections), **What you did**, **How it ended** (with the
outcome chain), and **Timeline**. The generation snapshot above them is
unchanged, and the page states that it is written once and never rewritten.

## Chat integration

Answered locally from stored rows, deterministically, with no provider:

- *Which opportunities did I mark valuable?*
- *Which suggestions were correct but already known?*
- *Which opportunities remain unresolved?*
- *What happened after this opportunity?*

The answer reports facts in sequence and says so. It never claims that AVA's
suggestion caused what the user did next.

## Telemetry

`feedback_epistemic_recorded` · `feedback_delivery_recorded` ·
`artifact_feedback_recorded` · `feedback_corrected` · `user_action_recorded` ·
`outcome_recorded` · `outcome_updated`

One event per dimension actually answered. A blank dimension emits nothing,
because nothing was observed about it. There is no event for "the user ignored
this".

## Tests

| | |
| --- | --- |
| lint | `import boundaries: ok` |
| typecheck | exit 0 |
| unit + integration + golden | 353 passed, 35 files |
| e2e | 26 passed, 5 files |
| build:web | exit 0 |
| provider smoke | `READY — REAL CALL NOT EXECUTED` |

## Deviations

- **D-21** — migration numbered `0008`, not `0007`; `0007` was taken by Slice 5
  (itself D-17).
- **D-22** — a `QueryKind` of `intervention` was added so questions about the
  record are classified before `personal`. "Which suggestions did I mark
  valuable?" is a question about AVA's records, not about the user's
  preferences, and routing it through the personal path would have made a
  record of judgements look like a statement of taste.
- **D-23** — the intervention answer records `grounding_valid = null` rather
  than `true`. That check asks whether an answer stayed inside the Context
  Packet; this answer does not come from the packet at all, and claiming it
  passed a check that never ran would be worse than recording that it did not
  apply.

## Known limitations

- Nothing is learned. Policies, the Value Vector, attention order, thresholds,
  Declared Cognition and Behavioral Hypotheses are all untouched by feedback,
  and the briefing order is provably identical before and after.
- `user_seen_at` is unavailable, so anticipation cannot yet be measured from
  the moment of reading — only from the moment of delivery.
- Outcome causality is not established. A recorded action after a shown
  opportunity is a sequence, not a cause, and `ambiguous` exists for exactly
  this reason.
- The counts have no sample behind them. Every number in the read model comes
  from synthetic scenarios.
- Feedback notes are free text and are stored as `sensitive` by default. They
  are never sent anywhere, but they are not redacted either.

## Blockers for Slice 7

None. Slice 7 audits the coverage of what has been instrumented; every event
this slice emits corresponds to something that actually happened, and the two
timestamps that do not exist — `user_seen_at` and any inferred outcome — are
absent by decision and documented as such.
