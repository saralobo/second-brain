# Adversarial Review — Architecture Package v0.1

**Revisor:** Adversarial AI Systems Architect
**Data:** 30 de agosto de 2026
**Objetivo:** tentar falsificar a arquitetura proposta, não melhorá-la cosmeticamente
**Postura:** hostil por design. Ausência de crítica em uma área significa que ela sobreviveu, não que foi elogiada.

---

## Veredito em uma página

O documento é intelectualmente forte e operacionalmente frágil. Ele acerta quase todos os *princípios* e erra o *regime de dados*.

Três falhas estruturais atravessam tudo:

1. **A arquitetura foi desenhada para um regime de dados que N=1 nunca vai produzir.** Calibração, Brier score, learning-to-rank, bandits, reward models, lift sobre baseline, precision@k por contexto — tudo isso exige centenas a milhares de eventos rotulados *por contexto*. Uma usuária, um projeto, quatro semanas produz dezenas de decisões ambíguas. A escada de ML (Seção 18) assume um crescimento de dados que a premissa do produto proíbe. Isso não é um detalhe: invalida a Seção 17 inteira, boa parte da Seção 11 e os estágios 2–4 da Seção 18.

2. **A incerteza que o pipeline preserva com tanto cuidado é falsa desde a origem.** O Princípio 3 exige que a incerteza sobreviva ao pipeline. Mas a fonte da incerteza é um número que uma LLM escreve sobre si mesma, e esse número é sistematicamente descalibrado. Preservar com rigor um valor sem significado produz *falsa precisão auditável* — pior que não ter confiança nenhuma, porque agora existe governança inteira construída sobre ele (quality gates, EAV, thresholds, promoção de memória, roteamento).

3. **Não existe um único número no documento.** Nenhum custo, nenhum token, nenhuma latência, nenhum volume de eventos/dia, nenhum orçamento por intervenção útil. Um sistema que reprocessa eventos continuamente, consolida memória em background, prevê antes de agir, avalia com um segundo modelo e roda shadow evaluation contra um modelo alternativo tem multiplicador de custo fácil de 10–30× sobre a chamada ingênua. Uma arquitetura sem modelo de custo não é uma arquitetura: é um manifesto.

E uma quarta, meta: **o próprio documento é um sintoma do risco que ele diz querer evitar.** 1673 linhas, 26 seções, 20 decisões e 16 experimentos foram produzidos antes de existir *uma única evidência* de que uma intervenção útil pode ser gerada. A Seção 22 propõe 9 fases; a leitura honesta é 4–8 meses de trabalho de uma pessoa antes do primeiro sinal forte de valor. A recomendação central desta revisão é inverter isso (ver **ALT-01**).

Contagem: **7 Critical, 11 High, 8 Medium, 3 Low.**

---

# Parte I — Achados

Formato por achado: Severity · Area · Problem · Why it matters · Failure scenario · Recommended change · Trade-offs · Architecture vs Experiment.

---

## CRITICAL

### F-01 — O regime de dados de N=1 torna a maior parte da arquitetura de aprendizado inalcançável

- **Severity:** Critical
- **Area:** Aprendizagem contínua, ML strategy (§18), avaliação (§17), PCM (§11)
- **Problem:** A Seção 18 descreve uma escada de 5 estágios que culmina em learning-to-rank, contextual bandits, preference models e fine-tuning. Todos esses métodos exigem volume de dados *por contexto*, não no total. Com uma usuária, um projeto e feedback esparso, o sistema opera permanentemente em regime de baixíssimos dados. O documento trata isso como "ainda não temos dados" quando a leitura correta é "nunca teremos, por construção".
- **Why it matters:** Metade das decisões arquiteturais (D-06, D-07, D-12, D-16, D-18) está justificada por "adiar até haver dataset". Se o dataset nunca chega, essas decisões não são adiamentos — são becos sem saída, e a arquitetura deveria ser desenhada para o regime permanente de poucos dados, o que muda o desenho: mais regra declarada, mais retrieval, mais calibração de poucos pontos, quase nenhum modelo treinado.
- **Failure scenario:** Após 6 meses, existem 140 previsões registradas, 90 resolvidas, distribuídas em 12 contextos. Nenhum contexto tem n>15. O Brier score tem intervalo de confiança que cobre de "excelente" a "pior que aleatório". A equipe conclui "precisamos de mais dados" e conecta mais fontes, aumentando ruído e custo sem nunca atingir poder estatístico. Estágios 2–4 nunca ativam. O investimento em instrumentação para eles é perdido.
- **Recommended change:** Declarar explicitamente um **Low-Data Regime Design Principle**: o sistema deve produzir valor com n<50 por contexto e nunca depender de aprendizado estatístico para funcionar. Reescrever a Seção 18 como duas trilhas paralelas, não uma escada: (a) trilha determinística-declarativa, que é o produto; (b) trilha estatística, tratada como pesquisa opcional que só entra se um limiar de dados for atingido — com o limiar escrito em número. Rebaixar os estágios 2–4 de "roadmap" para "condicional improvável". Substituir métricas que exigem volume (calibração, lift) por métricas de caso: análise de falhas graves, contagem absoluta de intervenções úteis, e comparação pareada cega em amostras pequenas.
- **Trade-offs:** Abre mão da narrativa de "sistema que aprende". Reduz o teto de personalização. Em compensação, remove ~40% da instrumentação prevista e antecipa valor.
- **Architecture vs Experiment:** **Arquitetural.** É uma consequência aritmética da premissa de produto, não uma hipótese a testar.

---

### F-02 — Confiança produzida por LLM é tratada como probabilidade calibrada em todo o sistema

- **Severity:** Critical
- **Area:** Arquitetura cognitiva, memória, quality gates, atenção
- **Problem:** `confidence` aparece como campo transversal (§19.6), critério de promoção de memória (§8.6), termo do EAV (§13), entrada da Action Policy (§14) e gate de qualidade (§17). Sua origem prática é uma LLM emitindo um número sobre a própria extração. Modelos de linguagem produzem confiança mal calibrada, com forte compressão em torno de 0.8–0.95 e sensível a formatação do prompt. O documento nunca define de onde vem o número, nunca define uma álgebra de composição (o que acontece quando um claim com 0.7 alimenta uma oportunidade com 0.6 que alimenta uma ação?), e nunca prevê recalibração.
- **Why it matters:** Todo o Princípio 3 — "incerteza deve sobreviver ao pipeline" — está construído sobre um número sem significado. E a métrica norteadora "quando o sistema diz 70%, acerta 70%" (§2) é impossível de satisfazer sem uma camada de calibração que não existe no desenho.
- **Failure scenario:** O extrator marca 0.85 em quase tudo, porque é o modo do modelo. O threshold de promoção é 0.8. Consequentemente, quase todo signal vira claim, quase todo claim vira memória semântica. O Belief Store enche. O usuário vê uma crença errada com "85% de confiança", perde a confiança no número, e a partir daí ignora todo indicador de incerteza — destruindo o mecanismo principal de segurança cognitiva do sistema.
- **Recommended change:** Adicionar um componente explícito de **Confidence Calibration Layer** entre percepção e estado, com três exigências arquiteturais: (1) confiança bruta de modelo é gravada como `raw_model_score`, nunca como `confidence`; (2) `confidence` só existe após mapeamento por uma calibração ajustada (Platt/isotônica ou, com poucos dados, *binning* manual em 3 faixas: provável / incerto / especulativo); (3) definir a álgebra de composição por escrito — recomendo o mínimo (elo mais fraco) em vez de produto, porque produto colapsa cadeias longas para ~0 e cria abstenção patológica. Em regime de poucos dados, prefira **3 níveis ordinais em vez de números contínuos**: números contínuos aqui são teatro de precisão.
- **Trade-offs:** Perde granularidade. Exige um conjunto rotulado pequeno (100–200 extrações) para calibrar, e recalibração a cada troca de modelo — o que também expõe um custo escondido de trocar de provedor.
- **Architecture vs Experiment:** **Ambos.** A camada é arquitetural e obrigatória. O formato (3 faixas vs contínuo) é experimento barato.

---

### F-03 — Não existe modelo de custo, tokens ou latência em nenhum ponto do pacote

- **Severity:** Critical
- **Area:** Custo, tokens, latência, viabilidade
- **Problem:** 1673 linhas sem um único número de custo, volume ou tempo. O documento não define sequer se o processamento é streaming, batch ou sob demanda — uma decisão de primeira ordem que determina a conta. Simultaneamente, ele prescreve: extração por evento, busca de contraevidência por hipótese, consolidação em background, previsão antes de recomendação, evaluator independente, shadow evaluation com modelo alternativo e replay sets periódicos.
- **Why it matters:** A métrica que realmente decide se o produto existe é **custo por intervenção útil**. Se o sistema gera 3 intervenções úteis por dia e queima US$ 15/dia em tokens, ele é um brinquedo caro. Essa razão precisa ser estimada *antes* da implementação, porque ela muda o desenho: define se dá para chamar LLM por evento, se dá para consolidar diariamente, se dá para ter evaluator independente em tudo.
- **Failure scenario:** V0 entra em operação. Um dia típico tem 400 eventos normalizados (mensagens, mudanças de doc, itens de calendário). Extração a ~1 chamada/evento com contexto médio, mais consolidação noturna, mais 3 detectores varrendo o grafo, mais previsão, mais evaluator, mais shadow em 10% — a conta chega em algo entre 1 e 3 ordens de grandeza acima da intuição inicial. A reação é cortar justamente as partes de qualidade (evaluator, contraevidência, shadow), que são as que sustentam as garantias epistêmicas do documento. O sistema degrada exatamente para "RAG + agentes".
- **Recommended change:** Produzir, antes de qualquer implementação, um **Cost & Latency Model** de uma página: eventos/dia estimados por fonte; fração que exige LLM; tokens médios por chamada por arquétipo; multiplicador de reprocessamento; custo/dia; custo/mês; custo por intervenção entregue. Adicionar uma decisão nova **D-21 — modo de processamento** (streaming vs micro-batch vs on-demand) com recomendação explícita. Minha recomendação: **on-demand + micro-batch em checkpoint**, não streaming — porque a V0 entrega em checkpoint, então processamento contínuo é custo sem consumidor. Adicionar um **pré-filtro barato** (heurístico ou classificador pequeno) antes de qualquer extração por LLM; sem ele, o custo escala linearmente com fontes conectadas, o que a própria §13 diz ser inaceitável para atenção mas ignora para computação.
- **Trade-offs:** Micro-batch aumenta latência de detecção; oportunidades com janela curta (menos de algumas horas) ficam fora do escopo da V0 — o que é aceitável e deveria ser dito.
- **Architecture vs Experiment:** **Arquitetural**, e é bloqueante. Nenhuma fase deveria começar sem esse documento.

