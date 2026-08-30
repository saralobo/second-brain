# Validation Sprint 0 Protocol v0.1

```text
Status: READY FOR EXECUTION
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final
Purpose: falsify key product and architecture assumptions before implementation
```

**Data:** 30 de agosto de 2026
**Protocol version:** v0.1
**Baseline:** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md) · [BASELINE.md](../architecture/BASELINE.md)
**Execução:** NOT STARTED

---

## 0. Propósito e não-propósito

O Validation Sprint 0 existe para **tentar falsificar** as premissas centrais do produto antes de qualquer implementação. Ele é modelagem manual, conforme §8 da baseline. Não é build, não é piloto e não é demo.

O sprint tenta descobrir empiricamente:

1. se existe valor real em detectar mudanças, contexto perdido e trabalho latente;
2. se essas oportunidades podem ser percebidas antes da usuária;
3. se fontes limitadas conseguem reconstruir estado e delta;
4. se o custo potencial da arquitetura é aceitável;
5. se Entity Resolution é viável nas fontes candidatas;
6. em quais categorias existe estabilidade suficiente para personalização futura.

**O objetivo não é provar que a arquitetura está correta. O objetivo é descobrir rapidamente onde ela está errada.**

### Hipóteses da baseline testadas aqui

Conforme §3 da baseline, sem reformulação:

| ID | Hipótese (baseline §3) | Coberta por |
| --- | --- | --- |
| H-01 | um briefing ideal, produzido manualmente com acesso amplo, é valioso com frequência suficiente | Workstream B |
| H-02 | sinais relevantes ficam disponíveis antes do momento em que a usuária já os percebe | Workstream A |
| H-03 | fontes limitadas permitem reconstruir estado e delta sem manutenção manual excessiva | Workstreams A, B, E |
| H-05 | o custo por intervenção útil é aceitável | Workstream D |
| H-04 | a personalização melhora o resultado acima de um baseline neutro | parcialmente preparada por C e F; **não decidida neste sprint** |
| H-06 | a proatividade não produz mais ruído, vigilância percebida ou correção do que valor | **fora do escopo do Sprint 0**; exige acompanhamento posterior |

O sprint não testa H-04 nem H-06 de forma conclusiva. C e F apenas produzem o bootstrap declarado e o mapa de estabilidade por categoria necessários para testar H-04 depois (EXP-10).

### Mapeamento para os experimentos da baseline (§35)

| Workstream deste protocolo | Baseline §8 | EXP da baseline §35 |
| --- | --- | --- |
| A — Retrospective Opportunity Study | A. Retrospective Opportunity | EXP-00B |
| B — Ideal Briefing Study | B. Ideal Briefing | EXP-00A |
| C — Declared Cognition Bootstrap | C. Declared Cognition | insumo de EXP-10 |
| D — Cost & Latency Study | D. Cost & Latency | EXP-00D |
| E — Entity Resolution Feasibility | E. Entity Resolution | EXP-00C |
| F — Auto-consistency | F. Auto-consistency | EXP-00E |

Nenhuma hipótese de produto nova é introduzida por este protocolo.

### Fora do escopo deste sprint

- implementação, código de aplicação ou protótipo funcional;
- integração técnica com Slack, Gmail, Figma, Calendar ou qualquer fonte;
- ingestão automatizada, pipeline ou banco de dados;
- alteração da arquitetura ou criação de v0.3;
- execução de qualquer experimento (este documento apenas define o protocolo).

---

## 1. Princípios do protocolo

Estes princípios governam a execução e prevalecem sobre conveniência de resultado.

1. **Critérios antes do resultado.** Critérios de sucesso e falha são definidos e registrados antes de observar qualquer resultado.
2. **Hindsight leakage deve ser evitado.** Ao reconstruir um momento, só pode ser usado o que estava disponível até aquele timestamp.
3. **Resultados negativos são válidos.** Um resultado que mata ou reduz a tese é uma saída bem-sucedida do sprint.
4. **Nenhuma métrica pode ser reinterpretada depois para salvar a hipótese.** Mudança de critério após ver dados invalida a decisão associada e deve ser registrada como desvio.
5. **Separar fatos observados de inferências.** Todo registro distingue o que foi observado na fonte do que foi concluído pelo revisor.
6. **Preservar ordem temporal.** `observed_at` e a sequência real dos eventos são preservados; reconstrução nunca reordena a história.
7. **Usar baseline simples sempre que possível.** Toda comparação tem um baseline barato e explícito.
8. **Registrar `n` e limitações.** Nenhum número aparece sem o tamanho da amostra e as limitações conhecidas.
9. **Não confundir utilidade percebida com correção.** As duas dimensões são registradas separadamente (§6 deste protocolo).
10. **Não alterar a arquitetura durante a execução do sprint.** A baseline permanece congelada até o fim do sprint.
11. **Mudanças necessárias após os resultados geram ADR.** Conforme [docs/decisions/README.md](../decisions/README.md), próximo ID disponível: ADR-21.
12. **Nenhum resultado individual é prova universal.** Um episódio, um dia ou um briefing não generaliza.

### Anti-hindsight: regras operacionais

- Cada episódio tem um **timestamp cutoff** explícito. Evidência posterior ao cutoff entra apenas na etapa de comparação, nunca na etapa de geração.
- A geração de oportunidades candidatas é feita **antes** de abrir o registro do que aconteceu depois, e é congelada por escrito antes da comparação.
- Quando a mesma pessoa executa geração e comparação (cenário provável em N=1), o congelamento por escrito com timestamp é o único controle disponível e deve ser registrado como limitação.
- Nenhuma oportunidade pode ser adicionada, editada ou removida após a abertura do futuro. Correções posteriores entram como nota separada, marcada `post_hoc = true`, e são excluídas das métricas.

### Viés de avaliação (baseline §27)

Aplicam-se as proteções da baseline: separar criação e rotulagem quando possível, ocultar origem do método em comparações, incluir baseline simples, registrar mudança de critério, não usar "aceitou" como sinônimo de "foi valioso", e não transformar a satisfação da dona do projeto na única métrica.

