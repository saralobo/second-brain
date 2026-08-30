# ADR-21 — Cost & Latency Gate under Prospective Instrumented Validation

```text
Status: ACCEPTED
Date: 2026-08-30
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final (unchanged)
Evidence / experiment: NONE — no experiment has been executed
Resolves: OQ-B1 (AVA Technical V0 Specification v0.1, §33)
```

**Declaração de evidência.** Este ADR **não** é motivado por evidência experimental. Ele é motivado por uma dependência circular de processo, identificada durante a especificação técnica. Nenhuma medida foi observada, nenhum threshold foi avaliado e nenhuma hipótese muda de status por causa desta decisão.

---

## Context

A baseline §26 declara o modelo de Cost & Latency um **gate bloqueante antes da implementação**, e é explícita quanto à sua fonte de dados: *"O modelo usa dados observados no Validation Sprint. Nenhum número é assumido como fato nesta versão."*

O Validation Sprint 0 retrospectivo foi adiado — `DEFERRED — HISTORICAL DATASET UNAVAILABLE` — porque não existe dataset histórico elegível com temporalidade preservada, diversidade mínima de fontes e janela consecutiva suficiente. A estratégia adotada em seguida, [Prospective Validation Strategy v0.1](../validation/prospective-validation-strategy-v0.1.md), exige construir uma V0 instrumentada justamente para gerar os dados que alimentariam esse gate.

Disso resulta uma dependência circular:

```text
need measured cost data
        ↓
to authorize V0
        ↓
but V0 is required
        ↓
to produce measured cost data
```

O gate não pode ser satisfeito na forma originalmente especificada, porque a única fonte de dados prevista deixou de existir. Deixar isso sem registro seria fazer a implementação avançar por omissão — exatamente o tipo de mudança silenciosa que a política de freeze da [BASELINE.md](../architecture/BASELINE.md) proíbe.

**Este ADR não remove o requisito de custo.** A viabilidade econômica continua sendo condição arquitetural. O que muda é *quando* e *com que dados* ela é verificada.

---

## Decision

Dividir o gate de Cost & Latency em **dois níveis**, com propósitos distintos e não intercambiáveis.

### Gate A — Pre-build Operational Guardrail

A construção da V0 é autorizada desde que **todas** as condições abaixo sejam satisfeitas:

| # | Condição |
| --- | --- |
| 1 | toda chamada de modelo é registrada |
| 2 | tokens são registrados (entrada e saída) |
| 3 | latência é registrada |
| 4 | custo é registrado |
| 5 | existe Budget Controller |
| 6 | existe hard budget limit configurável |
| 7 | existe capacidade de **interromper chamadas** quando o limite é atingido |
| 8 | caminhos determinísticos são preferidos quando suficientes |
| 9 | nenhum componente depende de consumo ilimitado de modelos |
| 10 | desenvolvimento pode usar mocks/fixtures quando uma chamada real não for necessária |

Essas condições já correspondem a requisitos existentes da baseline §25 (`ModelRun` estruturado) e §26 (Budget Controller com teto, limite de retries, fallback mais barato e bloqueio de processamento de baixo valor). O Gate A não inventa mecanismo novo — ele declara que esses mecanismos, mais a capacidade de interrupção, são a condição de autorização para **construir e medir**.

**O que o Gate A significa:** é seguro construir, porque o consumo é observável e limitado.

**O que o Gate A NÃO significa:** não significa que a arquitetura passou no gate econômico. Não significa que o custo é aceitável. Não significa que H-05 foi testada.

### Gate B — Evidence-based Economic Viability

Após uso prospectivo suficiente, avaliar com **dados medidos**:

- `cost/day`;
- `cost/month`;
- `cost/useful_intervention`;
- `wasted preparation cost`;
- `latency P50`;
- `latency P95`;
- distribuição de `calls` por archetype.

Somente após o Gate B pode haver decisão de:

- ampliar frequência de checkpoints;
- conectar novas fontes;
- adicionar preparação mais cara;
- aumentar autonomia;
- expandir Model Intelligence.

**A viabilidade econômica permanece gate arquitetural antes de qualquer expansão.** O Gate B é o gate original da baseline §26, executado no momento em que os dados existem, em vez de antes de existirem.

---

## Rationale

Três razões sustentam a divisão, e nenhuma delas é conveniência.