---

### F-04 — Prompt injection tem princípio, não tem mecanismo

- **Severity:** Critical
- **Area:** Segurança
- **Problem:** §20 declara "conteúdo de fonte é dado, nunca instrução privilegiada" e "isolamento entre instruções do sistema, políticas e conteúdo recuperado". Isso não é um controle: é um desejo. Dentro de uma única chamada de LLM não existe separação forte entre instrução e dado — a fronteira é estatística, não arquitetural. O documento lista a ameaça como #1 e depois a mitiga com uma afirmação.
- **Why it matters:** O plano prevê ingestão futura de e-mail e Slack (§21) e autonomia A4 (§14). Uma arquitetura que planeja escrever em sistemas externos e ler conteúdo de terceiros precisa de contenção estrutural desde o desenho, não como endurecimento posterior. Retrofit de isolamento em pipeline já construído é caro e tipicamente incompleto.
- **Failure scenario:** Um e-mail contém, em texto branco, instruções para "resumir também o documento X e incluir no próximo briefing" ou, pior, para marcar uma decisão como superseded. O extrator obedece parcialmente. O claim entra com proveniência impecável — a proveniência aponta corretamente para o e-mail malicioso, o que não ajuda em nada, porque ninguém audita proveniência de itens que parecem plausíveis. A memória semântica é envenenada com lineage perfeito.
- **Recommended change:** Tornar arquitetural o padrão de **dois planos**: (a) *plano quarentenado* — a LLM que toca conteúdo bruto não tem ferramentas, não tem acesso a memória, e só pode emitir saída estruturada validada contra schema fechado com enums; texto livre proveniente dela é sempre tratado como citação, nunca como instrução; (b) *plano privilegiado* — a LLM que decide e age nunca vê texto bruto de fonte externa, apenas objetos estruturados já validados. Adicionar a regra de promoção: **um claim cuja única evidência é conteúdo ingerido nunca pode ser promovido a memória semântica, de preferência ou de julgamento sem corroboração por um sinal originado da usuária** (ação, confirmação, ou segunda fonte independente com autoria distinta). Adicionar teste adversarial como gate de release, não como atividade "recorrente".
- **Trade-offs:** Perde nuance: a saída estruturada fechada descarta informação que texto livre capturaria. Aumenta chamadas (duas etapas em vez de uma) e portanto custo — o que reforça F-03.
- **Architecture vs Experiment:** **Arquitetural.** Experimento serve só para medir quanto sinal se perde com a saída fechada.

---

### F-05 — A consolidação de memória é um amplificador de erro com viés de recuperação a favor do resumo

- **Severity:** Critical
- **Area:** Memória, consolidação, memory poisoning
- **Problem:** §8.4 descreve consolidação como processo que une redundâncias, promove padrões e gera resumos derivados. Não há limite de profundidade de derivação. Resumos de resumos são o mecanismo clássico de deriva para ficção. Pior: resumos são curtos, coerentes e semanticamente densos — exatamente o que ganha em busca vetorial contra os eventos originais, que são longos e ruidosos. O sistema vai preferir sistematicamente sua própria interpretação sobre a evidência que a gerou.
- **Why it matters:** É a contradição direta do Princípio 1 ("evidência antes de inferência") e do D-01 ("evidência é a trilha autoritativa"). A trilha pode ser autoritativa no papel e irrelevante na prática, se o retrieval nunca a alcança.
- **Failure scenario:** Mês 1: um resumo de reunião interpreta erradamente que "a direção visual foi aprovada". Mês 2: a consolidação semanal absorve esse resumo num claim semântico "direção visual definida em fevereiro". Mês 4: o resumo trimestral consolida o claim. Mês 6: a usuária pergunta quando a direção foi decidida; o retrieval devolve o resumo trimestral, com proveniência que aponta para o resumo mensal, que aponta para o semanal. Ninguém desce até a transcrição. O erro está agora em três camadas, é auto-consistente, e cada camada corrobora a outra.
- **Recommended change:** Três regras arquiteturais: (1) **profundidade máxima de derivação = 1** — todo resumo é computado a partir de eventos/claims de nível zero, nunca de outro resumo; resumos são caches recomputáveis, não memória; (2) **resumos não competem com evidência no ranking** — no retrieval, um resumo só entra se seus itens-fonte foram considerados e excluídos por orçamento, e o Context Packet registra isso; (3) **corroboração cruzada obrigatória para promoção semântica**: exigir ≥2 evidências de autoria ou fonte independente (§8.6 já pede "diversidade de fontes" — transformar em regra dura, não critério).
- **Trade-offs:** Recomputar em vez de encadear resumos é mais caro (de novo F-03) e mais lento. Perde compressão de longo prazo — o que reabre a questão de escala em §F-20.
- **Architecture vs Experiment:** **Arquitetural** para as regras 1 e 3. A regra 2 é experimento (EXP-03 estendido).

---

### F-06 — O PCM exige atribuição causal que o próprio documento declara impossível

- **Severity:** Critical
- **Area:** Behavioral Model, Personal Cognition Model, ML prematuro
- **Problem:** §11 define `PreferenceHypothesis` com um campo `tipo: hábito | preferência | princípio | estratégia | restrição | tendência`. §10 ("Credit assignment") explica, corretamente, que uma edição não revela seu motivo, e que a diferença pode vir de nova informação, stakeholder, prazo, política, erro factual, estilo, exploração ou acaso. Essas duas seções são incompatíveis: o schema exige exatamente a distinção que a seção anterior declara indecidível a partir de observação. Não há teste operacional que separe hábito de preferência de princípio usando apenas comportamento observado — isso exigiria conjuntos de escolha contrafactuais que o sistema não tem.
- **Why it matters:** Um campo que não pode ser preenchido confiavelmente vira preenchido *plausivelmente* — pela LLM, com viés para "princípio", porque princípios soam mais úteis. E a §11 estabelece que princípios são mais estáveis e normativos, ou seja: o campo mal preenchido ganha peso maior e decai mais devagar. O erro é auto-reforçante por design.
- **Failure scenario:** A usuária remove jargão de três rascunhos seguidos porque os três eram para o mesmo cliente conservador. O sistema registra "princípio: prefere linguagem sem jargão" com alta estabilidade. Seis meses depois, num contexto técnico interno onde jargão é preciso e desejável, o quality gate pessoal penaliza o output correto. A usuária corrige. O sistema registra a correção como "exceção conhecida", não como falsificação do princípio — porque §11 diz explicitamente para não tratar toda exceção como drift.
- **Recommended change:** Colapsar a taxonomia de 6 tipos em **dois campos ortogonais e mensuráveis**: (a) `origin: declared | observed` — binário, verificável, sem inferência; (b) `context_breadth`, estimado por contagem de contextos distintos com evidência, não por julgamento de LLM. Eliminar `hábito/preferência/princípio` como tipos inferidos; permitir "princípio" **apenas** quando declarado explicitamente pela usuária. Reduzir os 8 submodelos do PCM (§11) a **dois** na V0: relevância e formato/acabamento. Os outros seis são abstração prematura sem dados para sustentá-los.
- **Trade-offs:** O PCM fica visivelmente mais burro e menos vendável. Perde a promessa de modelar estilo de trabalho e comunicação. Ganha falsificabilidade real, que é o que o documento diz querer.
- **Architecture vs Experiment:** **Arquitetural** para o colapso da taxonomia. Experimento para decidir quais dois submodelos sobrevivem.

---

### F-07 — Nada garante que as preferências da usuária sejam estáveis o suficiente para serem aprendíveis

- **Severity:** Critical
- **Area:** Modelagem temporal, PCM, premissa não comprovada
- **Problem:** Todo o aparato de personalização assume implicitamente que existe um sinal estável a ser aprendido. Ninguém mediu a **auto-consistência** da usuária. Se, apresentada ao mesmo conjunto de opções em dois momentos separados por três semanas, ela escolhe diferente 40% das vezes, então 60% é o teto absoluto de qualquer preditor — e um teto de 60% em decisões binárias é praticamente inútil, ainda mais quando a baseline "escolha mais comum" já entrega algo próximo disso.
- **Why it matters:** Este é o único ponto do documento capaz de matar a tese inteira com um experimento de uma semana. §24 pergunta "quais decisões se repetem o suficiente" (Q14), mas trata como questão de escopo, não como teste de viabilidade. É de viabilidade.
- **Failure scenario:** Investem-se quatro meses em PCM, previsões registradas, versionamento, drift detection. Na avaliação, o lift sobre baseline não personalizado é 4 pontos percentuais com intervalo de confiança de ±12. Não é possível distinguir personalização de ruído — e nunca será, porque o teto é o próprio ruído da usuária.
- **Recommended change:** Rodar **EXP-00 (test–retest de auto-consistência)** antes de qualquer outra coisa: 30–40 pares de opções reais extraídos de trabalho passado, apresentados duas vezes com 2–3 semanas de intervalo, ordem embaralhada. Medir concordância consigo mesma, global e por categoria. Definir *antes* o critério: se a concordância global for <70%, o PCM sai da V0 e vira, no máximo, memória de preferências declaradas. Publicar o teto medido como limite superior explícito de toda métrica de personalização.
- **Trade-offs:** O experimento é desconfortável — pode invalidar a parte mais ambiciosa do produto em uma semana. É exatamente por isso que deve vir primeiro.
- **Architecture vs Experiment:** **Experimento**, e é o experimento mais importante do pacote inteiro.