**Limitação estrutural declarada:** este é um estudo N=1 conduzido pela própria dona do projeto. Cegamento é parcial, independência de avaliador é limitada e há incentivo a favor da tese. Isso não invalida o sprint, mas todo resultado positivo deve ser lido com essa limitação explícita ao lado.

---

## 2. Escopo do sprint

### 2.1 Unidade de análise

| Unidade | Definição operacional |
| --- | --- |
| **workstream** | Linha de trabalho contínua com objetivo próprio, artifacts próprios e dependências próprias. É o recorte de seleção do sprint (baseline §13). |
| **período / dia** | Intervalo entre dois checkpoints consecutivos. Unidade de agregação de volume e custo. |
| **event** | Ocorrência datada e recuperável em uma fonte (reunião, mensagem, edição, criação, decisão registrada). Unidade bruta de contagem. |
| **change** | Delta no estado do trabalho, conforme §3 deste protocolo. Unidade central do Workstream A. |
| **opportunity** | Possibilidade de valor ainda não solicitada, conforme §3. Unidade de saída do Workstream A. |
| **intervention** | Um item entregue à usuária em um briefing. Unidade de avaliação do Workstream B e denominador de custo do Workstream D. |
| **prepared artifact** | Artefato reversível produzido antes de solicitação explícita. Unidade de medida de desperdício. |
| **personal decision** | Uma escolha entre alternativas reais, com contexto registrado. Unidade do Workstream F. |
| **episode** | Agrupamento de trabalho do Workstream A: um cutoff + as mudanças e oportunidades associadas a ele. |

Um item pode pertencer a mais de uma unidade (uma `change` pode originar zero, uma ou várias `opportunity`). Contagens nunca são somadas entre unidades diferentes.

### 2.2 Janela histórica

O sprint usa uma janela histórica real de trabalho. O valor exato ainda não foi escolhido.

```text
Selected window: TO BE FILLED BEFORE EXECUTION
Selected workstream(s): TO BE FILLED BEFORE EXECUTION
```

**Procedimento de seleção (executar antes de olhar conteúdo):**

1. Listar os workstreams candidatos com atividade no período recuperável, usando apenas metadados (quantidade de reuniões, existência de documentos, existência de decisões registradas) — **sem ler o conteúdo**.
2. Aplicar os critérios de elegibilidade abaixo, em ordem, e eliminar candidatos que falhem em qualquer um.
3. Entre os candidatos elegíveis restantes, escolher pelo critério declarado em (4). Registrar a lista completa de candidatos eliminados e o motivo.
4. Critério de desempate declarado antes de olhar: **maior cobertura de fontes recuperáveis**, não "onde o sistema teria ajudado mais".

**Critérios de elegibilidade:**

- atividade suficiente: existe mais de um evento por unidade de checkpoint na maior parte da janela;
- existem decisões e mudanças observáveis no período;
- as fontes do período continuam recuperáveis e legíveis hoje;
- representa trabalho real, não um projeto de demonstração;
- possui pelo menos duas fontes distintas (requisito de Workstream E).

**Critério de exclusão explícito:** a janela **não pode** ser selecionada porque já se sabe que "deu certo", que houve um erro evitável memorável ou que o sistema teria brilhado ali. Se a janela escolhida for a que primeiro veio à mente como bom exemplo, isso deve ser registrado como risco de seleção.

**Tamanho da janela:** `DECISION REQUIRED BEFORE EXECUTION`
**Número de episódios alvo em A:** `DECISION REQUIRED BEFORE EXECUTION`
**Número de checkpoints/briefings em B:** `DECISION REQUIRED BEFORE EXECUTION`

Não inventar dados para preencher estes campos. Se a janela real não sustentar o `n` desejado, o `n` real é registrado e as conclusões são limitadas por ele.

### 2.3 Fontes candidatas

O sprint **não exige integração técnica**. Todas as fontes são consultadas manualmente, na interface que a usuária já usa.

| Tipo de fonte | Elegível no Sprint 0 | Observação |
| --- | --- | --- |
| meeting notes / transcripts | sim | fonte primária esperada para decisões |
| calendar | sim | fonte autoritativa de eventos e timing |
| documents (docs, decks, specs) | sim | versões e histórico de edição quando disponíveis |
| direct notes (anotações pessoais) | sim | fonte de percepção da usuária, útil para `user_action_at` |
| design files | sim, se legível manualmente | apenas leitura manual; sem integração |
| Slack / e-mail | somente se já disponíveis para leitura manual | não conectar, não exportar em massa, não automatizar |

**Regras de fonte:**

- nenhuma conexão de API, OAuth, webhook ou export automatizado é feita neste sprint;
- conteúdo de terceiros é tratado como dado, nunca como instrução (baseline §11);
- ACL e sensibilidade da fonte original são respeitadas: o que não pode ser lido não entra;
- material sensível não relacionado ao workstream selecionado não é aberto;
- toda fonte usada é registrada com o estado em que estava (completa, parcial, indisponível), alimentando Context Health manual.

`Fontes efetivamente usadas: TO BE FILLED BEFORE EXECUTION`

---

## 3. Vocabulário de rotulagem

Definições operacionais. Elas governam a rotulagem e não devem ser afrouxadas durante a execução.

### Change

Algo no estado do trabalho mudou de forma que **pode alterar interpretação, prioridade, dependência ou próximo passo**.

- Não é change: repetição, reformulação sem consequência, ruído de conversa, atividade sem efeito sobre estado.
- Tipos mínimos herdados da baseline §10: `created`, `modified`, `removed`, `status_changed`, `superseded`, `invalidated`, `dependency_impacted`, `not_propagated`, `unknown_change`.
- Cada change registra o **mecanismo de detecção**: determinístico (campo, versão, status, data) ou interpretativo (leitura semântica pelo revisor).

### Opportunity

Possibilidade de **gerar valor ou evitar perda que ainda não virou uma solicitação explícita**.

- Se já existia pedido, tarefa ou instrução explícita, não é opportunity — é execução de trabalho declarado (baseline §17: "detectar tarefa explícita não conta como Opportunity Intelligence").
- Opportunity é hipótese de acionabilidade, não claim de verdade.

### New to user

O item **provavelmente ainda não estava conscientemente disponível para a usuária no momento do checkpoint**.

