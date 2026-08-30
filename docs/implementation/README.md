# Implementation

```text
Current phase:
V0 IMPLEMENTATION PLANNING

Current plan:
ava-v0-implementation-plan-v0.1.md

Current implementation status:
NOT STARTED

Blockers before Batch 1:
NONE

Next gate:
Begin AVA V0 Implementation Batch 1
```

- **Plan:** [AVA V0 Implementation Plan v0.1](ava-v0-implementation-plan-v0.1.md) — `READY FOR IMPLEMENTATION`
- **Architecture baseline:** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md) — `FROZEN`, tag `architecture-v0.2-final`
- **Technical specification:** [AVA Technical V0 Specification v0.1](../specification/ava-technical-v0-specification-v0.1.md) — `READY FOR IMPLEMENTATION PLANNING`
- **Decisions:** [ADR-21](../decisions/ADR-21-prospective-cost-latency-gate.md) · [ADR-22](../decisions/ADR-22-v0-data-provider-boundary.md)
- **Validation strategy:** [Prospective Validation Strategy v0.1](../validation/prospective-validation-strategy-v0.1.md)

Nenhum código de produto foi escrito. O repositório contém apenas documentação.

## Batches

| Batch | Escopo | Status |
| --- | --- | --- |
| **Batch 1** | Slice 0 (Foundation) + Slice 1 (Capture → Evidence) + Slice 2 (Current State → Change) — 38 tarefas, `S0-T01` a `S2-T12` | `NOT STARTED` |
| Batch 2+ | Slices 3–7 | não planejado em detalhe |

O Batch 1 termina no **Milestone 1 — Capture and Change Loop**, e não contém nenhuma chamada de modelo. O gate de provider (ADR-22) aparece apenas em `S3-T15`.

## Gates posteriores

| Gate | Bloqueia |
| --- | --- |
| Provider gate (`S3-T15`) | primeira chamada externa real de modelo |
| Gate B do ADR-21 | qualquer expansão de escopo |
| Prospective Validation Protocol | início da validação prospectiva |

Nenhuma hipótese está validada. H-01 a H-06 permanecem `NOT TESTED`.
