# Slice 7 — Prospective Validation Audit

```text
Status: COMPLETE
Tasks: S7-T01 … S7-T05 (5/5)
Date: 2026-08-31
Milestone: 6 — Prospective Evidence Trail, REACHED
V0: AVA V0 FUNCTIONALLY COMPLETE
Prospective Validation Readiness: READY WITH LIMITATIONS
Prospective Validation Protocol: NOT CREATED
Hypotheses: H-01 … H-06 ALL NOT TESTED
ADR-21 Gate A: ACTIVE · Gate B: OPEN
```

## Status

The audit is done. The evidence trail reconstructs end to end from records
written prospectively, and the two gaps that would have made it meaningless
were found and closed.

The audit proves `MEASURABLE`, not `GOOD`. No hypothesis was tested, no rate
was computed as a finding, and no protocol was created.

## Tasks

| ID | Task | Result |
| --- | --- | --- |
| `S7-T01` | Audit the nine timeline events | COMPLETE — all nine have a producer except `user_seen_at`, which has none by decision. Two defects found (F-15, F-16) |
| `S7-T02` | Verify anti-retroactivity end to end | COMPLETE — AR-01 … AR-07 all PASS, each attempting the violation directly in SQL |
| `S7-T03` | Verify the thirteen validation quantities are computable | COMPLETE — readiness matrix; eleven YES, two PARTIAL |
| `S7-T04` | Longitudinal report, first run, with `n` visible | COMPLETE — `npm run validation:export`, JSONL, `validation_schema_version = v0.1` |
| `S7-T05` | Record gaps without filling them with estimates | COMPLETE — blockers, important-non-blocking and deferrable, separated |

## Milestone 6

```bash
npm run db:reset && npm run db:migrate
npm run db:seed -- --proactive --supersede
npm run today -- <ws>
npm run feedback -- give <oppId> correct valuable
npm run feedback -- action <oppId> reviewed "Reviewed and updated it."
npm run validation:export -- <ws>
npm run db:backup
npm run db:restore -- <file> --verify
```

The export reconstructs evidence → change detectable → change detected →
opportunity generated → shown → feedback → action → outcome, using only rows
written at the time.

## Instrumentation audited

Nine timestamps, their producers, persistence, required fields and missingness
semantics: see the readiness audit, §Timeline audit.

Provenance chains verified in both directions. `execution_mode` distinguishes a
deterministic intervention that genuinely cost nothing from a ModelRun missing
because something failed.

## Gaps fixed

- **F-15 — anticipation was unmeasurable by construction.** `CaptureRequest`
  had no `observedAt`, so every capture was dated at the moment it was typed.
  `change_detectable_at` therefore equalled the write time and detection
  latency was identically zero — the single most important measurement in the
  prospective study, reading perfectly and meaning nothing. The field is now
  forwarded through parse to the validator, which already rejected future
  values.

- **F-16 — the anti-retroactivity constraint forced the fabrication it existed
  to prevent.** `validation_event` refused any `occurred_at` more than 60
  seconds before the write, including a person legitimately reporting
  yesterday's decision. The only options were losing the event or dating it at
  the write; the second is what happened. Events now carry `time_basis`
  (`system_clock` | `reported`); machine-observed events still cannot be
  backdated, nothing may be dated in the future, and the table stays
  append-only.

- **D-02 durability.** Backup, restore and a verified round-trip added and
  tested. Nothing is uploaded.

- **D-05 form drift.** The e2e suite now asserts that every field name and enum
  value the server actions read is present in the rendered form.

## Gaps remaining

**Blockers:** none.

**Important, non-blocking:** no real provider call has ever been made, so cost
and latency instrumentation is complete and unexercised; browser-level e2e for
the feedback forms; undeclared relations leave no trace, so serious false
negatives need human review; reported timestamps depend on honest reporting.

**Deferrable:** `user_seen_at`; scheduled backups; per-dimension feedback
timestamps in the read model.

## Durability

`D-02` → **`ACCEPT WITH BACKUP`**. PGlite is genuine PostgreSQL and keeps
ADR-22 local-first honest. Backup and verified restore now exist and are
tested. Single-writer concurrency remains a documented operational limit: the
web server holds the directory, so CLI writes require it stopped.

## Provider status

`PROVIDER PIPELINE READY — REAL CALL NOT EXECUTED` · no API key.

Gate A ACTIVE, Gate B OPEN. **REAL MODEL QUALITY AND COST VALIDATION: NOT
READY.** The deterministic loop — Milestones 4 and 5 in full — needs no
provider and could be validated first.

## Tests

| | |
| --- | --- |
| lint | `import boundaries: ok` |
| typecheck | exit 0 |
| unit + integration + golden + validation | 379 passed, 37 files |
| e2e | 27 passed, 5 files |
| build:web | exit 0 |
| provider smoke | `READY — REAL CALL NOT EXECUTED` |

New suites: `tests/validation/anti-retroactivity.test.ts` (AR-01…AR-07),
`tests/validation/timeline.test.ts`, `tests/validation/durability.test.ts`.

## Deviations

- **D-24** — migration numbered `0009`. The plan assigns no migration to Slice
  7; this one exists only because F-16 required a schema change to stop the
  telemetry constraint from forcing fabricated timestamps.
- **D-25** — `Database.dump()` and `openDatabaseFromDump()` added to the
  storage layer. This is infrastructure, not product capability, and exists
  solely to resolve D-02.
- **D-02** — resolved: `ACCEPT WITH BACKUP`.
- **D-05** — resolved: `IMPORTANT BUT NON-BLOCKING`, with drift coverage added.

## V0 completion status

```text
AVA V0 FUNCTIONALLY COMPLETE
Prospective Validation Readiness: READY WITH LIMITATIONS
Prospective Validation Protocol: NOT CREATED
H-01 … H-06: NOT TESTED
ADR-21 Gate B: OPEN
```

Software being complete is not a hypothesis being validated, and the two are
recorded separately on purpose. Nothing built across Slices 0–7 says the
architecture works.
