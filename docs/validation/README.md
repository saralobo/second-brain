# Validation

```text
# Validation

Historical Validation Sprint 0:
DEFERRED — HISTORICAL DATASET UNAVAILABLE

Current strategy:
PROSPECTIVE INSTRUMENTED VALIDATION

Current product phase:
PROSPECTIVE VALIDATION PROTOCOL DESIGN

AVA V0:
FUNCTIONALLY COMPLETE

Validation:
NOT STARTED

Readiness audit:
READY WITH LIMITATIONS

Prospective Validation Protocol:
v0.1 PRE-EXECUTION LOCK IN PROGRESS — PRIMARY WORKSTREAM REQUIRED

Pre-execution decisions:
23 of 24 LOCKED — 1 blocking: D-21 Primary Workstream

Hypotheses:
H-01 H-02 H-03 H-04 H-05 H-06 — ALL NOT TESTED

Pre-execution decisions:
LOCKED (historical, unchanged)

Protocol:
validation-sprint-0-protocol-v0.1.md

Decision pack:
pre-execution-decisions-v0.1.md

Architecture baseline:
../architecture/architecture-package-v0.2-final.md
```

- **Protocol:** [Validation Sprint 0 Protocol v0.1](validation-sprint-0-protocol-v0.1.md) — `READY FOR EXECUTION`
- **Decision pack:** [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md) — `LOCKED` em 2026-08-30
- **Current strategy:** [Prospective Validation Strategy v0.1](prospective-validation-strategy-v0.1.md) — `ADOPTED`
- **Readiness audit:** [Prospective Validation Readiness Audit v0.1](prospective-validation-readiness-audit-v0.1.md) — `READY WITH LIMITATIONS`, 2026-08-31
- **Prospective Validation Protocol:** [v0.1](prospective-validation-protocol-v0.1.md) — `DRAFT — PRE-EXECUTION DECISIONS REQUIRED`
- **Pre-execution decisions:** [v0.1](prospective-validation-pre-execution-decisions-v0.1.md) — `LOCKED EXCEPT D-21`, 23 de 24 travadas em 2026-08-31
- **Technical spec:** [AVA Technical V0 Specification v0.1](../specification/ava-technical-v0-specification-v0.1.md) — `DRAFT FOR IMPLEMENTATION PLANNING`
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

## Mudança de estratégia

O sprint retrospectivo foi **adiado**, não reprovado. Nenhum GO, PIVOT ou STOP lhe foi atribuído, e nenhum threshold foi avaliado — nem atingido, nem violado. A validação passa a ser **prospectiva**: construir a menor V0 fiel capaz de gerar os dados longitudinais que o estudo histórico não pôde fornecer.

Ver [Prospective Validation Strategy v0.1](prospective-validation-strategy-v0.1.md).

**Nenhuma hipótese está validada.** A arquitetura permanece congelada e não verificada empiricamente.

O protocolo histórico e o decision lock permanecem inalterados e podem fornecer métricas, schemas e thresholds — mas nenhum threshold migra para o contexto prospectivo sem que a equivalência semântica seja documentada em um Prospective Validation Protocol explicitamente versionado.

## Próximo gate

Selecionar e travar o Primary Validation Workstream.

O [protocolo v0.1](prospective-validation-protocol-v0.1.md) está pré-registrado
e **23 das 24 decisões estão `LOCKED`** desde 2026-08-31: período, warm-up,
amostragens, thresholds de correctness, desperdício de atenção, valor, custo,
burden, memória, Context Health, o desenho de retirada (semanas 3 e 6) e a
regra de composição do veredito.

Resta **uma** decisão bloqueante: **D-21 — qual workstream**. Ela exige o
conhecimento da dona sobre o próprio trabalho e não foi preenchida com
placeholder. Os critérios de seleção já estão travados, para que a escolha não
possa depois ser feita de modo a favorecer o resultado. `AVA development` está
explicitamente excluído como default.

Dois thresholds do estudo retrospectivo foram herdados, cada um com argumento
escrito de equivalência semântica (D-08 e D-12). Cinco não foram, e cada um
registra por quê.

**Nenhuma hipótese foi testada.** H-01 a H-06 permanecem `NOT TESTED`, o Gate B
do ADR-21 permanece `OPEN`, e nenhuma validação começou.
