# Slice 3 Provider Gate v0.1

```text
Status: PENDING
Date: 2026-08-30
Architecture baseline: Architecture Package v0.2 Final (tag architecture-v0.2-final)
Governing decisions: ADR-21, ADR-22
Batch 1: ACCEPTED
Slice 3: NOT STARTED
External model calls to date: NONE
Provider selected: NONE
```

This document reviews Batch 1 against the Implementation Plan and prepares the gate that
ADR-22 requires before any real content crosses the provider boundary.

**It selects no provider and sets no cap.** Both require input this repository does not
contain.

---

## Part 1 — Batch 1 review

### Verdict

`BATCH 1 ACCEPTED`

Verified against the repository, not against the completion report. Executable checks
re-run at review time:

| Check | Result |
| --- | --- |
| `npm run lint` (import boundaries) | pass |
| `npm run typecheck` | exit 0 |
| `npm test` | **74 passed**, 10 files |
| `npm run build:web` | exit 0 |
| `npm run test:e2e` | **4 passed** |
| `git status` | clean |
| Migrations from zero | `0001`, `0002`, `0003` applied |

### Task audit

| Slice | Tasks | Verified |
| --- | --- | --- |
| S0 | `S0-T01`…`S0-T13` | 13/13 — workspace, boundaries lint, Next shell, local Postgres, migration runner, primitives, harness, redacting logger, provider contract + mock, budget skeleton, `validation_event`, fixtures, CI |
| S1 | `S1-T01`…`S1-T13` | 13/13 — migration `0002`, append-only rules, ten capture types, three-plane quarantine, repositories, actions, capture UI, workstream UI, `evidence_arrived`, injection test, seed + reset, E2E |
| S2 | `S2-T01`…`S2-T12` | 12/12 — migration `0003`, lifecycles, supersession, projector, detection stages 1–4 and 6, relationships and impact, change telemetry, workstream UI, GS-01 |

### Invariant verification

| Invariant | Evidence in the repository |
| --- | --- |
| **`packages/core` has no I/O** | no import of `node:*`, `@ava/*`, `pg` or `next` in `packages/core/src`; `scripts/lint-boundaries.mjs` fails the build otherwise |
| **Evidence append-only** | `evidence_no_update` / `evidence_no_delete` rules in `0002`; `EvidenceRepository` exposes only `append` and reads; integration test issues a raw `UPDATE` and `DELETE` and asserts the content survives |
| **Provenance preserved** | `content_origin`, `lineage`, `source_record_id`, `observed_at` and sha256 `hash` are `NOT NULL` on every evidence row; a test asserts the hash matches the stored content |
| **Quarantine enforced** | `packages/ingestion` imports neither `@ava/db` nor `@ava/llm`, enforced by lint; four hostile payloads (instruction override, fake system prompt, injected markup, SQL injection) are stored as data and change no state or schema |
| **Current State reconstructible** | `projectCurrentState` is pure; `canonicalise` comparison proves two rebuilds are byte-identical; the projection holds no state of its own |
| **Supersession historical** | earlier versions keep wording, evidence and timestamps; `markSuperseded` refuses an already-superseded version; a test reads the original evidence after supersession |
| **Change deterministic-first** | `detectChange` runs stages 1→4 then abstention; `stage5_semantic` exists in the type union with **no code path**; a test asserts the detector is never `stage5_semantic` |
| **No Work Graph** | relations are rows in `relationship`, traversed to an explicit depth; a test asserts `pg_extension` contains no `vector` |
| **No external model calls** | no provider SDK in `node_modules` or `package.json`; no `fetch` to any external host in `packages` or `apps/web/app`; the budget controller refuses every call while caps are unset |

### Regressions and blockers found

`NONE`

No regression. Two **dormant items** were found — neither is wrong today, and neither
blocks Slice 3, but both need attention before the code that would rely on them:

**F-01 — `evidence_annotation` has no code path.** The satellite table exists and is
append-only, but nothing writes or reads it. Its purpose is to let `workstream_id`,
`entity_refs` and `sensitivity` evolve while the evidence row stays literally immutable.
Today those fields are only ever set at insert, so the gap is invisible. The moment any
code needs to reclassify evidence — and **sensitivity reclassification is exactly what
the provider boundary will need** — reads must go through the latest annotation rather
than the base row. If that is missed, a re-classified `restricted` item would still
present as `normal` at the boundary.
→ Recorded as a required condition below, not as a Batch 1 defect.

