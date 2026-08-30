# Validation

```text
# Validation

Current phase:
Validation Sprint 0 — protocol ready

Current gate:
PRE-EXECUTION DECISIONS

Status:
PENDING DECISION LOCK

Sprint execution:
NOT STARTED

Protocol:
validation-sprint-0-protocol-v0.1.md

Decision pack:
pre-execution-decisions-v0.1.md

Architecture baseline:
../architecture/architecture-package-v0.2-final.md
```

- **Protocol:** [Validation Sprint 0 Protocol v0.1](validation-sprint-0-protocol-v0.1.md) — `READY FOR EXECUTION`
- **Decision pack:** [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md) — `PENDING DECISION LOCK`
- **Architecture baseline:** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md) — tag `architecture-v0.2-final`

## Workstreams

Definidos pela arquitetura (seção *Validation Sprint 0* da baseline) e detalhados no protocolo.

| Workstream | Protocolo | EXP | Status |
| --- | --- | --- | --- |
| A. Retrospective Opportunity Study | [§5](validation-sprint-0-protocol-v0.1.md) | EXP-00B | NOT STARTED |
| B. Ideal Briefing Study | [§6](validation-sprint-0-protocol-v0.1.md) | EXP-00A | NOT STARTED |
| C. Declared Cognition Bootstrap | [§7](validation-sprint-0-protocol-v0.1.md) | insumo de EXP-10 | NOT STARTED |
| D. Cost & Latency Study | [§8](validation-sprint-0-protocol-v0.1.md) | EXP-00D | NOT STARTED |
| E. Entity Resolution Feasibility | [§9](validation-sprint-0-protocol-v0.1.md) | EXP-00C | NOT STARTED |
| F. Auto-consistency | [§10](validation-sprint-0-protocol-v0.1.md) | EXP-00E | NOT STARTED |

Nenhum experimento foi executado. Nenhum resultado foi registrado.

## Estrutura

| Diretório | Propósito |
| --- | --- |
| [datasets/](datasets/README.md) | dados de entrada versionados (janela, fontes, amostras) |
| [observations/](observations/README.md) | registros brutos por experimento |
| [results/](results/README.md) | experiment logs, análises e decisões |

Todos vazios. Nenhum dado real existe.

## Gate atual — Pre-execution decisions

Os critérios **GO / PIVOT / STOP** devem ser definidos **antes** da observação dos resultados. Critérios definidos ou ajustados depois de ver os dados não são válidos para decidir avanço, ajuste ou parada.

O [decision pack](pre-execution-decisions-v0.1.md) cobre os 38 campos abertos do protocolo (33 `DECISION REQUIRED BEFORE EXECUTION` + 5 `TO BE FILLED BEFORE EXECUTION`).

| Status | Quantidade |
| --- | --- |
| `LOCKED` | 0 |
| `PROPOSED` — recomendação metodológica aguardando aceite | 24 |
| `PENDING` — exige julgamento da dona do projeto | 15 |

**Enquanto qualquer decisão obrigatória permanecer `PENDING` ou `PROPOSED`, o Validation Sprint 0 permanece `NOT STARTED`.**

## Próximo gate

Travar todas as decisões pré-execução.
