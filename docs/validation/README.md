# Validation

```text
# Validation

Current phase:
Validation Sprint 0 — blocked before start

Current gate:
PROVIDE ELIGIBLE WORK SOURCE FOR SPRINT 0

Status:
PRE-EXECUTION DECISIONS LOCKED

Sprint execution:
NOT STARTED — BLOCKED (see deviation D-001)

Protocol:
validation-sprint-0-protocol-v0.1.md

Decision pack:
pre-execution-decisions-v0.1.md

Architecture baseline:
../architecture/architecture-package-v0.2-final.md
```

- **Protocol:** [Validation Sprint 0 Protocol v0.1](validation-sprint-0-protocol-v0.1.md) — `READY FOR EXECUTION`
- **Decision pack:** [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md) — `LOCKED` em 2026-08-30
- **Experiment log:** [sprint-0-experiment-log.md](observations/sprint-0-experiment-log.md) — `BLOCKED — CANDIDATE SOURCE FAILED ELIGIBILITY`
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

### Por que nenhum workstream iniciou

O procedimento de seleção do protocolo (§2.2) exige listar workstreams candidatos a partir de metadados de fontes reais recuperáveis, e o §2.3 exige que essas fontes sejam consultadas manualmente, sem integração técnica. Nenhum material de trabalho foi disponibilizado ao operador do sprint, e portanto não existe conjunto de candidatos sobre o qual aplicar os critérios de elegibilidade.

O primeiro candidato avaliado (C-001 — projeto Vytta, `~/Documents/valeria`) foi julgado **inelegível** por metadados: 96,6% dos arquivos têm data de criação e modificação idênticas em um único instante, assinatura de cópia em massa que destruiu a temporalidade. Falha em 3 dos 5 critérios de elegibilidade e não sustenta a janela de 6 semanas de SC-01. Avaliação completa no §6 do experiment log. Nenhum conteúdo foi aberto.

Registrado como desvio **D-001** no [experiment log](observations/sprint-0-experiment-log.md), com as três opções de desbloqueio. Nada foi inventado para preencher SC-01, SC-02 ou SC-04.

Isto **não** é um resultado sobre o produto: H-01, H-02, H-03 e H-05 permanecem não testadas. Ausência de acesso não é evidência a favor nem contra nenhuma hipótese.

## Estrutura

| Diretório | Propósito |
| --- | --- |
| [datasets/](datasets/README.md) | dados de entrada versionados (janela, fontes, amostras) |
| [observations/](observations/README.md) | registros brutos por experimento |
| [results/](results/README.md) | experiment logs, análises e decisões |

`datasets/` e `results/` vazios. `observations/` contém apenas o experiment log. Nenhum dado de trabalho real existe no repositório.

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

Disponibilizar acesso a fonte de trabalho real para o Sprint 0.