**F-02 — no provider registry.** "The mock provider is the only registered provider" is
currently true because no other implementation exists and the lint forbids importing a
provider SDK outside `packages/llm/src/providers/`. That is adequate enforcement now, but
there is no single place that will refuse to hand out a real provider while the gate is
open. Slice 3 should introduce one, so the gate is enforced by code rather than by the
absence of code.

### Deviation classification

Per the Batch 1 execution log. Accepted choices are not altered.

| ID | Deviation | Classification | Reasoning |
| --- | --- | --- | --- |
| **D-01** | npm workspaces instead of pnpm | `ACCEPT FOR V0` | package manager only; no architectural surface; substituting back is a `package.json` change |
| **D-02** | Embedded PGlite as default local runner | `ACCEPT FOR V0` · **`REVISIT BEFORE PROSPECTIVE VALIDATION`** | genuine PostgreSQL 18.3, same SQL, same migrations, and it strengthens ADR-22 local-first. What must be revisited is **durability**: prospective validation depends on a longitudinal record surviving months, and today there is no backup or export path. The technology is accepted; the absence of a backup is what needs a decision |
| **D-03** | Hand-written SQL migrations instead of Drizzle | `ACCEPT FOR V0` | the plan's stated reason for Drizzle was readable SQL with no magic over the schema; rewrite rules, the anti-retroactivity `CHECK` and generated `tsvector` columns are not expressible in an ORM schema, so adding one would have created a second source of truth for the very thing that guarantees auditability |
| **D-04** | `packages/app` added for use cases | `ACCEPT FOR V0` | required to keep `apps/web` free of domain logic and the vertical slice testable without Next.js; `core` remains pure and the new package is covered by the boundary lint |
| **D-05** | E2E asserts server-rendered HTML instead of driving a browser | `ACCEPT FOR V0` · **`REVISIT BEFORE PROSPECTIVE VALIDATION`** | correct for server components. The first thing it cannot cover is `S3-T11`, the streaming chat UI, which is genuinely interactive. Streaming correctness is not merely cosmetic here: a truncated or mis-ordered stream can present an ungrounded fragment as an answer |
| **D-06** | `evidence_annotation` satellite table | `ACCEPT FOR V0` | implemented exactly as the plan described. See **F-01**: it needs a read path before any reclassification happens |

**`MUST FIX BEFORE SLICE 3`: none.**

---

## Part 2 — Provider gate

### 1. Provider selection

**`PROVIDER DECISION REQUIRES EXTERNAL VERIFICATION`**

No provider is recommended. The repository contains nothing that could settle the choice,
and the deciding criteria — retention policy, training-data policy, the ability to
disable both, regional processing, and current pricing — are exactly the facts that
change without notice and that this assistant's knowledge cannot be trusted to hold
current. Choosing on unverified recollection would be the same failure the deferred
retrospective sprint avoided: an authoritative-looking decision resting on data nobody
checked.

#### Candidates worth evaluating

Four shapes, not four brands. The shape matters more than the vendor, because ADR-22
makes the boundary — not the model — the architectural object.

