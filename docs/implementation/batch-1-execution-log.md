# Batch 1 — Execution Log

```text
Batch: 1 (Slice 0 + Slice 1 + Slice 2)
Status: COMPLETE
Date: 2026-08-30
Tasks: 38/38
Milestone 1: REACHED
External model calls: NONE
Architecture changes: NONE
```

The Implementation Plan has no task-status field and is treated as immutable. This log
records execution against it.

## Task status

| Slice | Tasks | Status |
| --- | --- | --- |
| S0 — Foundation | `S0-T01` … `S0-T13` | 13/13 COMPLETE |
| S1 — Capture → Evidence | `S1-T01` … `S1-T13` | 13/13 COMPLETE |
| S2 — Current State → Change | `S2-T01` … `S2-T12` | 12/12 COMPLETE |

Per-slice detail in [progress/](progress/).

## Deviations

Small implementation differences that change no behaviour or invariant. Each is recorded
here rather than by editing the plan.

### D-01 — npm workspaces instead of pnpm workspaces

**Plan:** §3 named pnpm workspaces as `IMPLEMENTATION DEFAULT`, replacement cost low.
**Reality:** pnpm is not installed on the machine and `corepack enable` requires root.
**Decision:** npm workspaces (npm 11, Node 24). No machine-level change required.
**Impact:** none on architecture. Workspace layout, package boundaries and scripts are
unchanged. Substituting back is a `package.json` change.

### D-02 — Embedded PostgreSQL (PGlite) as the default local runner

**Plan:** §3 named Docker Compose as the way to run PostgreSQL locally, an
`IMPLEMENTATION DEFAULT`. **PostgreSQL itself** is the `IMPLEMENTATION DEFAULT` in §21.
**Reality:** Docker is not installed and no PostgreSQL server is present.
**Decision:** default to PGlite — genuine PostgreSQL 18.3 compiled to WASM, running
in-process. `docker-compose.yml` is still shipped for a server-backed setup.
**Verified before adopting:** rewrite rules (append-only), `tsvector` generated columns,
GIN indexes, `CHECK` constraints, enums and `jsonb` all behave as on a server.
**Impact:** none on architecture. The SQL is identical, the migrations are the same
files, and this strengthens rather than weakens ADR-22 local-first persistence.
**Not done:** `AVA_DB_MODE=server` raises a clear error instead of silently falling back;
wiring a server driver is a small task whenever a server is wanted.

### D-03 — Hand-written SQL migrations instead of Drizzle

**Plan:** §3 named Drizzle as `IMPLEMENTATION DEFAULT`, valued for "migrations in
readable SQL".
**Decision:** numbered `.sql` files applied by a small forward-only runner, with typed
repositories over them.
**Rationale:** the plan's stated reason for Drizzle was readable SQL and no magic layer
over the schema. Several invariants — rewrite rules, the anti-retroactivity `CHECK`,
generated `tsvector` columns — cannot be expressed in the ORM schema anyway, so the SQL
would have been hand-written in addition to a Drizzle schema, creating two sources of
truth for the thing that guarantees auditability.
**Impact:** none on architecture. Adding Drizzle later for typed query building does not
require changing the migrations.

### D-04 — `packages/app` added for application services

**Plan:** §4 listed seven packages and warned against a package per architectural concept.
**Decision:** added `packages/app` holding the composition root and the capture/change use
cases.
**Rationale:** the plan requires that `apps/web` hold no domain logic and that the vertical
slice be testable without the web layer. Without this package the orchestration would live
in server actions, and integration tests would import from a Next.js app.
**Impact:** none on architecture. It is a wiring layer; `core` remains pure and the
boundary lint covers the new package.

### D-05 — End-to-end tests assert server-rendered HTML instead of driving a browser

**Plan:** §3 named Playwright as `CAN SUBSTITUTE`, limited to critical flows.
**Decision:** the E2E suite boots the real built server with its own disposable database,
seeds it, and asserts on the rendered HTML.
**Rationale:** the pages are server components, so the server's output is what a person
sees. Installing browser binaries is a large download that was not necessary to verify
the Milestone 1 flow.
**Impact:** interactive behaviour (form submission through the browser) is not covered by
automation; the capture path itself is covered at the service level and by integration
tests. Adding Playwright later requires no production code change.

### D-06 — `evidence_annotation` satellite table

**Plan:** §6 required evidence content to be immutable while `workstream_id`,
`entity_refs` and `sensitivity` legitimately evolve.
**Decision:** implemented exactly as the plan described, in a satellite table, so the
`evidence` row can carry an unconditional `DO INSTEAD NOTHING` rule.
**Impact:** none. Recorded because the table is not named in the plan's model list.

## Blockers

`NONE`

No `IMPLEMENTATION BLOCKER` and no `ADR REQUIRED` situation arose. Nothing required an
architectural change, a privacy boundary was never in conflict, the deterministic Change
Engine was sufficient for every Batch 1 flow, and the persistence model preserved
provenance throughout.

## One defect found and fixed during the batch

The boundary lint rejected the seed CLI, which had been placed in `packages/db` while
importing `packages/app` — a genuine layering inversion. The CLI moved to
`packages/app/src/cli/`. Recorded because it is evidence the boundary rule does real work
rather than passing vacuously.

A second defect was found by manual verification rather than by a test: a relative
`.pgdata` path resolved against the current working directory, so the web app (running
from `apps/web`) opened a different database from the CLIs (running from the root). The
data directory is now anchored at the repository root.

## Gates still open

| Gate | Status |
| --- | --- |
| ADR-22 provider selection | **OPEN** — mock provider only; no SDK installed; no external call made |
| ADR-21 Gate B, economic viability | **OPEN** — requires measured data that does not exist yet |
| Operational safety caps | **UNSET** — `IMPLEMENTATION CONFIG REQUIRED BEFORE FIRST REAL MODEL CALL` |
| Prospective Validation Protocol | **NOT CREATED** — belongs to a later gate |

No hypothesis is validated. H-01 to H-06 remain `NOT TESTED`.
