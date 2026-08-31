# Implementation

```text
Current phase:
SLICE 3 PROVIDER GATE

Current plan:
ava-v0-implementation-plan-v0.1.md

Implementation status:
BATCH 1 COMPLETE

Provider gate:
IMPLEMENTED — AWAITING CONTROLLED PROVIDER VERIFICATION

Provider:
Anthropic / claude-sonnet-5 (initial V0 implementation provider)

Challenger:
OpenAI / gpt-5.6-terra (S3-T13 eval candidate, no adapter)

External model calls:
NONE — real call not executed, API key unavailable

Blockers before provider-independent Slice 3 work:
NONE

Next gate:
Implement AVA V0 Slice 3 — Chat + Retrieval
```

- **Plan:** [AVA V0 Implementation Plan v0.1](ava-v0-implementation-plan-v0.1.md) — `READY FOR IMPLEMENTATION`
- **Batch 1 execution log:** [batch-1-execution-log.md](batch-1-execution-log.md) — `COMPLETE`, 38/38
- **Slice checkpoints:** [progress/](progress/)
- **Provider gate:** [Slice 3 Provider Gate v0.1](slice-3-provider-gate-v0.1.md) — `IMPLEMENTED — AWAITING CONTROLLED PROVIDER VERIFICATION`
- **Architecture baseline:** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md) — `FROZEN`, tag `architecture-v0.2-final`
- **Technical specification:** [AVA Technical V0 Specification v0.1](../specification/ava-technical-v0-specification-v0.1.md) — `READY FOR IMPLEMENTATION PLANNING`
- **Decisions:** [ADR-21](../decisions/ADR-21-prospective-cost-latency-gate.md) · [ADR-22](../decisions/ADR-22-v0-data-provider-boundary.md)
- **Validation strategy:** [Prospective Validation Strategy v0.1](../validation/prospective-validation-strategy-v0.1.md)

Nenhum código de produto foi escrito. O repositório contém apenas documentação.

## Batches

| Batch | Escopo | Status |
| --- | --- | --- |
| **Batch 1** | Slice 0 + Slice 1 + Slice 2 — 38 tarefas, `S0-T01` a `S2-T12` | `COMPLETE` · **ACCEPTED** em 2026-08-30 |
| Batch 2 | Slice 3 — Chat + Retrieval | `NOT STARTED` · parte provider-independente **desbloqueada** |
| Batch 3+ | Slices 4–7 | não planejado em detalhe |

O Batch 1 terminou no **Milestone 1 — Capture and Change Loop**, alcançado sem nenhuma chamada de modelo. A revisão formal está no [provider gate](slice-3-provider-gate-v0.1.md).

O provider gate foi implementado: F-01 e F-02 corrigidos, `ModelRun` persistente aberto em `PENDING` antes da chamada, pipeline de minimização/redaction/policy/budget em caminho único, e adapter Anthropic com o SDK confinado a um único arquivo.

**Safety caps configurados** (ADR-21, valores operacionais, não thresholds de validação): US$ 0,15 por chamada · US$ 0,50 por checkpoint · US$ 2,00/dia · US$ 20,00/mês · 1 retry. Hard stop aborta e abstém.

Todas as quinze tarefas do Slice 3 estão `READY`. Falta apenas rodar a chamada controlada quando houver chave.

## Gates posteriores

| Gate | Bloqueia |
| --- | --- |
| Verificação controlada do provider | marcar o gate como verificado; exige `ANTHROPIC_API_KEY` e `npm run provider:smoke` |
| Gate B do ADR-21 | qualquer expansão de escopo |
| Prospective Validation Protocol | início da validação prospectiva |

Nenhuma hipótese está validada. H-01 a H-06 permanecem `NOT TESTED`.
