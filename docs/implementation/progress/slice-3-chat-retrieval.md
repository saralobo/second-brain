# Slice 3 — Chat + Retrieval

```text
Status: FUNCTIONALLY COMPLETE — REAL PROVIDER VERIFICATION PENDING
Tasks: S3-T01 … S3-T15 (15/15)
Date: 2026-08-30
Milestone: 2 — Grounded Project Conversation, REACHED
External model calls: NONE — mock mode only, no API key available
Hypotheses: H-01 … H-06 ALL NOT TESTED
```

## Status

Every provider-independent behaviour of Slice 3 is implemented, tested and demonstrable
end to end. The one thing outstanding is a controlled call against a real provider, which
requires an `ANTHROPIC_API_KEY` that is not available. Nothing about answer quality has
been measured, and nothing here says the architecture works.

## Tasks completed

| ID | Task | Note |
| --- | --- | --- |
| S3-T01 | `context_health`, `decision_record`, `model_run` | `model_run` shipped in `0004`; the rest in `0005_chat_and_decision` (D-06) |
| S3-T02 | lexical retrieval over FTS, extensible interface | `LexicalRetrieval` behind `RetrievalStrategy` |
| S3-T03 | Context Packet, with counter-evidence and gaps | explicit object, never a prompt string |
| S3-T04 | Context Health, ten dimensions, aggregation per task | all ten computed on every call |
| S3-T05 | downstream gates | `DEGRADED` blocks preparation and promotion; `INSUFFICIENT` blocks assertion |
| S3-T06 | versioned prompt registry | `grounded-answer/v1`, frozen |
| S3-T07 | `state_query_answer` archetype with evidence constraint in code | `validateGrounding` |
| S3-T08 | abstention as a first-class output | four distinct abstention paths |
| S3-T09 | `DecisionRecord` for material evidence selection | append-only |
| S3-T10 | `ModelRun` always written, including on failure | closed in the provider gate, exercised here |
| S3-T11 | chat UI with clickable citations | streaming deliberately not implemented (D-07) |
| S3-T12 | Why surface, drill-down to Evidence, no LLM on the path | `/why/[id]` |
| S3-T13 | evals: schema, grounding, unsupported assertion, abstention | pipeline only; quality `PENDING REAL PROVIDER` |
| S3-T14 | **GS-05** insufficient context → abstention | two scenarios |
| S3-T15 | provider gate | closed in the previous task; unchanged here |

## Milestone 2

```text
create workstream → capture decision → supersede it → open chat
→ ask "What changed in this project?" → grounded answer with evidence
→ inspect why
```

Works end to end against the built server. `tests/e2e/milestone-2.test.ts`.

### How to see it

```bash
npm run db:reset && npm run db:migrate && npm run db:seed -- --supersede
npm run dev            # http://localhost:3210
```

Open the workstream → **Ask AVA about this workstream** → ask *What changed in this
project?* Then follow **Why is AVA saying this?**. Ask something the project holds no
evidence for and AVA abstains instead of answering.

From the command line:

```bash
npm run ask -- <workstreamId> "What changed in this project?"
npm run eval:answers
```

## What can the user do now?

Ask questions about one workstream and get an answer built only from evidence captured
into it, with the evidence shown; or get an explicit refusal when the evidence does not
support an answer. Every turn links to a page that shows what was retrieved, what was
excluded and why, which health dimensions were computed, and how the answer was produced.

Supported question shapes: current state · what changed · decisions · what is unresolved ·
show me the evidence · what are you unsure about. Anything else is classified `unknown`
and answered by keyword retrieval, with that fact recorded as a gap.

## Retrieval implementation

Lexical only — PostgreSQL full text over the generated `fts` column, `simple` dictionary,
OR semantics with `ts_rank` ordering. No embeddings, no pgvector, no learned ranking.

Scope is one workstream by default. A question that matches perfectly in another project
returns nothing: cross-project leakage is a privacy problem before it is a quality one.