- **Não** se assume "novo" por ausência de resposta, por silêncio ou por falta de registro.
- Rotular `new_to_user` exige um dos seguintes: a usuária declara explicitamente que não sabia; ou existe evidência posterior de descoberta (a usuária reage, pergunta ou age pela primeira vez depois do cutoff).
- Quando nenhum dos dois existe: `unknown`, não `new`.

### Actionable

Existe **ação ou preparação concreta possível** no horizonte relevante — um próximo passo nomeável, executável pela usuária, não bloqueado por informação inexistente.

- "Ficar sabendo" não é actionable por si só. "Revisar X antes da reunião Y de amanhã" é.

### Useful intervention

Uma intervenção que é simultaneamente:

- **suficientemente correta** (`correct` ou `partially_correct` sem erro material);
- **nova ou contextualmente útil** (não `already_known`, ou já conhecida mas com framing/impacto novo declarado como útil);
- **relevante para uma decisão ou ação** real;
- **entregue em timing adequado** (não `too_early`, não `too_late`).

Uma intervenção que falha em qualquer um dos quatro **não** é útil. Esta é a unidade do denominador de custo (§10).

### Already known

A informação estava correta, mas **não adicionava valor porque a usuária já a conhecia** naquele momento. É um resultado de valor, não de correção.

### False positive

O item foi promovido como relevante mas **não deveria ter ocupado atenção**: irrelevante, já conhecido sem framing novo, ou não acionável. Vale igualmente para itens promovidos por revisor manual — neste sprint não há sistema.

### Serious false negative

Algo importante **existia nas fontes** disponíveis até o cutoff, **deveria ter sido promovido**, e ficou de fora — e sua ausência teve ou poderia ter tido consequência real (retrabalho, decisão pior, prazo perdido, propagação não feita).

- Falso negativo trivial (existia, seria útil, sem consequência) é registrado separadamente e não conta como grave.

### Definições complementares

| Termo | Definição operacional |
| --- | --- |
| **evidence** | Item de fonte, recuperável, com timestamp e origem. Nunca é a conclusão do revisor. |
| **first_detectable_at** | Timestamp da primeira evidência disponível a partir da qual a mudança/oportunidade poderia ter sido identificada por alguém com acesso às fontes selecionadas. |
| **user_action_at** | Timestamp em que a usuária demonstravelmente percebeu ou agiu. Se nunca percebeu, `null` com nota. |
| **anticipation_window** | `user_action_at − first_detectable_at`. Negativo é impossível por construção; zero significa detecção simultânea; `null` quando `user_action_at` é `null`. |
| **evidence strength** | ESTABLISHED / SUPPORTED / SPECULATIVE, conforme baseline §29. Nunca um número. |
| **context health** | HEALTHY / DEGRADED / INSUFFICIENT no momento do cutoff, conforme baseline §16. |
| **hindsight risk** | `low` / `medium` / `high`: quanto a identificação depende de saber o que aconteceu depois. Avaliado por quem gerou, no momento da geração. |
| **not_verifiable** | Não é possível decidir a correção com as fontes disponíveis. Não é sinônimo de incorreto. |
| **abstention** | Decisão explícita de não promover nada. É um resultado válido, não uma falha. |

---

## 4. Feedback bidimensional

Todo item avaliado recebe **duas dimensões independentes**, conforme baseline §23. É proibido combiná-las em um score único.

### Dimensão 1 — Epistemic correctness

| Valor | Significado |
| --- | --- |
| `correct` | o que foi afirmado corresponde às fontes |
| `partially_correct` | núcleo correto com erro secundário identificável |
| `incorrect` | contradiz as fontes ou afirma algo sem base |
| `not_verifiable` | fontes disponíveis não permitem decidir |

### Dimensão 2 — Delivery / value

| Valor | Significado |
| --- | --- |
| `valuable` | mudou ou poderia ter mudado uma decisão, ação ou preparação |
| `already_known` | correto, porém já conhecido, sem framing ou impacto novo |
| `irrelevant` | não afeta trabalho, decisão ou atenção legítima |
| `too_early` | correto e relevante, mas antes de poder ser usado |
| `too_late` | correto e relevante, mas depois da janela de uso |

Um item pode ser `correct` + `irrelevant`, ou `partially_correct` + `valuable`. Nenhuma combinação é impossível a priori.

**Regra de derivação:** `useful intervention` é derivada das duas dimensões conforme §3, e é a única agregação permitida — e apenas para o denominador de custo.

---

## 5. Workstream A — Retrospective Opportunity Study

**Testa:** H-02, e parcialmente H-03. Corresponde a EXP-00B.

### Hipóteses

- **A-H1:** sinais relevantes existem nas fontes antes da percepção ou ação da usuária.
- **A-H2:** mudanças podem gerar oportunidades úteis, não apenas informação.
- **A-H3:** existe uma janela real de antecipação, larga o bastante para ser explorada por um checkpoint.

Falsificação: se as oportunidades só forem identificáveis com hindsight, ou se `anticipation_window` for consistentemente ~0 ou negativa em prática, A-H1/A-H3 caem.

### Método, por episódio

1. **Fixar o cutoff.** Escolher um timestamp na janela histórica. A escolha dos cutoffs é feita por regra (ex.: um por checkpoint natural do período), não por "onde houve algo interessante".
2. **Reconstruir somente o contexto disponível até o cutoff.** Abrir apenas as fontes e versões existentes até aquele instante. Registrar quais fontes estavam completas, parciais ou indisponíveis (Context Health manual).
3. **Listar mudanças observáveis** desde o cutoff anterior, com tipo (baseline §10) e mecanismo de detecção.
4. **Registrar a primeira evidência disponível** de cada mudança: fonte, timestamp, e se a detecção seria determinística ou interpretativa.
5. **Identificar dependências e impactos** usando apenas relações determinísticas (dependência declarada, referência direta, autoria, pertencimento a workstream). Não construir grafo.
6. **Gerar oportunidades candidatas** a partir das mudanças. Escrever e **congelar** — registro datado, imutável a partir daqui.
7. **Abrir o futuro.** Só agora consultar o que realmente aconteceu depois do cutoff.
8. **Registrar quando a usuária percebeu ou agiu** (`user_action_at`) com a evidência que sustenta essa data.
9. **Medir a janela de antecipação** e classificar correctness e value, sem alterar a lista congelada.