---

## HIGH

### F-08 — Não-goal "não reproduzir a personalidade da usuária" é contradito por três componentes

- **Severity:** High
- **Area:** Product boundaries, PCM, privacidade
- **Problem:** §4 lista como não-objetivo "reproduzir a personalidade da usuária" e §11 diz que o Personal Decision Simulator "não deve impersonar a usuária nem enviar mensagens como se fosse ela". Simultaneamente, o pacote prevê: um Communication model que adapta tom e densidade por público; preparação de rascunhos de mensagens (A2, §14 e §21); e um Quality judgment model que julga o que ela consideraria bom. Um rascunho de mensagem preparado com o modelo de comunicação dela *é* texto em primeira pessoa com a voz dela. A distinção "prepara mas não envia" é uma política de entrega, não uma fronteira arquitetural.
- **Why it matters:** Fronteiras que só existem no ponto de envio quebram no primeiro momento em que A4 é concedido. E, no plano de confiança, a usuária vai perceber a contradição antes do arquiteto.
- **Failure scenario:** A V1 concede A4 ("criar rascunho em ferramenta aprovada"). Um rascunho na voz dela fica salvo no Gmail. Alguém do time vê o rascunho num documento compartilhado e assume autoria dela. Nenhuma política foi violada; a fronteira simplesmente não existia.
- **Recommended change:** Substituir o não-goal vago por uma regra mecânica: **todo artefato gerado carrega marcação de autoria de máquina e não removível pelo sistema** (só a usuária remove, num ato explícito de adoção). E separar `voice adaptation` (permitido: densidade, estrutura, formato) de `voice imitation` (proibido: idioleto, assinaturas estilísticas, primeira pessoa não marcada) como duas capacidades distintas no Capability Registry, com a segunda sem grant possível na V0.
- **Trade-offs:** Rascunhos ficam menos "prontos", exigem mais edição, reduzindo o valor medido em EXP-06.
- **Architecture vs Experiment:** **Arquitetural.**

### F-09 — Aprendizado de preferência a partir de conjuntos de escolha gerados pelo próprio sistema é um loop fechado

- **Severity:** High
- **Area:** Feedback loops, preference learning
- **Problem:** §10 lista "escolheu uma alternativa" como feedback implícito de nível 5. Mas o sistema só conhece as alternativas que ele mesmo propôs. Aprender de escolhas dentro de um conjunto gerado pelo sistema aprende sobre a distribuição geradora do sistema, não sobre a usuária. §23 nomeia "overpersonalization" e mitiga com "contraevidência, baseline neutro, drift" — três palavras, nenhum mecanismo.
- **Why it matters:** É o mecanismo padrão de colapso de sistemas de recomendação, e aqui é pior, porque a usuária é única: não há população que forneça diversidade exógena.
- **Failure scenario:** O sistema aprende que ela prefere análises curtas. Passa a gerar só análises curtas. Ela escolhe entre curtas. A confiança na hipótese sobe. Análises longas nunca reaparecem — nem quando o contexto pedia. O sistema fica cada vez mais confiante numa preferência que ele criou.
- **Recommended change:** Mecanismo concreto: **slots de exploração obrigatórios**. Uma fração fixa (sugestão: 15–20%) das propostas deve ser amostrada de uma política *não personalizada*, marcada internamente, e as escolhas nesses slots são as únicas usadas para atualizar hipóteses de preferência de forma forte. Registrar sempre o conjunto de alternativas consideradas e não apresentadas. Adicionar **checkpoints cegos periódicos** onde o output é gerado sem personalização e comparado por preferência pareada.
- **Trade-offs:** 15–20% das propostas serão medidamente piores. É o preço de ter um sinal não contaminado; deve ser explicado à usuária, ou ela vai interpretar como regressão.
- **Architecture vs Experiment:** **Arquitetural** (o slot precisa existir no desenho). A fração é experimento.

### F-10 — A taxonomia de feedback confunde "estava errado" com "não valia ser dito"

- **Severity:** High
- **Area:** Aprendizagem, atenção, avaliação
- **Problem:** §21 prevê feedback "útil, não útil, incorreto, cedo/tarde e edição". Isso mistura duas dimensões independentes: **correção epistêmica** (o sistema entendeu certo?) e **valor de entrega** (valia interromper/mostrar?). Um item pode estar perfeitamente correto e ser inútil porque ela já sabia. Um item pode estar factualmente errado e ainda assim ter valor, por ter apontado para a região certa.
- **Why it matters:** Colapsar as duas dimensões em um eixo envenena os dois aprendizados ao mesmo tempo: o extrator é penalizado por acertos redundantes, e o Attention Engine é recompensado por itens corretos mas irrelevantes. Falta explicitamente o estado **"correto, mas eu já sabia"** — que é provavelmente o rótulo mais frequente nos primeiros meses e o mais informativo para o attention model.
- **Failure scenario:** A usuária marca "não útil" em 20 detecções corretas de decisão não propagada porque já as tinha percebido. O sistema reduz a confiança do detector de decisão — que estava certo — e não aprende nada sobre o que realmente importa: o timing.
- **Recommended change:** Feedback bidimensional obrigatório: eixo A ∈ {correto, parcialmente correto, incorreto, não verificável}; eixo B ∈ {valioso, já sabia, irrelevante, cedo, tarde}. Roteamento distinto: eixo A alimenta percepção/estado; eixo B alimenta atenção/entrega. Nunca cruzar.
- **Trade-offs:** Dois cliques em vez de um. Em compensação, dobra o valor informacional de cada feedback — crítico no regime de F-01.
- **Architecture vs Experiment:** **Arquitetural.**

### F-11 — O decay de preferências penaliza sistematicamente princípios raros e preserva hábitos triviais

- **Severity:** High
- **Area:** Memória, temporalidade, contradição interna
- **Problem:** §8.5 recomenda "reduzir peso de preferências antigas sem evidência recente". Mas a ausência de evidência recente para uma preferência normalmente indica **ausência da situação**, não mudança de preferência. Critérios que aparecem raramente (o que fazer quando um cliente pede algo antiético; como priorizar quando há conflito entre stakeholders sênior) são justamente os mais normativos e mais valiosos — e são os que decaem. Enquanto isso, tendências de alta frequência e baixo valor (formato de bullet, horário de resposta) são constantemente reforçadas.
- **Why it matters:** O mecanismo de decay implementa exatamente o inverso do Princípio 7 e da regra "o sistema não deve promover hábito a princípio": ele rebaixa princípios e promove hábitos, por frequência. É uma contradição interna do documento, não uma preferência de desenho.
- **Failure scenario:** Após um ano, o modelo pessoal é composto quase inteiramente de padrões de formatação. O primeiro conflito ético/político real chega e o sistema não tem nada — a hipótese relevante decaiu por falta de recorrência.
- **Recommended change:** Substituir decay por tempo por **decay por oportunidade**: uma hipótese só perde peso quando ocorreu um contexto em que ela era aplicável e o comportamento observado não a confirmou. Sem contexto aplicável, não há decay. Isso exige modelar `applicability_context` na hipótese — que já está previsto como "domínio e contexto". Preferências declaradas explicitamente não decaem: expiram apenas por revogação explícita ou contradição observada.
- **Trade-offs:** Exige detectar "contexto aplicável ocorreu", que é ele mesmo uma inferência falível. Hipóteses obsoletas podem persistir mais tempo.
- **Architecture vs Experiment:** **Arquitetural.**

### F-12 — Explicabilidade corre o risco de ser narração post-hoc gerada por LLM

- **Severity:** High
- **Area:** Observabilidade, explicabilidade
- **Problem:** §2 exige que o sistema explique sinal, inferência, evidência, confiança e por que interromper agora. Nada no desenho impede que essa explicação seja gerada por uma LLM olhando o resultado final. Isso produz explicações fluentes, plausíveis e desconectadas do processo real de decisão — o pior resultado possível, porque é indistinguível de explicabilidade genuína até o dia em que não é.
- **Why it matters:** A explicabilidade é o principal mecanismo de confiança e de correção do sistema. Se ela for confabulada, o usuário corrige a narrativa em vez do modelo, e as correções não têm efeito causal sobre o comportamento futuro.
- **Failure scenario:** A usuária discorda de uma priorização e o sistema explica "priorizei porque você historicamente trata prazos de cliente como críticos". Ela corrige essa crença. Nada muda, porque a priorização real veio de um peso de recência no reranker; a crença citada nunca entrou no cálculo.
- **Recommended change:** Regra arquitetural: **a explicação é montada a partir do registro estruturado de decisão** (fatores, pesos, evidências efetivamente usadas, política aplicada, versão). A LLM tem permissão apenas para redigir, com proibição explícita de introduzir fatores. Adicionar um teste de regressão: perturbar um fator no registro deve mudar a explicação; se não muda, a explicação é decorativa. Definir `DecisionRecord` como objeto de primeira classe em §19.4 — hoje ele não existe; existem `ActionProposal`, `AgentRun` e `Evaluation`, nenhum dos quais captura *por que* o ranking ordenou daquele jeito.
- **Trade-offs:** Explicações ficam mais secas e mais mecânicas. Exige que todos os rankers sejam introspectáveis, o que efetivamente proíbe usar uma LLM como ranker de caixa-preta — uma restrição pesada e, na minha leitura, correta.
- **Architecture vs Experiment:** **Arquitetural.**

### F-13 — Resolução de identidade e entidades entre fontes está ausente e é onde esses sistemas costumam morrer

