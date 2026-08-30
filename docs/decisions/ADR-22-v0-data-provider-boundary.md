# ADR-22 — V0 Data Locality and Model Provider Boundary

```text
Status: ACCEPTED
Date: 2026-08-30
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final (unchanged)
Evidence / experiment: NONE — no experiment has been executed
Resolves: OQ-B2 (AVA Technical V0 Specification v0.1, §33)
```

**Declaração de evidência.** Este ADR não é motivado por evidência experimental. Ele resolve uma questão deixada em aberto pela baseline §34 nº 6 — *"Quais dados organizacionais podem ser processados por quais provedores?"* — cuja resposta é pré-condição para escrever a primeira chamada de modelo.

---

## Context

A V0 conterá dados pessoais desde a primeira captura: trabalho real da dona do projeto, decisões, princípios declarados sobre si mesma, e informação sobre terceiros mencionada incidentalmente. A baseline §28 estabelece fronteiras claras — provider boundary recebendo somente dados necessários e permitidos, redaction antes do envio, policy de provedor por sensibilidade e modalidade — mas não define onde os dados residem nem qual provedor é usado.

Sem essa definição não é possível escrever a primeira chamada de modelo de forma responsável, o que bloqueia os contratos de LLM (§18 da especificação) e a configuração de redaction (§26 da especificação).

---

## Decision

A AVA V0 adota:

`LOCAL-FIRST PERSISTENCE + PROVIDER-AGNOSTIC MODEL INTERFACE`

### Local-first

Por padrão, permanecem no ambiente **local** da V0:

- Evidence Ledger;
- structured state;
- memory;
- Declared Cognition;
- DecisionRecords;
- telemetry;
- user feedback;
- raw captured content;
- local artifacts/references.

**Não é necessário construir cloud persistence para a primeira V0.** Isso não é economia de esforço: é a configuração que dá à dona do projeto controle físico sobre o próprio corpus enquanto o produto ainda não provou nada.

### External model boundary

Quando um modelo externo for utilizado, **somente o contexto necessário para a tarefa** atravessa a fronteira. Antes do envio, em ordem:

1. recuperar somente a evidência necessária;
2. aplicar sensitivity classification;
3. aplicar redaction/minimization quando necessário;
4. registrar quais `evidence_ids` foram enviados;
5. registrar provider/model;
6. registrar a finalidade;
7. registrar `ModelRun`.

**Nunca enviar automaticamente o ledger inteiro ou a memória inteira.** Nenhum archetype tem "todo o contexto disponível" como entrada. Esta é uma restrição de código, verificada por teste — não uma diretriz de prompt.

Os passos 4 a 7 têm efeito colateral desejado: tornam auditável, depois do fato, exatamente o que saiu da máquina. Sem esse registro, a fronteira existiria apenas como intenção.

### Third-party information

Conteúdo de terceiros **não** é transformado em behavioral profile. A proibição da baseline §28 permanece integral: nada de PCM, PreferenceHypothesis, traços persistentes, previsões comportamentais ou rankings sobre colegas.

Informação sensível ou desnecessária de terceiros é removida ou minimizada **antes** de qualquer chamada externa.

Quando a política não permitir envio seguro, o sistema tem três saídas legítimas, nesta ordem de preferência:

1. usar processamento local/determinístico;
2. pedir confirmação à usuária;
3. **abster**.

Abstenção por política de dados é comportamento correto, registrado no DecisionRecord como qualquer outra abstenção.

### Provider abstraction

A arquitetura **não** fica acoplada a um provedor específico. Contrato mínimo:

```text
ModelProvider
├── structured generation          saída validada contra schema versionado
├── streaming                      quando necessário (chat)
├── usage reporting                tokens de entrada e saída
├── model identification           provider, model, version
├── timeout                        limite por chamada
├── retry / fallback               política explícita, contável
└── data policy metadata           o que o provedor faz com os dados enviados
```

O último campo é o que torna o contrato útil para esta decisão e não apenas para portabilidade: a política de dados do provedor é **metadado do provedor**, consultável em código, não conhecimento tácito de quem configurou.

A escolha do primeiro provedor é uma:

`IMPLEMENTATION DECISION`