### Baseline de comparação

`chronological/manual summary without delta reasoning` — um resumo cronológico simples do período entre cutoffs, produzido sem raciocínio de delta, impacto ou propagação. Produzido a partir das mesmas fontes e do mesmo cutoff. Serve para separar "valor de organizar informação" de "valor de raciocinar sobre mudança".

### Schema de observação — `episodes` + `opportunities`

```text
episode_id
workstream
timestamp_cutoff
evidence_available        # lista de {source, item_ref, timestamp, state}
context_health_at_cutoff  # HEALTHY | DEGRADED | INSUFFICIENT
change                    # {change_type, object, before_ref, after_ref, detection_mechanism}
opportunity               # {description, minimal_action, effort, reversibility}
first_detectable_at
user_action_at            # null se nunca
anticipation_window       # user_action_at - first_detectable_at | null
correctness               # correct | partially_correct | incorrect | not_verifiable
value                     # valuable | already_known | irrelevant | too_early | too_late
new_to_user               # yes | no | unknown
actionable                # yes | no
hindsight_risk            # low | medium | high
evidence_strength         # ESTABLISHED | SUPPORTED | SPECULATIVE
notes                     # separar fato observado de inferência do revisor
```

### Métricas primárias

- distribuição de `anticipation_window` (mediana e faixa), reportada **apenas** sobre itens com `hindsight_risk = low`;
- contagem absoluta de oportunidades `actionable` + `valuable` + `new_to_user ≠ no`;
- proporção de mudanças detectáveis deterministicamente vs. interpretativamente;
- serious false negatives identificados ao abrir o futuro;
- `n` de episódios e de oportunidades.

Contagens absolutas, não taxas sobre amostras pequenas (baseline §27).

### Critérios de decisão

Os limiares numéricos não são escolhidos por este documento.

| Condição | Decisão |
| --- | --- |
| existem oportunidades acionáveis, novas, com `hindsight_risk = low` e janela de antecipação positiva em volume relevante | **GO** — antecipação é plausível; A alimenta as classes de delta da V0 |
| oportunidades existem e são valiosas, mas a janela é ~0 ou só aparecem com hindsight | **PIVOT** — reconstrução e preparação sob demanda, sem proatividade |
| quase nada acionável, ou tudo depende de hindsight, ou nada seria detectável com as fontes escolhidas | **STOP** — a tese proativa não se sustenta como está |

`Volume mínimo de oportunidades acionáveis por período para GO: DECISION REQUIRED BEFORE EXECUTION`
`Janela de antecipação mínima considerada explorável: DECISION REQUIRED BEFORE EXECUTION`
`Proporção máxima aceitável de itens com hindsight_risk = high: DECISION REQUIRED BEFORE EXECUTION`

---

## 6. Workstream B — Ideal Briefing Study

**Testa:** H-01, e o custo de manutenção manual de H-03. Corresponde a EXP-00A.

### Objetivo

Produzir **manualmente** a experiência norte da baseline §4 e medir o **teto de valor** antes de qualquer automação. Se o briefing ideal, feito por um humano com acesso amplo e tempo, não é valioso, nenhuma implementação o tornará valioso.

### Estrutura obrigatória do briefing (baseline §4)

1. **What changed**
2. **What you may not know yet**
3. **What needs attention**
4. **What could be prepared**
5. **What can be ignored**

`Número máximo de itens por bloco: DECISION REQUIRED BEFORE EXECUTION`
`Número máximo de itens no briefing inteiro: DECISION REQUIRED BEFORE EXECUTION`

O limite existe porque atenção é escassa (baseline §5, princípio 9). Um briefing sem teto de itens não testa promoção, testa listagem.

### Processo de construção

1. Fixar o checkpoint e o cutoff. Nada posterior ao cutoff entra.
2. Cronometrar a partir daqui. Todo tempo é registrado.
3. Reconstruir o estado do workstream a partir das fontes.
4. Registrar Context Health por fonte no momento do cutoff.
5. Produzir os cinco blocos respeitando o teto de itens; cada item cita a evidência usada e a força ordinal.
6. Produzir **em paralelo, das mesmas fontes**, a baseline: resumo cronológico simples, sem raciocínio de delta, impacto ou propagação.
7. Parar o cronômetro. Registrar tempo total e tempo por etapa.
8. Aguardar o intervalo de cegamento e então avaliar.

### Cegamento

Cegamento completo é impossível em N=1 com autor e avaliador na mesma pessoa. O protocolo exige o cegamento **parcial** possível:

- briefing e baseline são apresentados sem rótulo de origem, em ordem randomizada;
- a avaliação ocorre após um intervalo mínimo entre produção e avaliação;
- a avaliação é feita item a item, sem ver a atribuição de método;
- quando houver terceiro disponível, ele produz a baseline ou faz a rotulagem.

`Intervalo mínimo entre produção e avaliação: DECISION REQUIRED BEFORE EXECUTION`
`Terceiro disponível para cegamento parcial: TO BE FILLED BEFORE EXECUTION`

A limitação de cegamento é reportada junto de todo resultado de B.

### Feedback

Cada item recebe as duas dimensões de §4, mais:

- `new_to_user` conforme §3 (com a regra de não assumir novidade);
- `already_known` explicitamente contado, não deduzido;
- classificação como false positive quando aplicável;
- ao final do período: serious false negatives, identificados revisitando as fontes e o que efetivamente aconteceu.

### Manual normalization effort

Métrica de viabilidade de primeira classe, não nota de rodapé. Testa diretamente H-03.

Registrar, por briefing:

| Campo | Descrição |
| --- | --- |
| `time_total_min` | tempo total de produção |
| `time_source_correction_min` | tempo corrigindo, completando ou reconciliando fontes |
| `time_identity_resolution_min` | tempo decidindo se dois itens/pessoas/artifacts são o mesmo |
| `time_context_reconstruction_min` | tempo reconstruindo estado anterior para poder ver o delta |
| `time_authoring_min` | tempo escrevendo o briefing em si |
| `ambiguities_found` | lista de ambiguidades encontradas, com tipo |
| `sources_unavailable` | fontes esperadas e ausentes |
| `blocked_items` | itens que não puderam ser resolvidos manualmente |

