# Pre-Execution Decisions v0.1 — AVA

```text
Status: PENDING DECISION LOCK
Gate: Resolve pre-execution decisions and start Validation Sprint 0
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final
Protocol: Validation Sprint 0 Protocol v0.1
Purpose: define the ruler before any result is observed
```

**Data:** 30 de agosto de 2026
**Documento:** decision pack v0.1
**Execução do sprint:** NOT STARTED

---

## 0. Propósito e regra principal

Este documento resolve o último gate antes da execução do Validation Sprint 0: transformar cada campo aberto do protocolo em uma decisão explícita, justificada e travada **antes** de qualquer resultado.

**Regra principal: nenhum dado experimental foi observado ou analisado para produzir este documento.** Todas as recomendações vêm de desenho experimental, não de dados. Nenhuma foi calibrada para que o produto passe.

Nada é alterado aqui: nem o [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md), nem o [Validation Sprint 0 Protocol v0.1](validation-sprint-0-protocol-v0.1.md), nem a tag `architecture-v0.2-final`, nem as hipóteses.

### Correção de contagem

O relatório de entrega do protocolo informou **29** campos `DECISION REQUIRED BEFORE EXECUTION`. A contagem verificada no arquivo é **33** — os nove thresholds dos kill criteria (K-1 a K-8, K-10) haviam sido agrupados como um item só. Este documento cobre os **33** campos `DECISION REQUIRED` e os **5** campos `TO BE FILLED`, totalizando **38 decisões**.

### Tipos de decisão

| Tipo | Significado | Quem decide |
| --- | --- | --- |
| **A — Experimental design** | definível por desenho experimental, tamanho de amostra, risco de leakage e esforço operacional | proposto aqui como `PROPOSED` |
| **B — Product owner threshold** | depende de julgamento da dona do projeto (custo aceitável, ruído tolerável, valor mínimo suficiente) | `OWNER DECISION REQUIRED` |
| **C — Scope selection** | exige selecionar dados/contexto reais antes da execução | `OWNER DECISION REQUIRED` |
| **D — Derived dependency** | calculável a partir de outra decisão pré-execução, ainda antes de observar resultados | resolve-se ao travar a decisão-mãe |

Nenhuma decisão tipo B foi preenchida automaticamente.

### Distribuição

| Tipo | Quantidade |
| --- | --- |
| A — Experimental design | 13 |
| B — Product owner threshold | 10 |
| C — Scope selection | 5 |
| D — Derived dependency | 10 |
| **Total** | **38** |

---

## 1. Scope

### S-01 — Tamanho da janela histórica

**Protocol reference:** §2.2
**Type:** A

**Why this must be locked:** janela escolhida depois de olhar o conteúdo vira janela escolhida por conveniência. O protocolo já proíbe selecionar por "deu certo"; fixar o *tamanho* antes remove também o ajuste silencioso de duração até o `n` ficar favorável.

**Recommended decision:** `PROPOSED — 6 semanas`

**Reasoning:** o tamanho precisa satisfazer três restrições simultâneas. Precisa render episódios suficientes para que nenhum episódio isolado domine a conclusão (S-02). Precisa ser recente o bastante para que as fontes continuem recuperáveis e para que `user_action_at` seja verificável por evidência, não por memória. E precisa caber no esforço manual, já que todo o sprint é feito à mão. Seis semanas atende os três em trabalho de design com cadência de projeto típica; duas semanas tornam o resultado refém de um único ciclo de projeto, e doze semanas degradam a verificabilidade da percepção da usuária e explodem o esforço.

**Alternatives:**
- 2–3 semanas: barato, mas um único ciclo de projeto define o resultado.
- 6 semanas *(recomendado)*: cobre mais de um ciclo, mantém fontes vivas.
- 12 semanas: mais `n`, porém `user_action_at` passa a depender de memória e o esforço manual pode inviabilizar B.

**Consequence of stricter threshold (janela menor):** menos episódios, maior variância, maior risco de concluir GO ou STOP por acaso de um projeto atípico.
**Consequence of looser threshold (janela maior):** mais `n`, mas maior contaminação por memória imprecisa, maior custo manual e risco de o sprint não terminar.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### S-02 — Número de episódios alvo em A

**Protocol reference:** §2.2, §5
**Type:** A

**Why this must be locked:** sem alvo prévio, a coleta para quando o padrão parecer bom. Isso é *optional stopping*: garante encontrar o resultado desejado se a coleta continuar até ele aparecer.

**Recommended decision:** `PROPOSED — mínimo 12 episódios; parar em 12 mesmo que o padrão já pareça claro`

**Reasoning:** o protocolo usa contagens absolutas, não taxas (baseline §27), então o número não precisa sustentar inferência estatística — precisa sustentar a distinção entre "recorrente" e "aconteceu uma vez". Abaixo de ~8 episódios, um único episódio rico pode responder sozinho pela conclusão. Doze episódios permitem observar se oportunidades acionáveis aparecem de forma distribuída ou concentrada, que é exatamente a pergunta de A-H1. A regra de parar no alvo, e não quando o padrão agrada, é parte da decisão.

**Alternatives:**
- 8 episódios: mais barato, aceita maior risco de conclusão por episódio único.
- 12 episódios *(recomendado)*.
- 20 episódios: melhor separação, provavelmente incompatível com o esforço manual de A somado a B.

**Consequence of stricter threshold (mais episódios):** conclusão mais robusta; risco real de o sprint não ser concluído, o que é pior que uma conclusão limitada.
**Consequence of looser threshold (menos episódios):** sprint rápido, conclusões frágeis e não generalizáveis — que o protocolo já exige declarar (princípio 12).

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### S-03 — Número de checkpoints / briefings em B

**Protocol reference:** §2.2, §6
**Type:** A

**Why this must be locked:** B é uma comparação pareada cega contra baseline. Se o número de pares for decidido durante a execução, a comparação para quando o briefing ideal está ganhando.

**Recommended decision:** `PROPOSED — 8 pares (8 briefings ideais + 8 baselines cronológicas), produzidos e avaliados até o fim, sem parada antecipada`

**Reasoning:** cada checkpoint produz um par cego. Com 8 pares, uma vitória consistente do briefing ideal é distinguível de alternância aleatória sem exigir teste formal; com 4 pares, 3 vitórias são compatíveis com sorte. O limite superior é o esforço: cada par exige duas produções manuais completas mais o intervalo de cegamento de B-03, e B é o workstream mais caro do sprint.

**Alternatives:**
- 5 pares: viável, porém pouco separável de acaso.
- 8 pares *(recomendado)*.
- 12 pares: melhor separação; provavelmente inviável junto de A, C, E e F no mesmo sprint.

**Consequence of stricter threshold (mais pares):** comparação mais confiável, custo manual possivelmente proibitivo.
**Consequence of looser threshold (menos pares):** resultado de B vira anedota, o que enfraquece justamente a hipótese H-01, que é a mais decisiva do sprint.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 2. Workstream A — Retrospective Opportunity

### A-01 — Volume mínimo de oportunidades acionáveis por período para GO

**Protocol reference:** §5
**Type:** B

**Why this must be locked:** este é o número que define "vale a pena existir". Escolhido depois, ele será inevitavelmente ajustado até coincidir com o que foi observado — o modo de falha exato que o princípio 4 do protocolo proíbe.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** não existe base metodológica para escolher este valor. Ele é uma afirmação sobre quanto valor por período justifica manter um sistema proativo funcionando, e essa é uma preferência da dona do projeto, não uma propriedade do desenho experimental. Ver Owner Decision **OD-1**.

