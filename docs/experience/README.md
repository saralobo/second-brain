# Experience

```text
AVA Cognitive V0:
FUNCTIONALLY COMPLETE

AVA Interaction Layer v0.1:
FROZEN

AVA Live v0.1:
FUNCTIONAL

Prospective Validation:
NOT STARTED — deferred until Interaction Layer freeze

ADR-23 (cross-workstream retrieval):
DEFERRED — not needed for v0.1

ADR-24 (audio boundary):
ACCEPTED
```

O produto deixa de ser navegado por projeto e passa a ser conversado com a
própria AVA. Workstreams continuam sendo fronteiras reais de contexto — é o que
impede a evidência de um projeto de entrar na resposta de outro — mas deixam de
ser o modelo mental de topo.

- **[Interaction Experience Package v0.1](ava-interaction-experience-package-v0.1.md)** —
  arquitetura de informação global, AVA Core, linguagem visual, identidade,
  Live Mode, captura conversacional, e a avaliação de impacto na validação.
- **[Interaction Implementation Plan v0.1](ava-interaction-implementation-plan-v0.1.md)** —
  seis slices, `I0` a `I5`.
- **[Implementation Progress v0.1](ava-interaction-implementation-progress-v0.1.md)** —
  o que foi construído, três achados, limites de cobertura declarados.
- **[Experience Freeze v0.1](ava-interaction-freeze-v0.1.md)** — semântica
  congelada antes do Warm-up Day 1.
- **[ADR-24](../decisions/ADR-24-v0-live-audio-boundary.md)** — fronteira de
  áudio e caminho de fala.

## O que este pacote não faz

Não altera a arquitetura congelada, não implementa código, não seleciona
provider de voz, não inicia validação e não trava D-21.

Onde uma experiência desejada atravessaria uma fronteira congelada, está
marcada `ADR REQUIRED` e deixada em aberto — em particular a recuperação
cross-workstream, que hoje é impedida no nível do SQL e não pode ser destravada
por trabalho de interface.

## Decisões da dona que bloqueiam o início da validação

Uma pergunta global — *"AVA, o que precisa da minha atenção hoje?"* — reconstrói
o briefing sob demanda. Isso mina o desenho de retirada travado em D-19, que
mantém Capture e Chat ativos nas semanas 3 e 6 justamente para medir se a
proatividade adiciona valor. Com conversa global, a comparação passa a medir
*push versus pull*, que é uma pergunta legítima e **não é a que D-19 travou**.

Registrado como **BD-01** no [freeze](ava-interaction-freeze-v0.1.md).

**BD-02** — Live torna `spoken_delivery_started_at` e
`spoken_delivery_completed_at` genuinamente observáveis. `user_heard_at`
continua não observável: a AVA pode observar que falou, nunca que alguém
ouviu.

## Próximo gate

`Resolve final validation compatibility decisions and lock D-21`