Se o esforço de normalização manual for alto e não decrescente ao longo dos briefings, isso é evidência **contra** H-03, independentemente do valor percebido do briefing.

### Schema — `briefings` + `feedback`

```text
briefing_id
checkpoint_at
cutoff_at
workstream
method                    # ideal_briefing | chronological_baseline
context_health_by_source
items[]                   # {item_id, block, text, evidence_refs, evidence_strength, actionable}
effort                    # campos de manual normalization effort acima
notes
```

```text
feedback_id
item_id
correctness               # correct | partially_correct | incorrect | not_verifiable
value                     # valuable | already_known | irrelevant | too_early | too_late
new_to_user               # yes | no | unknown
false_positive            # yes | no
reason                    # opcional, declarado pela usuária
evaluated_at
method_hidden             # yes | no
```

Serious false negatives vivem em registro próprio, ligados ao `briefing_id`, com a evidência que existia até o cutoff e a consequência observada.

### Critérios de decisão

| Condição | Decisão |
| --- | --- |
| briefing ideal produz itens úteis com frequência suficiente e supera a baseline cronológica em comparação cega | **GO** para o teto de valor da tese |
| briefing tem valor, mas não supera a baseline cronológica | **PIVOT** — o valor está em organizar contexto, não em raciocinar delta; reduzir escopo |
| briefing é majoritariamente `already_known` ou `irrelevant`, ou o esforço de normalização é proibitivo e não decresce | **STOP** ou redefinição profunda da tese |

`Frequência mínima de itens úteis por briefing para GO: DECISION REQUIRED BEFORE EXECUTION`
`Proporção máxima aceitável de already_known + irrelevant: DECISION REQUIRED BEFORE EXECUTION`
`Teto de manual normalization effort por briefing: DECISION REQUIRED BEFORE EXECUTION`
`Número mínimo de serious false negatives que caracteriza falha: DECISION REQUIRED BEFORE EXECUTION`

---

## 7. Workstream C — Declared Cognition Bootstrap

**Produz:** a primeira versão explícita e editável do conhecimento pessoal, conforme baseline §19. Insumo obrigatório de EXP-10. Não decide GO/PIVOT/STOP sozinho.

### Regra central

**Não inferir respostas.** O sprint não deduz princípios a partir de comportamento observado. Baseline §20 proíbe explicitamente transformar padrão observado em princípio declarado.

Separação obrigatória:

| Tipo | Origem | Autoridade |
| --- | --- | --- |
| `declared fact` | dito diretamente pela usuária, em resposta a uma pergunta | `knowledge_origin = declared`, autoridade máxima no escopo declarado |
| `hypothesis generated from examples` | derivada pelo entrevistador a partir de exemplos citados | `knowledge_origin = observed`, **não** é Declared Cognition |

Toda hipótese gerada durante a entrevista **precisa ser confirmada explicitamente** pela usuária, em uma pergunta separada e registrada, antes de virar Declared Cognition. Confirmação implícita, silêncio ou não-contestação não contam.

### Roteiro estruturado

Executar em sessão editável, uma seção por vez. Toda resposta é registrada literalmente antes de ser normalizada.

1. **Princípios declarados** — regras que a usuária afirma seguir no trabalho.
2. **Critérios de qualidade** — o que faz um trabalho ser bom ou inaceitável, por tipo de entrega.
3. **Preferências por contexto** — o que muda conforme cliente, projeto, fase, audiência.
4. **Quando benchmark faz sentido** — condições que justificam olhar para fora.
5. **Quando discovery faz sentido** — condições que justificam investigar antes de decidir.
6. **Evidência necessária para agir** — quanto e que tipo de evidência basta, por classe de decisão.
7. **Critérios de prioridade** — como escolher entre duas coisas legítimas.
8. **Limites de autonomia** — o que o sistema pode fazer sem perguntar.
9. **Ações que sempre exigem confirmação** — lista explícita, sem exceção implícita.
10. **Formatos preferidos** — estrutura, densidade, ordem, extensão.
11. **Profundidade** — quando resumo basta e quando detalhe é obrigatório.
12. **Exemplos positivos** — casos concretos do que foi bom, com o motivo declarado.
13. **Exemplos negativos** — casos concretos do que foi ruim, com o motivo declarado.
14. **Exceções** — quando cada princípio acima não vale.
15. **Coisas que o sistema nunca deve inferir** — domínios interditos à inferência.

Nas seções 12 e 13, exemplos são **dados**; o princípio que o entrevistador enxerga neles é **hipótese** e segue a regra de confirmação explícita.

### Schema versionado — `cognition_declarations`

```text
declaration_id
version                    # versão do bootstrap; imutável após fechada
category                   # uma das 15 seções do roteiro
declaration_text           # literal, como dito
knowledge_origin           # declared | observed
confirmed                  # yes | no | pending   (obrigatório yes se observed → declared)
confirmation_question      # a pergunta exata usada para confirmar
confirmation_at
scope                      # contexto/audiência onde vale
examples[]                 # positivos e negativos, com rótulo
exceptions[]
declared_at
status                     # active | superseded | revoked
superseded_by              # opcional
source                     # sessão/entrevista de origem
```

Uma linha com `knowledge_origin = observed` e `confirmed ≠ yes` **não é** Declared Cognition e não pode ser usada em nenhuma comparação de personalização.

### Saída

`Declared Cognition Bootstrap v1` — documento versionado, editável, revisável pela usuária a qualquer momento, com contagem de itens `declared` vs. `observed pending`.

---

## 8. Workstream D — Cost & Latency Study

**Testa:** H-05. Corresponde a EXP-00D. Gate bloqueante conforme baseline §26.

### Regra central

**Este protocolo não inventa preços nem volumes.** Todos os volumes vêm dos Workstreams A e B efetivamente executados. Todos os preços vêm da tabela vigente do provedor no momento do cálculo, registrada com data.

### Modelo de registro

