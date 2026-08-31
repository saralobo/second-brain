# Slice 5 — Opportunity + Briefing

```text
Status: COMPLETE
Tasks: S5-T01 … S5-T15 (15/15)
Date: 2026-08-30
Milestone: 4 — Change to Attention, REACHED
External model calls: NONE — the opportunity engine is fully deterministic
Provider: mock only; Anthropic smoke NOT EXECUTED — no API key
Hypotheses: H-01 … H-06 ALL NOT TESTED
ADR-21 Gate A: ACTIVE on the production path
ADR-21 Gate B: OPEN
```

## Status

This is the first slice in which AVA speaks without being asked. A change to a decision now
reaches the work that depended on it, is weighed by three independent policies, and either
earns a place in Today or is recorded with the reason it did not.

Nothing here says the architecture works. No hypothesis has been tested, and the number of
opportunities generated is not a result — optimising that number is the failure mode the
baseline names.

## Tasks

| ID | Task | Where |
| --- | --- | --- |
| `S5-T01` | Migration with `value_vector jsonb` | `packages/db/src/migrations/0007_opportunity_and_checkpoint.sql` (D-17) |
| `S5-T02` | Thirteen factors, origin per factor, no scalar | `packages/core/src/opportunity/value-vector.ts` |
| `S5-T03` | Quality gates, separate from the policies | `packages/core/src/opportunity/gates.ts` |
| `S5-T04` | `unpropagated_decision` | `detect.ts` — `detectUnpropagatedDecision` |
| `S5-T05` | `upcoming_commitment` | `detect.ts` — `detectUpcomingCommitment` |
| `S5-T06` | `invalidated_work` | `detect.ts` — `detectInvalidatedWork` |
| `S5-T07` | `unresolved_question` | `detect.ts` — `detectUnresolvedQuestion` |
| `S5-T08` | `closing_risk` | `detect.ts` — `detectClosingRisk` |
| `S5-T09` | Three independent policies | `packages/core/src/opportunity/policies.ts` |
| `S5-T10` | Preparation bias guard | `evaluateShow` signature + distinct DecisionRecords |
| `S5-T11` | Filters + top-k, 3/block, 10/briefing | `packages/core/src/opportunity/attention.ts` |
| `S5-T12` | Home/Today, five blocks, empty and degraded states | `apps/web/app/workstreams/[id]/today/` |
| `S5-T13` | Manual checkpoint | `packages/db/src/repositories/checkpoint.ts`, `openCheckpoint`/`closeCheckpoint` |
| `S5-T14` | ADR-21 Gate A active in production | `prepareForOpportunity` → `BudgetController` |
| `S5-T15` | GS-02, GS-03, GS-07 | `tests/golden/gs-02-*.test.ts`, `gs-03-unresolved-question-opportunity.test.ts` |

## Milestone 4

```bash
npm run db:reset && npm run db:migrate
npm run db:seed -- --proactive --supersede
npm run today -- <workstreamId>          # or open /workstreams/<id>/today
```

Decision A → dependent proposal → architecture B replaces A → Change `superseded` → Impact
marks the proposal `outdated` → Opportunity *"Proposal based on architecture A may need
review"* → Show Policy `PASS` → Today. Why traces the whole chain. No provider is contacted
at any point.

## Opportunity types

Five, and the enum is what keeps a sixth from arriving as an implementation detail.

| Class | Trigger | Behaviour |
| --- | --- | --- |
| `unpropagated_decision` | a decision was superseded and a declared dependent has not been revised since | names the dependent, never asserts it is wrong |
| `upcoming_commitment` | a commitment falls due within a week **and** supporting work is unfinished | a date alone raises nothing |
| `invalidated_work` | a change of type `invalidated` with a declared dependent | *potentially* affected, never *definitively* invalid |
| `unresolved_question` | an open question that a change touched, or that blocks an approaching commitment | never invents an answer or closes the question |
| `closing_risk` | a risk whose recorded mitigation window is within a week | reports the window, does not predict the risk |

Every rule is deterministic over Current State, ChangeRecords and declared relations. A model
may one day phrase an opportunity; none may conjure one.

## Value Vector

Thirteen factors, recorded once, read by three policies. Each carries `value`, `origin`
(`deterministic` · `declared` · `rule` · `inferred`), `basis` and `derivedFrom`.

`alignment` · `consequence` · `timeSensitivity` · `evidenceStrength` · `contextHealth` ·
`novelty` · `actionability` · `effort` · `reversibility` · `permissionScope` ·
`preparationCost` · `dependencyReach` · `sensitivityRisk`

No scalar exists. There is no `score`, no `confidence`, no aggregate column in the schema, and
a test asserts that no factor value is a number. `novelty` is conservative by construction:
`already_known` requires an observation that supports it, and absent one the honest value is
`new` rather than a manufactured degree of interest.

## Policies

Independent, versioned (`POLICY_VERSION = 1.0.0`), and recorded on every DecisionRecord.

- **Investigate** — the most permissive; internal, costs no attention, and is how a `DEGRADED`
  context gets repaired. Stops at the security and permission gates.
- **Show** — spends a person's attention. Refuses on `already_known`, on no concrete next step,
  on no relation to what the user is pursuing, and on low consequence without time pressure.
- **Prepare** — the strictest. Requires reversible work, non-speculative evidence, `HEALTHY`
  context, budget authorisation and the absence of any declared autonomy limit.