- **Severity:** High
- **Area:** Componente faltante, ingestão, Work Graph
- **Problem:** §6.1 menciona "deduplicar" em uma palavra. §19 define `Actor`, `Artifact`, `Workstream` sem nenhum mecanismo de resolução. A mesma reunião aparece como evento de calendário, transcrição, resumo automático, thread de Slack e comentário em documento. A mesma pessoa é um e-mail, um handle de Slack, um nome em transcrição e um cursor no Figma. O mesmo projeto tem três nomes.
- **Why it matters:** Sem resolução de identidade não existe Work Graph — existem cinco grafos desconectados com aparência de um só. Todas as métricas de "decisão não propagada" dependem de saber que o documento X e a decisão Y pertencem ao mesmo objeto. É o subsistema mais chato e mais determinante do pacote, e recebeu uma palavra.
- **Failure scenario:** O detector "decisão não propagada" dispara constantemente porque não reconhece que o documento atualizado é o mesmo objeto referido na reunião com outro nome. Precisão do detector desaba; a usuária conclui que a proatividade é ruído; o pivot é acionado por um problema de entity resolution diagnosticado como falha de cognição.
- **Recommended change:** Promover **Entity Resolution & Identity Service** a componente nomeado na §6.1, com desenho próprio: chaves determinísticas quando existirem (IDs de provedor, URLs canônicas, hashes), heurísticas de bloqueio, e LLM apenas como desempate em casos ambíguos, com registro de merge reversível. Adicionar métrica de ingestão específica: taxa de merge correto/incorreto. Adicionar ao critério de parada da V0: "identidade não resolvível entre as fontes escolhidas".
- **Trade-offs:** Trabalho não glamouroso que consome semanas antes de qualquer demonstração cognitiva. É exatamente por isso que costuma ser adiado, e exatamente por isso que costuma matar o projeto.
- **Architecture vs Experiment:** **Arquitetural**, com validação empírica na Fase 1 (já prevista, mas subdimensionada).

### F-14 — Previsões são registradas mas não existe motor de resolução de outcome

- **Severity:** High
- **Area:** Componente faltante, avaliação, aprendizagem
- **Problem:** D-07 exige registrar previsões antes do resultado. §19.3 define `Prediction`. §17 exige comparar previsão e outcome. Não existe, em lugar nenhum, o componente que **decide que um outcome ocorreu, qual foi, e quando desistir**. Muitas previsões nunca resolvem: a decisão não é tomada, é tomada fora do campo de visão do sistema, ou é tomada de forma ambígua. §24 (Q28, Q29) reconhece o problema e o deixa em aberto.
- **Why it matters:** Previsão sem resolução é log de escrita apenas. Pior: se apenas as previsões que resolvem entram na avaliação, existe viés de seleção severo — resolvem justamente as previsões sobre coisas visíveis e formalizadas, que são as fáceis. A calibração medida será otimista de forma estrutural.
- **Failure scenario:** 200 previsões registradas, 60 resolvidas, todas sobre itens que viraram tarefa formal. A calibração parece boa. A capacidade real do sistema sobre trabalho implícito — a tese central do produto — permanece completamente não medida.
- **Recommended change:** Adicionar **Outcome Resolution Engine** como componente de §6.6, com: definição por tipo de previsão do que conta como resolução; janela de expiração obrigatória; estado `unresolved` reportado como métrica de primeira classe (nunca descartado); e relato explícito da taxa de resolução ao lado de qualquer métrica de acurácia. Regra: nenhuma métrica de calibração pode ser reportada sem a taxa de não-resolução ao lado.
- **Trade-offs:** Vai revelar que a maioria das previsões não resolve, o que é desmoralizante e verdadeiro.
- **Architecture vs Experiment:** **Arquitetural**, com definição operacional saindo da Fase 0.

### F-15 — Dados de terceiros não consentidos não têm modelo algum

- **Severity:** High
- **Area:** Privacidade, segurança, legal
- **Problem:** §20 é inteiramente centrada na usuária: consentimento por fonte, sensibilidade do PCM, direito de exclusão. Mas o sistema ingere reuniões, mensagens e e-mails contendo dados de **colegas que não consentiram** e, pior, a §12 prevê explicitamente "divergência entre stakeholders" como categoria de oportunidade — isto é, inferência comportamental sobre terceiros. Não existe nenhum objeto, política ou controle para isso.
- **Why it matters:** Sob LGPD/GDPR isso não é detalhe: há tratamento de dados pessoais de terceiros, com inferência, sem base legal clara, num sistema que persiste e consolida. Além disso, é risco de confiança concreto: um colega descobrir que existe um sistema modelando divergências dele é um incidente social, não apenas jurídico.
- **Failure scenario:** O briefing diz "João e Marina divergem sobre escopo; João tem histórico de recuar quando pressionado por prazo". Isso é um perfil comportamental de um terceiro, derivado de conversas privadas, armazenado indefinidamente. Basta um screenshot.
- **Recommended change:** Adicionar **D-22 — Third-Party Data Policy**: (1) terceiros são `Actor` com sensibilidade alta por padrão; (2) proibição arquitetural de `PreferenceHypothesis` / `BehavioralObservation` cujo sujeito não seja a usuária — divergência pode ser registrada como *fato sobre artefatos e posições declaradas*, nunca como *tendência sobre a pessoa*; (3) retenção mais curta para conteúdo de terceiros; (4) redação de identificadores antes do envio a provedores quando a tarefa não exigir identidade.
- **Trade-offs:** Perde capacidade de modelar dinâmica de time, que provavelmente seria útil. É uma perda aceitável.
- **Architecture vs Experiment:** **Arquitetural.** Não é experimentável — é limite.

### F-16 — Quatro subsistemas rankeiam o mesmo candidato com os mesmos critérios

- **Severity:** High
- **Area:** Responsabilidades duplicadas, overengineering
- **Problem:** Opportunity Intelligence (§12) estima valor, timing, custo, risco e personal fit. O Attention Engine (§13) rankeia com 14 fatores que incluem valor, urgência, confiança, custo, reversibilidade e risco. A Action Policy (§14) decide com 12 fatores que incluem risco, reversibilidade, confiança, urgência e custo. Os Quality Gates (§17) avaliam risco, permissão, temporalidade e valor de entrega. São quatro sistemas de pontuação sobre o mesmo objeto com conjuntos de critérios majoritariamente sobrepostos, cada um com sua própria calibração, métricas e modo de falha.
- **Why it matters:** Quatro pontuações independentes sobre os mesmos fatores produzem inconsistência garantida (um item alto em um, baixo em outro, sem que exista uma autoridade), quadruplicam a superfície de calibração — impossível no regime de F-01 — e tornam a explicação (F-12) incoerente.
- **Failure scenario:** Uma oportunidade pontua alto em valor, é rebaixada pelo attention model por custo de interrupção, é aprovada pela Action Policy como "preparar", e é bloqueada pelo delivery gate. Ninguém consegue dizer qual componente decidiu, e a explicação gerada cita o primeiro.
- **Recommended change:** **Um único ponto de avaliação de valor esperado**, com um vetor de fatores compartilhado, computado uma vez, e três *políticas* que consomem o mesmo vetor com limiares distintos (o que fazer, quando mostrar, se pode agir). Fatores são calculados uma vez, com uma definição por fator. Os gates de §17 ficam restritos ao que é genuinamente diferente: grounding, permissão, temporalidade e contradição — que são verificações binárias, não pontuações.
- **Trade-offs:** Menos separação conceitual entre "detectar valor" e "decidir interromper", que o D-08 defende com razão. A separação de *estados* (Opportunity → AttentionCandidate) deve ser preservada; o que deve ser unificado é o *cálculo dos fatores*.
- **Architecture vs Experiment:** **Arquitetural.**

### F-17 — Na V0, metade do modelo de atenção é código morto

- **Severity:** High
- **Area:** Overengineering, priorização
- **Problem:** A V0 (§21) entrega por briefing em checkpoint, explicitamente "não feed contínuo", com autonomia A0–A2. Nesse desenho, "interromper agora", attention budget por canal, custo de interrupção e boa parte do EAV não têm consumidor: não há interrupção a ser decidida. §13 constrói um modelo de 14 fatores mais uma fórmula para um problema que a V0 resolveu por design.
- **Why it matters:** Fatores nunca exercitados não podem ser calibrados nem validados; ficam no código como dívida com aparência de capacidade. Pior: EXP-04 mede precision@k de um ranking cujo único efeito é a ordem dentro de um briefing — onde a usuária lê tudo de qualquer forma, tornando a ordem quase irrelevante e a métrica quase vazia.
- **Failure scenario:** Seis meses de instrumentação de atenção produzem métricas que ninguém consegue interpretar, porque o custo de interrupção nunca foi pago em nenhum caso observado.
- **Recommended change:** Na V0, reduzir o Attention Engine a **um filtro binário mais um corte top-k** com fatores explicitamente declarados e pesos fixos escritos à mão. Adiar EAV, orçamento por canal e custo de interrupção para a versão que efetivamente interrompe. Reformular EXP-04 para medir **falsos negativos graves** (o que ficou de fora e importava), que é a métrica que ainda tem sentido dentro de um briefing.
- **Trade-offs:** Perde-se a chance de coletar dados sobre interrupção cedo. Aceitável: não há como coletar dados sobre um custo que não é pago.
- **Architecture vs Experiment:** **Arquitetural** (corte de escopo).

### F-18 — Preparação silenciosa cria viés de custo afundado no ranking

- **Severity:** High
- **Area:** Feedback loops, Action Policy, custo
- **Problem:** §13 lista "preparar silenciosamente" como saída da decisão de atenção, e EXP-06 testa se preparar bate avisar. Mas preparar é caro (tokens, latência) e cria um artefato que existe. Um artefato existente pressiona pela exibição — arquiteturalmente e psicologicamente. Nada no desenho impede que "já foi preparado" se torne, de fato, um fator de promoção.
- **Why it matters:** É um loop clássico: prepara-se o que é provável de ser útil → o preparado é mostrado → o mostrado é usado → confirma-se que era útil. A validação é circular e o custo cresce com a taxa de preparação, não com a taxa de utilidade.
- **Failure scenario:** O sistema prepara 10 itens/dia, mostra 5 porque foram preparados, a usuária aproveita 2. As métricas registram 40% de aproveitamento sobre o mostrado, o que parece bom, escondendo 20% sobre o preparado e um custo por item útil 5× maior que o esperado.
- **Recommended change:** Duas regras: (1) **a decisão de mostrar precede e é independente da decisão de preparar**; o estado `prepared` é invisível ao ranker; (2) métrica obrigatória de **taxa de aproveitamento sobre o preparado**, não sobre o mostrado, com custo por item aproveitado. Definir teto de preparação por dia como orçamento duro.
- **Trade-offs:** Preparar sem saber se vai mostrar desperdiça deliberadamente. É o preço de uma medição não contaminada.
- **Architecture vs Experiment:** **Arquitetural** para a regra 1; EXP-06 precisa ser reformulado com a regra 2.