**Consequence of stricter threshold:** menor chance de construir um produto que entrega pouco; maior chance de matar uma tese que era viável em escopo mais estreito.
**Consequence of looser threshold:** produto avança com valor marginal; risco de descobrir só depois do build que o checkpoint não sustenta atenção.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### A-02 — Janela de antecipação mínima considerada explorável

**Protocol reference:** §5
**Type:** D — depende de S-03 e da cadência de checkpoint escolhida

**Why this must be locked:** se "explorável" for definido depois, qualquer janela observada será declarada suficiente. O conceito de antecipação perde sentido.

**Recommended decision:** `PROPOSED — regra derivada: anticipation_window ≥ 1 intervalo de checkpoint`

**Reasoning:** a janela só é explorável se couber um checkpoint dentro dela. Uma antecipação de 2 horas é inútil para um checkpoint diário: o sistema descobriria e mostraria depois da usuária. Portanto o valor não deve ser escolhido como número absoluto, mas derivado da cadência: com checkpoint diário, ≥24h; com checkpoint por reunião, ≥ o intervalo entre reuniões. Isso torna a régua honesta sob qualquer cadência escolhida.

**Alternatives:**
- valor fixo absoluto (ex.: ≥24h) independentemente da cadência: mais simples, mas errado se a cadência mudar.
- ≥1 intervalo de checkpoint *(recomendado)*.
- ≥2 intervalos: exige folga para preparação além de exibição; mais severo, defensável se o valor esperado for preparação e não notificação.

**Consequence of stricter threshold:** menos oportunidades qualificam; PIVOT para on-demand fica mais provável.
**Consequence of looser threshold:** contam como antecipação janelas que o produto real não conseguiria explorar — falso GO.

**Final value:** `PENDING` (resolve ao travar a cadência de checkpoint)
**Locked before execution:** `NO`

---

### A-03 — Proporção máxima aceitável de itens com `hindsight_risk = high`

**Protocol reference:** §5, §1
**Type:** A

**Why this must be locked:** hindsight leakage é a ameaça central de A. Sem teto prévio, um estudo inteiramente contaminado por retrospectiva pode ser apresentado como evidência de antecipação.

**Recommended decision:** `PROPOSED — as métricas primárias de A são calculadas exclusivamente sobre itens com hindsight_risk = low; adicionalmente, se mais de 1/3 das oportunidades geradas forem high, A é reportado como não conclusivo`

**Reasoning:** o controle mais forte não é um teto, é a exclusão: itens `high` simplesmente não entram no numerador. O teto de 1/3 existe como sinal separado de qualidade do desenho — se a maioria das oportunidades só é visível sabendo o desfecho, o exercício mediu memória, não detecção, e nenhum recorte dos dados conserta isso. A escolha de 1/3 é conservadora sem ser impossível: ela admite que alguma contaminação é inevitável em estudo retrospectivo N=1, mas recusa que ela seja a norma.

**Alternatives:**
- excluir `high` sem teto adicional: mais simples, perde o sinal de que o desenho falhou.
- excluir `high` + teto de 1/3 *(recomendado)*.
- excluir `high` e `medium`, com teto sobre ambos: mais rigoroso, provavelmente deixa `n` insuficiente para qualquer conclusão.

**Consequence of stricter threshold:** A vira não conclusivo com mais frequência — resultado honesto, porém o sprint pode terminar sem responder H-02.
**Consequence of looser threshold:** o estudo confunde "eu sabia o que ia acontecer" com "o sinal estava lá", que é exatamente o autoengano que o sprint existe para evitar.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 3. Workstream B — Ideal Briefing

### B-01 — Número máximo de itens por bloco

**Protocol reference:** §6
**Type:** A

**Why this must be locked:** sem teto, o briefing lista tudo e o estudo deixa de testar promoção. O teto é o que força a escolha entre itens, que é a capacidade sob teste.

**Recommended decision:** `PROPOSED — 3 itens por bloco`

**Reasoning:** o protocolo testa se o briefing consegue *promover* os itens certos, não se consegue recuperar informação. Três itens por bloco criam competição real dentro do bloco sem tornar o exercício artificialmente cruel. Um teto de 1 mediria apenas o melhor item e desperdiçaria a estrutura de cinco blocos; um teto de 5 ou mais aproxima o briefing de uma lista, e listas não testam Show Policy (baseline §18).

**Alternatives:**
- 2 por bloco: competição mais dura, risco de descartar itens úteis por regra e inflar falsos negativos artificialmente.
- 3 por bloco *(recomendado)*.
- 5 por bloco: mais permissivo, mede menos promoção e mais cobertura.

**Consequence of stricter threshold:** mais falsos negativos por construção; precisa ser lido junto de B-07 para não penalizar o método pela régua.
**Consequence of looser threshold:** briefing vira inbox; o resultado positivo não distingue valor de volume.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### B-02 — Número máximo de itens no briefing inteiro

**Protocol reference:** §6
**Type:** D — depende de B-01

**Why this must be locked:** um teto por bloco sem teto global permite um briefing de 15 itens, que na prática não é um briefing.

**Recommended decision:** `PROPOSED — 10 itens no total, abaixo da soma dos tetos por bloco (3 × 5 = 15)`

**Reasoning:** o teto global precisa ser menor que a soma dos tetos por bloco, senão ele não faz nada. A folga entre 10 e 15 é o mecanismo que força competição *entre* blocos: nem todo checkpoint tem três coisas dignas em cada uma das cinco categorias, e a régua deve premiar quem reconhece isso. Dez itens também é uma quantidade que uma pessoa lê num checkpoint sem triagem própria — se ela precisa filtrar o briefing, o briefing falhou.

**Alternatives:**
- 15 (soma dos blocos): teto global inerte.
- 10 *(recomendado)*.
- 7: mais próximo do que se lê sem esforço; mais severo com cobertura.

**Consequence of stricter threshold:** força abstenção, que o protocolo trata como resultado válido; aumenta falsos negativos registrados.
**Consequence of looser threshold:** o estudo não distingue "promoveu bem" de "mostrou muito".

**Final value:** `PENDING` (resolve ao travar B-01)
**Locked before execution:** `NO`

---

### B-03 — Intervalo mínimo entre produção e avaliação

**Protocol reference:** §6
**Type:** A

**Why this must be locked:** é o único controle de cegamento parcial disponível em N=1. Definido depois, ele se torna "o tempo que sobrou", e a avaliação passa a ser autoavaliação imediata do próprio texto.

**Recommended decision:** `PROPOSED — mínimo 48 horas entre produzir o par e avaliá-lo`

**Reasoning:** o objetivo é degradar a lembrança de qual texto é qual, não a lembrança dos fatos. Menos de 24h praticamente garante que a autoria seja reconhecida pela redação. Acima de ~1 semana, o contexto de trabalho já mudou e a avaliação de `too_early` / `too_late` fica distorcida por eventos posteriores ao cutoff, contaminando a dimensão de valor. 48 horas fica na faixa em que o reconhecimento de autoria cai e o contexto ainda é o mesmo.

**Alternatives:**
- 24h: mais rápido, cegamento fraco.
- 48h *(recomendado)*.
- 7 dias: cegamento melhor, mas a avaliação de timing passa a ser feita de um presente diferente do checkpoint avaliado.

**Consequence of stricter threshold (intervalo maior):** melhor cegamento, pior fidelidade da dimensão de timing e sprint mais longo.
**Consequence of looser threshold:** a comparação cega deixa de ser cega e B perde valor probatório, sem que isso apareça no resultado.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### B-04 — Frequência mínima de itens úteis por briefing para GO

**Protocol reference:** §6
**Type:** B