1. **O propósito original do gate é preservado.** A baseline queria impedir que a arquitetura fosse construída em escala sobre custo desconhecido. O Gate A impede exatamente isso, por outro mecanismo: teto duro e interrupção. O que ele autoriza é uma V0 de uma usuária com ingestão manual — o menor volume possível — não a expansão que o gate original visava conter.

2. **O gate não podia ser satisfeito, e um gate insatisfazível não protege nada.** Mantê-lo formalmente bloqueante enquanto sua única fonte de dados não existe produziria uma de duas saídas ruins: paralisia indefinida, ou avanço informal sem registro. Ambas são piores que a decisão explícita.

3. **A separação torna a distinção visível no tempo.** Com um gate só, seria fácil, meses depois, tratar "o custo em desenvolvimento ficou baixo" como se fosse aprovação econômica. Com dois gates nomeados, o Gate B continua aberto e visível até ser fechado com dados medidos.

---

## Important distinction

Thresholds numéricos do Validation Sprint retrospectivo **não** são reutilizados automaticamente. A [Prospective Validation Strategy v0.1](../validation/prospective-validation-strategy-v0.1.md) já registrou que equivalência semântica precisa ser demonstrada antes de qualquer reuso.

Os limites usados durante o desenvolvimento são:

`OPERATIONAL SAFETY CAPS`

e **não**:

`PRODUCT VALIDATION THRESHOLDS`

A diferença é de natureza, não de grau:

| | Operational safety cap | Product validation threshold |
| --- | --- | --- |
| **Pergunta** | quanto posso gastar sem risco? | o produto vale o que custa? |
| **Origem** | tolerância operacional da dona | critério travado antes do resultado |
| **Efeito ao ser atingido** | interromper chamadas | informar GO/PIVOT/STOP |
| **Pode ser ajustado durante a execução** | sim, é configuração | **não**, seria mudança de critério |

Um safety cap atingido é um limite operacional funcionando, **não** um sinal de que o produto falhou no gate econômico. Confundir os dois em qualquer direção invalida a leitura dos dados: um cap generoso não é aprovação, e um cap atingido não é reprovação.

Os **valores** dos safety caps são configuração operacional explícita e podem ser definidos no Implementation Plan.

---

## Trade-offs

**O que se ganha:** a implementação pode começar; os dados que faltam passam a ser produzidos; o mecanismo de contenção existe desde o primeiro dia em vez de ser adicionado depois.

**O que se perde:** a garantia — que nunca foi obtida — de conhecer o custo antes de escrever código. Aceita-se construir sob incerteza econômica, com teto duro como mitigação.

**Risco residual, declarado:** é possível que o Gate B, quando executado, mostre que o custo por intervenção útil é inaceitável, depois de a V0 já ter sido construída. Esse é um resultado válido e possível do processo, não uma falha dele. A baseline §33 lista *cost explosion* como risco arquitetural com sinal de kill próprio; a mitigação continua sendo micro-batch, pré-filtro e budget — todos presentes no Gate A.

**Alternativa rejeitada:** manter o gate bloqueante e aguardar outra fonte de dados de custo. Rejeitada porque não há fonte identificada; estimativas sintéticas produziriam números sem valor epistêmico com aparência de medição, e o mesmo problema de fabricação que inviabilizou o sprint retrospectivo reapareceria aqui.

---

## Consequences

- **OQ-B1 deixa de bloquear o Implementation Plan.**
- O Gate A vira conjunto de acceptance criteria do Slice 0 e do Slice 5 na especificação técnica.
- O Gate B permanece **aberto** e é pré-condição de qualquer expansão de escopo.
- Os valores dos safety caps são definidos no Implementation Plan como configuração operacional explícita.
- **Nenhuma hipótese é considerada validada.** H-05 (custo por intervenção útil aceitável) permanece `NOT TESTED`.
- A Architecture Package v0.2 Final **não é alterada**. Este ADR registra a interpretação do gate §26 sob a estratégia prospectiva; a baseline permanece congelada e a tag imóvel.

---

## Validation / follow-up

O Gate B é fechado quando existir uso prospectivo suficiente para calcular as sete grandezas listadas, com `n` visível. O que constitui "suficiente" deve ser definido em um Prospective Validation Protocol explicitamente versionado, **antes** de os números serem observados — mesma disciplina do decision lock retrospectivo.

Até lá, o estado correto do gate econômico é: **aberto, não avaliado**.