Por fonte e por arquétipo de tarefa (baseline §26):

```text
observation_id
period                        # dia ou checkpoint
source
events_per_day                # E_s, observado em A/B
eligible_events               # após pré-filtro conceitual; f_filter
pct_requiring_llm             # f_llm
task_archetype
calls_per_item                # c_a
input_tokens                  # T_in,a
output_tokens                 # T_out,a
retry_multiplier              # r_a
evaluator_sampling_rate
processing_frequency          # streaming | micro_batch | on_demand
preparation_frequency         # quantas preparações por período
useful_interventions          # denominador, conforme §3
unused_prepared_artifacts
notes
```

Tokens e chamadas são **estimados a partir do trabalho manual realmente feito** (o que precisou ser lido, comparado e escrito), não a partir de suposição.

### Modos comparados (baseline §26)

| Modo | O que medir |
| --- | --- |
| streaming | custo contínuo estimado, latência mínima, complexidade |
| micro-batch por checkpoint | custo por checkpoint, atraso evento→checkpoint |
| on-demand | custo por invocação, cobertura perdida por falta de gatilho |

Recomendação provisória da baseline é micro-batch; o estudo pode falsificá-la.

### Cálculos (executados depois, com dados reais)

```text
calls_a/day = eligible_items_a × c_a × (1 + r_a)
token_cost_a/day = calls_a/day × ((T_in,a × input_price_a) + (T_out,a × output_price_a))
total_cost/day = Σ token_cost_a + tool/storage/connector costs
cost/month = total_cost/day × dias de operação assumidos (registrar a suposição)
cost/useful_intervention = total_cost / resolved_useful_interventions
wasted_preparation_cost = custo de artifacts preparados e não usados
latency_P50, latency_P95 por arquétipo
```

Custo de desenvolvimento é registrado separadamente do custo operacional, mas ambos aparecem na decisão (baseline §26).

### Ordem obrigatória

O **teto de custo por intervenção útil deve ser definido antes** de calcular o custo. Definir o teto depois de ver o número é violação do princípio 1 e invalida a decisão.

```text
maximum acceptable cost per useful intervention: DECISION REQUIRED BEFORE EXECUTION
maximum acceptable cost per month: DECISION REQUIRED BEFORE EXECUTION
maximum acceptable latency P95 checkpoint → briefing: DECISION REQUIRED BEFORE EXECUTION
assumed operating days per month: DECISION REQUIRED BEFORE EXECUTION
```

### Critérios de decisão

| Condição | Decisão |
| --- | --- |
| custo por intervenção útil dentro do teto em pelo menos um modo | **GO** naquele modo |
| custo excede o teto em modo contínuo, mas cabe em micro-batch ou on-demand | **PIVOT** de frequência/modo |
| custo excede o teto em todos os modos, mesmo com escopo reduzido | **PIVOT** de escopo (menos fontes, menos classes) antes de STOP |
| custo excede o teto em todos os modos e escopos plausíveis | **STOP** econômico |

---

## 9. Workstream E — Entity Resolution Feasibility

**Testa:** H-03 na dimensão de identidade. Corresponde a EXP-00C. Pré-requisito arquitetural do Work Graph (baseline §12).

### Objetivo

Testar se objetos que aparecem em múltiplas fontes podem ser ligados com **segurança suficiente** — não se podem ser ligados de algum jeito.

### Categorias

people · meetings · artifacts · projects/workstreams · decisions · commitments

### Amostragem

Amostrar objetos que **aparecem em pelo menos duas fontes** dentro da janela selecionada. A amostra é definida por regra (ex.: todos os objetos de um período, ou amostra sistemática), nunca escolhendo os casos fáceis.

`Tamanho da amostra por categoria: DECISION REQUIRED BEFORE EXECUTION`

### Schema — `entity_resolution`

```text
resolution_id
category                      # people | meetings | artifacts | projects | decisions | commitments
source_a
source_a_identifier
source_b
source_b_identifier
deterministic_key_available   # yes | no      (ID, link, event id, endereço estável)
alias_present                 # yes | no
heuristic_needed              # yes | no      (nome, proximidade temporal, título similar)
ambiguous                     # yes | no
resolution_class              # deterministic | heuristic | ambiguous_manual
correct_merge                 # yes | no | unknown
false_merge                   # yes | no
unresolved                    # yes | no
manual_correction_required    # yes | no
time_spent_min
notes
```

### Separação obrigatória de resultados

Reportar sempre em três blocos, nunca agregados em um número único:

1. **deterministic resolution** — resolvido por chave compartilhada;
2. **heuristic resolution** — resolvido por alias ou heurística explícita;
3. **ambiguous / manual resolution** — exigiu julgamento humano.

Métricas por categoria e por par de fontes: cobertura determinística, taxa de falso merge, taxa de não resolvidos, correções manuais, tempo gasto (baseline §12).

### Quando trocar de fontes

Conforme baseline §33 ("fonte depende majoritariamente de merge ambíguo"):

| Condição | Decisão |
| --- | --- |
| cobertura determinística suficiente na maioria das categorias relevantes | **GO** com as fontes escolhidas |
| resolução depende majoritariamente de heurística ou merge ambíguo, ou falso merge afeta deltas e briefings | **PIVOT de fontes** — trocar ou reduzir o conjunto de fontes, não necessariamente o produto |
| nenhuma combinação de fontes disponíveis resolve identidade com segurança | reduzir escopo a fonte única, aceitando perda de cross-source; reavaliar a tese depois |

`Cobertura determinística mínima por categoria: DECISION REQUIRED BEFORE EXECUTION`
`Taxa máxima aceitável de falso merge: DECISION REQUIRED BEFORE EXECUTION`
`Tempo máximo aceitável de correção manual por período: DECISION REQUIRED BEFORE EXECUTION`

Resultado ruim aqui **não** mata o produto. Ele muda as fontes ou o alcance do Work Graph (baseline §13: existência condicionada a EXP-04).

---

## 10. Workstream F — Auto-consistency

**Prepara:** H-04. Corresponde a EXP-00E. Decide **limites** do PCM, nunca sua eliminação global (baseline §8).

### Objetivo