**Why this must be locked:** este é o teto de valor da tese inteira (H-01). É o número mais fácil de ajustar depois e o mais consequente.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** define quantas intervenções úteis por checkpoint justificam abrir e ler um briefing todo dia. É uma preferência sobre atenção própria, não uma propriedade do método. Ver Owner Decision **OD-2**.

**Consequence of stricter threshold:** protege contra construir um produto que a própria dona ignoraria; pode matar uma tese que funcionaria com cadência mais espaçada.
**Consequence of looser threshold:** GO com valor marginal; o produto compete mal com simplesmente olhar as fontes.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### B-05 — Proporção máxima aceitável de `already_known` + `irrelevant`

**Protocol reference:** §6
**Type:** B

**Why this must be locked:** é a definição operacional de ruído tolerável. Sem teto prévio, qualquer nível de ruído observado será racionalizado como aceitável.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** quanto ruído destrói a confiança num briefing proativo é julgamento pessoal sobre atenção, não desenho experimental. Ver Owner Decision **OD-3**.

**Consequence of stricter threshold:** força abstenção e briefings curtos; pode reprovar um método que seria útil com top-k menor.
**Consequence of looser threshold:** o checkpoint vira inbox — risco "proactivity noise" da baseline §33 — e o produto passa no teste enquanto falha no uso real.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### B-06 — Teto de manual normalization effort por briefing

**Protocol reference:** §6
**Type:** B

**Why this must be locked:** este número testa H-03 diretamente. Definido depois, o esforço observado será sempre declarado "aceitável, porque automatizável", que é uma suposição sem evidência.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** o teto expressa quanto tempo manual por checkpoint ainda representa um produto viável. É uma decisão sobre o próprio tempo. Ver Owner Decision **OD-4**.

**Nota metodológica (não é a decisão):** o protocolo já exige que o esforço seja **decrescente** ao longo dos briefings (K-5). Um teto absoluto alto com tendência plana é pior sinal que um teto moderado com tendência de queda; a dona deve escolher o teto sabendo que a tendência é avaliada em separado.

**Consequence of stricter threshold:** H-03 é reprovada cedo, evitando build sobre fontes que exigem curadoria constante.
**Consequence of looser threshold:** o sprint aprova fontes cuja manutenção manual seria o verdadeiro produto.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### B-07 — Número mínimo de serious false negatives que caracteriza falha

**Protocol reference:** §6
**Type:** B

**Why this must be locked:** falso negativo grave é o dano silencioso do produto: o usuário nunca sabe o que não viu. Sem critério prévio, ele será tratado como exceção pontual, caso a caso.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** quantos itens importantes perdidos tornam um briefing não confiável depende de quanto a dona passaria a depender dele. Ver Owner Decision **OD-5**.

**Nota metodológica (não é a decisão):** este número deve ser escolhido **junto** com B-01/B-02. Tetos de itens mais apertados produzem mais falsos negativos por construção; reprovar o método por falsos negativos causados pela própria régua seria um artefato do desenho, não um achado.

**Consequence of stricter threshold:** exige alta cobertura; interage com o teto de itens e pode tornar B irreprovável ou irreprovavelmente severo se escolhido isolado.
**Consequence of looser threshold:** o produto pode falhar silenciosamente em coisas importantes e ainda assim passar.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 4. Workstream D — Cost & Latency

### D-01 — Maximum acceptable cost per useful intervention

**Protocol reference:** §8; baseline §26, §34
**Type:** B

**Why this must be locked:** o protocolo já declara em §8 que definir este teto depois de ver o número é violação do princípio 1 e invalida a decisão. É também a Open Question nº 2 da baseline §34.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** é o preço que a dona aceita pagar por uma intervenção cognitiva útil. Nenhum desenho experimental produz esse valor. Ver Owner Decision **OD-6**.

**Consequence of stricter threshold:** força micro-batch ou on-demand e escopo estreito desde o início; pode excluir modos que se tornariam viáveis com modelos mais baratos depois.
**Consequence of looser threshold:** o gate de custo deixa de ser gate; o risco "cost explosion" da baseline §33 passa direto.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### D-02 — Maximum acceptable cost per month

**Protocol reference:** §8
**Type:** B

**Why this must be locked:** o custo por intervenção pode ser aceitável e o total mensal, não — se o volume de intervenções for alto. Os dois tetos são independentes e ambos precisam existir antes.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** é um limite de orçamento pessoal. Ver Owner Decision **OD-7**.

**Consequence of stricter threshold:** limita frequência de checkpoint e número de fontes; decisão de escopo tomada por orçamento, o que é legítimo se explícito.
**Consequence of looser threshold:** viabilidade aparente que não se sustenta quando o escopo cresce para mais de um workstream.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### D-03 — Maximum acceptable latency P95 checkpoint → briefing

**Protocol reference:** §8; baseline §26
**Type:** B

**Why this must be locked:** latência define qual modo de processamento sobrevive. Decidida depois, ela será igualada ao que o modo preferido entregou.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** o limite aceitável depende de como a dona pretende usar o checkpoint — se ela abre e espera, ou se o briefing precisa estar pronto quando ela chega. São regimes diferentes com tetos muito diferentes. Ver Owner Decision **OD-8**.

**Consequence of stricter threshold:** elimina micro-batch em favor de streaming, que a baseline §26 considera não recomendado sem caso urgente provado — logo, um teto muito apertado força uma arquitetura que a baseline desaconselha.
**Consequence of looser threshold:** briefings chegam tarde demais para serem acionáveis, produzindo `too_late` que aparecerá como falha de valor, não de latência.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### D-04 — Assumed operating days per month

**Protocol reference:** §8
**Type:** A

**Why this must be locked:** é o multiplicador entre custo diário e mensal. Ajustado depois, ele permite fazer o custo mensal caber no teto sem mudar nada real.

**Recommended decision:** `PROPOSED — 20 dias úteis por mês, registrado explicitamente como suposição no experiment log`

**Reasoning:** o produto é orientado a trabalho e os checkpoints acompanham dias de trabalho, não dias corridos. Vinte dias úteis é a convenção padrão e não favorece nem prejudica a tese: um número menor esconderia custo mensal, um número maior (30) inflaria custo de dias em que não há atividade a processar. O que importa mais que o valor é que ele seja fixo antes e citado no cálculo.

**Alternatives:**
- 20 dias úteis *(recomendado)*.
- 22 dias úteis: média anual mais precisa; diferença de ~10% no total mensal.
- 30 dias corridos: só se o produto processar em fins de semana, o que a V0 não prevê.

**Consequence of stricter threshold (mais dias):** custo mensal estimado maior; mais provável reprovar em D-02.
**Consequence of looser threshold (menos dias):** custo mensal subestimado e falso GO econômico.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 5. Workstream E — Entity Resolution

### E-01 — Tamanho da amostra por categoria

**Protocol reference:** §9
**Type:** A

**Why this must be locked:** amostra definida durante a execução tende a parar quando os casos difíceis começam a aparecer.

**Recommended decision:** `PROPOSED — 20 objetos por categoria, ou todos se houver menos de 20; amostragem sistemática (todos os objetos cross-source do período, ou 1 a cada k), nunca por escolha do revisor`

**Reasoning:** E mede taxas de erro raras (falso merge), e taxas raras exigem amostra suficiente para que a ausência de erro signifique algo — com 5 objetos, zero falso merge não é informação. Vinte por categoria, em seis categorias, dá até 120 resoluções manuais, que é o limite plausível de esforço para um workstream que não é o principal do sprint. A regra de amostragem sistemática é mais importante que o número: escolher quais objetos testar é o mecanismo mais direto de produzir o resultado desejado.

