# AVA

**AVA** is a personal work-context system: it keeps evidence of what happened in a
piece of work, reconstructs the current state from that evidence, and detects what
changed — always able to show what it knows and why.

The product name is settled as **AVA**. Earlier documents refer to a working
placeholder, *Second Brain*; those documents are historical and are not rewritten.

## Current status

```text
Architecture:            FROZEN — Architecture Package v0.2 Final (tag architecture-v0.2-final)
Validation strategy:     PROSPECTIVE INSTRUMENTED VALIDATION
Historical Sprint 0:     DEFERRED — HISTORICAL DATASET UNAVAILABLE
Technical specification: READY FOR IMPLEMENTATION PLANNING
Implementation plan:     READY FOR IMPLEMENTATION
Implementation:          BATCH 1 COMPLETE (Slices 0-2) — Milestone 1 reached
Hypotheses H-01..H-06:   NOT TESTED
External model calls:    NONE — the ADR-22 provider gate is open
```

**No hypothesis is validated.** The architecture is a frozen hypothesis that has not been
verified empirically. The retrospective Validation Sprint 0 was deferred because no
eligible historical dataset exists — it received no GO, PIVOT or STOP, and no threshold
was ever evaluated.

## What works today

Milestone 1 — **Capture and Change Loop**, deterministic end to end:

```text
create workstream → capture a decision → evidence persisted
→ capture superseding information → current state projected
→ change detected → change displayed in the UI
```

No model participates in any step of that loop.

## Running it locally

Requires Node 20+. Everything stays on your machine.

```bash
npm install
npm run db:migrate     # build the schema
npm run db:seed        # synthetic Project Alpha scenario (add --supersede)
npm run build:web
npm start              # http://localhost:3210
```

Verification: `npm run verify` (lint, typecheck, tests) and `npm run test:e2e`.

## Project documentation

| Area | Document |
| --- | --- |
| **Architecture baseline** | [docs/architecture/BASELINE.md](docs/architecture/BASELINE.md) · [Architecture Package v0.2 Final](docs/architecture/architecture-package-v0.2-final.md) |
| **Architecture history** | [docs/architecture/README.md](docs/architecture/README.md) |
| **Decisions** | [docs/decisions/README.md](docs/decisions/README.md) — ADR-21, ADR-22 |
| **Validation** | [docs/validation/README.md](docs/validation/README.md) · [Prospective Validation Strategy v0.1](docs/validation/prospective-validation-strategy-v0.1.md) |
| **Technical specification** | [AVA Technical V0 Specification v0.1](docs/specification/ava-technical-v0-specification-v0.1.md) |
| **Implementation** | [docs/implementation/README.md](docs/implementation/README.md) · [plan](docs/implementation/ava-v0-implementation-plan-v0.1.md) · [Batch 1 log](docs/implementation/batch-1-execution-log.md) · [Slice 3 log](docs/implementation/slice-3-execution-log.md) · [Slice 4 log](docs/implementation/slice-4-execution-log.md) |

## Repository layout

```text
apps/web        Next.js — workstreams, capture, state, changes, chat, why, memory
packages/core   pure domain: primitives, state, supersession, change, impact (no I/O)
packages/db     schema, forward-only SQL migrations, repositories
packages/app    composition root and use cases
packages/ingestion  three-plane quarantine pipeline
packages/llm    provider contract, providers, prompts, budget, boundary policy
packages/retrieval  lexical retrieval, Context Packet, Context Health signals
packages/core   also: Declared Cognition, authority order, memory rules
packages/telemetry  validation events, logging with redaction
tests/          integration, golden scenarios, end-to-end
docs/           architecture, decisions, specification, validation, implementation
```

## Open gates

| Gate | Blocks |
| --- | --- |
| Controlled provider verification | moving the provider gate to `CLOSED — VERIFIED BY CONTROLLED REAL CALL`; needs an API key |
| ADR-21 Gate B — economic viability | any expansion of scope |
| Prospective Validation Protocol | the start of prospective validation |

## Next gate

Review AVA V0 Slice 4 and prepare Slice 5 — Opportunity + Briefing.