Words that describe the *kind* of question (`changed`, `decision`, `unresolved`, …) are
stripped from the search terms. They describe the request, not the subject, and searching
for them matched nothing — which produced a false `INSUFFICIENT` on the first real run.

Every result carries `evidence_id`, source, `observed_at`, `effective_at`, workstream,
capture type, `content_origin`, strength, **effective** sensitivity, superseded status,
score and a stated reason. The score is a lexical rank and is never combined with strength:
a rank is not a probability that a statement is true.

Temporality: retrieval is bounded by `observed_at <= asOf`. Supersession is read from the
version pointer, never from the `status` string — in the Slice 2 lifecycle a correction
writes a successor whose own status reads `superseded`, so reading the status would mark
the live version as out of date and invert the very distinction this slice protects.

## Context Health behavior

Ten dimensions, computed on every call, none of them consulting a model. Aggregation is
per task: only the dimensions material to the question kind can decide the aggregate, and
the rest are still reported.

| State | Observed example |
| --- | --- |
| `HEALTHY` | seeded workstream, question *What changed in this project?* — three items retrieved, sources available, no contradictions |
| `DEGRADED` | one item withheld by classification while others still cover the question — answer allowed, gap named, promotion and preparation blocked |
| `INSUFFICIENT` | question about a vendor contract in a workstream that holds none — retrieval empty, `expected_sources_available` decides |

A second `INSUFFICIENT` route: evidence reclassified `restricted` after capture, leaving
nothing eligible — `permission_blocked_coverage` decides.

Health changes behaviour. `INSUFFICIENT` abstains **before** any provider is contacted:
no ModelRun row exists at all on that path.

## Grounding behavior

The generation receives only the authorised Context Packet. The answer contract is
`answer` · `evidence_ids[]` · `uncertainties[]` · `abstained`, and nothing else is read.

Validation runs afterwards and independently, against the packet AVA built rather than the
model's account of itself. It rejects citations that were never retrieved, citations of
evidence withheld from the provider, an assertion with no valid citation, an inconsistent
abstention, and a citation marker in the prose that is absent from `evidence_ids`.

A rejected answer is **discarded**, not shown with a caveat: a caveat on an unsupported
claim is still an unsupported claim. The rejection is recorded and telemetered.

System-origin content is retrievable locally for audit but never eligible to ground a
claim — AVA citing its own output is circular corroboration, not evidence.

Restricted content never crosses the boundary. `tests/integration/answer-provider-payload.test.ts`
inspects the payload itself rather than the eligibility list, because an eligibility list
is a claim about the payload and not the payload.

## Provider status

| | |
| --- | --- |
| Mock mode | Works end to end with no API key, no network, no configuration |
| Anthropic adapter | Implemented, SDK confined to `packages/llm/src/providers/`, unchanged in this slice |
| Real call | `NOT EXECUTED — API KEY UNAVAILABLE` |
| Provider gate | `IMPLEMENTED — AWAITING CONTROLLED PROVIDER VERIFICATION` |
| Challenger | `CHALLENGER EVAL DEFERRED UNTIL ADAPTER/EVAL GATE` |

Mock mode is disclosed in the UI on every turn it produces. A mock answer is never
presented as a model answer.

## Telemetry

New events: `question_received` · `retrieval_started` · `retrieval_completed` ·
`context_packet_created` · `provider_call_authorized` · `provider_call_denied` ·
`grounded_answer_generated` · `grounded_answer_rejected` · `answer_shown` ·
`abstention_shown`.

`retrieval_completed` carries query kind, scope, candidate count, selected count, selected
evidence ids, exclusions with reasons, and latency — not raw content.

`answer_shown` and `abstention_shown` mean *delivered by the server*. They do not claim the
answer was read: there is no client-side observability, so `user_seen` stays unemitted
rather than being approximated by delivery.

Anti-retroactivity is unchanged: the database still refuses backdated and future-dated rows.

## Tests

```text
lint                                   import boundaries: ok
typecheck                              exit 0
unit + integration + golden            172 passed, 23 files
build:web                              exit 0
e2e                                    8 passed, 2 files
eval:answers                           6/6 cases, 0 unsupported assertions
provider:smoke                         PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED
```

