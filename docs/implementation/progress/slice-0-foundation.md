# Slice 0 — Foundation

```text
Status: COMPLETE
Tasks: S0-T01 … S0-T13 (13/13)
Date: 2026-08-30
External model calls: NONE
```

## Tasks completed

| ID | Task | Notes |
| --- | --- | --- |
| S0-T01 | workspace scaffold, TypeScript, `.gitignore` | npm workspaces (see deviation D-01) |
| S0-T02 | lint, typecheck, **import boundaries** | `scripts/lint-boundaries.mjs` |
| S0-T03 | Next.js App Router shell | routes for the Batch 1 surfaces |
| S0-T04 | local PostgreSQL + env strategy | embedded PGlite by default (D-02); `docker-compose.yml` shipped |
| S0-T05 | migration tooling + `0001_foundation` | forward-only, SQL files, `_migration` table |
| S0-T06 | domain primitives | ULID, time, ordinal strength, content origin |
| S0-T07 | test harness | Vitest + disposable in-memory database |
| S0-T08 | observability + logging redaction | local logger, no external exporter |
| S0-T09 | `ModelProvider` contract + `MockModelProvider` | no SDK installed |
| S0-T10 | Budget Controller skeleton | caps unset, controller closed |
| S0-T11 | `validation_event` + anti-retroactivity | enforced by database constraint |
| S0-T12 | deterministic fixtures | synthetic only |
| S0-T13 | CI | install, lint, typecheck, migrations, tests, build, e2e |

## Does it run?

Yes. `npm install && npm run db:migrate` builds the schema from zero.

## What can the user do now?

Nothing user-facing. This slice exists to make the invariants enforceable.

## Architecture invariants implemented

- **`core` has no I/O** — enforced by the boundary lint, not by convention.
- **Ordinal evidence strength** — three levels, no numeric confidence type exists.
- **`created_at` is operational only** — flagged in code and asserted in tests.
- **Telemetry cannot be backdated** — a database `CHECK`, not application logic.
- **Budget controller closed when unconfigured** — an unbounded external call is impossible.

## Telemetry available

`validation_event` schema and writer, with the anti-retroactivity constraint active.

## What remains mocked

Everything to do with models. `MockModelProvider` is the only provider, no SDK is
installed, and the ADR-22 gate is open.

## Tests

17 unit tests (primitives, budget, provider, redaction). Boundary lint passes.

## Known limitations

- `AVA_DB_MODE=server` is not wired: Batch 1 ships the embedded driver only.
- OpenTelemetry traces are not exported anywhere; the local logger is the only sink.

## Blockers for next slice

None.