**Alternatives:**
- 10 por categoria: mais barato; zero falso merge deixa de ser informativo.
- 20 por categoria *(recomendado)*.
- todos os objetos cross-source do período: ideal se o volume permitir; adotar quando o total ficar abaixo de 20.

**Consequence of stricter threshold (amostra maior):** melhor detecção de erros raros, custo manual alto num workstream secundário.
**Consequence of looser threshold:** E não consegue distinguir "resolve bem" de "não foi testado o suficiente para falhar".

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### E-02 — Cobertura determinística mínima por categoria

**Protocol reference:** §9
**Type:** B

**Why this must be locked:** define quando as fontes escolhidas são consideradas inadequadas. Decidido depois, o resultado observado será chamado de suficiente.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** o limite aceitável depende de quanta resolução manual recorrente a dona aceita como parte da operação — a mesma preferência que governa E-04, com a qual esta decisão deve ser tomada em conjunto. Ver Owner Decision **OD-9**.

**Consequence of stricter threshold:** PIVOT de fontes mais cedo, provavelmente reduzindo a V0 a uma ou duas fontes com IDs compartilhados.
**Consequence of looser threshold:** aprova um conjunto de fontes cujo estado depende de julgamento humano contínuo — o risco "entity resolution failure" da baseline §33.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### E-03 — Taxa máxima aceitável de falso merge

**Protocol reference:** §9; baseline §12
**Type:** A

**Why this must be locked:** falso merge corrompe Current State silenciosamente e propaga para deltas e briefings. Sem teto prévio, cada caso será tratado como exceção compreensível.

**Recommended decision:** `PROPOSED — tolerância zero nas categorias de alto impacto (decisions, commitments, artifacts): qualquer falso merge é sinal de falha para aquela categoria; nas demais (people, meetings, projects), no máximo 1 em 20 objetos amostrados`

**Reasoning:** falso merge não é um erro simétrico a "não resolvido". Um objeto não resolvido permanece distinto e visível; um falso merge cria um fato errado que herda evidência de duas origens e não sinaliza nada. Em `decisions` e `commitments`, um único merge errado produz um Change Record falso e um briefing confiantemente errado — não existe faixa de tolerância defensável. Nas categorias de baixo impacto, um erro em vinte reconhece que homônimos e reuniões recorrentes são ambiguidades reais, sem tornar o critério inerte.

**Alternatives:**
- tolerância zero em todas as categorias: máximo rigor, provavelmente reprova qualquer conjunto de fontes reais.
- zero em alto impacto + 1/20 nas demais *(recomendado)*.
- teto único de 5% em todas: mais simples, ignora que o custo do erro difere por categoria em ordens de magnitude.

**Consequence of stricter threshold:** PIVOT de fontes quase garantido; pode eliminar fontes que seriam usáveis com revisão humana nos merges de alto impacto — que é, aliás, o que a baseline §12 já prescreve.
**Consequence of looser threshold:** o sprint aprova fontes que produzirão estado errado de forma invisível, e nenhum workstream posterior detectaria isso.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### E-04 — Tempo máximo aceitável de correção manual por período

**Protocol reference:** §9
**Type:** B

**Why this must be locked:** junto com B-06, define se o produto é viável ou se a manutenção manual é o produto.

**Recommended decision:** `OWNER DECISION REQUIRED`

**Reasoning:** é um limite sobre o próprio tempo, tomado em conjunto com E-02. Ver Owner Decision **OD-9**.

**Consequence of stricter threshold:** menos fontes, escopo mais estreito, produto mais defensável.
**Consequence of looser threshold:** custo humano oculto que não aparece no modelo de custo de D, porque D mede tokens, não horas.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 6. Workstream F — Auto-consistency

### F-01 — Intervalo entre avaliações

**Protocol reference:** §10
**Type:** A

**Why this must be locked:** se o intervalo for curto, F mede memória do teste, não estabilidade de preferência — e o resultado será falsamente estável.

**Recommended decision:** `PROPOSED — mínimo 14 dias entre a rodada 1 e a rodada 2 do mesmo par`

**Reasoning:** o teste é test-retest; sua validade depende de a segunda resposta não ser a recuperação da primeira. Duas semanas é curto o bastante para que o contexto de trabalho não se transforme por completo — o que produziria `context dependent` artificial — e longo o bastante para que a escolha específica entre duas alternativas não esteja em memória de trabalho. O protocolo já registra mudança de contexto (`context_changed_since_r1`), o que protege o limite superior; o limite inferior é o que precisa ser fixado.

**Alternatives:**
- 7 dias: sprint mais curto, risco real de recall da rodada 1.
- 14 dias *(recomendado)*.
- 30 dias: melhor contra recall; provavelmente estende o sprint além do razoável e aumenta `context dependent` por mudança real.

**Consequence of stricter threshold (intervalo maior):** menos contaminação por memória, mais categorias classificadas como `context dependent`, sprint mais longo.
**Consequence of looser threshold:** estabilidade aparente que é apenas consistência de memória — falso positivo para personalização, exatamente o risco "false personalization" da baseline §33.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### F-02 — Número mínimo de pares por categoria

**Protocol reference:** §10
**Type:** A

**Why this must be locked:** com poucos pares, qualquer categoria parece estável ou instável por acaso. E `n` decidido depois permite reportar apenas as categorias que deram certo.

**Recommended decision:** `PROPOSED — 8 pares por categoria; categorias que não alcançarem 8 pares de histórico real são reportadas com o n real e marcadas como não conclusivas, nunca completadas com pares construídos`

**Reasoning:** a escolha é binária, então a concordância por acaso é 50%. Com 8 pares, uma concordância de 7 ou 8 é claramente distinguível de sorte; com 4 pares, 3 acertos ocorrem por acaso com frequência alta. Oito é o menor `n` em que o critério de F-03 tem significado. A proibição de completar com pares construídos existe porque o protocolo já exige marcar `alternatives_origin`, e misturar as duas origens no mesmo denominador destruiria essa distinção.

**Alternatives:**
- 5 pares: barato; o critério de estabilidade perde poder de discriminação.
- 8 pares *(recomendado)*.
- 12 pares: melhor separação; difícil de obter a partir de decisões reais do histórico em várias categorias.

**Consequence of stricter threshold:** mais categorias reportadas como não conclusivas por falta de histórico — resultado honesto, e sem consequência para a V0, já que F não decide sobre ela.
**Consequence of looser threshold:** categorias declaradas estáveis por acaso, habilitando personalização sobre ruído.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

### F-03 — Taxa de auto-concordância que caracteriza `sufficiently stable`

**Protocol reference:** §10
**Type:** A

**Why this must be locked:** é o critério que separa preferência de ruído. Escolhido depois, ele será ajustado à taxa observada na categoria mais promissora.

**Recommended decision:** `PROPOSED — ≥ 7 de 8 pares (87,5%) para sufficiently stable; 5–6 de 8 com mudança de contexto registrada → context dependent; 5–6 de 8 sem mudança de contexto, ou ≤ 4 de 8 → unstable / abstain`

**Reasoning:** em escolha binária, o acaso produz 50%. O critério precisa ficar distante o suficiente do acaso para que a estabilidade signifique algo, e 6/8 (75%) ainda ocorre por sorte com frequência que não justificaria personalizar. 7/8 exige que a escolha se repita quase sempre, que é o padrão mínimo para o sistema agir com base nela. A faixa intermediária não é descartada: ela é encaminhada para `context dependent` quando houver contexto registrado que explique a variação, preservando a regra do protocolo de que inconsistência com contexto não é instabilidade.

**Alternatives:**
- 6/8 (75%): mais categorias qualificam; sobreposição relevante com acaso.
- 7/8 (87,5%) *(recomendado)*.
- 8/8 (100%): elimina qualquer ruído de medição; provavelmente nenhuma categoria humana qualifica, tornando o critério inútil.

