# Conceito visual — AVA

Protótipo visual do front da AVA na identidade aprovada. Um único arquivo HTML,
sem dependências além das fontes do Google Fonts: abra
[`ava-prototipo-visual.html`](ava-prototipo-visual.html) no navegador.

Isto é um conceito, não código de produção. Nada aqui é importado por
`apps/web`.

## O que o protótipo cobre

As seis superfícies da Interaction Layer — Live, Today, Ask AVA, Workstreams,
Memory e Why — com os dados do cenário Project Alpha de `packages/app/src/seed.ts`.

O contrato epistêmico é preservado em todas elas: força ordinal ao lado de cada
afirmação, saúde de contexto por item e nunca global, declarado por você
distinto de hipótese inferida, conteúdo substituído legível em vez de apagado,
e rota para Why em toda assertiva.

## A decisão de design que o protótipo resolve

O `AvaCore` de hoje representa a AVA como um corpo e codifica saúde de contexto
como um arco que abre. Aqui a AVA é uma **linha** — quatro fios sobrepostos,
com envelope que afina até zero nas duas pontas.

Uma linha não tem arco, então saúde de contexto passa a ser **continuidade**:

| Estado | Comportamento da linha |
| --- | --- |
| `idle` | Quase reta, inteira, respiração lenta |
| `listening` | Amplitude cheia, reage à voz |
| `processing` | Onda viajante — não é barra de progresso, a duração é desconhecida |
| `speaking` | Cadência mais curta, nunca chega à altura de `listening` |
| `attention` | Âmbar constante, nunca pisca |
| `degraded` | A linha se rompe e um fio apaga |
| `insufficient` | Rompe mais, sobram dois fios, luminância cai para 46% |
| `error` | Fragmentada e irregular em vermelho — falha não é incerteza |

As quebras são determinísticas por fio: o mesmo estado sempre rompe nos mesmos
pontos, então a forma é aprendível. Os três estados de saúde se distinguem só
pela continuidade — sem depender de texto nem de cor.

## Identidade

| | |
| --- | --- |
| Tipografia | SF Pro pelo stack de sistema, Inter de reserva. JetBrains Mono só para identificadores, horários e métricas |
| Caixa alta | Proibida em toda a interface |
| Fundo | `#05060A` com campo de degradê atravessando a tela, em deriva lenta |
| Acento | `#1B4DFF` como sinal de atividade cognitiva, `#4DD8FF` e `#7B5CFF` na iridescência |
| Superfícies | Vidro: `rgba(255,255,255,.05)` com `backdrop-filter: blur(28px)` |

O DNA completo da marca vive fora do repositório, em `human-output/dna/ava/`.
