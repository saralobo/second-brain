# Sprint 0 — Experiment Log

```text
Status: BLOCKED — AWAITING WORK DATA ACCESS
Architecture baseline: Architecture Package v0.2 Final
Architecture tag: architecture-v0.2-final
Protocol version: Validation Sprint 0 Protocol v0.1
Decision Lock: pre-execution-decisions-v0.1.md — LOCKED 2026-08-30
Decision Lock commit: e30fac7 — docs(validation): lock Sprint 0 pre-execution criteria (branch main)
Log opened: 2026-08-30
Sprint start date: NOT SET — sprint not started
Sprint execution: NOT STARTED
Deviations: 1 (D-001, blocking)
```

> All experiment criteria were locked before inspection of the selected work data.

Esta declaração permanece verdadeira e verificável: no momento da abertura deste log, **nenhuma fonte de trabalho real foi aberta, lida ou analisada**. O log é aberto para registrar por que a execução não pôde iniciar, não para registrar um início.

---

## 1. Por que o sprint não foi iniciado

O protocolo §2.2 exige, **antes** de qualquer análise, o registro de SC-01 (janela), SC-02 (workstream) e SC-04 (cegamento). O procedimento de seleção travado é explícito:

> 1. Listar os workstreams candidatos com atividade no período recuperável, usando apenas metadados […]
> 2. Aplicar os critérios de elegibilidade […]
> 4. Critério de desempate declarado antes de olhar: maior cobertura de fontes recuperáveis.

Esse procedimento opera sobre trabalho real da dona do projeto. O protocolo §2.3 é igualmente explícito quanto ao meio:

> Todas as fontes são consultadas manualmente, na interface que a usuária já usa.
> Nenhuma conexão de API, OAuth, webhook ou export automatizado é feita neste sprint.

**Estado observado em 2026-08-30:** o repositório não contém nenhum material de trabalho. `datasets/`, `observations/` e `results/` continham apenas os respectivos `README.md`. Nenhuma nota de reunião, exportação de calendário, documento ou lista de metadados de workstream foi disponibilizada manualmente ao operador do sprint.

Consequência direta: **não existe conjunto de candidatos sobre o qual aplicar os critérios de elegibilidade de SC-02**, e não existe base para fixar as datas de SC-01. Preencher esses campos exigiria inventá-los.

### O que isso não é

- **Não é** um resultado de source coverage (protocolo §4 do briefing operacional). Um finding de source coverage descreve a insuficiência de sinal *dentro* de uma janela e workstream selecionados e inspecionados. Aqui não houve seleção nem inspeção. Registrar esta ausência como finding de cobertura seria tratar ausência de acesso como evidência sobre o produto.
- **Não é** um resultado desfavorável às hipóteses. H-01, H-02, H-03 e H-05 permanecem **não testadas**. Ausência de evidência não é evidência contrária, e tampouco favorável.
- **Não é** um pre-execution blocker no sentido do Decision Lock. Os critérios estão travados e íntegros; o Decision Lock permanece válido e inalterado. O bloqueio é de **provisionamento de dados**, posterior à trava e anterior à execução.

---

## 2. Protocol Deviations

### D-001 — Execução não iniciada por indisponibilidade de fonte