**Consequence of stricter threshold:** poucas ou nenhuma categoria elegível; consequência arquitetural é manter Core Learning sem Statistical Personalization — que a baseline já trata como resultado aceitável, não como falha.
**Consequence of looser threshold:** personalização construída sobre categorias que não são estáveis, gerando correções recorrentes e perda de confiança.

**Final value:** `PENDING`
**Locked before execution:** `NO`

---

## 7. Kill criteria

Oito dos nove thresholds abertos são **derivados**: eles reutilizam um número já decidido em outro workstream. Isso é deliberado — um kill criterion com número próprio, diferente do critério do estudo, permitiria que um workstream reprovasse e o kill criterion não disparasse.

**K-9 permanece qualitativo, sem threshold numérico**, conforme o protocolo §12.

### K-1 — Pouco conteúdo novo e acionável no briefing ideal

**Protocol reference:** §12; baseline §33 "teto de valor baixo"
**Type:** D — deriva de B-04
**Why this must be locked:** é o kill criterion da hipótese central (H-01).
**Recommended decision:** `PROPOSED — dispara quando a frequência de itens úteis fica abaixo de B-04 na maioria dos briefings do sprint`
**Reasoning:** o critério de kill deve ser o mesmo do GO, negado, aplicado à maioria dos casos e não a um briefing isolado (princípio 12: nenhum resultado individual é prova universal).
**Consequence of stricter threshold:** STOP prematuro sobre variação normal entre checkpoints.
**Consequence of looser threshold:** o kill criterion nunca dispara e o gate de valor deixa de existir.
**Final value:** `PENDING` (resolve ao travar B-04) · **Locked:** `NO`

### K-2 — Janela de antecipação inexistente

**Protocol reference:** §12; baseline §33 "signal latency"
**Type:** D — deriva de A-02
**Why this must be locked:** define quando a proatividade perde sentido e o produto vira on-demand.
**Recommended decision:** `PROPOSED — dispara quando a mediana de anticipation_window, calculada apenas sobre itens com hindsight_risk = low, fica abaixo do mínimo de A-02`
**Reasoning:** usar a mediana, e não o máximo, impede que um único caso excepcional de antecipação longa mascare a ausência sistemática de janela.
**Consequence of stricter threshold:** PIVOT para on-demand mesmo havendo antecipação em uma classe específica de mudança.
**Consequence of looser threshold:** a tese proativa sobrevive apoiada em casos isolados.
**Final value:** `PENDING` (resolve ao travar A-02) · **Locked:** `NO`

### K-3 — Fonte depende majoritariamente de merge ambíguo

**Protocol reference:** §12; baseline §33 "entity resolution failure"
**Type:** D — deriva de E-02 e E-03
**Why this must be locked:** determina troca de fontes antes do build, não depois.
**Recommended decision:** `PROPOSED — dispara quando a cobertura determinística fica abaixo de E-02 em qualquer categoria de alto impacto (decisions, commitments, artifacts), ou quando E-03 é violado em qualquer categoria`
**Reasoning:** o gate é por categoria, não global: uma média boa pode esconder uma categoria de alto impacto integralmente ambígua, e é justamente essa categoria que corrompe Change Records.
**Consequence of stricter threshold:** PIVOT de fontes provável; a V0 pode ficar restrita a fonte única.
**Consequence of looser threshold:** build sobre identidade não confiável, com erro invisível a jusante.
**Final value:** `PENDING` (resolve ao travar E-02 e E-03) · **Locked:** `NO`

### K-4 — Custo por intervenção útil excede o limite

**Protocol reference:** §12, §8; baseline §33 "cost explosion"
**Type:** D — deriva de D-01
**Why this must be locked:** o protocolo §8 já exige o teto antes do cálculo; o kill criterion apenas o aplica.
**Recommended decision:** `PROPOSED — dispara quando cost/useful_intervention excede D-01 em todos os modos comparados (streaming, micro-batch, on-demand)`
**Reasoning:** exceder em streaming não é kill — a baseline §26 já desaconselha streaming. O kill só faz sentido quando nenhum modo cabe.
**Consequence of stricter threshold:** STOP econômico por um modo ruim que já não era recomendado.
**Consequence of looser threshold:** custo inviável sobrevive porque "algum escopo hipotético caberia".
**Final value:** `PENDING` (resolve ao travar D-01) · **Locked:** `NO`

### K-5 — Esforço de normalização manual alto e não decrescente

**Protocol reference:** §12; §3 H-03
**Type:** D — deriva de B-06
**Why this must be locked:** testa H-03 diretamente e é o sinal mais provável de que as fontes exigem curadoria permanente.
**Recommended decision:** `PROPOSED — dispara quando o esforço médio dos briefings excede B-06 e não apresenta tendência de queda entre o primeiro e o último terço da série`
**Reasoning:** o critério é conjunto por construção: esforço alto que cai indica aprendizado do processo; esforço alto e plano indica que o trabalho é irredutível. Nenhuma das duas condições sozinha é suficiente.
**Consequence of stricter threshold:** reprova H-03 sobre uma série curta em que a tendência ainda não apareceria.
**Consequence of looser threshold:** aprova fontes cuja manutenção manual seria o verdadeiro produto.
**Final value:** `PENDING` (resolve ao travar B-06) · **Locked:** `NO`

### K-6 — Aumento de itens irrelevantes ou "já sabia"

**Protocol reference:** §12; baseline §33 "proactivity noise"
**Type:** D — deriva de B-05
**Why this must be locked:** é o gate de ruído; sem ele, o checkpoint vira inbox sem que nada dispare.
**Recommended decision:** `PROPOSED — dispara quando a proporção de already_known + irrelevant excede B-05 na maioria dos briefings`
**Reasoning:** mesma lógica de K-1: maioria, não caso isolado.
**Consequence of stricter threshold:** força top-k mais apertado, o que aumenta falsos negativos medidos por B-07.
**Consequence of looser threshold:** ruído crescente não dispara nada, e o risco da baseline §33 se materializa depois do build.
**Final value:** `PENDING` (resolve ao travar B-05) · **Locked:** `NO`

### K-7 — Correção manual e "other" dominam a classificação de objetos

**Protocol reference:** §12; baseline §33 "ontology rigidity"
**Type:** A
**Why this must be locked:** testa se o schema mínimo da baseline §13 cobre trabalho real. Sem teto prévio, "other" vira categoria normal e o schema nunca é questionado.
**Recommended decision:** `PROPOSED — dispara quando mais de 1/3 dos objetos registrados exigirem "other" ou reclassificação manual`
**Reasoning:** o schema mínimo é uma aposta arquitetural (workstream, goal, artifact, decision, commitment, question, risk, event). Se um terço do trabalho real não couber nele, o problema é a ontologia, não a rotulagem — e isso precisa ser detectado antes do build, quando ainda é barato mudar. Um terço é permissivo o bastante para admitir que nenhum schema cobre tudo, e severo o bastante para que um schema inadequado não passe.
**Alternatives:** 1/5 (mais rigoroso, provável falso alarme sobre casos legítimos de borda) · 1/3 *(recomendado)* · 1/2 (só dispara quando o schema já falhou por completo).
**Consequence of stricter threshold:** revisão de schema desencadeada por casos de borda normais.
**Consequence of looser threshold:** build sobre uma ontologia que não representa o trabalho, com correção manual permanente.
**Final value:** `PENDING` · **Locked:** `NO`

### K-8 — Itens úteis só aparecem com `hindsight_risk = high`

