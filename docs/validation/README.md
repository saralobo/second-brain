# Validation

```text
# Validation

Current phase:
Validation Sprint 0 — protocol ready

Current gate:
SPRINT 0 READY TO START

Status:
PRE-EXECUTION DECISIONS LOCKED

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
- **Decision pack:** [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md) — `LOCKED` em 2026-08-30
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

## Gate atual — Sprint 0 ready to start

Os critérios **GO / PIVOT / STOP** foram definidos e travados **antes** de qualquer observação de resultados. O [decision pack](pre-execution-decisions-v0.1.md) cobre os 38 campos abertos do protocolo (33 `DECISION REQUIRED BEFORE EXECUTION` + 5 `TO BE FILLED BEFORE EXECUTION`), mais K-9 preservado como qualitativo.

| Status | Quantidade |
| --- | --- |
| `LOCKED` | 39 |
| `PROPOSED` | 0 |
| `PENDING` | 0 |

**Pre-execution blockers: NONE.**

> These criteria were locked before experimental work data was inspected. Changes after execution starts require explicit protocol deviation and cannot retroactively alter the original GO/PIVOT/STOP evaluation.

### Critérios travados — resumo

| Área | Critério |
| --- | --- |
| Escopo | 6 semanas consecutivas · 1 workstream · ≥12 episódios em A · 8 pares em B |
| Fontes | Calendar · Meeting notes/transcripts · Documents/textual artifacts (máx. 3 classes) |
| A — Antecipação | ≥2 oportunidades acionáveis/semana · janela ≥1 intervalo de checkpoint · métricas só sobre `hindsight_risk = low` |
| B — Briefing | ≥1 item útil em ≥75% dos briefings · ruído ≤33% · ≤30 min de normalização · 3 itens/bloco, 10/briefing · ≥48h até avaliar |
| D — Custo | US$ 3 por intervenção útil · US$ 60/mês · P95 ≤5 min · 20 dias úteis/mês |
| E — Identidade | ≥80% determinístico · zero falso merge em decisions/commitments/artifacts · ≤15 min de correção manual |
| F — Estabilidade | ≥14 dias entre rodadas · 8 pares/categoria · ≥7/8 para `sufficiently stable` |

Alteração de qualquer critério após o início da execução é **protocol deviation** registrada, e não recalcula retroativamente nenhuma avaliação já produzida.

## Próximo gate

Iniciar o Validation Sprint 0.