---

## MEDIUM

### F-19 — Bitemporalidade completa é cara e apoiada em valid times inferidos e ruidosos

- **Severity:** Medium
- **Area:** Modelagem temporal
- **Problem:** D-19 recomenda bitemporalidade conceitual. O ponto é correto e o custo é subestimado: bitemporalidade contamina toda consulta, todo índice e toda API. E o `valid time` de um claim derivado de texto é *inferido por LLM* ("a decisão foi tomada na terça") — ruidoso, frequentemente ausente, às vezes um intervalo. Modelagem bitemporal rigorosa sobre um valid time ruidoso produz precisão formal sobre dado impreciso.
- **Why it matters:** O benefício real (replay "o que sabíamos na época", evitar hindsight leakage) vem quase inteiro do `system time`, que é confiável e barato. O `valid time` agrega valor menor a custo maior.
- **Failure scenario:** Consultas históricas ficam lentas e sutilmente erradas; a equipe adiciona caches por período; os caches divergem; o replay deixa de ser confiável — matando justamente a capacidade que justificava a bitemporalidade.
- **Recommended change:** Versão reduzida com ~90% do valor: **`observed_at` (system time, obrigatório e confiável) + `effective_at` (opcional, nullable, com flag `inferred`) + `superseded_by` (aresta explícita)**. Replay temporal usa apenas `observed_at`, que é suficiente para impedir vazamento do futuro. Reservar bitemporalidade plena para a classe restrita de objetos onde valid time é factual (reuniões, prazos, versões de documento).
- **Trade-offs:** Perde a capacidade de responder "quando isso passou a ser verdade no mundo" para claims inferidos. Aceitável na V0.
- **Architecture vs Experiment:** **Arquitetural**, com EXP-01 quantificando quantas vezes valid time ≠ observed at de forma consequente.

### F-20 — Embeddings são o verdadeiro lock-in, e a estratégia anti-lock-in não os menciona

- **Severity:** Medium
- **Area:** Model Intelligence, escalabilidade, vendor independence
- **Problem:** §16 e D-14 tratam independência via contratos, replay sets e estado fora dos modelos — tudo focado em LLMs generativas. Embeddings não aparecem. Mas o índice vetorial de anos de memória é o ativo mais caro de migrar: trocar de modelo de embedding invalida todos os vetores, exige reindexação completa, e muda silenciosamente o comportamento de recuperação — o que quebra todos os replay sets e todas as métricas históricas de retrieval de uma vez.
- **Why it matters:** A conclusão do documento afirma que o moat não é o banco vetorial. Correto — mas a *dependência* é.
- **Failure scenario:** Ano 2, o provedor de embeddings deprecia o modelo. A reindexação custa dias de computação e, ao terminar, os resultados de retrieval mudaram o suficiente para invalidar todas as comparações históricas de qualidade. Não há como saber se o sistema melhorou ou piorou.
- **Recommended change:** Registrar `embedding_model_version` em cada vetor; manter reindexação incremental como capacidade desde o primeiro dia; congelar um **golden retrieval set** avaliado por relevância rotulada humana, não por similaridade, para que a comparação sobreviva à troca de modelo. Considerar retrieval híbrido com componente léxico forte (BM25) — que é portátil por construção e, em corpora pequenos e com vocabulário próprio (nomes de projeto, pessoas), frequentemente supera embeddings.
- **Trade-offs:** Manter dois índices custa mais. Em corpus de N=1 o custo é irrisório.
- **Architecture vs Experiment:** **Arquitetural**, com EXP-02 estendido para comparar léxico vs semântico vs híbrido.

### F-21 — Model Intelligence tem 7 componentes para um problema que na V0 é um arquivo de configuração

- **Severity:** Medium
- **Area:** Overengineering, abstração prematura
- **Problem:** §16 define Task Classifier, Capability Registry, Routing Policy, Execution Adapter, Performance Store, Budget Controller e Routing Evaluator. A V0 tem três detectores, um briefing e um tipo de preparação — talvez 5 arquétipos de tarefa e 2 modelos. D-12 já diz "roteamento simples", mas a seção descreve a arquitetura final como se fosse o desenho.
- **Why it matters:** Documentar sete componentes cria pressão de implementação e um vocabulário que a equipe passa a tratar como compromisso. Abstração prematura documentada é quase tão cara quanto abstração prematura implementada.
- **Failure scenario:** Alguém implementa o Capability Registry e o Execution Adapter "porque estão na arquitetura", gastando duas semanas para rotear entre dois modelos, enquanto entity resolution (F-13) continua sem dono.
- **Recommended change:** Reduzir a §16 na V0 a **dois** artefatos: um mapa `arquétipo → (modelo, fallback)` versionado em arquivo, e um log estruturado de `ModelRun` com custo, latência e resultado. Mover o resto para um apêndice marcado como "arquitetura-alvo condicional". O Budget Controller é a única exceção — deve existir na V0, por causa de F-03.
- **Trade-offs:** Refatoração posterior quando houver mais arquétipos. Barata, porque o log já terá os dados.
- **Architecture vs Experiment:** **Arquitetural** (corte de escopo).

### F-22 — Três objetos disputam o mesmo papel: Signal, Claim e Opportunity

- **Severity:** Medium
- **Area:** Modelo de dados, responsabilidades duplicadas
- **Problem:** `Signal` é "interpretação candidata de eventos". `Claim` é "afirmação derivada com evidência e confiança". `Opportunity` é "possibilidade latente de valor". Na prática, "existe um compromisso implícito sem responsável" é simultaneamente um signal (§6.2 lista "compromisso explícito ou implícito"), um claim e uma oportunidade (§12 lista exatamente esse caso). O mesmo conteúdo será representado três vezes, com três confianças e três ciclos de vida.
- **Why it matters:** Triplicação de estado com sincronização implícita é gerador confiável de inconsistência, e triplica a superfície de proveniência.
- **Failure scenario:** A usuária corrige a oportunidade. O claim subjacente permanece. Na semana seguinte, a mesma oportunidade é regerada a partir do claim não corrigido. A usuária conclui que corrigir não adianta — e para de corrigir, matando a fonte de feedback explícito de maior qualidade.
- **Recommended change:** Colapsar `Signal` e `Claim` em um só objeto com um campo de estado (`candidate | accepted | rejected | superseded`); a distinção atual é de maturidade, não de tipo. Manter `Opportunity` como objeto distinto apenas porque tem ciclo de vida próprio e acionabilidade — mas exigir que toda oportunidade referencie claims e que a correção propague para baixo, não só para o lado.
- **Trade-offs:** Perde nitidez conceitual entre percepção e estado. Ganha uma cadeia de correção que funciona.
- **Architecture vs Experiment:** **Arquitetural.**

### F-23 — A competência metacognitiva é o mesmo objeto que o Performance Store e o Routing Evaluator

- **Severity:** Medium
- **Area:** Responsabilidades duplicadas, metacognição
- **Problem:** §7 propõe estimativas de auto-competência por tipo de tarefa ("erro ao inferir prioridade em discussões exploratórias"). §16 propõe Performance Store por arquétipo. §17 propõe avaliação por camada e por competência. São três representações do mesmo dado: desempenho histórico por tipo de tarefa e contexto.
- **Why it matters:** Três representações significam três lugares para atualizar, das quais duas ficarão desatualizadas — e a metacognição é justamente o que alimenta confiança, roteamento e decisão de perguntar.
- **Recommended change:** Um único **Competence Store**: chave = (arquétipo de tarefa, contexto, versão de modelo/prompt); valor = desempenho observado e n. Metacognição, roteamento e quality gates leem dele. Exigir que qualquer afirmação de competência exiba n — em regime de poucos dados, "n=4" é a informação mais importante da linha.
- **Trade-offs:** Nenhum relevante. É simplificação pura.
- **Architecture vs Experiment:** **Arquitetural.**

### F-24 — Não há plano de bootstrap: o sistema começa sem memória e sem princípios declarados

- **Severity:** Medium
- **Area:** Cold-start, componente faltante
- **Problem:** A Fase 0 usa histórico apenas para rotular e construir replay set. Nada é dito sobre **carregar histórico como memória de produção**. E, mais grave: o caminho mais barato e confiável para personalização — pedir que a usuária declare 20–30 princípios, critérios de qualidade e limites explícitos — está subordinado à inferência comportamental em todo o documento. §23 reconhece cold-start e mitiga com "explicitar baseline e pedir pouco feedback".
- **Why it matters:** No regime de F-01, **preferência declarada domina preferência inferida por uma margem enorme** e por tempo indefinido. A arquitetura inverte a prioridade: gasta a maior parte do desenho em inferência e trata declaração como caso menor.
- **Failure scenario:** Os dois primeiros meses são genéricos e desapontantes. A usuária desengaja antes de existir qualquer dado comportamental. O sistema nunca sai do cold start — e o pivô é acionado por uma falha de bootstrap interpretada como falha da tese.
- **Recommended change:** Adicionar componente **Declared Knowledge Intake**: entrevista estruturada inicial (princípios, critérios de qualidade por domínio, o que nunca deve ser inferido, o que sempre exige confirmação, stakeholders e seus papéis), com formato idêntico ao das hipóteses inferidas mas com `origin: declared` e prioridade estrutural sobre o inferido. Adicionar ingestão retroativa do histórico como memória de produção, com marcação clara de `observed_at` retroativo para não vazar futuro no replay. Explicitar em D-06 que **declarado supera inferido em caso de conflito**, sempre — hoje o documento não estabelece essa precedência.
- **Trade-offs:** Onboarding pesado, que a §1 diz querer evitar. Contra-argumento: uma hora de entrevista provavelmente vale mais que seis meses de inferência implícita para N=1.
- **Architecture vs Experiment:** **Arquitetural**, e é também a alternativa ALT-03.