| Campo | Registro |
| --- | --- |
| **Requisito original** | Protocolo §2.2 e §2.3: selecionar janela de 6 semanas e 1 workstream a partir de metadados de fontes reais recuperáveis (calendar, meeting notes/transcripts, documents), consultadas manualmente. |
| **Motivo** | Nenhuma fonte de trabalho real foi disponibilizada ao operador. O repositório não contém material de trabalho, e o protocolo proíbe conectar integrações técnicas para obtê-lo. Os conectores disponíveis nesta sessão não foram acessados. |
| **Decisão tomada** | Não iniciar o sprint. Não registrar SC-01/SC-02/SC-04. Não criar datasets, observations ou results. Não marcar nenhum workstream como iniciado. |
| **Impacto esperado** | Zero sobre a validade dos critérios: nada foi observado, nada foi avaliado, nenhum threshold foi aplicado. O sprint parte do estado limpo assim que houver fonte. |
| **Compromete a conclusão?** | Não compromete a validade metodológica. Compromete integralmente a **disponibilidade** de conclusão: nenhum verdict é metodologicamente permitido. |
| **Alternativa rejeitada** | Executar os workstreams sobre material sintético, ilustrativo ou reconstruído de memória. Rejeitada por violar o princípio 5 do protocolo (separar fatos observados de inferências) e a instrução operacional de não inventar dados ausentes. Um sprint sobre dados fabricados produziria um verdict sem valor epistêmico e com aparência de validade — o pior resultado possível para um protocolo cujo propósito é falsificar. |

Nenhum threshold foi alterado. Nenhum critério foi reinterpretado.

---

## 3. Estado dos workstreams

| Workstream | EXP | Status | Motivo |
| --- | --- | --- | --- |
| A — Retrospective Opportunity | EXP-00B | NOT STARTED | depende de SC-01 e SC-02 |
| B — Ideal Briefing | EXP-00A | NOT STARTED | depende de SC-01 e SC-02 |
| C — Declared Cognition Bootstrap | insumo de EXP-10 | NOT STARTED | depende de sessão de captura com a dona do projeto |
| D — Cost & Latency | EXP-00D | NOT STARTED | depende de volumes observados em A e B |
| E — Entity Resolution | EXP-00C | NOT STARTED | depende de objetos presentes em ≥2 fontes da janela |
| F — Auto-consistency | EXP-00E | NOT STARTED | depende de decisões reais da dona do projeto |

Observação sobre C: é o único workstream que **não depende da janela selecionada**. Ele captura apenas o que for explicitamente declarado e confirmado pela dona do projeto, com origem registrada por item. Pode ser executado como sessão de captura assim que ela estiver disponível, independentemente da resolução de D-001. Não foi iniciado porque exige a participação dela, e nenhum item declarado pode ser inferido pelo operador.

Observação sobre F: mesmo com fonte disponível, F exige ≥14 dias entre rodadas e permanecerá `IN PROGRESS — WAITING FOR RETEST WINDOW` após a primeira rodada. Isso é esperado e não é desvio.

---

## 4. O que desbloqueia a execução

Qualquer uma das opções abaixo, à escolha da dona do projeto. Nenhuma foi assumida.

1. **Lista de metadados de workstreams candidatos** — nome, período de atividade, contagem aproximada de reuniões, existência de documentos e de decisões registradas, sem conteúdo. É o insumo mínimo e suficiente para executar o procedimento de seleção de SC-02 sem ler conteúdo, exatamente como o protocolo pede.
2. **Material histórico exportado manualmente** para uma pasta local fora do repositório — notas de reunião, itens de calendário, documentos da janela candidata. O log registrará onde a fonte foi mantida; o repositório receberá apenas metadata e IDs anonimizados.
3. **Autorização explícita** para leitura via um conector já autenticado, com escopo delimitado. Requer decisão dela, por dois motivos independentes: o protocolo §2.3 restringe o meio de consulta, e o material contém trabalho real de terceiros sujeito a ACL.

O operador não escolheu entre elas e não acessou nenhuma fonte.

---

## 5. Integridade

| Verificação | Estado |
| --- | --- |
| Architecture Package v0.2 Final | inalterado |
| Tag `architecture-v0.2-final` | inalterada, não movida, nenhuma tag nova criada |
| Validation Sprint 0 Protocol v0.1 | inalterado |
| Pre-Execution Decisions v0.1 | inalterado, `LOCKED` |
| Thresholds | inalterados |
| Dados experimentais | nenhum criado |
| Fontes de trabalho real | nenhuma aberta, lida ou analisada |
| Itens contaminados por hindsight em métrica primária | nenhum — não há métrica |
| Verdict | nenhum — não permitido metodologicamente |
