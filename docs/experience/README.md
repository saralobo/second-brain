# Experience

```text
AVA Cognitive V0:
FUNCTIONALLY COMPLETE

AVA Interaction Layer:
READY FOR IMPLEMENTATION — NOT IMPLEMENTED

Prospective Validation:
NOT STARTED — deferred until Interaction Layer freeze

ADRs required:
ADR-23 (cross-workstream retrieval) — needed only beyond v0.1 scope
ADR-24 (audio boundary) — blocks Live Mode
```

O produto deixa de ser navegado por projeto e passa a ser conversado com a
própria AVA. Workstreams continuam sendo fronteiras reais de contexto — é o que
impede a evidência de um projeto de entrar na resposta de outro — mas deixam de
ser o modelo mental de topo.

- **[Interaction Experience Package v0.1](ava-interaction-experience-package-v0.1.md)** —
  arquitetura de informação global, AVA Core, linguagem visual, identidade,
  Live Mode, captura conversacional, e a avaliação de impacto na validação.
- **[Interaction Implementation Plan v0.1](ava-interaction-implementation-plan-v0.1.md)** —
  seis slices, `I0` a `I5`, com `I3` bloqueado por ADR-24.

## O que este pacote não faz

Não altera a arquitetura congelada, não implementa código, não seleciona
provider de voz, não inicia validação e não trava D-21.

Onde uma experiência desejada atravessaria uma fronteira congelada, está
marcada `ADR REQUIRED` e deixada em aberto — em particular a recuperação
cross-workstream, que hoje é impedida no nível do SQL e não pode ser destravada
por trabalho de interface.

## Achado que exige decisão antes do warm-up

Uma pergunta global — *"AVA, o que precisa da minha atenção hoje?"* — reconstrói
o briefing sob demanda. Isso mina o desenho de retirada travado em D-19, que
mantém Capture e Chat ativos nas semanas 3 e 6 justamente para medir se a
proatividade adiciona valor. Com conversa global, a comparação passa a medir
*push versus pull*, que é uma pergunta legítima e **não é a que D-19 travou**.

Registrado em §17 do Experience Package. Exige decisão da dona antes do início
da validação.

## Próximo gate

`Implement AVA Interaction Layer v0.1`