### F-25 — Métricas de utilidade são avaliadas pela pessoa que quer que o projeto dê certo

- **Severity:** Medium
- **Area:** Avaliação, validade
- **Problem:** "Proporção de intervenções consideradas úteis" é a métrica norteadora #1 e é julgada pela usuária, que é simultaneamente sujeito, avaliadora, beneficiária e provavelmente dona do projeto. Não há controle, não há cegamento, não há linha de base de placebo. §17 lista "avaliação cega de alternativas", mas apenas para comparar outputs entre si.
- **Why it matters:** Sem um controle, "68% das intervenções foram úteis" não é interpretável. Sistemas proativos produzem utilidade percebida mesmo quando o conteúdo é fraco, por efeito de saliência: qualquer lembrete relevante ao contexto parece útil.
- **Failure scenario:** O produto passa em todos os gates de utilidade percebida e, ao ser desligado por uma semana, nada acontece de mensurável.
- **Recommended change:** Introduzir **controle de placebo**: uma fração das intervenções entregues é gerada por uma baseline degradada (item recente aleatório do projeto, ou heurística trivial), sem marcação visível, e avaliada no mesmo fluxo. A métrica válida é a *diferença* entre real e placebo, não o valor absoluto. Complementar com um **teste de retirada**: uma semana com o sistema desligado, medindo o que a usuária sente falta espontaneamente.
- **Trade-offs:** Enganar deliberadamente a própria usuária exige consentimento prévio para o desenho do estudo. Como ela é a dona, isso é resolvível — mas precisa ser combinado antes, não depois.
- **Architecture vs Experiment:** **Experimento**, mas exige suporte arquitetural (canal de injeção de placebo e marcação interna).

### F-26 — Detecção de contradição é tratada como capacidade resolvida

- **Severity:** Medium
- **Area:** Estado cognitivo, LLM tratada como determinística
- **Problem:** "Preservar contradições relevantes" (§8.4), "detectar conflito e lacuna" (§9), "contradiction gate" (§17) e "contradiction search" (§23) assumem que detectar contradição semântica entre claims é uma operação disponível. Não é. Detecção de contradição — especialmente contradição *temporal* e contradição de *escopo* ("aprovamos a direção" vs "aprovamos a direção para o piloto") — é um problema aberto onde LLMs erram nos dois sentidos, com forte tendência a declarar contradição onde há apenas mudança de escopo.
- **Why it matters:** Um gate que falha silenciosamente é pior que gate ausente, porque produz confiança injustificada. Se o contradiction gate deixa passar 60% das contradições reais, o sistema afirma consistência que não verificou.
- **Failure scenario:** Duas decisões incompatíveis coexistem no Work Graph. O gate não detecta. O briefing apresenta as duas como estado atual. A usuária age sobre a errada e perde confiança na representação de estado — o ativo central do produto.
- **Recommended change:** Rebaixar o contradiction gate de garantia a heurística, com nome honesto (`contradiction_flag`, não `gate`). Focar o esforço no subconjunto **detectável de forma determinística**: mesmo atributo do mesmo objeto com valores diferentes em janelas sobrepostas — que exige um modelo de atributo por objeto, e não busca semântica livre. Medir recall de contradição num conjunto pequeno construído à mão antes de confiar no mecanismo.
- **Trade-offs:** Menos cobertura, mais honestidade. Exige modelagem de atributos do Work Graph mais rígida do que o documento sugere.
- **Architecture vs Experiment:** **Ambos.** Rebaixamento é arquitetural; a medição de recall é experimento pequeno e obrigatório.

---

## LOW

### F-27 — A escada A0–A5 tem seis degraus e a V0 usa três

- **Severity:** Low
- **Area:** Abstração prematura, autonomia
- **Problem:** §14 define seis níveis mais uma matriz por domínio, ação e audiência, com grants versionados e expiráveis. A V0 usa A0–A2 e nenhuma escrita externa. A distinção A3 (estado interno) / A4 (externo com limites) / A5 (delegação contínua) é conceitualmente correta e prematuramente detalhada.
- **Recommended change:** Manter a *matriz* (o insight de D-10 é forte e correto) e reduzir os níveis a três na V0: observar, propor, preparar. Adicionar A4/A5 quando existir a primeira ação externa concreta a autorizar — o desenho certo virá do caso concreto.
- **Trade-offs:** Nenhum relevante.
- **Architecture vs Experiment:** Arquitetural (corte de escopo).

### F-28 — Oito tipos de memória para um sistema que ainda não provou consolidar um

- **Severity:** Low
- **Area:** Abstração prematura, memória
- **Problem:** §8.1 define trabalho, episódica, semântica, procedural, preferência, julgamento e outcome — sete tipos lógicos mais três temperaturas. A V0 (§21) usa três. Memória procedural e de julgamento não têm fonte de dados plausível nos primeiros meses.
- **Recommended change:** V0 com **três**: episódica (com evidência), semântica (fatos estabilizados), e declarada (princípios e preferências explícitas — que não é nenhum dos sete e é a mais valiosa, ver F-24). Memória de trabalho é estado de sessão, não memória persistente, e não deveria estar na mesma taxonomia. Outcome é uma relação entre objetos, não um tipo de memória.
- **Trade-offs:** Nenhum relevante.
- **Architecture vs Experiment:** Arquitetural.

### F-29 — "Modo de degradação" não existe

- **Severity:** Low
- **Area:** Confiabilidade, observabilidade
- **Problem:** §23 menciona "source failure" e "freshness e health como evidência", mas o sistema não tem um comportamento definido para operar degradado: conector atrasado, extração com confiança baixa generalizada, provedor indisponível. O comportamento default de sistemas assim é continuar afirmando com a mesma segurança sobre dados incompletos.
- **Recommended change:** Definir um **estado de saúde do contexto** que acompanha todo Context Packet e todo briefing: quais fontes estão frescas, quais estão defasadas e desde quando. Regra: se cobertura de fonte < limiar, o sistema rebaixa a linguagem (de afirmação para hipótese) e suprime detecções do tipo "não propagado", que são justamente as que dependem de completude.
- **Trade-offs:** Nenhum relevante. É barato e evita a classe de erro mais embaraçosa.
- **Architecture vs Experiment:** Arquitetural.

---

# Parte II — Buscas explícitas solicitadas

## Premissas não comprovadas

| # | Premissa implícita | Onde | Status |
|---|---|---|---|
| P-01 | O trabalho relevante deixa rastro textual suficiente para reconstrução | §1, §21 | Não testada. Para uma designer, muito do julgamento acontece em canvas, em conversa síncrona e em revisão visual — invisível ao pipeline. EXP-01 mede recall mas não define o piso que mata a tese. |
| P-02 | A usuária é auto-consistente o bastante para ser modelada | §11 inteira | Nunca medida. Ver F-07. É a premissa mais frágil e a mais barata de testar. |
| P-03 | Confiança emitida por LLM significa algo | §19.6 e todo o pipeline | Falsa como está. Ver F-02. |
| P-04 | Feedback implícito contém sinal de preferência recuperável | §10 | Contestada pelo próprio documento em "credit assignment", e mesmo assim usada. |
| P-05 | Haverá dados suficientes para os estágios 2–4 de ML | §18 | Aritmeticamente improvável. Ver F-01. |
| P-06 | O Work Graph supera retrieval com metadados | D-03, EXP-02 | Plausível mas não óbvia. Em corpus de um projeto, filtros de metadado + BM25 podem empatar por fração do custo. |
| P-07 | Antecipação é valiosa mesmo quando parcialmente errada | §24 Q3 | Levantada como pergunta, tratada como fato no desenho da preparação silenciosa. |
| P-08 | "Decisão" é um objeto identificável de forma estável | §19.2, §24 Q8 | Admitidamente aberta, e é o spine de tudo. Todo o modelo de estado depende dela. |
| P-09 | Detecção de contradição é operacionalmente viável | §8.4, §9, §17 | Ver F-26. |
| P-10 | Interromper menos aumenta valor percebido | §13 | Plausível; nunca comparada contra a hipótese oposta (usuária pode preferir mais input, não menos). |
| P-11 | Custo por intervenção útil é economicamente viável | ausente | Nunca estimado. Ver F-03. |
| P-12 | Consolidação melhora recuperação mais do que degrada fidelidade | §8.4, EXP-15 | Testada apenas no sentido positivo; EXP-15 não mede degradação induzida pela consolidação. |

## Componentes que poderiam ser eliminados na V0

- Personal Decision Simulator (§11) — sem P-02 validada, é ficção instrumentada.
- EAV, attention budget por canal e custo de interrupção (§13) — sem interrupção, sem consumidor (F-17).
- 5 dos 7 componentes de Model Intelligence (F-21).
- 6 dos 8 submodelos do PCM (F-06).
- 4 dos 7 tipos de memória (F-28).
- Níveis A3–A5 (F-27).
- Estágios 2–4 da escada de ML (F-01).
- Belief Store como armazenamento separado de Memory Store e Model State Store — é o mesmo dado com três nomes.
- Capability Registry e Execution Adapter — com 2 modelos e 5 arquétipos, é configuração.

## Responsabilidades duplicadas

1. Signal / Claim / Opportunity (F-22).
2. Opportunity scoring / Attention ranking / Action Policy / Quality gates (F-16).
3. Metacognição / Performance Store / Routing Evaluator / avaliação por competência (F-23).
4. Belief Store / memória de preferência / Model State Store.
5. Critic/Evaluator (§15) / Evaluation Layer (§6.6) / Personal Quality Evaluator (§17) — três avaliadores com o mesmo trabalho e nenhuma precedência definida.
6. Temporal State (§6.3) / campos bitemporais em todo objeto (§19.6) — o primeiro é redundante se o segundo existe.

## Abstrações prematuras