Não testar "a personalidade inteira". Identificar **em quais categorias** as escolhas têm estabilidade suficiente para justificar personalização futura.

### Método

1. **Categorias.** Definir as categorias de escolha a testar, derivadas do trabalho real (ex.: prioridade entre entregas, profundidade de investigação, formato de entrega, critério de qualidade). `Categorias selecionadas: TO BE FILLED BEFORE EXECUTION`
2. **Pares de alternativas.** Usar decisões e opções **reais do histórico** sempre que possível. Alternativas construídas artificialmente são marcadas como tal e reportadas separadamente.
3. **Reapresentação.** O mesmo par é apresentado novamente em momento posterior, com ordem das alternativas randomizada e rótulos neutralizados.
4. **Intervalo entre avaliações.** Longo o bastante para não ser memória do teste anterior. `Intervalo: DECISION REQUIRED BEFORE EXECUTION`
5. **Randomização de ordem** obrigatória em ambas as apresentações.
6. **Registro de mudança de contexto.** Se o contexto real mudou entre as apresentações, isso é registrado — inconsistência com mudança de contexto é `context_dependent`, não `unstable`.
7. **Justificativa opcional.** A usuária pode declarar o motivo; a justificativa é dado, não critério.

### Schema — `auto_consistency`

```text
trial_id
category
pair_id
alternative_a
alternative_b
alternatives_origin        # real_history | constructed
presentation_round         # 1 | 2
presentation_order         # ab | ba
choice
justification              # opcional, literal
context_changed_since_r1   # yes | no | unknown
context_change_note
evaluated_at
```

### Resultados possíveis, **por categoria**

| Resultado | Significado | Consequência |
| --- | --- | --- |
| `sufficiently stable` | escolhas se repetem sob reapresentação randomizada | categoria elegível para personalização futura |
| `context dependent` | escolhas variam, mas a variação acompanha mudança de contexto registrada | personalização só com contexto explícito; candidata a Declared Cognition condicional |
| `unstable / abstain` | escolhas variam sem contexto explicativo | sistema deve abster-se de personalizar nessa categoria |

Medir **sempre por categoria**, com `n` visível. Reportar global apenas como descrição, nunca como decisão.

### Regra de proteção

**Falha em uma categoria não elimina Personal Cognition como um todo.** O resultado de F define onde o sistema personaliza e onde se abstém. Se todas as categorias testadas forem instáveis, a consequência é manter Core Learning sem Statistical Personalization (baseline §21, trilha 2 permanece fechada) — não encerrar o produto.

`Número mínimo de pares por categoria: DECISION REQUIRED BEFORE EXECUTION`
`Taxa de auto-concordância que caracteriza sufficiently stable: DECISION REQUIRED BEFORE EXECUTION`

---

## 11. Decision matrix do sprint

Consolidação. Preenchida com o resultado real ao fim do sprint, nunca antes.

| Finding | GO | PIVOT | STOP | Architectural consequence |
| --- | --- | --- | --- | --- |
| **Briefing manual é valioso e antecipável** (B alto + A com janela positiva) | GO para V0 proativa | — | — | segue o Build Sequence da baseline §32, Stage 1 |
| **Briefing é valioso, mas antecipação não existe** (B alto + A sem janela) | — | PIVOT para reconstrução e preparação sob demanda | — | remove checkpoint proativo do centro; on-demand vira modo primário; ADR necessário |
| **Nem intervenção manual produz valor suficiente** (B baixo) | — | — | STOP ou redefinição profunda da tese | a tese proativa não sobrevive; nenhuma parte do build começa |
| **Fontes são úteis mas Entity Resolution é ruim** (A/B ok + E ruim) | — | PIVOT de fontes, não de produto | — | troca/redução do conjunto de fontes antes de construir; Work Graph permanece fora (EXP-04 não é sequer avaliado) |
| **Custo é inviável** (D acima do teto) | — | PIVOT de frequência, modo ou escopo | STOP econômico se nenhum modo/escopo couber | micro-batch ou on-demand; redução de fontes e classes; ADR de Cost & Latency |
| **Personalização não supera baseline** (F instável em todas as categorias) | — | — | — | manter Core Learning sem Statistical Personalization; trilha 2 da baseline §21 permanece fechada; V0 não é afetada |

A matriz não cria decisões além das já implicadas pela baseline §8.

---

## 12. Kill / Pivot Criteria

Critérios definidos **antes** da execução. Quando a baseline já define o critério semanticamente (§33), ele é preservado sem alteração.

| # | Sinal | Origem na baseline | Ação | Threshold |
| --- | --- | --- | --- | --- |
| K-1 | pouco conteúdo novo e acionável no briefing ideal, segundo critério prévio | §33 "teto de valor baixo" | STOP ou redefinição da tese | `DECISION REQUIRED BEFORE EXECUTION` |
| K-2 | janela de antecipação inexistente | §33 "signal latency" | PIVOT para on-demand | `DECISION REQUIRED BEFORE EXECUTION` |
| K-3 | fonte depende majoritariamente de merge ambíguo | §33 "entity resolution failure" | PIVOT de fontes | `DECISION REQUIRED BEFORE EXECUTION` |
| K-4 | custo por intervenção útil excede o limite definido no sprint | §33 "cost explosion" | PIVOT de frequência/modo/escopo; STOP se nenhum couber | `DECISION REQUIRED BEFORE EXECUTION` (ver §8) |
| K-5 | esforço de normalização manual alto e não decrescente | §3 H-03; §33 "ontology rigidity" | PIVOT de fontes/escopo | `DECISION REQUIRED BEFORE EXECUTION` |
| K-6 | aumento de itens irrelevantes ou "já sabia" no briefing | §33 "proactivity noise" | reduzir top-k e escopo de promoção | `DECISION REQUIRED BEFORE EXECUTION` |
| K-7 | correção manual e "other" dominam a classificação de objetos | §33 "ontology rigidity" | revisar o schema mínimo antes de construir | `DECISION REQUIRED BEFORE EXECUTION` |
| K-8 | itens úteis só aparecem com `hindsight_risk = high` | §33 "signal latency"; princípio 2 deste protocolo | tratar A como não conclusivo; PIVOT para on-demand | `DECISION REQUIRED BEFORE EXECUTION` |
| K-9 | a usuária evita fontes ou muda comportamento por se sentir observada | §33 "surveillance perception" | reduzir escopo de fontes imediatamente | critério qualitativo declarado, sem threshold numérico |
| K-10 | serious false negatives com consequência real e recorrentes | §27 "falsos negativos graves" | revisar cobertura de fontes antes de qualquer GO | `DECISION REQUIRED BEFORE EXECUTION` |

