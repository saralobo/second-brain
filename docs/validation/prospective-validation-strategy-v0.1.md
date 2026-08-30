# Prospective Validation Strategy v0.1 — AVA

```text
Status: ADOPTED
Adopted: 2026-08-30
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final
Retrospective Sprint 0: DEFERRED — HISTORICAL DATASET UNAVAILABLE
Hypotheses status: NOT TESTED
Purpose: replace the retrospective validation path with a prospective, instrumented one
```

> Build the smallest faithful V0 capable of generating the longitudinal evidence required to validate the architecture prospectively.

---

## Context

O Validation Sprint 0 foi projetado como estudo **retrospectivo**: reconstruir episódios reais de uma janela passada e verificar, sob controle anti-hindsight, se sinais relevantes existiam antes da percepção da usuária. Os critérios foram travados antes de qualquer observação ([Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md), 39 campos `LOCKED`, zero blockers).

A execução não pôde iniciar. O procedimento de seleção do protocolo (§2.2) exige listar workstreams candidatos por metadados de fontes recuperáveis, e o §2.3 exige consulta manual sem integração técnica. O único candidato avaliado — projeto Vytta, `~/Documents/valeria` — foi julgado **inelegível**, por metadados, sem que nenhum conteúdo fosse aberto:

- 96,6% dos arquivos (3.134 de ~3.245) com `birthtime` e `mtime` idênticos em um único instante (`2026-07-13 13:35`), assinatura de cópia em massa que destruiu a temporalidade;
- repositório git em `plugin/` com um único commit, sem histórico incremental;
- ausência de calendário e de atas/transcrições, por declaração da dona do projeto, deixando apenas uma classe de fonte contra o mínimo de duas exigido pelo Workstream E;
- período declarado de ~4,4 semanas contra a janela de 6 semanas consecutivas travada em SC-01.

Falha em três dos cinco critérios de elegibilidade travados. Avaliação completa no §6 do [experiment log](observations/sprint-0-experiment-log.md).

Este é o estado formal do sprint retrospectivo:

`DEFERRED — HISTORICAL DATASET UNAVAILABLE`

O motivo é a inexistência, hoje, de dataset histórico elegível com temporalidade preservada, diversidade mínima de fontes, reconstrução confiável de `first_detectable_at` e janela consecutiva suficiente. A baseline §34 já listava isso como pergunta bloqueante nº 3 — *"Qual janela histórica representa trabalho real e pode ser usada no sprint?"*. A resposta empírica foi: nenhuma disponível no momento.

### Por que não continuar procurando

Procurar indefinidamente por um dataset histórico melhor tem custo crescente e retorno incerto. Mais relevante: mesmo um dataset encontrado depois carregaria as limitações estruturais que o próprio protocolo já declarava — N=1, cegamento parcial, geração e avaliação pela mesma pessoa, e o controle anti-hindsight dependendo inteiramente de congelamento por escrito. A alternativa prospectiva elimina o problema na raiz: dados gerados com timestamps corretos por construção, e a predição registrada **antes** do outcome, não reconstruída depois.

---

## Decision

Adotar **Prospective Instrumented Validation** como estratégia de validação da arquitetura.

Construir a menor V0 fiel à arquitetura congelada, alimentada inicialmente de forma manual, cuja operação produz os eventos temporais reais necessários para validar as hipóteses de forma longitudinal.

Fontes iniciais da V0:

- input manual;
- eventos adicionados pela usuária;
- decisões declaradas;
- mudanças declaradas;
- artifacts e textos adicionados manualmente;
- feedback explícito;
- comportamento observado dentro da própria AVA.

Integrações externas completas (Slack, Gmail, Figma, Calendar API) **não** são requisito da primeira versão. O input manual é feature deliberada, não gambiarra provisória: é o que garante `observed_at` correto na origem.

---

## What this decision does NOT mean

Explicitamente, e sem atenuação:

| Afirmação | Estado real |
| --- | --- |
| A arquitetura foi validada | **NÃO.** A Architecture Package v0.2 Final permanece uma hipótese arquitetural congelada, não verificada empiricamente. |
| O Sprint 0 retrospectivo passou | **NÃO.** Ele não foi executado. Não recebeu GO, PIVOT nem STOP. |
| Os thresholds foram atingidos | **NÃO.** Nenhum threshold foi avaliado, nem para cima nem para baixo. Não foram atingidos e não foram violados — não foram medidos. |
| As hipóteses foram testadas | **NÃO.** |

Status das hipóteses da baseline §3:

| ID | Hipótese | Status |
| --- | --- | --- |
| H-01 | briefing ideal manual é valioso com frequência suficiente | `NOT TESTED` |
| H-02 | sinais relevantes ficam disponíveis antes da percepção da usuária | `NOT TESTED` |
| H-03 | fontes limitadas reconstroem estado e delta sem manutenção manual excessiva | `NOT TESTED` |
| H-04 | personalização melhora resultado acima de baseline neutro | `NOT TESTED` |
| H-05 | custo por intervenção útil é aceitável | `NOT TESTED` |
| H-06 | proatividade não produz mais ruído/vigilância que valor | `NOT TESTED` |