**Protocol reference:** §12; §1 princípio 2
**Type:** D — deriva de A-03
**Why this must be locked:** é o controle contra o autoengano central de um estudo retrospectivo.
**Recommended decision:** `PROPOSED — dispara quando A-03 é violado, ou quando a remoção dos itens hindsight_risk = high faz o volume de oportunidades acionáveis cair abaixo de A-01`
**Reasoning:** a segunda condição é a mais importante: ela testa se a conclusão de A sobrevive à exclusão dos itens contaminados. Se não sobrevive, o estudo mediu retrospectiva.
**Consequence of stricter threshold:** A fica não conclusivo com frequência; o sprint termina sem responder H-02, o que é preferível a respondê-la errado.
**Consequence of looser threshold:** GO baseado em detecção que só é possível sabendo o desfecho.
**Final value:** `PENDING` (resolve ao travar A-01 e A-03) · **Locked:** `NO`

### K-9 — Percepção de vigilância

**Protocol reference:** §12; baseline §33 "surveillance perception"
**Type:** preservado como **qualitativo**, sem threshold numérico
**Recommended decision:** `PROPOSED — manter sem número, conforme o protocolo §12`
**Reasoning:** o sinal é a dona evitar fontes ou mudar comportamento por se sentir observada. Quantificar isso exigiria medir o comportamento que o próprio critério existe para proteger. A ação — reduzir escopo de fontes imediatamente — não depende de um limiar.
**Final value:** `qualitativo, sem threshold` · **Locked:** `NO` (confirmar na trava)

### K-10 — Serious false negatives com consequência real e recorrentes

**Protocol reference:** §12; baseline §27
**Type:** D — deriva de B-07
**Why this must be locked:** falso negativo grave é o dano que o usuário nunca vê.
**Recommended decision:** `PROPOSED — dispara quando o número de serious false negatives atinge B-07 e ocorre em mais de um briefing (recorrência)`
**Reasoning:** o critério da baseline exige "recorrentes". Um evento isolado grave merece registro e análise, mas não é evidência de falha sistemática do método.
**Consequence of stricter threshold:** revisão de cobertura de fontes disparada por caso único.
**Consequence of looser threshold:** falhas silenciosas repetidas não bloqueiam o GO.
**Final value:** `PENDING` (resolve ao travar B-07) · **Locked:** `NO`

---

## 8. Scope selections (`TO BE FILLED BEFORE EXECUTION`)

Nenhum valor é inventado aqui. Estes cinco campos exigem seleção de contexto real antes da execução, seguindo o procedimento já definido no protocolo §2.2.

### SC-01 — Selected window

**Protocol reference:** §2.2 · **Type:** C
**Why this must be locked:** janela escolhida depois de ver conteúdo vira janela escolhida por resultado — o viés que o protocolo §2.2 proíbe explicitamente.
**Value:** `OWNER DECISION REQUIRED`
**Procedimento obrigatório:** aplicar o procedimento de seleção do protocolo §2.2 usando **apenas metadados**, com o critério de desempate já declarado (maior cobertura de fontes recuperáveis), e registrar a lista completa de candidatos eliminados com o motivo. Depende de S-01 estar travado.
**Final value:** `PENDING` · **Locked:** `NO`

### SC-02 — Selected workstream(s)

**Protocol reference:** §2.2 · **Type:** C
**Why this must be locked:** é a Open Question nº 1 da baseline §34 — qual workstream oferece sinal suficiente sem expor contexto excessivo. Escolher depois permite migrar para o workstream onde o resultado ficou melhor.
**Value:** `OWNER DECISION REQUIRED`
**Procedimento obrigatório:** aplicar os cinco critérios de elegibilidade do protocolo §2.2; se a primeira opção que vier à mente for "onde o sistema teria ajudado mais", registrar como risco de seleção conforme o protocolo exige.
**Final value:** `PENDING` · **Locked:** `NO`

### SC-03 — Fontes efetivamente usadas

**Protocol reference:** §2.3 · **Type:** C
**Why this must be locked:** é a Open Question nº 4 da baseline §34 e o insumo direto de E. Adicionar fontes durante a execução muda a régua de E-02 no meio do estudo.
**Value:** `OWNER DECISION REQUIRED`
**Restrições já fixadas pelo protocolo:** nenhuma integração técnica, nenhuma conexão de API ou export automatizado; mínimo de duas fontes distintas (requisito de E); Slack e e-mail apenas se já disponíveis para leitura manual; ACL e sensibilidade da fonte original respeitadas.
**Final value:** `PENDING` · **Locked:** `NO`

### SC-04 — Terceiro disponível para cegamento parcial

**Protocol reference:** §6 · **Type:** C
**Why this must be locked:** determina o grau de cegamento real de B, que é a limitação mais séria do sprint. Descobrir na execução que não há terceiro transforma B em autoavaliação sem que isso tenha sido assumido antes.
**Value:** `OWNER DECISION REQUIRED`
**Reasoning:** a resposta pode ser legitimamente "não há". Nesse caso o cegamento fica restrito ao intervalo de B-03 e à randomização de ordem, e essa limitação deve ser declarada em todo resultado de B — não descoberta depois. Um terceiro, mesmo sem contexto do projeto, pode produzir a baseline cronológica ou aplicar a rotulagem, e qualquer uma das duas já melhora materialmente a validade de B.
**Final value:** `PENDING` · **Locked:** `NO`

### SC-05 — Categorias selecionadas em F

**Protocol reference:** §10 · **Type:** C
**Why this must be locked:** categorias escolhidas depois permitem reportar apenas as que se mostraram estáveis — seleção de desfecho, não descoberta.
**Value:** `OWNER DECISION REQUIRED`
**Procedimento obrigatório:** as categorias devem ser derivadas do trabalho real, declaradas antes da rodada 1, e **todas** devem ser reportadas ao final, inclusive as instáveis e as não conclusivas por falta de pares (F-02). Depende de SC-02 estar travado, já que as categorias vêm do workstream selecionado.
**Final value:** `PENDING` · **Locked:** `NO`

---

## 9. Owner Decisions Required

As decisões abaixo exigem julgamento da dona do AVA. Nenhuma foi preenchida. As opções são plausíveis e mutuamente exclusivas; a recomendação, quando existe, é metodológica e não substitui a escolha.

### OD-1 — Volume mínimo de oportunidades acionáveis por período (A-01)

**Decision:** Quantas oportunidades acionáveis, novas e com janela real de antecipação precisam existir por período para que a detecção proativa valha a pena?

- **Option A — 1 por semana.** Régua permissiva. GO provável. Consequência: o produto pode ser construído para um valor que se dilui no ruído do dia a dia, e a dona pode acabar não abrindo o checkpoint.
- **Option B — 1 por checkpoint (ex.: 1 por dia útil).** Régua exigente. Consequência: se passar, o valor é evidente e o checkpoint diário se justifica sozinho; se falhar, pode matar uma tese que funcionaria em cadência semanal.
- **Option C — 2–3 por semana.** Meio-termo. Consequência: sustenta um checkpoint a cada 2–3 dias, mas não um diário; implicaria rever a cadência de checkpoint antes do build.

**Recommendation:** Option C. Ela é falsificável (bem acima de zero), não exige valor diário — que seria uma aposta forte para um produto ainda não validado — e a consequência de falhar é um PIVOT de cadência, não um STOP. Option B é a mais honesta se a intenção for um produto de uso diário desde o início.

---

### OD-2 — Frequência mínima de itens úteis por briefing (B-04)

**Decision:** Quantos itens úteis um briefing precisa entregar, em quantos briefings, para que abrir o briefing valha o tempo?