e **não** uma nova architectural requirement. Trocar de provedor não deve exigir ADR.

### Provider selection gate

O provedor primário precisa ser escolhido e sua política de dados verificada:

`BEFORE THE FIRST REAL EXTERNAL MODEL CALL`

**Não** precisa ser escolhido antes da criação do Implementation Plan.

Isso permite implementar primeiro, sem provedor definido:

- Foundation;
- persistence;
- Evidence Ledger;
- Capture;
- Current State;
- deterministic Change Engine;
- provider interfaces;
- mocks.

**Enquanto esse gate estiver aberto, nenhum conteúdo real pode ser enviado a um provedor externo.** Esta é a restrição operante, e ela é verificável: o mock provider é o único provider registrado até o gate fechar.

### Development mode

A V0 suporta desenvolvimento com:

- deterministic fixtures;
- mock provider;
- controlled synthetic scenarios (`S-01`…`S-08` da especificação §24).

Grande parte do sistema é construível sem compartilhar dado real com nenhum modelo externo. Isso é possível porque a cascata determinística do Change Engine (estágios 1–4) e toda a camada de estado, evidência e projeção não dependem de LLM por decisão arquitetural, não por acaso.

---

## Rationale

**Por que local-first:** o volume da V0 é baixo, a usuária é uma, e o conteúdo é altamente sensível — Declared Cognition é, literalmente, um modelo do raciocínio de uma pessoa. Persistência local satisfaz todos os requisitos operacionais desta fase e remove uma superfície inteira de exposição. Cloud persistence resolveria problemas que a V0 ainda não tem.

**Por que provider-agnostic:** a baseline §25 já exige configuração provider-neutral e §33 lista *vendor lock-in* como risco, com sinal de kill quando o estado depende de formato proprietário. Um contrato `ModelProvider` fino é o custo mínimo para manter essa propriedade.

**Por que adiar a escolha do provedor:** ela bloqueia apenas a primeira chamada real, não o Implementation Plan nem os quatro primeiros slices. Antecipá-la forçaria uma decisão sobre política de dados antes de o sistema existir, com menos informação do que se terá no momento certo.

---

## Trade-offs

**O que se ganha:** implementação começa sem decisão de provedor; nenhum dado real sai da máquina até que a política seja verificada; portabilidade preservada.

**O que se perde:** trabalhar contra mock por vários slices significa que problemas reais de qualidade de saída de modelo aparecem tarde. Mitigação: os contratos por archetype são escritos com schema desde o início, e as LLM evals (§25 da especificação) rodam assim que houver provider real.

**Risco residual, declarado:** local-first sem backup significa que a perda da máquina é perda do corpus. Isso é decisão consciente para a V0 e deve ser reavaliado antes de o corpus ter valor acumulado significativo. Backup local criptografado é extensão natural e não requer ADR.

**Alternativa rejeitada:** escolher o provedor agora para destravar tudo de uma vez. Rejeitada porque a escolha não é necessária para começar e a verificação de política de dados é mais bem feita quando existe uma lista concreta do que será enviado — que só existe depois dos contratos por archetype estarem escritos.

---

## Consequences

- **OQ-B2 deixa de bloquear o Implementation Plan.**
- A seleção do primeiro provedor aparece no Implementation Plan como `BLOCKING BEFORE FIRST REAL MODEL CALL`, **não** como blocker para começar o Slice 0.
- O mock provider é requisito de Slice 0, não conveniência de teste.
- Nenhum provedor foi selecionado por esta decisão, explícita ou implicitamente.
- Nenhum dado foi enviado externamente.
- A Architecture Package v0.2 Final **não é alterada**; este ADR responde a uma pergunta que a baseline deixou explicitamente em aberto (§34 nº 6).

---

## Validation / follow-up

Antes da primeira chamada real: registrar qual provedor, qual política de retenção e treinamento se aplica ao conteúdo enviado, e qual classe de sensibilidade fica proibida de atravessar a fronteira. Esse registro pertence ao Implementation Plan e à configuração operacional, não a um novo ADR — salvo se a política escolhida exigir exceção a alguma fronteira da baseline §28, caso em que um ADR é obrigatório.