Nenhuma hipótese muda de status por causa desta decisão. A decisão troca o **instrumento** de medição, não o resultado.

Registro adicional contra leitura equivocada futura: a perda de timestamps no candidato Vytta é artefato de uma operação de cópia de arquivos, **não** propriedade do trabalho da dona nem das fontes que o produto pretende usar. Tratá-la como evidência contra H-03 seria erro de atribuição.

---

## Validation mechanism

O ciclo que a V0 instrumentada precisa fechar:

```text
User input
↓
Evidence
↓
State
↓
Change
↓
Opportunity / response
↓
User exposure
↓
Feedback
↓
Outcome
↓
Longitudinal evaluation
```

A propriedade que torna esse ciclo válido como instrumento — e que o estudo retrospectivo não conseguia garantir — é que **cada seta carrega um timestamp registrado no momento em que aconteceu**, não reconstruído depois. Isso elimina hindsight leakage por construção, em vez de por disciplina.

Duas condições precisam ser preservadas para que o ciclo produza evidência e não apenas telemetria:

1. **A predição precede o outcome.** Opportunity, Value Vector e DecisionRecord são gravados antes da exposição à usuária. Sem isso não há evidência de aprendizagem, apenas racionalização (baseline §24).
2. **Output do sistema não confirma o sistema.** Todo artefato produzido pela AVA carrega `content_origin = system` e lineage do run; se reaparecer, não conta como evidência independente (baseline §11).

---

## Future validation

O instrumento deve conseguir medir, entre outros:

| Dimensão | Origem na baseline |
| --- | --- |
| correctness | §23, dimensão epistêmica |
| novelty | §18, fator do Value Vector |
| already known rate | §23, dimensão de entrega |
| false positives | §27, camada show policy |
| serious false negatives | §27, camada show policy |
| anticipation window | §33, risco de signal latency |
| useful interventions | §26, denominador de custo |
| memory accuracy | §27, camada state/memory |
| context reconstruction | §27, camada retrieval |
| Context Health behavior | §16, §27 |
| personalization lift | §27, comparação cega por categoria |
| cost | §26 |
| latency | §26 |

Estas são as grandezas que a instrumentação da V0 precisa tornar calculáveis. A especificação técnica trata disso em sua seção de Prospective Validation Instrumentation.

---

## Relationship with previous protocol

O [Validation Sprint 0 Protocol v0.1](validation-sprint-0-protocol-v0.1.md) e o [Pre-Execution Decisions v0.1](pre-execution-decisions-v0.1.md) permanecem **documentos históricos válidos e inalterados**. Não são apagados, reescritos nem substituídos. O experiment log e a avaliação do candidato Vytta permanecem como registro do que foi tentado e por que não foi possível.

Eles continuam úteis como fonte de:

- vocabulário de rotulagem (feedback bidimensional, força ordinal, tipos de mudança);
- schemas de dataset;
- definições operacionais de unidades de análise;
- métodos adequados a poucos dados;
- e, potencialmente, thresholds.

**Regra de reuso de thresholds.** Um threshold travado para o estudo retrospectivo **não** migra automaticamente para o contexto prospectivo. Os contextos são semanticamente diferentes em pelo menos três aspectos:

1. no retrospectivo, um "briefing" era produzido manualmente por um humano com acesso amplo e tempo — o **teto** de valor; no prospectivo, é produzido pelo sistema, sob Context Health real e budget real;
2. no retrospectivo, o esforço de normalização manual media a viabilidade de H-03; no prospectivo, parte desse esforço é a própria captura manual, que é feature, não custo de manutenção;
3. no retrospectivo, a janela de antecipação era reconstruída; no prospectivo, é medida.

Qualquer futuro **Prospective Validation Protocol** deve ser explicitamente versionado e, para cada threshold herdado, documentar a equivalência semântica que justifica o reuso. Herdar um número sem documentar a equivalência é mudança de critério disfarçada de continuidade.

---

## Governança

Esta decisão **não altera a arquitetura**. A Architecture Package v0.2 Final permanece congelada e a tag `architecture-v0.2-final` permanece imóvel.

Um ponto exige atenção explícita, e está registrado como questão bloqueante na especificação técnica: a baseline §26 declara o modelo de Cost & Latency um **gate bloqueante antes da implementação**, alimentado por dados observados no Validation Sprint. Adiar o sprint significa que esse gate não pode ser fechado na forma originalmente especificada. Isso não é resolvido por este documento e não deve ser resolvido silenciosamente — requer ADR formal (próximo ID disponível: **ADR-21**), conforme a política de mudança da [BASELINE.md](../architecture/BASELINE.md).

---

## Próximo gate

Produzir a AVA V0 Implementation Plan a partir da [AVA Technical V0 Specification v0.1](../specification/ava-technical-v0-specification-v0.1.md).