Nenhuma porcentagem foi escolhida por este documento. Um número escolhido sem justificativa de domínio serviria apenas para preencher a tabela e daria falsa legitimidade à decisão.

---

## 13. Data capture

```text
docs/validation/
├── README.md                              # estado da fase e ponteiros
├── validation-sprint-0-protocol-v0.1.md   # este protocolo
├── datasets/                              # dados de entrada versionados
├── observations/                          # registros brutos por experimento
└── results/                               # análises, decisões e relatórios
```

Nenhum dado real existe ainda. Os diretórios contêm apenas README explicando o propósito.

---

## 14. Dataset schemas

Formatos conceituais: **CSV, JSON ou Markdown**. Nenhum banco de dados é escolhido. Nenhuma abstração além do necessário.

| Dataset | Chave | Campos | Definido em |
| --- | --- | --- | --- |
| `episodes` | `episode_id` | workstream, timestamp_cutoff, context_health_at_cutoff, notes | §5 |
| `evidence` | `evidence_id` | episode_id, source, item_ref, timestamp, content_origin, availability_state, evidence_strength | §5, baseline §11 |
| `changes` | `change_id` | episode_id, change_type, object, before_ref, after_ref, detection_mechanism, first_detectable_at, evidence_refs | §5, baseline §10 |
| `opportunities` | `opportunity_id` | change_id, description, minimal_action, effort, reversibility, first_detectable_at, user_action_at, anticipation_window, correctness, value, new_to_user, actionable, hindsight_risk, notes | §5 |
| `briefings` | `briefing_id` | checkpoint_at, cutoff_at, workstream, method, context_health_by_source, items[], effort fields | §6 |
| `feedback` | `feedback_id` | item_id, correctness, value, new_to_user, false_positive, reason, evaluated_at, method_hidden | §6 |
| `entity_resolution` | `resolution_id` | category, source_a/b + identifiers, deterministic_key_available, alias_present, heuristic_needed, ambiguous, resolution_class, correct_merge, false_merge, unresolved, manual_correction_required, time_spent_min | §9 |
| `cognition_declarations` | `declaration_id` | version, category, declaration_text, knowledge_origin, confirmed, confirmation_question, confirmation_at, scope, examples[], exceptions[], declared_at, status | §7 |
| `cost_observations` | `observation_id` | period, source, events_per_day, eligible_events, pct_requiring_llm, task_archetype, calls_per_item, input_tokens, output_tokens, retry_multiplier, evaluator_sampling_rate, processing_frequency, preparation_frequency, useful_interventions, unused_prepared_artifacts | §8 |
| `auto_consistency` | `trial_id` | category, pair_id, alternative_a/b, alternatives_origin, presentation_round, presentation_order, choice, justification, context_changed_since_r1, evaluated_at | §10 |

Campos transversais em todos os datasets: `dataset_version`, `recorded_at`, `recorded_by`, `notes`. Toda inferência do revisor vai em `notes`, nunca em campo de fato.

---

## 15. Experiment log

Todo experimento executado no futuro registra, em `docs/validation/results/`, um log com:

```text
experiment_id
architecture_baseline        # Architecture Package v0.2 Final
architecture_tag             # architecture-v0.2-final
protocol_version             # v0.1
started_at
ended_at
dataset_version
hypothesis                   # a hipótese sendo falsificada
predefined_criteria          # GO / PIVOT / STOP, copiados antes de iniciar
deviations                   # tudo que saiu do protocolo, com data e motivo
result                       # o que foi observado, com n
interpretation               # separada do resultado
decision                     # GO | PIVOT | STOP | INCONCLUSIVE
related_adr                  # ADR-21+ se houver
limitations
```

`predefined_criteria` é copiado **antes** de iniciar. Se um critério mudar durante a execução, isso é `deviation`, não atualização — e a decisão associada perde validade.

Isso existe para impedir que a história seja reescrita depois do resultado.

---

## 16. Regras de encerramento do sprint

O sprint termina quando os seis workstreams tiverem resultado registrado ou tiverem sido explicitamente marcados como inconclusivos com o motivo.

Ao encerrar:

1. preencher a Decision Matrix (§11) com resultados reais;
2. registrar as decisões GO / PIVOT / STOP no experiment log;
3. abrir ADR-21+ para toda mudança arquitetural motivada por evidência, referenciando o experimento, a medida e o critério pré-definido;
4. **não** alterar o Architecture Package v0.2 Final; ele permanece congelado até que um ADR ou uma nova versão arquitetural explícita o substitua;
5. atualizar [docs/validation/README.md](README.md) com o estado final.

---

## 17. Observações documentais

Registro de observações encontradas ao ler a baseline. **Nenhuma altera a arquitetura.** Ficam aqui como nota, conforme instrução de não modificar a baseline congelada.

1. A baseline §8 lista o Workstream C ("Declared Cognition") entre os que "decidem" — personalização inicial. Como o sprint não executa EXP-10, C não produz uma decisão GO/PIVOT/STOP própria; ele produz o insumo versionado. Este protocolo trata C explicitamente como produtor de bootstrap, não como gate. Nenhuma contradição arquitetural: apenas precisão de escopo.
2. A baseline §8 e §35 usam nomes ligeiramente diferentes para os mesmos estudos (`A. Retrospective Opportunity` / `EXP-00B`, `B. Ideal Briefing` / `EXP-00A`). O mapeamento está fixado em §0 deste protocolo para evitar ambiguidade em citações futuras.
3. A baseline §35 nota que "os critérios numéricos específicos devem ser registrados antes de executar cada experimento". Este protocolo cumpre isso deixando os campos marcados `DECISION REQUIRED BEFORE EXECUTION` em vez de escolher números sem base de domínio.
