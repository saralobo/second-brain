# Slice 7 — Execution Log

```text
Slice: 7 (Prospective Validation Audit)
Status: COMPLETE
Date: 2026-08-31
Tasks: 5/5
Milestone 6: REACHED
External model calls: NONE
Architecture changes: NONE
ADR REQUIRED: none raised
```

## Task status

| ID | Status | Where |
| --- | --- | --- |
| `S7-T01` | COMPLETE | audit matrix in `docs/validation/prospective-validation-readiness-audit-v0.1.md` |
| `S7-T02` | COMPLETE | `tests/validation/anti-retroactivity.test.ts` |
| `S7-T03` | COMPLETE | `packages/app/src/validation/read-model.ts`, readiness matrix |
| `S7-T04` | COMPLETE | `packages/app/src/validation/export.ts`, `npm run validation:export` |
| `S7-T05` | COMPLETE | gaps section, classified and not filled with estimates |

## Findings

- **F-15 — anticipation was unmeasurable by construction.** `CaptureRequest`
  carried no `observedAt`, so `parse()` always dated an observation at arrival.
  `change_detectable_at` equalled the write time, detection latency was
  identically zero, and the anticipation denominator was fabricated — while
  every test passed and every number looked excellent. Found by capturing a
  day-old decision and reading back the emitted events.

- **F-16 — the anti-retroactivity rule caused the fabrication it prevented.**
  With F-15 fixed, `validation_event` rejected the backdated
  `change_detectable_at` outright: its constraint allowed only 60 seconds
  between `occurred_at` and the write. The rule conflated "recorded late" with
  "backdated fraudulently". Split by `time_basis`; the strict rule is kept
  where it belongs and no event may be dated in the future.

- **F-17 — outcome telemetry could be backdated through the domain API.**
  `recordOutcome` accepts an explicit `recordedAt`, and the event was emitted
  at that value. Recording an outcome is AVA observing herself, so the event
  now fires at the real write instant; the row keeps the supplied
  `recorded_at`.

- **F-18 — `Blob` from `Uint8Array` failed under the web app's DOM lib.** The
  restore path compiled under the package tsconfig and broke `next build`,
  which is the build that ships. Caught by running `build:web`, not by
  `typecheck`.

## Instrumentation added

Strictly the minimum the audit required:

- `CaptureRequest.observedAt`, forwarded through parse (F-15);
- `validation_event.time_basis` and the split constraint (F-16);
- `Database.dump()` / `openDatabaseFromDump()` plus backup and restore CLIs,
  to resolve D-02;
- the validation read model and JSONL export, which is `S7-T03`/`S7-T04`.

No product capability was added to make the audit pass.

## Deviations

D-24 (migration `0009`) · D-25 (dump/restore in the storage layer) · D-02
resolved as `ACCEPT WITH BACKUP` · D-05 resolved as `IMPORTANT BUT
NON-BLOCKING`.

## What is not claimed

- The audit proves `MEASURABLE`, never `GOOD`.
- No hypothesis was tested. H-01 … H-06 remain `NOT TESTED`.
- ADR-21 Gate B remains `OPEN`. No real model call has been made, so cost and
  latency instrumentation is complete and entirely unexercised.
- No Prospective Validation Protocol was created, and no GO / PIVOT / STOP was
  declared.
- Every number produced during this slice came from synthetic scenarios.
