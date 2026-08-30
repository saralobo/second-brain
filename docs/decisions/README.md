# Architecture Decisions

## Onde estão os ADRs atuais

Os ADRs da baseline v0.2 (**ADR-01** a **ADR-20**) estão atualmente **consolidados dentro do** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md), na seção *ADR v0.2*. Eles não foram extraídos para arquivos individuais nesta pasta, e essa extração não é um pré-requisito para nada.

## ADRs pós-freeze

| ID | Título | Status | Data |
| --- | --- | --- | --- |
| **ADR-21** | [Cost & Latency Gate under Prospective Instrumented Validation](ADR-21-prospective-cost-latency-gate.md) | `ACCEPTED` | 2026-08-30 |
| **ADR-22** | [V0 Data Locality and Model Provider Boundary](ADR-22-v0-data-provider-boundary.md) | `ACCEPTED` | 2026-08-30 |

Ambos resolvem blockers da [AVA Technical V0 Specification v0.1](../specification/ava-technical-v0-specification-v0.1.md) e **nenhum deles é motivado por evidência experimental** — os dois declaram isso no próprio cabeçalho. Nenhuma hipótese muda de status por causa deles.

Próximo ID disponível: **ADR-23**.

## Regras para novos ADRs

- Novos ADRs criados **após o freeze** devem ser documentos individuais nesta pasta, um arquivo por decisão.
- A numeração é **contínua a partir do próximo ID disponível**. A baseline vai até ADR-20; os pós-freeze estão na tabela acima.
- Quando um ADR for motivado por Validation Sprint ou outro experimento, ele deve **referenciar explicitamente a evidência** que o justifica — qual experimento, qual medida, qual critério definido antes do resultado.
- Um ADR posterior ao freeze é o mecanismo formal para alterar a baseline. Ver a política em [BASELINE.md](../architecture/BASELINE.md).

Sugestão de nome de arquivo: `adr-21-titulo-curto.md`.

## Template

```text
# ADR-XX — Title

Status:
Date:
Architecture baseline:
Evidence / experiment:

## Context

## Decision

## Rationale

## Trade-offs

## Consequences

## Validation / follow-up
```
