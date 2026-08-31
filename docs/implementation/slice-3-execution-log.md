# Slice 3 — Execution Log

```text
Slice: 3 (Chat + Retrieval)
Status: FUNCTIONALLY COMPLETE — REAL PROVIDER VERIFICATION PENDING
Date: 2026-08-30
Tasks: 15/15
Milestone 2: REACHED
External model calls: NONE — no API key available
Architecture changes: NONE
```

`batch-1-execution-log.md` is scoped to Batch 1 and is not the cumulative V0 log, so this
slice records its execution here. The Implementation Plan has no task-status field and is
treated as immutable; nothing in it was rewritten.

## Task status

| ID | Status | Where |
| --- | --- | --- |
| `S3-T01` | COMPLETE | `packages/db/src/migrations/0005_chat_and_decision.sql` (with `0004`) |
| `S3-T02` | COMPLETE | `packages/db/src/repositories/retrieval.ts`, `packages/retrieval/src/lexical.ts` |
| `S3-T03` | COMPLETE | `packages/core/src/context/packet.ts`, `packages/retrieval/src/packet.ts` |
| `S3-T04` | COMPLETE | `packages/core/src/context/health.ts`, `packages/retrieval/src/health.ts` |
| `S3-T05` | COMPLETE | `gatesFor` in core; enforced in `packages/app/src/answer-service.ts` |
| `S3-T06` | COMPLETE | `packages/llm/src/prompts.ts` |
| `S3-T07` | COMPLETE | `packages/core/src/context/grounding.ts` |
| `S3-T08` | COMPLETE | four abstention paths in `answer-service.ts` |
| `S3-T09` | COMPLETE | `packages/db/src/repositories/decision-record.ts` |
| `S3-T10` | COMPLETE | closed in the provider gate; exercised throughout this slice |
| `S3-T11` | COMPLETE | `apps/web/app/workstreams/[id]/chat/` |
| `S3-T12` | COMPLETE | `apps/web/app/why/[id]/page.tsx` |
| `S3-T13` | COMPLETE | `packages/app/src/eval/answer-eval.ts` — pipeline only |
| `S3-T14` | COMPLETE | `tests/golden/gs-05-abstention.test.ts` |
| `S3-T15` | COMPLETE | closed previously; unchanged |

## New package

`@ava/retrieval` — lexical retrieval, Context Packet assembly, Context Health dimension
gathering. Depends on `core`, `db` and `llm` (for the data-class rules, so boundary policy
is not duplicated). The import-boundary lint gained a matching rule, and caught a real
violation when a Context Packet test was written inside the package and imported `@ava/app`.

Pure Context Health logic — the ten dimension ids, the aggregation, the gates — lives in
`core`, which the plan names as the owner of Context Health. Only the gathering of
storage-backed signals is in `retrieval`.

## Deviations

| ID | Deviation | Effect |
| --- | --- | --- |
| D-06 | `S3-T01` split across migrations `0004` and `0005` | none; both tables exist |
| D-07 | streaming not implemented — Strategy A, and the D-05 revisit | UI shows only validated answers |
| D-08 | Milestone 2 E2E asks through the `ask` CLI rather than the browser form | rendering proven against the real server; the action itself is covered by integration tests |
| D-09 | budget gate skipped for `local: true` providers | offline development works; network providers still gated |
| D-10 | `ulid()` made monotonic within a millisecond | correctness fix; see below |

Full reasoning in [progress/slice-3-chat-retrieval.md](progress/slice-3-chat-retrieval.md).

## Findings made during execution

These are things the work uncovered, not deviations from the plan.

**F-03 — annotation ordering was decided by a random suffix.** `effectiveSensitivity`
picks the latest annotation by `(annotated_at DESC, id DESC)`. `ulid()` was not monotonic
within a millisecond, so two annotations landing in the same millisecond were ordered
arbitrarily — and the loser could be a reclassification to `restricted`. That is an F-01
defect that survived the provider gate. Fixed by making `ulid()` monotonic, with a test.
Found by an existing test that had been passing by luck.

**F-04 — the E2E harness could talk to a stale server.** `spawn('npx', ['next', 'start'])`
followed by `child.kill()` killed the wrapper, leaving `next-server` bound to the port. The
next run's server failed to bind, `waitForServer` connected to the survivor, and the suite
asserted against a previous run's database. This affected Batch 1's Milestone 1 suite as
well. Both suites now spawn detached, kill the process group, and free the port before
starting.

**Observation — status vocabulary and the supersession pointer diverge.** In the Slice 2
lifecycle a correction writes a successor whose own `status` reads `superseded`, meaning
"this object's earlier decision was superseded". Slice 3 therefore derives current-versus-
replaced from `superseded_by`, never from the status string. Slice 2 behaviour is
unchanged; this is recorded so the ambiguity is not rediscovered later.

**Observation — question words are not subject words.** "What changed in this project?"
has no searchable subject: `changed` names the request type. Searching for it returned
nothing and produced a false `INSUFFICIENT` on the first real run. Intent words are now
stripped before retrieval, and when nothing remains the subject is the workstream itself,
which retrieval already scopes to.

## Verification

```text
npm run lint          import boundaries: ok
npm run typecheck     exit 0
npm test              172 passed, 23 files
npm run build:web     exit 0
npm run test:e2e      8 passed, 2 files
npm run eval:answers  6/6 expected behaviour, 0 unsupported assertions
npm run provider:smoke  PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED
```

## Blockers

None.

## Not done, deliberately

No semantic memory, Declared Cognition, Behavioral Hypotheses, Opportunity Engine,
briefing, feedback loop, Outcome Resolution, connectors, Work Graph, embeddings or learned
ranking. No Slice 4 type was introduced.

## Architecture integrity

`architecture-v0.2-final` unchanged. ADR-21 and ADR-22 unchanged. No hypothesis marked
validated: H-01 … H-06 remain `NOT TESTED`, and ADR-21 Gate B remains `OPEN`.