Capability Registry; Execution Adapter; AutonomyGrant versionado com expiração; ModelVersion do PCM; a taxonomia de 6 tipos de hipótese comportamental; as 5 camadas de persistência conceitual; a matriz de autonomia por domínio × ação × audiência; a distinção Signal/Claim.

## Tecnicamente inviável ou caro demais

- Calibração probabilística real com N=1 (F-01, F-07).
- Detecção de contradição semântica confiável (F-26).
- Isolamento instrução/dado dentro de uma chamada de LLM (F-04).
- Bitemporalidade completa com valid time inferido (F-19).
- Extração por LLM em todo evento, continuamente, sem pré-filtro (F-03).
- Shadow evaluation contra modelo alternativo em amostra significativa — dobra o custo da amostra e, em amostras pequenas, não produz conclusão.

## LLM tratada como mais determinística do que é

1. Confiança emitida pelo próprio modelo (F-02).
2. "Preserva interpretações alternativas quando isso muda a ação" (§7.2) — exige que o extrator conheça o espaço de ações a jusante.
3. Detecção de contradição (F-26).
4. Atribuição de valid time a partir de texto (F-19).
5. "Conteúdo de fonte é dado, nunca instrução" (F-04).
6. Classificação hábito/preferência/princípio (F-06).
7. Model-as-judge com "calibração e diversidade de juiz" (§17) — juízes LLM concordam entre si por razões estilísticas, e diversidade de juiz não é independência.
8. Estimativa de "custo de estar errado" e "reversibilidade" (§14) por inferência — são julgamentos de mundo, não de texto.

## ML introduzido cedo demais

Contextual bandits para roteamento (estágio 3); learning-to-rank (estágio 2 — o volume nunca chega); preference models pairwise; reward model pessoal e fine-tuning (corretamente adiados em D-18, mas ainda listados como roadmap, o que cria expectativa).

## ML que deveria existir e está faltando

1. **Calibração de confiança** (Platt/isotônica ou binning) — barata, essencial, e todo o sistema depende dela. Deveria estar no Estágio 0, não ausente.
2. **Pré-filtro barato de "vale extrair"** — classificador pequeno ou heurística antes da LLM. É a única defesa contra explosão de custo (F-03).
3. **Entity resolution** — heurísticas e classificadores clássicos superam LLM em custo e estabilidade (F-13).
4. **Detecção de mudança/delta** — determinística, não LLM. Hoje `Change` é uma primitiva entre onze, quando deveria ser um motor.
5. **Recuperação léxica (BM25)** ao lado de embeddings — barata, portátil, forte em vocabulário próprio (F-20).

## Riscos de feedback loop

- Conjunto de escolha gerado pelo sistema (F-09).
- Preparação → exibição → uso → validação (F-18).
- Consolidação → resumo vence retrieval → resumo corrobora a si mesmo (F-05).
- Personalização → retrieval confirmatório → mais confiança na hipótese (§9 reconhece, sem mecanismo).
- Aceite como proxy de valor: aceitar é barato, aceitar não é aprovar (F-10).
- Autonomia expandida por histórico de sucesso, onde o sucesso foi medido pelo próprio sistema (§14 "escalada progressiva").

## Riscos de memory poisoning

- Injeção via conteúdo ingerido (F-04).
- Compounding por consolidação em múltiplos níveis (F-05).
- Promoção por repetição textual — §8.6 alerta contra, mas "diversidade de fontes" continua sendo critério mole; um mesmo boato citado em três threads parece três fontes.
- Auto-envenenamento: output do sistema (rascunho, briefing) que retorna como evidência quando salvo num documento monitorado. **Não previsto no documento e é altamente provável.** Exige `origin: system` propagado e exclusão explícita de conteúdo próprio da ingestão.
- Correção que não propaga para o claim subjacente (F-22).

## Temporalidade e mudança de comportamento

- Decay penaliza princípios raros (F-11).
- Não-estacionariedade vs tamanho de amostra: o contexto de projeto muda a cada poucos meses; a janela para coletar dados suficientes pode ser maior que a janela em que a preferência é estável. Se isso for verdade, preferências contextuais são **estruturalmente inaprendíveis** para esse usuário. O documento não considera essa possibilidade.
- "Distinguir modelo aprendeu de usuária mudou" (§11) é matematicamente indecidível sem previsões pré-registradas em volume — que F-01 diz não existir.
- Decisões não têm escopo nem expiração no modelo de dados. "Aprovado" sem escopo é a fonte mais comum de contradição falsa (F-26).

## Ação do usuário interpretada erroneamente como preferência

Casos concretos que o desenho atual interpretaria mal:

1. Edita por prazo, não por gosto → vira preferência de estilo.
2. Aceita porque aceitar é barato → vira validação de qualidade.
3. Ignora porque já sabia → vira irrelevância (F-10).
4. Escolhe a menos ruim de um conjunto ruim → vira preferência positiva (F-09).
5. Repete um formato porque é o default da ferramenta → vira hábito → vira princípio (F-06).
6. Adia por estar em outra coisa → vira baixa prioridade.
7. Muda de ideia após informação nova → vira drift comportamental.
8. Segue exigência de stakeholder → vira preferência própria.
9. Silêncio → §4 proíbe interpretar, mas §10 lista "ignorou, adiou" como feedback implícito. **Contradição direta entre não-goal e pipeline de aprendizado.**
10. Corrige o sistema uma vez e não repete porque desistiu de corrigir → vira ausência de contraevidência, ou seja, confirmação.

---

# Parte III — Seções finais

## 1. Strongest parts

Partes que eu manteria mesmo reescrevendo tudo o resto:

**Separar evidência de inferência e manter a evidência como trilha autoritativa (D-01, Princípios 1 e 4).** É a decisão mais valiosa do pacote e a que mais protege contra a falha dominante desta classe de sistema. Manteria sem alteração, exceto pelo reforço de F-05 — a evidência precisa ser alcançável pelo retrieval, não apenas existir.

**Prever antes de observar (D-07).** Epistemicamente correto e raro em produtos. É o único mecanismo que impede racionalização a posteriori. Precisa do motor de resolução ausente (F-14), mas a decisão está certa.

**Autonomia como matriz por domínio, ação e audiência, e não como escada global (D-10).** É insight genuíno. A intuição comum de "nível de autonomia" é errada, e o documento acerta contra a intuição. Manteria a matriz; cortaria os níveis (F-27).

**Separar oportunidade de prioridade (D-08).** Permite investigar e preparar sem notificar. É a base do único comportamento que diferencia esse produto de uma inbox.

**Separar "o sistema também cria valor quando espera ou ignora" (Princípio 9) e a saída explícita "o que foi deliberadamente ignorado" (§2).** Poucos sistemas proativos tratam a abstenção como output de primeira classe. Isso é diferenciação real.

**V0 somente leitura, A0–A2 (D-15).** Corte de risco correto e disciplinado. O maior risco inicial realmente é inferência ruim, não incapacidade de agir.

**A seção 25 inteira, e principalmente as "regras dos experimentos".** "Definir critério de decisão antes de ver o resultado" e "tratar rejeição da hipótese como progresso" são a melhor parte do documento. Falta apenas aplicá-las às hipóteses que o documento não colocou em teste (P-01, P-02, P-11).

**Os não-goals (§4).** São específicos, custosos e verificáveis — o que é raro. A contradição de F-08 e do item 9 acima não os invalida; só exige mecanismo.

**Construir por cortes verticais (D-20).** Certo. O problema é que a §22 depois desenha nove fases que, somadas, são um corte horizontal disfarçado.

## 2. Architecture alternatives

### ALT-01 — Inverter a ordem: Wizard-of-Oz antes de arquitetura (contra §22 e o próprio pacote)

**Discordo de:** construir Fases 0–5 (estimadas em meses) antes de qualquer evidência de que a intervenção principal tem valor.

**Alternativa:** duas a três semanas de operação **manual**. Todo dia, uma pessoa (ou a própria usuária com uma LLM, sem arquitetura nenhuma) lê as fontes brutas do projeto e produz o briefing de cinco blocos da §2. Sem grafo, sem memória, sem PCM, sem retrieval. Mede-se: quantos itens por dia; quantos são úteis; quantos ela já sabia; quanto tempo levaria para produzir manualmente; o que ela sente falta.

**Por que é melhor:** determina em três semanas, com custo quase zero, se o produto tem teto de valor — a pergunta que a arquitetura inteira pressupõe respondida. Se o briefing manual, feito por um humano com acesso total ao contexto e inteligência ilimitada, não for claramente útil, **nenhuma arquitetura resolve**, porque o humano é o limite superior de qualquer sistema automatizado aqui. Se for útil, o exercício produz de graça: a taxonomia real, a distribuição de tipos de item, o volume diário, o rótulo "já sabia", e o primeiro replay set — tudo o que a Fase 0 pretende produzir, mais rápido e sem código.

**Trade-off:** atrasa o início da construção em três semanas e é pouco satisfatório para quem quer construir. Em troca, elimina o risco de meses de trabalho sobre uma premissa não testada.

### ALT-02 — Change Engine no centro, Work Graph como índice (contra D-03 como está)

**Discordo de:** posicionar o Work Graph como a estrutura organizadora central.

**Alternativa:** a unidade central é o **delta** — "o que mudou desde X, e o que isso invalida". Um Change Engine determinístico compara estados de artefatos, decisões e compromissos entre dois pontos no tempo, e emite mudanças com tipo e magnitude. O grafo existe apenas para responder "o que mais depende disto" — ou seja, é o índice de propagação de uma mudança, não a representação primária.

**Por que é melhor:** a promessa de valor da §2 é quase inteiramente sobre mudança ("o que mudou", "decisão não propagada", "trabalho anterior obsoleto"). Detecção de mudança é determinística, barata, auditável, calibrável e não depende de LLM — o oposto de tudo o que é frágil nesta arquitetura. Além disso, é a defesa mais forte contra "virar RAG + agentes": RAG não faz diffs; RAG responde perguntas sobre um corpus estático. Um sistema centrado em delta temporal é categoricamente diferente de RAG, enquanto um sistema centrado em grafo de conhecimento é apenas RAG com um índice melhor.