- **Option A — ≥1 item útil em ≥50% dos briefings.** Permissivo. Consequência: metade dos checkpoints não entrega nada; na prática o hábito de abrir não se sustenta.
- **Option B — ≥1 item útil em ≥75% dos briefings.** Consequência: o briefing é confiável o bastante para virar hábito; é a régua mínima para um produto que pede atenção recorrente.
- **Option C — ≥2 itens úteis em ≥75% dos briefings.** Consequência: exige densidade alta; se passar, H-01 fica forte; risco real de reprovar um produto que ainda assim seria valioso.

**Recommendation:** Option B. Um produto que pede atenção diária precisa acertar na maioria clara das vezes, mas exigir dois itens úteis por checkpoint impõe uma densidade que nem um assistente humano sustentaria.

---

### OD-3 — Proporção máxima de `already_known` + `irrelevant` (B-05)

**Decision:** Quanto ruído um briefing pode conter antes de deixar de ser confiável?

- **Option A — até 50%.** Consequência: metade do briefing é ruído; a dona passa a triar o briefing, e a triagem era o trabalho que o produto deveria eliminar.
- **Option B — até 1/3.** Consequência: ruído perceptível mas tolerável; mantém o briefing legível sem triagem.
- **Option C — até 20%.** Consequência: exige abstenção frequente e briefings curtos; aumenta falsos negativos medidos por B-07.

**Recommendation:** Option B. Acima de um terço, o custo de atenção do ruído começa a competir com o valor dos itens úteis. Vale escolher esta em conjunto com OD-5, já que reduzir ruído e reduzir falsos negativos puxam em direções opostas.

---

### OD-4 — Teto de manual normalization effort por briefing (B-06)

**Decision:** Quanto tempo manual por checkpoint — corrigindo fontes, resolvendo identidade, reconstruindo contexto — ainda representa um produto viável?

- **Option A — até 15 min por briefing.** Consequência: régua dura; reprova H-03 rapidamente se as fontes forem bagunçadas. Evita construir sobre curadoria permanente.
- **Option B — até 30 min por briefing.** Consequência: admite normalização real; ainda cabe num checkpoint diário sem consumir a manhã.
- **Option C — até 60 min por briefing.** Consequência: aceita que boa parte do valor vem de trabalho manual; na prática, aprova fontes cuja manutenção seria o produto.

**Recommendation:** Option B, com a ressalva já registrada em B-06: o teto absoluto importa menos que a **tendência**. Trinta minutos com queda consistente ao longo da série é um sinal melhor que quinze minutos estáveis.

---

### OD-5 — Serious false negatives que caracterizam falha (B-07)

**Decision:** Quantos itens importantes perdidos tornam o briefing não confiável?

- **Option A — 1 em todo o sprint.** Consequência: rigor máximo; com o teto de 10 itens de B-02, quase garante reprovação por artefato da própria régua.
- **Option B — 1 por briefing, recorrente em mais de um briefing.** Consequência: tolera o erro isolado, reprova a falha sistemática. Compatível com o teto de itens.
- **Option C — 2 ou mais por briefing.** Consequência: aceita perder itens importantes com regularidade; contradiz a promessa de "what you may not know yet".

**Recommendation:** Option B. É a única que separa erro pontual de falha de método e a única compatível com um briefing limitado a 10 itens. Escolher junto com OD-3.

---

### OD-6 — Maximum acceptable cost per useful intervention (D-01)

**Decision:** Qual o custo máximo aceitável, em moeda, por intervenção cognitiva útil?

- **Option A — equivalente a poucos minutos do próprio tempo.** Consequência: teto alto; quase qualquer arquitetura passa, e o gate de custo deixa de discriminar entre modos.
- **Option B — equivalente ao custo de uma consulta avulsa a um assistente.** Consequência: teto de mercado; força eficiência sem exigir otimização prematura.
- **Option C — teto agressivo, próximo do custo marginal de tokens.** Consequência: elimina streaming e provavelmente micro-batch amplo; força on-demand e escopo estreito.

**Recommendation:** Nenhuma. Este valor é uma preferência econômica pessoal e não tem base metodológica. **A única exigência é que o número seja escolhido e registrado antes do cálculo de D**, conforme o protocolo §8 — escolhê-lo depois invalida a decisão de custo do sprint inteiro.

---

### OD-7 — Maximum acceptable cost per month (D-02)

**Decision:** Qual o orçamento mensal máximo para operar o AVA no escopo da V0 (um workstream, poucas fontes)?

- **Option A — orçamento de ferramenta pessoal.** Consequência: limita fortemente frequência e número de fontes; decisão de escopo tomada por orçamento, o que é legítimo se explícito.
- **Option B — orçamento de ferramenta profissional.** Consequência: permite micro-batch diário sobre múltiplas fontes; exige que o valor de B seja claramente positivo para se justificar.
- **Option C — sem teto na V0, revisto depois da medição.** Consequência: **não recomendado** — anula o gate de custo, que a baseline §26 define como bloqueante antes da implementação.

**Recommendation:** Escolher A ou B. Option C não é uma opção legítima dentro deste protocolo: ela transforma um gate bloqueante em observação.

---

### OD-8 — Maximum acceptable latency P95 checkpoint → briefing (D-03)

**Decision:** Quanto tempo pode passar entre o checkpoint e o briefing estar pronto?

- **Option A — segundos (o briefing é gerado quando ela abre).** Consequência: exige processamento contínuo ou pré-computação agressiva; empurra para streaming, que a baseline §26 desaconselha sem caso urgente provado.
- **Option B — minutos (o briefing é preparado pouco antes do checkpoint).** Consequência: compatível com micro-batch, a recomendação provisória da baseline; o briefing está pronto quando ela chega.
- **Option C — sob demanda, ela aciona e espera.** Consequência: menor custo e maior controle; abre mão da proatividade e alinha o produto com o cenário de PIVOT, não com o de GO.

**Recommendation:** Option B, se a intenção for testar a tese proativa. Option C é coerente, mas escolhê-la agora seria pré-decidir o PIVOT que o Workstream A existe para testar.

---

### OD-9 — Cobertura determinística mínima e tempo de correção manual (E-02 + E-04)

**Decision:** Quanta resolução de identidade pode depender de julgamento humano recorrente antes de as fontes serem consideradas inadequadas? *(duas decisões acopladas — decidir juntas)*

- **Option A — cobertura determinística ≥80% por categoria; ≤15 min de correção manual por período.** Consequência: exigente; provavelmente restringe a V0 a fontes com IDs realmente compartilhados. Produto mais defensável, menos fontes.
- **Option B — ≥60% por categoria; ≤30 min por período.** Consequência: admite heurística como parte normal da operação; exige que E-03 (falso merge) seja respeitado com rigor, porque a heurística passa a carregar mais peso.
- **Option C — sem piso de cobertura; apenas teto de tempo manual.** Consequência: aprova fontes cujo estado depende de curadoria contínua — o risco "entity resolution failure" da baseline §33 materializado.

**Recommendation:** Option A ou B, nunca C. A escolha entre A e B depende de quanta manutenção manual recorrente é aceitável; ambas preservam o gate. Vale notar que um resultado ruim aqui **não** mata o produto — ele muda as fontes (PIVOT de fontes, protocolo §11).

---

## 10. Methodological Defaults

Decisões de desenho experimental com recomendação suficientemente defensável. Todas ficam `PROPOSED`, nunca `LOCKED` automaticamente. A dona pode aceitar ou alterar qualquer uma antes da execução.