Added: 20 unit tests for query classification, health aggregation, gates and grounding
validation; 8 for the ten health dimensions; 4 for the prompt registry; 3 for Context
Packet assembly; 4 for the end-to-end grounded path; 3 for the provider payload; 1 for the
eval; 2 for ULID monotonicity; 4 golden (GS-03, GS-05 ×2, GS-06 in chat); 4 E2E.

## Deviations

| ID | Deviation |
| --- | --- |
| D-06 | S3-T01 split across migrations `0004` and `0005`. Recorded when the gate shipped `model_run` alone; closed here. |
| D-07 | Streaming not implemented. Strategy A — buffer, validate, then display. Recorded below. |
| D-08 | Milestone 2 E2E asks through the `ask` CLI, not the browser form. PGlite allows one writer and the running server holds it. |
| D-09 | The budget gate is skipped for providers registered `local: true`. |
| D-10 | ULID made monotonic within a millisecond. A correctness fix, not a Slice 3 feature. |

### D-07 — streaming, and the D-05 revisit

D-05 was marked `REVISIT BEFORE PROSPECTIVE VALIDATION`. Streaming brought it forward, and
the resolution is to **not stream in V0**.

Strategy A: the response is buffered, validated against the Context Packet, and only then
rendered. Strategy B — streaming with a provisional state promoted after validation — was
rejected for V0 because a reader cannot unread a fabricated sentence. By the time
validation rejects it, it has already been seen, and the whole point of this slice is that
an unsupported claim never reaches the user.

Because nothing streams, there is no partial-token behaviour that a browser-level test
could observe that server-rendered HTML cannot. Playwright was therefore not introduced.
If streaming is added later, D-05 must be reopened **before** it ships.

### D-09 — local providers and the budget gate

`callThroughBoundary` skips the ADR-21 budget gate when the registry records the provider
as `local: true`. An in-process double has no spend to control, and requiring caps for it
would block offline development and CI without protecting anything.

This is narrow on purpose. `local` is set only at registration, only for in-process
doubles, and every provider that can reach the network still passes through the gate — the
budget tests now register the double as `local: false` precisely so they exercise the cap
rather than the path that has none.

### D-10 — ULID monotonicity

Two ids minted in the same millisecond sorted by a random suffix. The annotation table
picks the latest sensitivity by `(annotated_at DESC, id DESC)`, so "the most recent
classification wins" was in fact "an arbitrary classification wins" whenever two
annotations landed in the same millisecond — and the losing row could be the
reclassification to `restricted`. `ulid()` is now monotonic within a millisecond.

Found by an existing F-01 test failing intermittently. It had been passing by luck.

## Known limitations

- **Lexical retrieval only.** A question worded differently from the evidence will miss.
  That is a known Phase 1 limitation, not a defect to patch with embeddings.
- **Mock answers are composed locally.** They exercise the full pipeline and are clearly
  labelled, but they say nothing about how a real model behaves under the same prompt.
- **State and change titles do not cross the boundary.** They are captured content that
  has not been through redaction, so only structural references are sent. The wording
  reaches the model through the redacted evidence items.
- **Grounding validation is structural.** It verifies citations and abstention coherence.
  It cannot detect a claim that cites real evidence but misreads it — that needs a real
  provider and a human read.
- **No conversational memory.** Each question is answered from the ledger alone. Follow-up
  questions that depend on the previous turn are not supported; that is Slice 4.
- **`unknown` questions get keyword retrieval**, which is honest but weak.
- **No client-side observability**, so `user_seen` and everything downstream of it remain
  unemitted.

## Blockers for Slice 4

None.

Outstanding but not blocking: run `npm run provider:smoke` with a real key to move the
provider gate to `CLOSED — VERIFIED BY CONTROLLED REAL CALL`, and re-run
`npm run eval:answers` against a real provider to replace `PENDING REAL PROVIDER`.

ADR-21 Gate B remains **OPEN**. No hypothesis has been tested.