**Trade-off:** exige modelar atributos versionados por objeto de forma bem mais rígida (o que também resolve F-26). Reduz a capacidade de responder perguntas abertas sobre o corpus — que é justamente o que RAG comum já faz bem e não precisa ser reinventado.

### ALT-03 — Declarado primeiro, inferido depois (contra a ênfase de §10 e §11)

**Discordo de:** dedicar a maior parte da arquitetura de personalização à inferência comportamental.

**Alternativa:** a personalização da V0 é composta de (a) conhecimento declarado em entrevista estruturada, versionado e editável pela usuária; (b) correções explícitas, que atualizam diretamente o declarado; (c) inferência implícita apenas como **gerador de perguntas**, nunca como atualizador de estado. Ou seja: o sistema pode notar um padrão e perguntar "reparei que você tende a X em contexto Y — é uma preferência, ou circunstância?", mas não pode registrar X sem a resposta.

**Por que é melhor:** com N=1, uma hora de declaração explícita supera meses de inferência ruidosa, e é auditável, corrigível e imune a quase todos os riscos de feedback loop, poisoning e má atribuição listados acima. Também alinha com o Princípio 8 (falsificabilidade) de forma muito mais direta.

**Trade-off:** menos "mágica", mais trabalho inicial da usuária, e desiste da hipótese de descobrir sobre ela coisas que ela mesma não sabe — que é a parte mais interessante e a menos provável de funcionar cedo.

### ALT-04 — Três níveis ordinais de confiança em vez de escores contínuos (contra §19.6)

**Discordo de:** `confidence` como número contínuo propagado.

**Alternativa:** três faixas — `estabelecido` (evidência direta, múltiplas fontes independentes), `provável` (evidência única e clara), `especulativo` (inferência). Regras de composição por elo mais fraco. Promoção a memória semântica exige `estabelecido`. Toda apresentação à usuária usa a palavra, nunca o número.

**Por que é melhor:** é honesto sobre a resolução real do sinal, é calibrável com dezenas de exemplos em vez de milhares, elimina thresholds arbitrários, e comunica melhor. "70%" convida a confiar; "especulativo" convida a verificar.

**Trade-off:** perde granularidade para ordenação. Compensável com desempate por número de evidências, que é contável e verdadeiro.

### ALT-05 — Um único Value Vector, três políticas (contra a arquitetura de quatro pontuadores)

**Discordo de:** ter Opportunity scoring, Attention ranking, Action Policy e Quality gates com critérios sobrepostos.

**Alternativa:** um vetor de fatores computado uma única vez por candidato, com uma definição por fator e uma proveniência por fator. Três políticas declarativas leem o mesmo vetor com limiares diferentes: *investigar?*, *mostrar?*, *agir?*. Gates permanecem, mas apenas como verificações binárias e determinísticas: grounding, permissão, temporalidade, contradição-flag.

**Por que é melhor:** um lugar para calibrar, uma explicação coerente (F-12), e limiares que podem ser ajustados à mão de forma inteligível — que é o único tipo de ajuste viável no regime de F-01.

**Trade-off:** acopla decisões que conceitualmente são separadas; mudar a política de exibição pode exigir revisitar fatores. Aceitável em troca de coerência.

### ALT-06 — Três timestamps e supersessão em vez de bitemporalidade plena (contra D-19)

Descrito em F-19. Alternativa concreta: `observed_at` obrigatório, `effective_at` opcional com flag de inferido, `superseded_by` como aresta. Replay usa apenas `observed_at`.

## 3. Experiments before implementation

Ordenados por poder de falsificação por unidade de custo. Os quatro primeiros deveriam bloquear qualquer implementação.

### EXP-00 — Teto de auto-consistência (bloqueante)
**Hipótese testada:** P-02. Existe preferência estável a ser aprendida.
**Método:** 30–40 pares de opções reais extraídos de trabalho passado. Apresentar duas vezes, com 2–3 semanas de intervalo, ordem e rótulos embaralhados. Medir concordância consigo mesma, global e por categoria de decisão.
**Critério definido antes:** concordância global <70% → PCM sai da V0 e é substituído por ALT-03. Entre 70% e 85% → PCM restrito às categorias que passarem individualmente. >85% → prossegue.
**Custo:** ~2 horas da usuária, duas sessões. **Decide:** existência do PCM.

### EXP-0A — Wizard-of-Oz de três semanas (bloqueante)
**Hipótese testada:** P-01, P-07, P-10 e o teto de valor do produto.
**Método:** ALT-01. Briefing diário manual. Rotular cada item com o feedback bidimensional de F-10.
**Critério antes:** se menos de ~1 item verdadeiramente novo e acionável por dia, ou se >70% dos itens forem "já sabia", a tese de proatividade cai e o produto deve pivotar para reconstrução de contexto sob demanda (que é uma tese diferente e mais defensável).
**Custo:** 3 semanas, sem código. **Decide:** se a arquitetura deve existir.

### EXP-0B — Modelo de custo e viabilidade econômica (bloqueante)
**Hipótese testada:** P-11.
**Método:** a partir do volume real observado no EXP-0A, estimar eventos/dia, fração que exige LLM, tokens por arquétipo, multiplicador de reprocessamento. Calcular custo/dia e custo por intervenção útil, em três cenários de desenho (streaming, micro-batch, on-demand).
**Critério antes:** definir o custo máximo aceitável por intervenção útil *antes* de calcular.
**Custo:** um dia. **Decide:** modo de processamento (D-21) e se pré-filtro é obrigatório.

### EXP-0C — Viabilidade de resolução de identidade (bloqueante)
**Hipótese testada:** implícita e ignorada — que as fontes escolhidas podem ser unificadas.
**Método:** amostrar 100 objetos (reuniões, documentos, pessoas, projetos) que aparecem em ≥2 fontes. Tentar resolver com chaves determinísticas. Medir cobertura determinística e taxa de erro do fallback heurístico.
**Critério antes:** se <60% resolvível deterministicamente, o conjunto de fontes da V0 está errado e deve ser trocado por fontes com IDs compartilhados.
**Custo:** 2–3 dias. **Decide:** escolha de fontes da V0 (hoje decidida por densidade de sinal, o que é o critério errado).

### EXP-0D — Calibração de confiança de extração
**Hipótese testada:** P-03.
**Método:** 150–200 extrações rotuladas manualmente como corretas/incorretas. Plotar confiança emitida contra acurácia real. Testar se três faixas ordinais (ALT-04) separam melhor que o número contínuo.
**Critério antes:** se a confiança emitida não separar acurácia melhor que o acaso, ela é removida do pipeline e substituída por contagem de evidências.
**Custo:** 1–2 dias de rotulagem. **Decide:** todo o mecanismo de confiança.

### EXP-0E — Placebo e teste de retirada
**Hipótese testada:** validade das métricas de utilidade (F-25).
**Método:** durante o EXP-0A ou logo após, injetar 20–30% de itens gerados por heurística trivial (item recente aleatório do projeto, reformulado no mesmo formato), sem marcação visível. Comparar taxas de "útil". Complementar com uma semana de retirada total.
**Critério antes:** se a diferença entre real e placebo for menor que ~20 pontos, a percepção de utilidade não distingue conteúdo e a métrica norteadora #1 deve ser substituída.
**Custo:** baixo, embutido no EXP-0A. **Decide:** validade de toda a Seção 17.

### EXP-0F — Contradiction recall em conjunto construído à mão
**Hipótese testada:** P-09.
**Método:** construir 30 pares de claims manualmente: 10 contradições reais, 10 mudanças de escopo que parecem contradição, 10 compatíveis. Medir precisão e recall da detecção.
**Critério antes:** recall <70% ou precisão <70% → contradiction gate vira flag, e o esforço migra para o subconjunto determinístico (F-26).
**Custo:** 1 dia. **Decide:** se o gate existe.

### EXP-0G — Retrieval: léxico vs semântico vs graph-scoped
**Hipótese testada:** P-06 (é o EXP-02 do documento, com um braço a mais).
**Método:** o braço faltante é BM25 puro com filtros de metadado. Em corpus de um projeto, com vocabulário próprio, é um baseline forte e barato que o documento não considera.
**Critério antes:** o Work Graph só se justifica se superar o híbrido simples por margem que compense seu custo de construção e manutenção.
**Custo:** baixo, se o EXP-02 já estiver planejado. **Decide:** existência do Work Graph.

### EXP-0H — Degradação por consolidação
**Hipótese testada:** P-12 e F-05.
**Método:** o EXP-15 do documento mede se consolidação ajuda. Falta o braço inverso: em 50 claims consolidados, verificar manualmente quantos distorceram, perderam escopo ou inverteram nuance em relação à evidência original. Medir também com que frequência o retrieval devolve o resumo em vez da evidência.
**Critério antes:** taxa de distorção >10% → profundidade de derivação limitada a 1 e resumos rebaixados no ranking.
**Custo:** 1–2 dias. **Decide:** regras de consolidação.

### EXP-0I — Injeção adversarial na ingestão
**Hipótese testada:** F-04.
**Método:** inserir 20 payloads de injeção em documentos e mensagens de teste, variando sutileza. Medir quantos alteram a saída estruturada, quantos entram como claim, quantos sobrevivem à consolidação.
**Critério antes:** qualquer payload que chegue a memória semântica bloqueia a conexão de fontes externas até haver contenção de dois planos.
**Custo:** 1 dia. **Decide:** ordem de conexão de fontes.

---

## Observação final

Não busquei consenso, conforme pedido. Registro apenas o que considero a leitura mais provável: a arquitetura está **conceitualmente acima da média e operacionalmente descalibrada para o seu próprio contexto**. O problema não é falta de rigor — é rigor aplicado a um regime de dados que não existirá.

A pergunta mais barata e mais perigosa do pacote continua sem resposta: **se uma pessoa inteligente, com acesso total ao contexto, produzisse esse briefing à mão todo dia, isso seria valioso?** Enquanto essa pergunta não for respondida empiricamente, todas as 20 decisões arquiteturais são apostas sobre uma premissa não testada — inclusive as boas.