| ID | Decisão | Valor proposto | Base |
| --- | --- | --- | --- |
| S-01 | Tamanho da janela | 6 semanas | recuperabilidade das fontes × esforço manual × mais de um ciclo de projeto |
| S-02 | Episódios em A | ≥12, parar no alvo | evita optional stopping; separa recorrente de episódio único |
| S-03 | Pares em B | 8, sem parada antecipada | vitória consistente distinguível de alternância aleatória |
| A-02 | Janela mínima de antecipação | ≥1 intervalo de checkpoint | antecipação só é explorável se couber um checkpoint |
| A-03 | Teto de `hindsight_risk = high` | métricas só sobre `low`; não conclusivo se >1/3 for `high` | exclusão é controle mais forte que teto; teto sinaliza falha de desenho |
| B-01 | Itens por bloco | 3 | força promoção sem virar lista |
| B-02 | Itens no briefing | 10 (< 3×5) | folga cria competição entre blocos |
| B-03 | Intervalo produção → avaliação | ≥48h | degrada reconhecimento de autoria sem distorcer timing |
| D-04 | Dias de operação por mês | 20 dias úteis | convenção neutra; registrada como suposição |
| E-01 | Amostra por categoria | 20, ou todos se <20; amostragem sistemática | erro raro exige amostra; regra de seleção impede escolher casos fáceis |
| E-03 | Teto de falso merge | zero em decisions/commitments/artifacts; ≤1/20 nas demais | falso merge cria fato errado silencioso; custo do erro difere por categoria |
| F-01 | Intervalo entre rodadas | ≥14 dias | evita medir memória do teste sem inflar `context dependent` |
| F-02 | Pares por categoria | 8; sem completar com pares construídos | menor `n` em que o critério de F-03 discrimina |
| F-03 | Auto-concordância para `sufficiently stable` | ≥7/8 (87,5%) | acaso em escolha binária = 50%; 6/8 não separa |
| K-7 | Teto de "other"/reclassificação | >1/3 dos objetos | detecta ontologia inadequada antes do build |
| K-9 | Percepção de vigilância | manter qualitativo | quantificar exigiria medir o que o critério protege |

**Derivados (resolvem automaticamente ao travar a decisão-mãe):** A-02 ← cadência de checkpoint · B-02 ← B-01 · K-1 ← B-04 · K-2 ← A-02 · K-3 ← E-02+E-03 · K-4 ← D-01 · K-5 ← B-06 · K-6 ← B-05 · K-8 ← A-01+A-03 · K-10 ← B-07.

### Nota sobre calibragem

Estes valores não foram escolhidos para o produto passar nem para reprová-lo. Três deles são deliberadamente severos porque protegem contra falso positivo caro: A-03 (hindsight), E-03 (falso merge) e F-03 (auto-concordância). Dois são deliberadamente permissivos porque um critério impossível não é um critério: K-7 (1/3 de "other") e E-03 nas categorias de baixo impacto. As consequências de cada direção estão registradas em cada decisão.

---

## 11. Decision Lock Table

`PENDING` = aguarda decisão · `PROPOSED` = recomendação metodológica aguardando aceite · `LOCKED` = travada antes da execução

### Scope

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| S-01 | Tamanho da janela histórica | 6 semanas | PROPOSED |
| S-02 | Episódios alvo em A | ≥12 | PROPOSED |
| S-03 | Checkpoints/briefings em B | 8 pares | PROPOSED |

### Workstream A

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| A-01 | Volume mínimo de oportunidades acionáveis (GO) | — | PENDING (OD-1) |
| A-02 | Janela mínima de antecipação | ≥1 intervalo de checkpoint | PROPOSED (derivado) |
| A-03 | Teto de `hindsight_risk = high` | só `low` nas métricas; não conclusivo se >1/3 | PROPOSED |

### Workstream B

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| B-01 | Itens máximos por bloco | 3 | PROPOSED |
| B-02 | Itens máximos no briefing | 10 | PROPOSED (derivado) |
| B-03 | Intervalo produção → avaliação | ≥48h | PROPOSED |
| B-04 | Frequência mínima de itens úteis (GO) | — | PENDING (OD-2) |
| B-05 | Teto de `already_known` + `irrelevant` | — | PENDING (OD-3) |
| B-06 | Teto de manual normalization effort | — | PENDING (OD-4) |
| B-07 | Serious false negatives que caracterizam falha | — | PENDING (OD-5) |

### Workstream D

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| D-01 | Max cost per useful intervention | — | PENDING (OD-6) |
| D-02 | Max cost per month | — | PENDING (OD-7) |
| D-03 | Max latency P95 checkpoint → briefing | — | PENDING (OD-8) |
| D-04 | Assumed operating days per month | 20 | PROPOSED |

### Workstream E

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| E-01 | Amostra por categoria | 20 ou todos; sistemática | PROPOSED |
| E-02 | Cobertura determinística mínima | — | PENDING (OD-9) |
| E-03 | Teto de falso merge | 0 em alto impacto; ≤1/20 nas demais | PROPOSED |
| E-04 | Tempo máximo de correção manual | — | PENDING (OD-9) |

### Workstream F

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| F-01 | Intervalo entre avaliações | ≥14 dias | PROPOSED |
| F-02 | Pares mínimos por categoria | 8 | PROPOSED |
| F-03 | Auto-concordância `sufficiently stable` | ≥7/8 | PROPOSED |

### Kill criteria

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| K-1 | Pouco conteúdo novo e acionável | < B-04 na maioria dos briefings | PROPOSED (derivado) |
| K-2 | Janela de antecipação inexistente | mediana (só `low`) < A-02 | PROPOSED (derivado) |
| K-3 | Merge ambíguo domina | < E-02 em categoria de alto impacto, ou E-03 violado | PROPOSED (derivado) |
| K-4 | Custo excede o limite | > D-01 em todos os modos | PROPOSED (derivado) |
| K-5 | Esforço manual alto e não decrescente | > B-06 sem tendência de queda | PROPOSED (derivado) |
| K-6 | Ruído crescente | > B-05 na maioria dos briefings | PROPOSED (derivado) |
| K-7 | "other"/reclassificação domina | > 1/3 dos objetos | PROPOSED |
| K-8 | Utilidade só com hindsight | A-03 violado, ou volume cai abaixo de A-01 sem os `high` | PROPOSED (derivado) |
| K-9 | Percepção de vigilância | qualitativo, sem threshold | PROPOSED |
| K-10 | Serious false negatives recorrentes | ≥ B-07 em mais de um briefing | PROPOSED (derivado) |

### Scope selections

| ID | Decision | Value | Status |
| --- | --- | --- | --- |
| SC-01 | Selected window | — | PENDING (owner) |
| SC-02 | Selected workstream(s) | — | PENDING (owner) |
| SC-03 | Fontes efetivamente usadas | — | PENDING (owner) |
| SC-04 | Terceiro para cegamento parcial | — | PENDING (owner) |
| SC-05 | Categorias selecionadas em F | — | PENDING (owner) |

### Regra de bloqueio

**Enquanto qualquer decisão obrigatória permanecer `PENDING` ou `PROPOSED`, o Validation Sprint 0 permanece `NOT STARTED`.**

Uma decisão só passa a `LOCKED` quando a dona do projeto a aceita ou altera explicitamente. Toda decisão travada é copiada para o campo `predefined_criteria` do experiment log (protocolo §15) **antes** de iniciar cada experimento. Alteração posterior é `deviation`, não atualização — e a decisão associada perde validade.

**Estado atual:** 0 `LOCKED` · 24 `PROPOSED` · 15 `PENDING` · **Sprint 0 NOT STARTED**

A tabela tem 39 linhas: os 38 campos abertos do protocolo (33 `DECISION REQUIRED` + 5 `TO BE FILLED`) mais K-9, incluído para registrar explicitamente que ele permanece qualitativo e sem threshold.