**Show is structurally blind to preparation.** `evaluateShow(vector, gates)` has two parameters
and neither can carry preparation status; there is no code path through which sunk cost could
argue for attention. Preparing and showing write separate DecisionRecords.

## Attention

Filters, then top-k. Ordering is time sensitivity → consequence → evidence strength →
oldest-first → id. Three items per block, ten per briefing, enforced on the composed briefing.
Items that qualified but did not fit are listed with the reason rather than dropped.

No learned ranking, no bandit, no reward model, no preference vector.

## Home / Today

**What changed** · **Needs your attention** · **Open threads** · **AVA noticed** ·
**Prepared for you**

Every block states its own empty message. "Nothing needs your attention right now" is a
correct answer. When context is `DEGRADED` the gaps are shown above the blocks and items carry
a hedge; when `INSUFFICIENT` the page says AVA will not raise anything proactively.

## Briefing

One source of truth. The briefing is a composition over the same opportunities Today reads —
there is no second engine to disagree with the first. `deliver: false` renders without
stamping `shown_at`, so a preview cannot corrupt the latency timeline.

## Preparation

AVA can prepare one thing: a **review checklist**, assembled deterministically from the change,
the affected objects and the evidence behind them. It is written to AVA's own store and reaches
nothing outside — no e-mail, no message, no document edit, no calendar.

The model-assisted variant is asked for explicitly and refused explicitly: with no operational
cap configured the Budget Controller is closed, and the refusal plus the cheaper path taken
instead are both recorded in the DecisionRecord. No silent downgrade.

**Preparation quality is not validated.** It is a deterministic template, and no real provider
has produced anything.

## Why

For an opportunity: class, status, rule and rule version, triggering changes, objects reached
with relation/kind/depth, evidence with provenance, all thirteen factors with origin and basis,
every gate with its reason, all three policy verdicts with the factors each read, the
declarations that applied, the hypotheses that did not, and the generation snapshot.

No chain-of-thought, because none exists on this path.

## Cognition integration

A declaration in scope sets `permissionScope`, marks the factor `declared` and names the
declaration id. An `autonomy_limit` denies preparation; a `must_confirm_action` requires
confirmation first.

A behavioural hypothesis is carried on the generation row for inspection and is passed to no
policy. `evaluatePrepare` has no parameter for it. A declared limit on action is **not** a
limit on informing: AVA still says that a proposal rests on a decision that changed, because
that information belongs to the user.

## Context Health

Computed for the `opportunity_generation` task, with its own materiality set.

| State | Behaviour |
| --- | --- |
| `HEALTHY` | Show and Prepare may proceed on their own merits |
| `DEGRADED` | Show is allowed with the gap stated and reduced assertiveness; Prepare is blocked |
| `INSUFFICIENT` | the `context_health` gate blocks; the opportunity is recorded `suppressed` with its reason, and nothing is asserted |

Two dimensions are deliberately immaterial here — `expected_sources_available`, because
retrieval does not run on this path, and `artifacts_without_current_version`, because an
outdated artifact is the condition being reported rather than a gap in what AVA can see
(finding F-07).

## Telemetry

`opportunity_generated` · `opportunity_eligible` · `opportunity_suppressed` ·
`opportunity_shown` · `preparation_started` · `preparation_completed` · `preparation_denied` ·
`briefing_generated` · `briefing_shown` · `checkpoint_opened` · `checkpoint_closed`

`user_seen` remains unemitted and the writer rejects it. There is still no client-side
observability, and `shown` is not `seen`.

## Tests

| | |
| --- | --- |
| lint | `import boundaries: ok` |
| typecheck | exit 0 |
| unit + integration + golden | 299 passed, 32 files |
| e2e | 19 passed, 4 files |
| build:web | exit 0 |
| provider smoke | `READY — REAL CALL NOT EXECUTED` |

## Deviations

- **D-17** — migration numbered `0007`, not `0006`; `0006` was taken by Slice 4 (itself D-11).
- **D-18** — `artifact` added to `CAPTURE_TYPES`. It was already a State Object type with a
  full lifecycle but had no capture route, so the dependent artifact GS-02 requires could not
  be created.
- **D-19** — impact now moves a dependent **artifact** to `outdated` (new version, old one
  still readable) when its declared dependency is superseded or invalidated. This completes
  the GS-02 scenario Slice 2 opened, and is narrow: artifacts only, depth 1, declared relations
  only, and only when the artifact has not been revised since.
- **D-20** — a declared `autonomy_limit` blocks the Prepare Policy but not the permission gate,
  so it does not also silence Show.

## Known limitations

- Preparation is a deterministic template. Nothing about its usefulness has been tested.
- `novelty` cannot distinguish "the user already knows this" from "AVA has not shown it yet"
  beyond its own delivery record. Real `already_known` feedback arrives in Slice 6.
- Impact propagation is depth-limited and follows declared relations only. Anything the user
  did not declare is invisible, by design.
- Consequence and effort are rule-derived from the class and the number of objects involved.
  They are honest ordinals, not measurements.
- No opportunity has been shown to a real person about real work.

## Blockers for Slice 6

None. Slice 6 needs `opportunity.id` and `decision_record.id` as feedback and outcome targets;
both exist and are stable. No Slice 6 behaviour has been implemented — there is no feedback
column, no outcome table, no learning, and the policies are fixed and versioned.