| # | Shape | Why it is on the list |
| --- | --- | --- |
| **A** | Direct first-party API from a frontier lab | best structured-output and grounding behaviour available; simplest abstraction; policy is set by one party |
| **B** | Enterprise/cloud reseller of the same models (e.g. a cloud vendor's managed endpoint) | usually offers contractual retention and regional processing guarantees that the direct API may not; costs a heavier SDK and more configuration |
| **C** | **Local / self-hosted open-weights model** | the boundary is never crossed at all: no retention question, no training question, no per-call cost. Directly serves ADR-22 local-first. Pays for it in capability, which matters most for grounding-heavy work |
| **D** | Aggregator/gateway in front of several providers | eases switching, but inserts a third party into the data path — which multiplies the policy questions rather than answering them |

**Shape C deserves explicit consideration rather than dismissal.** AVA V0 is a single
user, micro-batch, with small context packets. If a local model can meet the grounding
and structured-output bar, the entire provider gate collapses into a non-question and
ADR-21's cost gate becomes trivial. Whether it can meet that bar is an empirical
question, not one to settle by reputation.

#### Comparison matrix

Rows are what actually matters to AVA V0. Popularity is not a criterion and does not
appear.

| Criterion | Why it matters here | Status |
| --- | --- | --- |
| Structured output / schema adherence | `S3-T07` validates output against a versioned schema and rejects it on failure; a provider that cannot reliably emit valid JSON turns rejection into the normal path | `EXTERNAL VERIFICATION REQUIRED` — needs measurement, not marketing claims |
| Streaming | only `S3-T11` needs it; nothing else does | `EXTERNAL VERIFICATION REQUIRED` |
| Usage reporting (input/output tokens) | ADR-21 Gate A requires token accounting on **every** call; a provider that does not report usage makes the budget controller unenforceable | `EXTERNAL VERIFICATION REQUIRED` — including whether usage is reported on **errors and partial streams** |
| Model/version identification | `ModelRun` and `DecisionRecord` must pin the exact version, or replay and the Competence Store are meaningless | `EXTERNAL VERIFICATION REQUIRED` — specifically whether a stable, dated version identifier is returned, not an alias that silently moves |
| Timeout / retry support | `ModelProvider` declares both; retries are capped by ADR-21 | `EXTERNAL VERIFICATION REQUIRED` |
| **Data retention policy** | ADR-22 requires this to be consultable in code as `policyMetadata` | `EXTERNAL VERIFICATION REQUIRED` — retention window, and what is retained |
| **Training / data-use policy** | baseline §28 forbids third-party training on this data without explicit opt-in | `EXTERNAL VERIFICATION REQUIRED` |
| **Ability to disable retention/training** | determines whether CLASS 2 content may cross at all | `EXTERNAL VERIFICATION REQUIRED` — whether it is available on the plan in question, not merely on some enterprise tier |
| Regional / data-locality implications | where processing physically happens; relevant to third-party work content | `EXTERNAL VERIFICATION REQUIRED` |
| Pricing for the expected V0 workload | ADR-21 caps cannot be set as numbers without it | `EXTERNAL VERIFICATION REQUIRED` — per-million input and output tokens for the specific model |
| SDK / API maturity | affects the adapter only, never the domain | assessable once candidates are named |
| Ease of provider abstraction | the `ModelProvider` contract already exists and is small; a provider needing more than it offers is a warning sign | assessable at adapter time |
| Grounding-heavy task support | AVA's answers must cite evidence ids present in the input and must abstain otherwise. This is the single most important criterion | `EXTERNAL VERIFICATION REQUIRED` — best settled by running the `S3-T13` evals against candidates |
| Developer ergonomics | lowest weight; it affects one adapter file | — |

#### What must be verified before deciding

Nothing below can be answered from this repository or from recollection:

1. current retention policy and retention window per candidate;
2. whether submitted content is used for training, and how to opt out;
3. whether retention/training opt-out is available on the plan actually in use;
4. region of processing and whether it can be pinned;
5. current per-token pricing, input and output, for the specific model;
6. whether token usage is reported on failed and partially streamed calls;
7. whether a stable dated model version identifier is exposed;
8. structured-output reliability, measured — ideally by running `S3-T13` evals against
   the shortlist before committing.

Item 8 is the one worth spending real effort on. Items 1–7 are lookups; item 8 is the
only one that predicts whether AVA's grounding requirement can actually be met.

---

### 2. Model archetypes required for Slice 3

Only what `Chat + Retrieval` needs. Nothing is defined here for the Target Architecture.

#### `state_query_answer` — Grounded Answer Generation

| Field | Definition |
| --- | --- |
| **Purpose** | answer a question about the workstream from the Context Packet |
| **Required capabilities** | structured output against a versioned schema; instruction adherence for citation discipline; no tool use; no streaming requirement for correctness |
| **Expected input size** | small. A Context Packet for one workstream: current state entries, recent changes, applicable evidence excerpts, contradictions and known gaps. Bounded by `filters + top-k`, not by the ledger |
| **Structured output** | required. `{ answer, evidence_ids[], abstained, unresolved_gaps[] }` validated in code |
| **Evidence constraint** | every `evidence_id` in the output must be present in the input. Verified **in code**, not requested in the prompt — an invented id rejects the whole response |
| **Fallback** | retry within the ADR-21 retry cap → fallback model if configured → abstain |
| **Abstention** | first-class. Required when Context Health is `INSUFFICIENT`, when retrieval is empty, and when the provider itself abstains. Abstention is recorded in the `DecisionRecord` and is a correct outcome, never an error to be hidden |

#### `explanation` — Decision Record rendering

| Field | Definition |
| --- | --- |
| **Purpose** | turn a `DecisionRecord` into readable prose |
| **Required capabilities** | structured output; strict input confinement |
| **Expected input size** | very small — the serialised `DecisionRecord` **only** |
| **Structured output** | required |
| **Constraint** | receives the `DecisionRecord` and nothing else. Restricting the input is more reliable than instructing a model not to invent reasons (baseline §22: an explanation may not add a reason absent from the record) |
| **Fallback** | render the `DecisionRecord` fields directly, without a model. This path must exist anyway for the **Why** surface (`S3-T12`), which has no model in it at all |
| **Abstention** | falls back to the deterministic rendering rather than abstaining |

**Not defined, and not to be added:** `semantic_change_interpretation` is a Slice 2
concern that Batch 1 deliberately left unimplemented, and Slice 3 does not need it — no
Slice 3 flow requires reinterpreting a change. Introducing it here would put a model into
the change path, which the deterministic-first cascade exists to prevent.

**Explicitly excluded:** model debate, learned router, ensemble, reward model, fine-tune.

---

### 3. Data classification

Built on the sensitivity model already implemented — `normal | sensitive | restricted` —
combined with `content_origin` (`user | third_party | source_system | system`). **No new
vocabulary is introduced**; these classes are a derived view over fields that exist.

| Class | Definition | Derived from | Boundary rule |
| --- | --- | --- | --- |
| **CLASS 0** | Synthetic / development data | seeded fixtures, `Project Alpha` | may cross freely. Used for adapter development and evals |
| **CLASS 1** | User-authored ordinary content | `content_origin = user` **and** `sensitivity = normal` | may cross **when necessary for the task** and only under an accepted provider policy |
| **CLASS 2** | Third-party or work-context content | `content_origin = third_party` or `source_system`, or `sensitivity = sensitive` | requires minimization and redaction, **and** a provider policy that permits it. Third-party content is never turned into a behavioural profile (baseline §28) |
| **CLASS 3** | Restricted | `sensitivity = restricted` | **must not cross the boundary in V0.** Handle locally and deterministically, ask the user, or abstain |

Two consequences worth stating plainly:

- **`system`-origin content is never sent as evidence.** It cannot corroborate anything
  (baseline §11), so including it in a Context Packet would inflate apparent support
  without adding any.
- Classification is evaluated **per evidence item at selection time**, not per workstream.
  One CLASS 3 item does not block a whole answer; it is excluded, and its exclusion is
  reported as a known gap in the Context Packet — without revealing the withheld content.

**Depends on F-01:** classification must read the latest `evidence_annotation`, not the
base evidence row, or a reclassified item will be evaluated at its original sensitivity.

---

### 4. Provider boundary pipeline

Mandatory for every external call. No call may bypass any stage.

```text
Retrieval                    lexical, scoped by workstream and task
    ↓
Evidence selection           top-k after filters; nothing "just in case"
    ↓
Sensitivity classification   per item, via latest annotation (F-01)
    ↓
Minimization                 drop everything the task does not need
    ↓
Redaction                    remove third-party identifiers and secrets
    ↓
Provider policy gate         does this provider's policy permit this class?
    ↓
Budget gate                  ADR-21 caps; refuses when unconfigured
    ↓
ModelRun created             written BEFORE the call, so a crash leaves a trace
    ↓
External call                with timeout and capped retries
    ↓
Structured validation        schema; failure is rejection, never repair
    ↓
Grounding validation         every evidence_id must be present in the input
    ↓
Response                     or abstention, recorded in the DecisionRecord
```

Two ordering choices are deliberate:

- **`ModelRun` is created before the call, not after.** A call that crashes or times out
  must still leave a record; writing it afterwards loses exactly the failures that
  ADR-21 Gate B will need to measure.
- **The budget gate sits after the policy gate.** A call that policy forbids should never
  consume budget headroom, even notionally.

The pipeline must be a single function that the adapter cannot be called around. If a
second code path can reach the provider, the boundary is documentation rather than
architecture.

---

### 5. Redaction readiness

**`IMPLEMENTATION REQUIRED BEFORE FIRST REAL CALL`**

| Element | State |
| --- | --- |
| Logging redaction | **exists** — `redact()` in `packages/telemetry/src/logging.ts` strips content-bearing keys, reduces free strings to a length, preserves ids and counts; four tests, including one asserting captured text cannot reach the log |
| Log sink | **safe** — local logger, disabled unless `AVA_LOG=1`, no external exporter configured |
| Sensitivity model | **exists** — three levels, `NOT NULL` on evidence, propagated to state versions |
| **Payload redaction / minimization for provider calls** | **absent** — nothing exists. `redact()` is for logs and is the wrong shape for this job: it destroys content, whereas a Context Packet must *preserve* the content that is allowed to cross while removing what is not |
| **Record of which evidence ids were sent** | **absent** — `ModelRun` does not exist yet (see §6) |
| Raw sensitive data in logs | **cannot occur today** — no provider call exists, and the logger redacts |

Required before the first real call, none of it implemented here:

1. a minimization function that reduces a Context Packet to the fields the archetype needs;
2. a redaction function for third-party identifiers, distinct from the logging redactor;
3. a policy gate that refuses CLASS 3 and checks CLASS 2 against `policyMetadata`;
4. persistence of the exact `evidence_ids` transmitted, on the `ModelRun`;
5. tests proving a CLASS 3 item never reaches the payload.

**Gap in the Implementation Plan, recorded not fixed:** the plan's Slice 3 task list has
no task for this pipeline. `S3-T15` is the gate checklist, not the implementation. This
needs a task before Group B work begins. The plan is authoritative and is not rewritten
here.

---

### 6. ModelRun readiness

**`IMPLEMENTATION REQUIRED BEFORE FIRST REAL CALL`**

`ModelRun` is planned as part of migration `0004` (`S3-T01`) and written in `S3-T10`.
Batch 1 correctly did not build it. Current state:

| Field | State |
| --- | --- |
| provider · model · model version | absent — `ModelProvider.id` carries a composite identifier the adapter can split |
| prompt id · prompt version | absent — `PromptRegistry` is `S3-T06` |
| **evidence ids sent** | absent — required by ADR-22 step 4, and by grounding validation |
| input / output tokens | partially — `Usage` type exists on the provider contract; nothing persists it |
| latency | absent |
| cost | absent — `Usage.costUsd` exists on the contract |
| status · error · fallback | absent |
| purpose / archetype | absent — `TaskArchetype` type exists |
| retry count | absent |
| redaction applied | absent |
| **table** | **does not exist** — only a nullable `model_run_id` FK column on `validation_event`, awaiting it |

**Do not invent fields the provider does not supply.** Two in particular:

- **Cost** is usually derived locally from tokens and a price table, not returned. The
  price table must be versioned and dated, and a `ModelRun` must record which price
  version produced its cost figure — otherwise a later price change silently rewrites
  the history that ADR-21 Gate B will read.
- **Token usage on failures** may be unavailable. Where it is, record it as `unknown`
  rather than zero. Zero is a claim; unknown is the truth.

---

### 7. Operational safety caps

ADR-21 requires caps before the first real call. These are **`OPERATIONAL SAFETY CAPS`,
not `PRODUCT VALIDATION THRESHOLDS`**: a cap being hit means the limit worked, and says
nothing about whether the product passed the economic gate. Gate B remains open.

The controller is already **closed** when unconfigured — with no cap set, no external
call is authorised. So the risk here is not omission; it is setting a number for the
wrong reason.

Workload shape, from the repository rather than from assumption: a single user, manual
capture, micro-batch at explicit checkpoints, small Context Packets, on-demand chat.
Volume is bounded by how often one person asks questions.

| Cap | Option A — conservative | Option B — moderate | Option C — permissive | Recommendation |
| --- | --- | --- | --- | --- |
| **Per call** | tightly bounded; a single unusually large packet is refused | headroom for a large packet | effectively unbounded per call | **A.** In V0 an outsized single call almost always means a packet that was not minimized. Refusing it surfaces a bug rather than paying for it |
| **Per checkpoint** | one or two calls' worth | a handful of calls | unbounded within the day | **B.** A checkpoint legitimately fans out over several items; too tight a cap turns normal use into a failure |
| **Daily** | interrupts a heavy day of use | absorbs a heavy day | rarely binds | **B.** The daily cap is the one that catches a runaway loop. It should bind on a genuinely abnormal day, not on an intense one |
| **Monthly** | binds before the daily cap in a normal month | roughly the daily cap times working days | rarely binds | **A or B.** The monthly cap is the real spend ceiling and is the most personal of the five |
| **Retries per call** | 0 | 1 | 2+ | **B — one retry.** A schema failure often succeeds on a second attempt; beyond that it is a prompt or schema defect, and retrying is paying to repeat a bug |
| **Hard stop** | abort, record the refusal, tell the user, write nothing partial | — | degrade to a smaller model | **Abort.** Silent degradation to a cheaper model would change what produced an answer without recording why, and the `DecisionRecord` would misstate the run |

**`OWNER DECISION REQUIRED` — the five absolute amounts.**

They cannot be derived here for two independent reasons: per-token pricing is
`EXTERNAL VERIFICATION REQUIRED`, and how much money is acceptable per month is a
personal economic preference that no analysis in this repository can supply.

A method for setting them once pricing is verified, offered as a starting point and not
as a recommendation about amounts:

1. measure a representative Context Packet's token count against a real archetype;
2. compute the cost of one typical call at verified prices;
3. set **per call** at roughly two to three times that, so a normal call never trips it;
4. set **per checkpoint** at the number of calls one checkpoint should ever justify;
5. set **daily** at a heavy but plausible day;
6. set **monthly** independently — as the amount that is acceptable to lose if the
   product turns out not to work, since at this stage that remains a real possibility.

Step 6 is the one that should not be back-derived from the daily cap. It is the only cap
that answers a question about the project rather than about the software.

---

### 8. Failure behaviour

Preference order throughout: deterministic or local fallback → limited retry → abstain.
**A response is never fabricated to preserve the experience.**

| Failure | Behaviour |
| --- | --- |
| Provider unavailable | deterministic surfaces keep working (workstreams, state, changes, **Why**); chat states plainly that the answering model is unavailable; `ModelRun` records the failure |
| Timeout | one retry within the ADR-21 cap, then abstain; both attempts recorded |
| Invalid structured output | **reject, never repair.** Retry once; on a second failure abstain and record. A repaired output is a fabricated one |
| Budget exceeded | hard stop. Operation aborted, nothing partially written, user told which cap was reached — and told that this is an operational limit, not a verdict about the product |
| Sensitivity disallows the call | no external call. Answer from deterministic data if possible, otherwise ask the user, otherwise abstain. The refusal is recorded in the `DecisionRecord` with the reason, never silently |
| Context Health `INSUFFICIENT` | abstain **before** calling the provider. Spending money to answer a question the context cannot support is the worst of both outcomes |
| Retrieval empty | "I have no evidence about this" — a complete and correct answer. No model call |
| Grounding validation fails | discard the response, abstain, record the failure as an eval signal. A response citing an evidence id that was not in the input is precisely the failure mode grounding validation exists to catch |

The shared pattern: **degrade by naming what is missing.** Every one of these paths is
also a `DecisionRecord` with a stated reason, so a later reader can tell an abstention
from an outage from a policy refusal.

---

### 9. Mock to real provider transition

Requirements, all already satisfied structurally by Batch 1:

- **`packages/core` never imports a provider SDK.** Enforced by the boundary lint, which
  fails the build on any provider SDK import outside `packages/llm/src/providers/`.
- The real adapter lives at `packages/llm/src/providers/<name>.ts`, implementing the
  existing `ModelProvider` contract. No other layer changes.
- `policyMetadata` on the adapter carries the verified retention, training and region
  facts, making the policy gate a code check rather than a remembered fact.

Introduce a **provider registry** (see **F-02**) as the single place that hands out a
provider, so that while the gate is open the registry returns the mock and refuses to
construct a real adapter. That turns "no real call has been made" from an observation
into an enforced property.

`MockModelProvider` remains permanently available for tests, fixtures, offline
development, and deliberate failure scenarios — including the abstention and
schema-failure paths, which are easier to exercise deterministically than against a real
model.

---

### 10. Slice 3 start conditions

#### Required before Slice 3 coding can begin

| # | Condition | Status |
| --- | --- | --- |
| 1 | Batch 1 accepted | ✅ done, this document |
| 2 | Migrations `0001`–`0003` applied and green from zero | ✅ verified |
| 3 | Boundary lint, typecheck and tests passing | ✅ verified |
| 4 | Mock provider available | ✅ exists |

**`NONE` outstanding.** Provider-independent Slice 3 work may begin.

#### Required before the first REAL external model call

| # | Condition | Status |
| --- | --- | --- |
| 1 | Provider selected | ❌ `PROVIDER DECISION REQUIRES EXTERNAL VERIFICATION` |
| 2 | Retention policy verified | ❌ external |
| 3 | Training/data-use policy verified | ❌ external |
| 4 | Retention/training opt-out confirmed available on the plan in use | ❌ external |
| 5 | Data classes permitted and forbidden decided per provider | ❌ depends on 2–4 |
| 6 | Minimization and redaction pipeline implemented | ❌ `IMPLEMENTATION REQUIRED` (§5) |
| 7 | Operational safety caps configured | ❌ `OWNER DECISION REQUIRED` (§7) |
| 8 | `ModelRun` logging working, written before the call | ❌ `IMPLEMENTATION REQUIRED` (§6) |
| 9 | Provider registry refusing real adapters while the gate is open | ❌ **F-02** |
| 10 | `evidence_annotation` read path, so classification sees reclassification | ❌ **F-01** |

Until every row is satisfied, **`MockModelProvider` only**, and no real content crosses
the boundary.

---

### 11. Recommended Slice 3 boundary

Tasks classified, not rewritten.

#### Group A — provider-independent · may proceed now with the mock

| ID | Task |
| --- | --- |
| `S3-T01` | migration `0004` — `context_health`, `decision_record`, `model_run` |
| `S3-T02` | lexical retrieval over FTS |
| `S3-T03` | Context Packet assembly, including counter-evidence and gaps |
| `S3-T04` | Context Health — ten dimensions, aggregated per task |
| `S3-T05` | downstream gates for `DEGRADED` and `INSUFFICIENT` |
| `S3-T06` | versioned prompt registry |
| `S3-T08` | abstention as a first-class outcome |
| `S3-T09` | `DecisionRecord` for evidence selection |
| `S3-T12` | **Why** surface — no model in the path by design |
| `S3-T14` | GS-05 — insufficient context produces abstention |

`S3-T14` belongs here on purpose: the abstention it tests is triggered by Context Health,
which is deterministic. It needs no model to be a valid test — and a system that abstains
correctly without a provider is exactly what should be verified first.

#### Group B — requires the provider gate

| ID | Task |
| --- | --- |
| `S3-T15` | the provider gate checklist itself |

Plus the **unassigned work identified in §5**: the minimization, redaction and policy-gate
pipeline, which the plan's task list does not currently name.

#### Group C — buildable against the mock, closable only after a controlled real call

| ID | Task | Why it cannot close on the mock |
| --- | --- | --- |
| `S3-T07` | `state_query_answer` with schema and evidence constraint | the constraint must be proven against a real model that can invent an id; a mock returns whatever it was handed |
| `S3-T10` | `ModelRun` written always, including on failure | real usage, latency, cost and failure shapes are needed to know the record is complete |
| `S3-T11` | chat UI with streaming | streaming behaviour is a property of the real transport |
| `S3-T13` | LLM evals — schema, grounding, unsupported assertion, abstention | evals against a deterministic mock measure nothing |

The practical consequence: **ten of fifteen Slice 3 tasks can be completed without a
provider**, and they are the ones carrying the load — retrieval, Context Packet, Context
Health, gates, abstention, `DecisionRecord`, the Why surface. Provider selection blocks
verification, not construction.

---

### 12. Provider decision

**`PROVIDER DECISION REQUIRES EXTERNAL VERIFICATION`**

No provider selected, implicitly or explicitly. The eight items in §1 must be verified
first, and item 8 — measured structured-output and grounding reliability — is the one
that should carry the most weight and is the only one this repository can eventually
answer for itself, by running the `S3-T13` evals against a shortlist.

---

## Gate status

```text
Batch 1:                    ACCEPTED
Slice 3 provider-independent work:  UNBLOCKED
Provider gate:              PENDING
Blocking before first real call:    10 conditions (§10)
Provider selected:          NONE
Safety caps:                UNSET — OWNER DECISION REQUIRED
Hypotheses H-01..H-06:      NOT TESTED
```

## Next gate

Resolve provider selection and operational safety caps.
