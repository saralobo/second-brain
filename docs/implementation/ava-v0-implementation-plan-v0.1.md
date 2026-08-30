# AVA V0 Implementation Plan v0.1

```text
Status: READY FOR IMPLEMENTATION
Architecture baseline: Architecture Package v0.2 Final
Technical specification: AVA Technical V0 Specification v0.1
Validation strategy: Prospective Instrumented Validation
Date: 2026-08-30
Product code: NOT STARTED
Blockers before Batch 1: NONE
```

> Define the executable implementation sequence for the smallest faithful, instrumented AVA V0.

**Autoridade em conflito:** Architecture Package v0.2 Final > AVA Technical V0 Specification v0.1 > ADR-21 / ADR-22 > este plano. Se este plano contradiz qualquer um deles, o plano está errado.

Este documento **não** cria decisão arquitetural nova. Onde uma escolha de implementação precisa ser feita, ela aparece marcada como tal, com o custo de substituição declarado.

---

## 1. Estado do repositório observado

Verificado em 2026-08-30, antes de planejar:

| Item | Estado |
| --- | --- |
| Branch | `main`, working tree limpa |
| Conteúdo | **somente documentação** — `docs/architecture`, `docs/decisions`, `docs/specification`, `docs/validation` |
| Package manager | **nenhum** — não há `package.json` |
| Scaffold técnico | **nenhum** |
| `node_modules` | ausente |
| `.gitignore` | uma linha: `.DS_Store` |
| Tag | `architecture-v0.2-final` → `519b2f0` |

Nada precisa ser migrado ou refatorado. O Slice 0 constrói sobre repositório limpo, e o `.gitignore` precisa crescer na primeira tarefa.

**Convenções existentes a preservar:** documentação em `docs/<área>/` com um `README.md` de índice por área; documentos versionados no nome do arquivo (`-v0.1`); status em bloco ```text no topo; commits `docs(<área>): <ação>`. O plano segue todas.

---

## 2. Princípios do plano

Os doze princípios governam qualquer conflito de execução:

1. **vertical slices** — cada slice atravessa UI, backend, persistência e testes;
2. **working software early** — Slice 1 já é usável por uma pessoa real;
3. **deterministic-first** — LLM é último recurso, nunca primeiro;
4. **local-first** — nada sai da máquina sem gate explícito (ADR-22);
5. **evidence-first** — nenhum estado existe sem evidência que o sustente;
6. **telemetry from the beginning** — instrumentação nasce com cada slice;
7. **no premature distributed architecture** — modular monolith, sem filas nem serviços;
8. **no premature optimization** — sem cache, sem índice especulativo, sem embeddings;
9. **no speculative ML** — nada aprendido na V0;
10. **every persisted inference traceable to evidence** — `evidence_ids` obrigatório;
11. **every slice independently testable**;
12. **every slice leaves the repository in a working state**.

O objetivo **não** é implementar a Target Architecture. É construir a menor V0 fiel e instrumentada.

---

## 3. Stack

Classificação exigida. `LOCKED BY SPEC` significa que trocar exige ADR; os demais são decisões de implementação.

| Item | Classificação | Nota |
| --- | --- | --- |
| **Local-first persistence** | `LOCKED BY SPEC` | ADR-22 — decisão arquitetural |
| **Provider-agnostic LLM interface** | `LOCKED BY SPEC` | ADR-22 + baseline §25 |
| **Append-only Evidence Ledger** | `LOCKED BY SPEC` | baseline §11, §14 |
| **Outputs estruturados com schema versionado** | `LOCKED BY SPEC` | baseline §25 |
| **Prompts versionados fora do código de domínio** | `LOCKED BY SPEC` | baseline §25 |
| **Força de evidência ordinal** | `LOCKED BY SPEC` | baseline §29 |
| **Feedback bidimensional sem score único** | `LOCKED BY SPEC` | baseline §23 |
| **PostgreSQL** | `IMPLEMENTATION DEFAULT` | relacional + jsonb + FTS numa peça; custo de troca baixo se as queries ficarem em repositórios |
| **TypeScript** | `IMPLEMENTATION DEFAULT` | uma linguagem do banco à UI |
| **Next.js App Router** | `IMPLEMENTATION DEFAULT` | server components mantêm dado sensível no servidor por padrão |
| **Drizzle** | `IMPLEMENTATION DEFAULT` | migrações em SQL legível — o schema *é* a garantia de auditabilidade |
| **Vitest** | `CAN SUBSTITUTE` | qualquer runner rápido serve |
| **Playwright** | `CAN SUBSTITUTE` | limitado a flows críticos |
| **OpenTelemetry** | `CAN SUBSTITUTE` | traces para latência; a tabela `model_run` é a fonte de verdade de custo, não o trace |

### Decisões de implementação que a spec não determinou

Três lacunas concretas, resolvidas aqui como `IMPLEMENTATION DEFAULT` — nenhuma reabre decisão arquitetural:

| # | Lacuna | Default adotado | Justificativa |
| --- | --- | --- | --- |
| 1 | package manager e layout de monorepo | **pnpm workspaces** | workspaces nativos, sem ferramenta extra; o repo está vazio, então não há custo de migração |
| 2 | como rodar Postgres localmente | **Docker Compose**, um serviço, porta não padrão | reprodutível, descartável, não conflita com Postgres já instalado na máquina |
| 3 | geração de IDs | **ULID** | ordenável por tempo, o que ajuda em ledger append-only; não é decisão arquitetural — o requisito da spec é apenas "ID estável, nunca reutilizado" |

---

## 4. Repository structure

Adaptada ao repositório real. **Nada existente é movido.**

```text
/
├── apps/
│   └── web/                 Next.js — as sete superfícies
│
├── packages/
│   ├── core/                domínio puro — SEM I/O
│   ├── db/                  schema Drizzle, migrações, repositórios
│   ├── ingestion/           quarentena: raw → parsed → accepted
│   ├── retrieval/           lexical, Context Packet, Context Health
│   ├── llm/                 ModelProvider, prompts, ModelRun, Budget Controller
│   ├── telemetry/           validation_event e derivados
│   └── test-support/        fixtures determinísticos, harness de cenários
│
├── tests/
│   ├── integration/
│   └── golden/              GS-01…GS-08
├── evals/                   schema · grounding · unsupported · abstention · change
└── docs/                    já existe — inalterado
    ├── architecture/        congelado
    ├── decisions/           ADR-21, ADR-22
    ├── specification/
    ├── validation/
    └── implementation/      este plano
```

### Responsabilidades e fronteiras

| Package | Responsabilidade | Pode importar |
| --- | --- | --- |
| `core` | tipos, invariantes, lógica de estado, supersessão, Change Engine, Value Vector, políticas, Context Health | **nada do projeto** |
| `db` | schema, migrações, repositórios | `core` |
| `ingestion` | três planos de quarentena, validação de schema | `core` |
| `retrieval` | busca lexical, montagem de Context Packet | `core`, `db` |
| `llm` | contrato `ModelProvider`, prompts, `ModelRun`, Budget Controller | `core` |
| `telemetry` | escrita de `validation_event` | `core`, `db` |
| `test-support` | fixtures, cenários sintéticos | `core` |
| `apps/web` | UI e server actions | todos |

### Regras de import, verificadas por lint

1. **`core` não importa nada do projeto** e nada de I/O — sem `pg`, sem `fs`, sem `fetch`, sem SDK de provedor. É a regra estrutural mais importante do plano: os invariantes que importam ficam testáveis sem banco, sem rede e sem modelo.
2. **Nenhum package importa SDK de provedor**, exceto o adapter dentro de `llm/providers/`.
3. **`ingestion` não importa `retrieval`, `llm` nem `telemetry`.** O plano de quarentena não tem acesso a ferramentas — isso é fronteira de segurança da baseline §11, não organização de código.
4. **Fluxo unidirecional** pela vertical slice; `db` e `telemetry` são transversais.
5. `apps/web` **não** contém lógica de domínio. Se uma regra de negócio aparecer numa server action, ela pertence a `core`.

Não criei um package por conceito arquitetural. `state`, `change`, `impact` e `opportunity` são **módulos dentro de `core`**, porque compartilham tipos e nenhum precisa de fronteira de deploy.

---

## 5. Domain model — ordem de implementação

Nenhuma tabela é criada antes de ter uso em um slice.

| # | Modelo | Slice | Persistência | Invariantes | Relações | Índices | Testes obrigatórios |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Workstream** | S1 | tabela | `name` não vazio | raiz de quase tudo | pk | criação, listagem |
| 2 | **SourceRecord** | S1 | tabela | `kind` no enum | 1:N Evidence | pk, `kind` | `availability_state` alimenta Context Health |
| 3 | **Evidence** | S1 | tabela **append-only** | `content`, `observed_at`, `hash` **imutáveis**; hash confere com content | N:1 Source, N:M Entity | pk, `workstream_id`, `observed_at`, GIN FTS sobre `content` | update rejeitado pelo banco; hash íntegro; `content_origin=system` não conta diversidade |
| 4 | **StateObject** (Decision, Commitment, Question, Risk, Artifact, Goal) | S2 | tabela versionada | versão imutável após escrita; `superseded_by` só aponta para versão posterior | N:1 Workstream, N:M Evidence | pk, `(workstream_id, type, status)`, `superseded_by` | ciclo de vida por tipo; supersessão em cadeia |
| 5 | **Relationship** | S2 | tabela | `kind` no enum; `evidence_ids` não vazio para relações inferidas | grafo simples | `(from_id)`, `(to_id)`, `kind` | propagação profundidade 1–2 |
| 6 | **ChangeRecord** | S2 | tabela | `before/after` são **referências de versão**, nunca cópias; `detector` sempre registrado | N:1 StateObject, N:M Evidence | pk, `object_id`, `observed_at`, `change_type` | os nove tipos; `candidate` de LLM não altera estado |
| 7 | **CurrentState** | S2 | **view/projeção**, não tabela de verdade | reconstruível integralmente do ledger | derivada | — | **reconstrução byte a byte após truncate** |
| 8 | **Entity** | S2 (mínimo) / S5 | tabela | `source_identifiers` nunca perdidos; merge reversível | N:M Evidence | pk, `source_identifiers` GIN | `unresolved` preservado; sem false merge |
| 9 | **ContextHealth** | S3 | tabela | específico da **tarefa**, não global | N:1 task ref | pk, `computed_at` | `INSUFFICIENT` causa abstenção real |
| 10 | **DecisionRecord** | S3 | tabela | evidências **realmente usadas**; alternativas registradas | N:M Evidence, N:1 ModelRun | pk, `decision_type`, `timestamp` | explicação não adiciona motivo ausente |
| 11 | **ModelRun** | S3 | tabela | sempre escrito, **inclusive em falha** | N:1 DecisionRecord | pk, `task_archetype`, `created_at` | custo e tokens registrados no caminho de erro |
| 12 | **DeclaredCognition** | S4 | tabela versionada | `original_statement` imutável; autoridade > hipótese | N:1 Evidence | pk, `category`, `status` | edição gera versão; anterior consultável |
| 13 | **MemoryRecord** | S4 | tabela | `evidence_reachable` **sempre verdadeiro** | aponta para as três classes | pk, `class` | invariante de alcançabilidade |
| 14 | **BehavioralHypothesis** | S4 | tabela | shadow mode; `alternatives_available` obrigatório; nunca governa | N:M Evidence + contraevidência | pk, `status` | não afeta ranking; terceiros excluídos |
| 15 | **Opportunity** | S5 | tabela | expira ou resolve; `prepared` não influencia Show Policy | N:1 ChangeRecord | pk, `class`, `status` | as cinco classes; gates |
| 16 | **ValueVector** | S5 | `jsonb` em Opportunity | **não colapsa em escalar**; cada fator com origem | embutido | — | ausência de campo `score` |
| 17 | **Feedback** | S6 | tabela | duas dimensões em **colunas separadas**, nullable independentes | N:1 Opportunity/Artifact | pk, `target_id` | ausência de coluna agregada |
| 18 | **Outcome** | S6 | tabela | `unresolved` é resultado válido; nunca inferido sem observabilidade | N:1 Opportunity/DecisionRecord | pk, `state` | não conversão de `unresolved` em rejeição |
| 19 | **ValidationEvent** | S0 (schema) + todos | tabela append-only | `occurred_at` **nunca retroativo** | referência polimórfica | pk, `event_type`, `occurred_at` | constraint anti-retroatividade |

`Prediction` fica fora da V0 como objeto próprio: a spec o cobre implicitamente via Opportunity + Outcome, e criar a tabela sem uso violaria a regra de não criar tabela antes do slice.

---

## 6. Database plan

### Ordem das migrations

| # | Migration | Slice | Conteúdo |
| --- | --- | --- | --- |
| `0001` | `foundation` | S0 | extensões (`pgcrypto`), enums transversais (`content_origin`, `evidence_strength`, `sensitivity`), tabela `validation_event` com constraint anti-retroatividade |
| `0002` | `capture` | S1 | `workstream`, `source_record`, `evidence` + append-only enforcement + índice GIN de FTS |
| `0003` | `state_and_change` | S2 | `state_object`, `relationship`, `change_record`, `entity` |
| `0004` | `context_and_decisions` | S3 | `context_health`, `decision_record`, `model_run` |
| `0005` | `memory` | S4 | `declared_cognition`, `memory_record`, `behavioral_hypothesis` |
| `0006` | `opportunity` | S5 | `opportunity` (com `value_vector jsonb`) |
| `0007` | `feedback_outcome` | S6 | `feedback`, `outcome` |

**`pgvector` não entra em nenhuma delas.** Entra apenas se e quando a Fase 2 de retrieval for justificada por medição.

### Como garantir que Evidence não seja sobrescrita

Defesa em três camadas, porque uma só é insuficiente:

1. **Banco** — regra de reescrita explícita:
   ```sql
   CREATE RULE evidence_no_update AS ON UPDATE TO evidence DO INSTEAD NOTHING;
   CREATE RULE evidence_no_delete AS ON DELETE TO evidence DO INSTEAD NOTHING;
   ```
   Campos que legitimamente evoluem (`workstream_id`, `entity_refs`, `sensitivity`) vivem em tabela satélite `evidence_annotation`, também append-only, cuja leitura pega a anotação mais recente. Isso mantém o núcleo da Evidence literalmente imutável em vez de "imutável por convenção".
2. **Repositório** — `EvidenceRepository` expõe `append()` e `findX()`. Não existe `update()` nem `delete()` na interface.
3. **Teste** — teste de integração que tenta `UPDATE` direto e prova que o conteúdo não mudou.

A exclusão exigida pela privacidade (§26 da spec) é implementada como **operação administrativa explícita** de exclusão em cascata, fora da interface de escrita normal, com reconstrução das views derivadas. Ela não é um `delete()` do repositório.

### Regras de schema

- **Foreign keys** em todas as relações; nenhuma referência solta.
- **Uniqueness:** `evidence.hash` não é único (o mesmo conteúdo pode ser observado duas vezes — e isso é dado); `(state_object.id, version)` é único.
- **JSONB somente quando justificado:** `state_object.fields` (varia por tipo), `opportunity.value_vector`, `context_health.dimensions`, `validation_event.payload`. Tudo que é consultado ou filtrado com frequência é coluna.
- **Full-text search:** coluna gerada `tsvector` sobre `evidence.content`, índice GIN. É o baseline obrigatório de retrieval da baseline §15.
- **Timestamps:** `timestamptz` sempre. `observed_at` e `effective_at` para raciocínio; `created_at`/`updated_at` **apenas operacionais**.
- **Provenance:** `lineage jsonb` com `root_run_id` — é o campo que permite agrupar evidências de mesma origem causal ao calcular diversidade.
- **Content origin:** enum `user | third_party | source_system | system` em Evidence, obrigatório.
- **Supersession:** `superseded_by uuid REFERENCES ...`, com constraint garantindo que o sucessor tenha `observed_at` maior ou igual.

### Estratégia de migrations em desenvolvimento

- **forward-only.** Nunca editar migration já aplicada.
- **reset local permitido** enquanto não houver dado real: `db:reset` derruba, recria e roda seeds sintéticos.
- a partir do momento em que houver captura real, reset exige export prévio.
- CI valida que as migrations rodam do zero e que o schema resultante bate com o schema declarado no Drizzle.
- **sem infraestrutura de zero-downtime.** A V0 tem uma usuária e roda localmente.

---

## 7. Delivery slices e tarefas

Complexidade: **S** (pequena, isolada) · **M** (média, múltiplos arquivos) · **L** (grande, atravessa camadas). Sem horas, sem story points.

### Slice 0 — Foundation

**Objetivo:** ambiente executável e invariantes básicos. Nenhuma chamada real externa de modelo.

| ID | Objetivo | Arquivos/módulos | Deps | Testes | Telemetria | Cx |
| --- | --- | --- | --- | --- | --- | --- |
| `S0-T01` | Scaffold pnpm workspace, TS base, `.gitignore` completo | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore` | — | build limpo | — | S |
| `S0-T02` | Lint, format, typecheck e **regras de import boundary** | `eslint.config.js` | T01 | teste que prova que `core` importando `pg` falha o lint | — | M |
| `S0-T03` | Next.js app shell com as sete rotas vazias | `apps/web/app/**` | T01 | rota responde 200 | — | M |
| `S0-T04` | Postgres via Docker Compose + estratégia de env | `docker-compose.yml`, `.env.example` | T01 | conexão estabelecida | — | S |
| `S0-T05` | Drizzle + tooling de migration + migration `0001` | `packages/db/**`, `drizzle.config.ts` | T04 | migração do zero | — | M |
| `S0-T06` | Primitivos de domínio: ULID, utilitários de tempo, `EvidenceStrength`, `ContentOrigin`, `Sensitivity` | `packages/core/primitives/**` | T01 | ordinal sem aritmética; **`created_at` proibido em raciocínio** | — | M |
| `S0-T07` | Harness de teste: Vitest unit + harness de integração com DB descartável | `vitest.config.ts`, `packages/test-support/db.ts` | T05 | suíte roda vazia e verde | — | M |
| `S0-T08` | Observabilidade: OTel + logger **com redaction** | `packages/telemetry/logging.ts` | T01 | teste que prova que conteúdo não aparece no log | — | M |
| `S0-T09` | Contrato `ModelProvider` + `MockModelProvider` | `packages/llm/provider.ts`, `providers/mock.ts` | T01 | mock determinístico; nenhum SDK importado | — | M |
| `S0-T10` | Budget Controller esqueleto: caps, agregação, **hard stop** | `packages/llm/budget.ts` | T09 | hard stop interrompe chamada | `model_run` | M |
| `S0-T11` | `validation_event`: schema, writer e **constraint anti-retroatividade** | `packages/telemetry/events.ts` + migration `0001` | T05 | insert com `occurred_at` no passado é **rejeitado pelo banco** | — | M |
| `S0-T12` | `test-support`: fixtures determinísticos e harness de cenários | `packages/test-support/**` | T07 | fixture reproduzível | — | S |
| `S0-T13` | CI: install, lint, typecheck, unit, integration, migration validation | `.github/workflows/ci.yml` | T02, T05, T07 | pipeline verde | — | M |

**Acceptance criteria do Slice 0:** o repositório instala, tipa, linta e testa com um comando; a migração roda do zero; `validation_event` rejeita evento retroativo no banco; o `MockModelProvider` responde deterministicamente; o Budget Controller interrompe ao atingir o cap; o lint impede `core` de importar I/O. **Nenhuma chamada externa de modelo existe no código.**

Isto satisfaz o **Gate A do ADR-21** em sua parte estrutural (registro, caps, hard stop, mocks) e o modo de desenvolvimento do **ADR-22** (mock provider como único provider registrado).

---

### Slice 1 — Capture → Evidence

**Objetivo:** primeiro fluxo de produto utilizável.

Fluxo: `Capture → Quarantined Input → Validation → Structured Evidence → Evidence Ledger`

| ID | Objetivo | Arquivos/módulos | Deps | Testes | Telemetria | Cx |
| --- | --- | --- | --- | --- | --- | --- |
| `S1-T01` | Migration `0002`: `workstream`, `source_record`, `evidence`, `evidence_annotation` | `packages/db/migrations/0002_*` | S0-T05 | schema aplica do zero | — | M |
| `S1-T02` | Append-only enforcement + rules + teste adversarial | migration `0002` + `packages/db/repositories/evidence.ts` | T01 | `UPDATE`/`DELETE` diretos não alteram nada | — | M |
| `S1-T03` | Tipos de captura e schemas de validação dos **dez tipos** | `packages/core/capture/**` | S0-T06 | cada tipo valida e rejeita corretamente | — | L |
| `S1-T04` | Pipeline de quarentena: três planos com fronteira explícita | `packages/ingestion/**` | T03 | **texto bruto não vira instrução**; parsing incompleto é marcado, não descartado | — | L |
| `S1-T05` | `EvidenceRepository` — só `append()` e leituras | `packages/db/repositories/evidence.ts` | T02 | ausência de `update`/`delete` na interface | — | M |
| `S1-T06` | `WorkstreamRepository` + server actions | `packages/db/repositories/workstream.ts`, `apps/web/app/workstreams/actions.ts` | T01 | CRUD mínimo | — | S |
| `S1-T07` | Server action de captura ligando UI → quarentena → ledger | `apps/web/app/capture/actions.ts` | T04, T05 | integração ponta a ponta | `evidence_arrived_at` | M |
| `S1-T08` | UI de Capture: dez tipos, seleção de workstream, estados vazio/erro | `apps/web/app/capture/**` | T07 | a11y: teclado e foco | — | L |
| `S1-T09` | Workstream: lista e detalhe mínimo com evidências | `apps/web/app/workstreams/**` | T06 | estado vazio explica o que fazer | — | M |
| `S1-T10` | Telemetria `evidence_arrived_at` no caminho de captura | `packages/telemetry/**` | S0-T11, T07 | evento gravado com `occurred_at` real | ✔ | S |
| `S1-T11` | **Teste de contenção de prompt injection** em texto capturado | `tests/integration/injection.test.ts` | T04 | payload hostil permanece dado | — | M |
| `S1-T12` | Seed sintético + comando `db:reset` | `packages/test-support/seed.ts` | T05 | seed reproduzível, **sem dado real** | — | M |
| `S1-T13` | E2E: criar workstream → capturar → ver evidência | `tests/e2e/capture.spec.ts` | T08, T09 | Playwright verde | — | M |

**DONE do Slice 1 significa exatamente:** a dona do projeto abre a aplicação local, cria um workstream, registra cada um dos dez tipos, e o conteúdo chega ao Evidence Ledger pelo mesmo caminho de quarentena que um connector futuro usaria — com `observed_at` correto, `content_origin` registrado, hash conferido, evidência impossível de sobrescrever, e um `validation_event` por captura. Um texto contendo instruções hostis é armazenado como dado e não altera comportamento.

---

### Slice 2 — Current State → Change

**Objetivo:** a AVA começa a entender mudança. **Sem LLM no caminho básico.**

| ID | Objetivo | Arquivos/módulos | Deps | Testes | Telemetria | Cx |
| --- | --- | --- | --- | --- | --- | --- |
| `S2-T01` | Migration `0003`: `state_object`, `relationship`, `change_record`, `entity` | `packages/db/migrations/0003_*` | S1-T01 | schema aplica | — | M |
| `S2-T02` | Domínio de State Objects e ciclos de vida por tipo | `packages/core/state/**` | S0-T06 | transições válidas e inválidas por tipo | — | L |
| `S2-T03` | Versionamento e supersessão | `packages/core/state/supersession.ts` | T02 | cadeia de supersessão; versão imutável | — | M |
| `S2-T04` | **Current State projector** + reconstrução | `packages/core/state/projector.ts` | T03 | **truncar projeção e reconstruir do ledger, comparando byte a byte** | — | L |
| `S2-T05` | Change Engine estágios 1–2: IDs, hashes, versões, campos estruturados | `packages/core/change/detect.ts` | T04 | detecção determinística; `detector` registrado | `change_detected_at` | L |
| `S2-T06` | Estágio 3: regras por tipo de objeto | `packages/core/change/rules.ts` | T05 | os nove tipos, positivo e negativo | ✔ | M |
| `S2-T07` | Estágio 4: diff lexical | `packages/core/change/lexical.ts` | T05 | diff estável | ✔ | M |
| `S2-T08` | Estágio 6: abstenção/revisão para **impacto alto + evidência baixa** | `packages/core/change/abstain.ts` | T06 | sistema não decide; marca para revisão | ✔ | M |
| `S2-T09` | Relationships + Impact profundidade 1–2, configurável | `packages/core/impact/**` | T02 | propagação; limite respeitado | — | M |
| `S2-T10` | Telemetria `change_detectable_at` e `change_detected_at` | `packages/telemetry/**` | S0-T11, T05 | ambos gravados | ✔ | S |
| `S2-T11` | UI: estado do workstream, mudanças recentes, timeline | `apps/web/app/workstreams/[id]/**` | T04, T05 | `effective_at` vs `observed_at` visualmente distintos | — | L |
| `S2-T12` | **GS-01** como teste golden | `tests/golden/gs-01.test.ts` | T11 | cenário determinístico verde | — | M |

**Primeiro objetivo demonstrável:** registrar Decision A → registrar evidência que supersede A → a AVA mostra que o estado mudou. **Nenhuma LLM participa desse fluxo** — estágios 1 a 4 são determinísticos por decisão arquitetural, e é por isso que a V0 é utilizável antes de o gate de provider fechar.

---

### Slice 3 — Chat + Retrieval

| ID | Objetivo | Deps | Cx |
| --- | --- | --- | --- |
| `S3-T01` | Migration `0004`: `context_health`, `decision_record`, `model_run` | S2-T01 | M |
| `S3-T02` | Retrieval lexical sobre FTS, com interface extensível | S1-T01 | M |
| `S3-T03` | Montagem do Context Packet, **incluindo contraevidência e lacunas** | T02 | L |
| `S3-T04` | Context Health: dez dimensões, agregação **por tarefa** | T03 | L |
| `S3-T05` | Gates de downstream: `DEGRADED` bloqueia preparação; `INSUFFICIENT` bloqueia afirmação | T04 | M |
| `S3-T06` | Registro de prompts versionados + `PromptRegistry` | S0-T09 | M |
| `S3-T07` | Archetype `state_query_answer` com schema e `evidence_constraint` verificado **em código** | T03, T06 | L |
| `S3-T08` | **Abstenção** como saída de primeira classe | T05, T07 | M |
| `S3-T09` | `DecisionRecord` para seleção de evidência relevante | T07 | M |
| `S3-T10` | `ModelRun` gravado sempre, **inclusive em falha** | S0-T10 | M |
| `S3-T11` | UI de Chat com streaming e citações clicáveis | T07 | L |
| `S3-T12` | Superfície **Why** — drill-down até Evidence, **sem LLM no caminho** | T09 | M |
| `S3-T13` | LLM evals: schema, grounding, unsupported assertion, abstention | T07 | L |
| `S3-T14` | **GS-05** — contexto insuficiente → abstenção | T08 | M |
| `S3-T15` | **PROVIDER GATE** — checklist bloqueante antes da primeira chamada real | T10 | M |

Perguntas mínimas suportadas: *What do you know about X?* · *What changed?* · *What decisions did I make?* · *What is unresolved?* · *Show me the evidence.* · *What are you unsure about?*

O mock provider continua permitido durante todo o slice. Uma implementação externa pluga depois que `S3-T15` fechar.

---

### Slice 4 — Memory + Declared Cognition

| ID | Objetivo | Deps | Cx |
| --- | --- | --- | --- |
| `S4-T01` | Migration `0005`: `declared_cognition`, `memory_record`, `behavioral_hypothesis` | S3-T01 | M |
| `S4-T02` | `DeclaredCognition`: nove categorias, versionamento, autoridade | T01 | L |
| `S4-T03` | Precedência declarada > hipótese, com registro de conflito | T02 | M |
| `S4-T04` | Memória episódica e semântica estabilizada + **regras de promoção** | T01 | L |
| `S4-T05` | Invariante `evidence_reachable` sempre verdadeiro | T04 | M |
| `S4-T06` | **Dedup de diversidade por `lineage.root_run_id`** — evidência de origem comum conta uma vez | T04 | M |
| `S4-T07` | `BehavioralHypothesis` em shadow mode, com `alternatives_available` obrigatório | T01 | L |
| `S4-T08` | Filtro que **exclui terceiros** da formação de hipóteses | T07 | M |
| `S4-T09` | Correção: novo evento + reconstrução de views derivadas | T04 | L |
| `S4-T10` | UI de Memory: cinco seções separadas, cinco ações | T02, T07 | L |
| `S4-T11` | **GS-04** e **GS-06** | T09, T06 | M |

Demonstração exigida: usuária declara preferência → AVA armazena com autoridade declarada → usuária corrige → registro antigo permanece rastreável → novo estado passa a ser autoritativo. **Nenhuma recursive summarization** — summary-of-summary não vira evidence, e isso é teste, não diretriz.

---

### Slice 5 — Opportunity + Briefing

| ID | Objetivo | Deps | Cx |
| --- | --- | --- | --- |
| `S5-T01` | Migration `0006`: `opportunity` com `value_vector jsonb` | S4-T01 | S |
| `S5-T02` | Value Vector: treze fatores com **origem por fator**, sem colapso escalar | S0-T06 | L |
| `S5-T03` | Quality gates separados das políticas | T02, S3-T04 | M |
| `S5-T04` | Classe `unpropagated_decision` | S2-T09 | M |
| `S5-T05` | Classe `upcoming_commitment` | T01 | M |
| `S5-T06` | Classe `invalidated_work` | S2-T06 | M |
| `S5-T07` | Classe `unresolved_question` | T01 | M |
| `S5-T08` | Classe `closing_risk` | T01 | M |
| `S5-T09` | Políticas Investigate/Show/Prepare **independentes** | T03 | L |
| `S5-T10` | **Preparation bias guard**: `prepared=true` fora da Show Policy, DecisionRecords distintos | T09 | M |
| `S5-T11` | Filtros + top-k, máx. 3/bloco e 10/briefing | T09 | M |
| `S5-T12` | Home/Today com os cinco blocos e estados vazio/degradado | T11 | L |
| `S5-T13` | Checkpoint manual explícito | T12 | M |
| `S5-T14` | **Gate A do ADR-21 funcional** — caps ativos no caminho de produção | S0-T10 | M |
| `S5-T15` | **GS-02**, **GS-03**, **GS-07** | T04, T06, T07 | L |

Work Graph permanece fora. Relações simples cobrem as cinco classes.

---

### Slice 6 — Feedback + Outcomes

| ID | Objetivo | Deps | Cx |
| --- | --- | --- | --- |
| `S6-T01` | Migration `0007`: `feedback`, `outcome` | S5-T01 | S |
| `S6-T02` | Feedback bidimensional em **colunas separadas**, sem score agregado | T01 | M |
| `S6-T03` | Feedback de artifacts preparados — seis estados | T01 | M |
| `S6-T04` | Outcome Resolution — quatro estados, resolver determinístico + revisão explícita | T01 | L |
| `S6-T05` | Ligação feedback/outcome ↔ Opportunity e DecisionRecord | T02, T04 | M |
| `S6-T06` | UI de feedback nas superfícies Home e Chat | T02 | M |
| `S6-T07` | Telemetria `feedback_at`, `user_action_at`, `outcome_at` | T04 | S |
| `S6-T08` | **GS-08** — opportunity → feedback → outcome | T05 | M |

Regra verificada por teste: `unresolved` **nunca** é convertido em rejeição ou confirmação.

---

### Slice 7 — Prospective Validation Audit

**Não é "adicionar telemetria no fim".** É auditoria de cobertura do que já foi instrumentado.

| ID | Objetivo | Deps | Cx |
| --- | --- | --- | --- |
| `S7-T01` | Auditar presença dos nove eventos da timeline | S6-T07 | M |
| `S7-T02` | Verificar constraint anti-retroatividade ponta a ponta | S0-T11 | M |
| `S7-T03` | Verificar que as treze grandezas de validação são calculáveis do banco | T01 | L |
| `S7-T04` | Relatório longitudinal — primeira execução, com `n` visível | T03 | M |
| `S7-T05` | Registrar gaps encontrados, sem preenchê-los com estimativa | T03 | S |

Somente após `S7-T05` a V0 pode ser considerada preparada para um Prospective Validation Protocol — que **não** é criado aqui.

---

## 8. Dependency graph

```text
Slice 0 — Foundation
   ↓
Slice 1 — Capture → Evidence
   ↓
Slice 2 — Current State → Change
   ├──────────────┬──────────────┐
   ↓              ↓              │
Slice 3        Slice 4           │
Chat+Retrieval Memory+DeclCog    │
   └──────┬───────┘              │
          ↓                      │
      Slice 5 — Opportunity ◄────┘
          ↓
      Slice 6 — Feedback + Outcomes
          ↓
      Slice 7 — Validation Audit
```

**Sequencial obrigatório:** S0 → S1 → S2. Nada é paralelizável antes de S2, porque tudo depende do ledger e da projeção de estado.

**Paralelizável:** Slice 3 e Slice 4 dependem ambos de S2 e não dependem um do outro. Podem ser construídos em paralelo. Slice 5 depende dos dois — de S3 para Context Health e gates, de S4 para Declared Cognition alimentando o Value Vector.

**Paralelizável dentro de slices:** em S0, as tarefas T03 (UI shell), T04–T05 (banco) e T09 (contrato de provider) são independentes entre si após T01. Em S5, as cinco classes de oportunidade (T04–T08) são independentes entre si.

**Caminho principal recomendado:** sequencial, mesmo onde o paralelo é possível. Com uma pessoa e agentes de codificação, paralelizar aumenta conflito de merge mais do que reduz tempo. O paralelismo está documentado para ser usado se e quando fizer diferença.

---

## 9. First executable milestone

**Nome técnico:** `Milestone 1 — Capture and Change Loop`

Comportamento ponta a ponta:

```text
Create Workstream
↓
Capture Decision
↓
Persist Evidence
↓
Capture superseding information
↓
Project Current State
↓
Detect Change
↓
Display change in UI
```

Alcançado ao final do **Slice 2**, especificamente em `S2-T11`, e verificado por `S2-T12` (GS-01).

Este milestone é significativo por uma razão: ele é atingido **sem nenhuma chamada de modelo**. Todo o caminho — captura, quarentena, ledger, projeção, detecção de mudança, exibição — é determinístico. A V0 é útil antes de o gate de provider fechar, e isso não é coincidência de planejamento: é consequência direta do princípio deterministic-first da baseline §10, que coloca a interpretação semântica por LLM no quinto lugar da cascata.

---

## 10. Provider gate

Conforme ADR-22. Aparece como tarefa `S3-T15`, **não antes**.

Antes da primeira chamada externa real, a execução é bloqueada até:

| # | Condição |
| --- | --- |
| 1 | provider escolhido |
| 2 | política de retenção verificada |
| 3 | uso para treinamento verificado |
| 4 | classes de dados permitidas e proibidas definidas |
| 5 | redaction/minimization implementada |
| 6 | operational caps configurados (ADR-21) |
| 7 | `ModelRun` logging funcionando |

Até `S3-T15` fechar: **`MockModelProvider` only**. O mock é o único provider registrado no container de dependências; um adapter externo não existe no código.

**Este gate não bloqueia os Slices 0, 1 e 2.** Eles não contêm nenhuma chamada de modelo, real ou simulada, no caminho de produção.

---

## 11. Budget Controller

Conforme ADR-21, implementado em `S0-T10` (esqueleto) e ativado no caminho de produção em `S5-T14`.

| Cap | Escopo |
| --- | --- |
| per-call cap | tokens e custo por chamada |
| per-checkpoint cap | custo agregado por checkpoint |
| daily cap | custo por dia |
| monthly cap | custo por mês |
| retry cap | número de tentativas por chamada |
| hard stop | interrupção quando qualquer cap é atingido |
| usage aggregation | soma por archetype, dia e mês |

**Valores iniciais:** `IMPLEMENTATION CONFIG REQUIRED BEFORE FIRST REAL MODEL CALL`

Nenhum valor é inventado aqui. Eles são configuração operacional da dona do projeto, definidos junto com o provider gate.

Reafirmação exigida pelo ADR-21: estes são `OPERATIONAL SAFETY CAPS`, **não** `PRODUCT VALIDATION THRESHOLDS`. Um cap atingido significa que o limite operacional funcionou — não que o produto falhou no gate econômico. O Gate B permanece aberto.

---

## 12. Security / privacy tasks

Distribuídas pelos slices, não empilhadas no fim.

| ID | Tarefa | Slice |
| --- | --- | --- |
| `SEC-T01` | Secret handling: env local, nunca versionado, nunca em prompt ou artifact | S0 (com T04) |
| `SEC-T02` | `.env.example` sem valores reais; `.gitignore` cobrindo `.env*` | S0 (com T01) |
| `SEC-T03` | Logging redaction: logs guardam IDs e contagens, **nunca conteúdo** | S0 (com T08) |
| `SEC-T04` | Classificação de sensibilidade por Evidence, propagada a derivados | S1 (com T03) |
| `SEC-T05` | Fixtures de teste **sem dado sensível real** | S1 (com T12) |
| `SEC-T06` | Minimização de terceiros antes de qualquer chamada externa | S3 (com T03) |
| `SEC-T07` | **Proibição de behavioral profiling de terceiros**, verificada por teste | S4 (com T08) |
| `SEC-T08` | Deleção em cascata verificável + reconstrução de views | S4 (com T09) |
| `SEC-T09` | Export completo em formato aberto | S4 |
| `SEC-T10` | Local data reset com export prévio obrigatório após dado real | S1 (com T12) |
| `SEC-T11` | Credenciais de provider isoladas do domínio | S3 (com T15) |

`SEC-T07` merece nota: a fronteira entre *"stakeholder X rejeitou a alternativa Y nesta reunião"* (evidência episódica aceitável) e *"X sempre rejeita inovação"* (inferência proibida) precisa ser checável em código — a formação de hipóteses filtra por `subject = user` e ignora terceiros.

---

## 13. Quarantine implementation

Três planos, com funções responsáveis nomeadas:

```text
Raw / untrusted
   │  ingestion/raw.ts        → RawInput { content, contentType, receivedAt }
   │                            sem ferramentas, sem autonomia, sem acesso a estado
   ↓
Parsed / normalized
   │  ingestion/parse.ts      → ParsedInput | ParseFailure
   │  ingestion/validate.ts   → validateAgainstSchema()
   │                            falha de schema é MARCADA e mantida, não descartada
   ↓
Accepted structured domain objects
      ingestion/accept.ts     → AcceptedEvidence | DerivedAssertion(candidate)
                                único caminho para o plano privilegiado
```

Interfaces:

- `RawInput` **não tem** métodos. É um dado.
- `parse()` e `validate()` são funções puras em `packages/ingestion`, sem acesso a repositório.
- `accept()` é o único ponto que escreve no ledger.
- `DerivedAssertion` nasce `candidate` e precisa de aceitação explícita para virar estado.

**Nenhum texto bruto pode chamar ferramenta ou modificar estado privilegiado por si só.** Garantido estruturalmente: `packages/ingestion` não importa `llm` nem `db` (exceto o repositório de escrita em `accept`), e a regra de import é verificada por lint em `S0-T02`.

---

## 14. Model provider contract

```text
interface ModelProvider {
  id: string                        model identifier: provider, model, version
  generateStructured(...)           saída validada contra schema versionado
  stream?(...)                      apenas onde necessário (chat)
  usage()                           tokens de entrada e saída
  timeout: number                   limite por chamada
  retry: RetryPolicy                política explícita e contável
  policyMetadata: ProviderPolicy    retenção, treinamento, classes permitidas
}
```

- `MockModelProvider` em `S0-T09` — determinístico, sem rede.
- Adapter externo **posterior**, em `packages/llm/providers/`, apenas após `S3-T15`.
- **Nenhuma lógica de domínio importa SDK de provider diretamente.** Regra de lint, não convenção.
- `policyMetadata` é o campo que torna a política do provedor consultável em código, em vez de conhecimento tácito de quem configurou.

---

## 15. Prompt management

| Item | Decisão |
| --- | --- |
| Localização | `packages/llm/prompts/<archetype>/<version>.ts` — nunca inline em componente |
| Prompt ID | `<archetype>.<version>`, ex.: `state_query_answer.v1` |
| Versionamento | nova versão é **novo arquivo**; a anterior permanece |
| Schema | cada prompt tem schema de saída versionado ao lado |
| Eval fixtures | `evals/<archetype>/` com casos por eixo |
| Logging | `prompt_version` em todo `ModelRun` e `DecisionRecord` |
| Mudança de versão | exige rodar as evals do archetype antes de virar padrão |

---

## 16. Retrieval plan

**Fase 1 — lexical/full-text.** Postgres FTS com índice GIN. É o baseline obrigatório da baseline §15 e o único implementado na V0.

**Fase 2 — avaliar semantic retrieval.** Só entra se a Fase 1 se mostrar insuficiente, **medido** por comparação pareada. Requer `pgvector`, embeddings versionados (modelo, versão, data, dimensão, chunking) e reindexação possível.

**Fase 3 — hybrid.** Só se demonstrar ganho sobre ambos.

Interface que permite extensão sem acoplar domínio:

```text
interface RetrievalStrategy {
  find(query, scope): Promise<Candidate[]>
}
```

`core` consome a interface; `retrieval` fornece as implementações. Trocar ou somar estratégias não toca o domínio.

**Nenhuma coluna de embedding é criada antecipadamente.** Não se adiciona `pgvector` porque existe uma coluna vazia esperando sofrimento futuro — adiciona-se quando a medição justificar.

---

## 17. DecisionRecord coverage

Operações que **produzem** DecisionRecord na V0:

| Operação | Slice |
| --- | --- |
| promoção de Opportunity (Show Policy) | S5 |
| decisão de preparação (Prepare Policy) — **registro distinto** do de promoção | S5 |
| mudança semântica assistida por LLM | S3 |
| resposta grounded quando houve seleção de evidência relevante | S3 |
| abstenção, por Context Health ou por política de dados | S3 |
| aceitação ou rejeição de DerivedAssertion | S2 |
| seleção de modelo e fallback | S3 |

Operações que **não** produzem: criação de workstream, captura simples, leitura, navegação. CRUD trivial gerando DecisionRecord transformaria o registro em ruído e destruiria seu valor de auditoria.

---

## 18. Context Health implementation

Determinístico sempre que possível — nenhuma dimensão depende de LLM.

**Inputs:** fontes esperadas disponíveis · freshness por fonte · cobertura temporal · sucesso de ingestão · Entity Resolution pendente · artifacts sem versão atual · contradiction flags não resolvidas · permissões que impedem cobertura · falhas de parsing/schema · lineage incompleto.

| Estado | Regra V0 | Gates downstream |
| --- | --- | --- |
| `HEALTHY` | cobertura necessária presente **para aquela tarefa** | nenhuma restrição |
| `DEGRADED` | lacunas conhecidas, resultado ainda possível | reduzir assertividade · **não promover** conhecimento · mostrar gaps · **bloquear preparação** dependente de fonte ausente · sem fallback silencioso para memória antiga |
| `INSUFFICIENT` | lacunas podem alterar materialmente o resultado | tentar recuperar mais; se não for possível, **abster** e registrar no DecisionRecord |

O agregado é **específico da tarefa**. Não existe "saúde global do sistema".

**Teste obrigatório (`S3-T05` + GS-05):** um cenário com `INSUFFICIENT` produz abstenção real, e não uma resposta plausível com aviso. Este é o teste mais fácil de deixar passar por acidente e o mais importante de manter.

---

## 19. Test pyramid

| Slice | Unit | Integration | E2E | LLM eval |
| --- | --- | --- | --- | --- |
| S0 | primitivos, ordinal, import boundaries | migração do zero, anti-retroatividade | — | — |
| S1 | schemas dos dez tipos, quarentena | append-only, injection containment | criar → capturar → ver | — |
| S2 | supersessão, os nove tipos de mudança | **reconstrução da projeção** | ver mudança na UI | — |
| S3 | Context Health, montagem de packet | retrieval → resposta grounded | perguntar e ver evidência | schema · grounding · unsupported · abstention |
| S4 | precedência, dedup de lineage | correção → reconstrução de views | corrigir memória | — |
| S5 | Value Vector, gates, preparation bias | mudança → oportunidade | ver briefing | change interpretation |
| S6 | estados de outcome | feedback → outcome | dar feedback | — |
| S7 | — | cobertura de telemetria | — | — |

**No CI:** install, lint, typecheck, unit, integration, migration validation, golden scenarios. **Fora do CI por padrão:** LLM evals (custam dinheiro e exigem provider) e E2E completo — o E2E roda limitado aos flows críticos.

---

## 20. Golden scenarios

| ID | Cenário | Setup | Sequência | Estado esperado | Invariante validado |
| --- | --- | --- | --- | --- | --- |
| **GS-01** | Superseded Decision | workstream + Decision A | capturar evidência que supersede A | A `superseded`, nova versão vigente, ChangeRecord `superseded` | supersessão sem apagar o passado |
| **GS-02** | Invalidated Artifact | Decision A + Artifact dependente | evidência invalida A | Artifact `outdated`, Opportunity `invalidated_work` | Change ≠ Impact; propagação profundidade 1 |
| **GS-03** | Unresolved Question | Question aberta relevante | passa checkpoint sem resposta | Opportunity `unresolved_question` | oportunidade sem inventar resolução |
| **GS-04** | Correction of Declared Cognition | preferência declarada | usuária corrige | antiga `superseded` e rastreável, nova autoritativa | passado não reescrito |
| **GS-05** | Insufficient Context → Abstention | contexto com lacuna material | pergunta que exige a fonte ausente | **abstenção**, registrada no DecisionRecord | `INSUFFICIENT` causa abstenção real |
| **GS-06** | System-origin evidence cannot self-confirm | claim + artifact gerado pela AVA | artifact reaparece como evidência | diversidade **não** aumenta; claim não promovido | `content_origin=system` + dedup por lineage |
| **GS-07** | Entity ambiguity remains unresolved | duas entidades ambíguas | resolução tentada | ambas `unresolved`, **sem merge** | `unresolved` > false merge |
| **GS-08** | Opportunity → feedback → outcome | oportunidade mostrada | feedback + ação + resolução | Outcome ligado, duas dimensões preservadas | loop fechado sem score único |

**Regra absoluta:** resultado sobre cenário sintético é **teste técnico**. Nunca é apresentado, relatado ou contado como evidência de validação do produto. Isso vai no README de `tests/golden/`.

---

## 21. CI plan

```text
install → lint → typecheck → unit → migration validation → integration → golden
```

Postgres como serviço no CI. Playwright limitado aos flows críticos, adicionado a partir de S1. Sem infraestrutura de deployment — a V0 é local-first.

---

## 22. Development environment

**Prerequisites:** Node LTS · pnpm · Docker.

```text
pnpm install
cp .env.example .env.local        # sem valores reais no exemplo
pnpm db:up                        # docker compose up -d
pnpm db:migrate
pnpm db:seed                      # cenários sintéticos apenas
pnpm test
pnpm dev
```

`.env.local` nunca é versionado. `.env.example` documenta as chaves sem valores.

**Nenhum dado real em seeds.**

---

## 23. Data seed

Seed controlado, `Workstream: Project Alpha`:

```text
t0 — goal created
t1 — decision A
t2 — artifact created based on A
t3 — evidence supersedes A
t4 — artifact becomes potentially invalid
```

O seed é ferramenta de desenvolvimento. **Nunca é evidência de validação.** Os dados são sinteticamente construídos, marcados como tal no banco, e um relatório de validação que os incluísse estaria contaminado.

---

## 24. Telemetry matrix

| Event | Slice introduced | Required fields | Validation use |
| --- | --- | --- | --- |
| `evidence_arrived_at` | **S1** | `evidence_id`, `workstream_id`, `content_origin`, `occurred_at` | ponto de partida de toda janela |
| `change_detectable_at` | **S2** | `change_id`, `evidence_ids`, `occurred_at` | limite teórico de antecipação |
| `change_detected_at` | **S2** | `change_id`, `detector`, `detector_version`, `occurred_at` | latência de detecção; proporção determinística |
| `opportunity_generated_at` | **S5** | `opportunity_id`, `class`, `change_id`, `occurred_at` | latência de raciocínio |
| `opportunity_shown_at` | **S5** | `opportunity_id`, `checkpoint_id`, `occurred_at` | atraso de exposição |
| `user_seen_at` | **S5** | `opportunity_id`, `occurred_at` | exposição real |
| `feedback_at` | **S6** | `target_id`, `epistemic`, `delivery`, `occurred_at` | correção e valor, em duas dimensões |
| `user_action_at` | **S6** | `subject_id`, `action`, `occurred_at` | janela de antecipação |
| `outcome_at` | **S6** | `outcome_id`, `state`, `resolved_by`, `occurred_at` | fechamento do loop |

Todos escrevem em `validation_event`, cujo schema e constraint anti-retroatividade nascem em **S0-T11**. **Slice 7 não é o primeiro lugar onde telemetria aparece** — é onde se audita o que já existe.

---

## 25. Error / failure modes

| Situação | Comportamento esperado |
| --- | --- |
| database unavailable | falha explícita na UI; nenhuma escrita parcial; nenhum fallback para memória |
| invalid capture | rejeição com mensagem clara; **conteúdo bruto preservado** para nova tentativa |
| conflicting evidence | ambas mantidas; `contradiction_flag`; **nenhum vencedor escolhido automaticamente** |
| unresolved entity | permanece `unresolved`; degrada Context Health; **nunca merge por conveniência** |
| provider timeout | retry limitado → fallback → abstenção; `ModelRun` gravado com a falha |
| invalid structured output | **rejeição**, não correção automática; `ModelRun` registra; abstenção se persistir |
| budget exceeded | **hard stop**; operação abortada; usuária informada; nada parcialmente escrito |
| Context Health insufficient | abstenção com lacuna nomeada, registrada no DecisionRecord |
| retrieval empty | "não encontrei evidência sobre isso" — **não** é convite a inventar |
| stale/superseded evidence | exibida como superseded, com data; nunca apresentada como atual |
| provider unavailable | caminhos determinísticos continuam funcionando; superfícies que exigem LLM degradam explicitamente |

O padrão comum: **degradar dizendo o que falta**, nunca degradar silenciosamente para uma resposta plausível.

---

## 26. Implementation checkpoints

Após cada slice, responder as seis perguntas:

| Pergunta | Como responder |
| --- | --- |
| **Does it run?** | comando único, verde |
| **What can the user do now?** | frase concreta, em termos de comportamento |
| **Which architecture invariant is now implemented?** | referência a seção da baseline |
| **What telemetry exists?** | eventos da matriz já gravados |
| **What remains fake/mock?** | lista explícita — mock provider, ausência de connectors |
| **What would block the next slice?** | dependência real, não suposta |

Estado esperado por checkpoint:

| Após | O que a usuária pode fazer | Ainda mock |
| --- | --- | --- |
| S0 | nada de produto; a base roda e testa | tudo de LLM |
| S1 | criar workstream e capturar os dez tipos | tudo de LLM |
| S2 | ver estado, mudanças e timeline — **Milestone 1** | tudo de LLM |
| S3 | perguntar e receber resposta grounded, ou abstenção | provider externo até `S3-T15` |
| S4 | declarar princípios, corrigir memória | — |
| S5 | receber briefing com oportunidades | — |
| S6 | dar feedback e ver outcomes | — |
| S7 | nada novo; relatório longitudinal existe | — |

---

## 27. Stop conditions during build

Situações em que a implementação **para** e gera decisão antes de continuar. Coding agents **não** resolvem nenhuma delas silenciosamente:

1. requisito da spec impossível sem mudança arquitetural;
2. dependency inversion necessária entre packages;
3. privacy boundary inviável como especificada;
4. **Change Engine determinístico insuficiente para um fluxo fundamental** — se os estágios 1–4 não cobrirem o caso central, isso é achado arquitetural, não motivo para chamar LLM mais cedo;
5. operational cost cap impossível mesmo em desenvolvimento;
6. persistence model incapaz de preservar provenance;
7. um invariante `LOCKED BY SPEC` precisaria ser relaxado para a tarefa passar.

Procedimento ao parar: registrar a situação, o requisito original, as alternativas e o impacto — e **aguardar decisão**. Se a resolução alterar a baseline, ela exige ADR (próximo ID: **ADR-23**).

Contornar silenciosamente qualquer um desses pontos produziria um sistema que parece cumprir a especificação e não cumpre — o modo de falha mais caro possível, porque só aparece quando os dados de validação já estiverem contaminados.

---

## 28. Coding agent handoff format

```text
Task ID:
Slice:
Objective:
Authoritative docs:
Files in scope:
Files out of scope:
Required behavior:
Invariants:
Tests required:
Telemetry required:
Do not:
Definition of done:
```

O campo `Do not:` é obrigatório e nunca fica vazio. Exemplos recorrentes: *não chamar provider externo* · *não criar tabela fora da migration do slice* · *não adicionar dependência não listada* · *não alterar documento em `docs/architecture/`* · *não colapsar o Value Vector em score* · *não converter `unresolved` em resultado*.

---

## 29. Order of execution

Lista autoritativa. O caminho principal é sequencial.

```text
── Implementation Batch 1 ──────────────────────────────
 1. S0-T01   scaffold pnpm workspace, TS, .gitignore
 2. S0-T02   lint, format, typecheck, import boundaries
 3. S0-T04   Postgres via Docker Compose + env            ║ paralelo com T03
 4. S0-T05   Drizzle + migration 0001
 5. S0-T06   primitivos de domínio
 6. S0-T03   Next.js app shell                            ║ paralelo com T04–T05
 7. S0-T07   harness de teste
 8. S0-T08   observabilidade + logging redaction
 9. S0-T09   ModelProvider + MockModelProvider            ║ paralelo com T07–T08
10. S0-T10   Budget Controller esqueleto
11. S0-T11   validation_event + anti-retroatividade
12. S0-T12   test-support fixtures
13. S0-T13   CI
14. S1-T01   migration 0002
15. S1-T02   append-only enforcement
16. S1-T03   dez tipos de captura + schemas
17. S1-T04   pipeline de quarentena
18. S1-T05   EvidenceRepository
19. S1-T06   WorkstreamRepository + actions
20. S1-T07   server action de captura
21. S1-T08   UI de Capture
22. S1-T09   UI de Workstreams
23. S1-T10   telemetria evidence_arrived_at
24. S1-T11   teste de prompt injection
25. S1-T12   seed sintético + db:reset
26. S1-T13   E2E de captura
27. S2-T01   migration 0003
28. S2-T02   State Objects e ciclos de vida
29. S2-T03   versionamento e supersessão
30. S2-T04   Current State projector + reconstrução
31. S2-T05   Change Engine estágios 1–2
32. S2-T06   estágio 3 — regras por tipo
33. S2-T07   estágio 4 — diff lexical
34. S2-T08   estágio 6 — abstenção/revisão
35. S2-T09   relationships + Impact
36. S2-T10   telemetria de change
37. S2-T11   UI de estado e mudanças        ◄── MILESTONE 1
38. S2-T12   GS-01
── fim do Batch 1 ──────────────────────────────────────

39–53.  Slice 3 (S3-T01 … S3-T15)     ║ paralelizável com Slice 4
54–64.  Slice 4 (S4-T01 … S4-T11)     ║ paralelizável com Slice 3
65–79.  Slice 5 (S5-T01 … S5-T15)
80–87.  Slice 6 (S6-T01 … S6-T08)
88–92.  Slice 7 (S7-T01 … S7-T05)
```

### Onde termina o Batch 1

`Implementation Batch 1` = **Slice 0 + Slice 1 + Slice 2 completos** — 38 tarefas, terminando em `S2-T12`.

A expectativa inicial era "Slice 0 + Slice 1 e, se seguro, o início do Slice 2". A dependência real permite ir além, e o princípio 12 do plano — *every slice leaves the repository in a working state* — desaconselha parar no meio do Slice 2: um Change Engine construído até o estágio 2, sem regras por tipo e sem UI, deixaria o repositório num estado que não demonstra nada e não é testável de ponta a ponta.

Três fatos tornam o Slice 2 completo seguro no primeiro batch:

1. depende **apenas** do Slice 1 — nenhuma dependência de Slice 3, 4 ou posterior;
2. **não contém nenhuma chamada de modelo**, real ou mockada, no caminho de produção — logo não depende do provider gate nem de decisão de custo;
3. é onde o **Milestone 1** acontece. Terminar o batch antes dele entregaria fundação sem comportamento demonstrável.

---

## 30. Definition of V0 complete

Cada acceptance criterion da especificação técnica vira item verificável. **Nenhum item é marcado pela simples existência de interface** — todos exigem comportamento observável em teste.

| # | Critério | Verificação concreta | Slice |
| --- | --- | --- | --- |
| 1 | workstream creation | E2E cria e lista | S1 |
| 2 | manual capture | os dez tipos gravam Evidence com `observed_at` correto | S1 |
| 3 | evidence provenance | `content_origin`, `lineage` e hash presentes e conferidos | S1 |
| 4 | decision capture | `Decision` com `evidence_ids` não vazio | S1–S2 |
| 5 | supersession | GS-01: antiga `superseded` e ainda consultável | S2 |
| 6 | Change detection | os nove tipos com caso positivo e negativo; `detector` registrado | S2 |
| 7 | grounded chat | **toda** afirmação factual com `evidence_ids` válidos; teste falha se houver afirmação sem evidência | S3 |
| 8 | evidence explanation | Why chega à Evidence original **sem LLM no caminho** | S3 |
| 9 | Declared Cognition | declaração tem autoridade sobre hipótese conflitante, provado em teste | S4 |
| 10 | correction | GS-04: correção gera evento novo; passado rastreável | S4 |
| 11 | basic Opportunity | ao menos `unpropagated_decision` e `upcoming_commitment` geradas por regra determinística | S5 |
| 12 | feedback | duas dimensões em colunas separadas; **ausência de coluna agregada** verificada no schema | S6 |
| 13 | outcome | quatro estados; `unresolved` nunca convertido | S6 |
| 14 | DecisionRecord | campos mínimos completos, incluindo alternativas e gates; explicação não adiciona motivo ausente | S3 |
| 15 | validation telemetry | os nove eventos gravados com `occurred_at` real | S1–S6 |
| 16 | **abstention** | GS-05: `INSUFFICIENT` produz abstenção real, não resposta plausível com aviso | S3 |

O critério 16 é o que distingue esta V0 de um assistente comum, e o mais fácil de perder sob pressão de demonstração. É acceptance criteria, não refinamento.

---

## 31. Definition of ready for prospective validation

Duas condições **separadas**, e a primeira não implica a segunda:

### `V0 FUNCTIONALLY COMPLETE`

Os dezesseis itens da §30 verificados. Slices 0–6 concluídos.

### `READY FOR PROSPECTIVE VALIDATION`

Exige, além do acima:

| # | Condição |
| --- | --- |
| 1 | telemetry audit completo (Slice 7) |
| 2 | constraint anti-retroatividade verificada ponta a ponta |
| 3 | nenhum timestamp faltando no caminho crítico |
| 4 | provider policy resolvida (ADR-22, `S3-T15` fechado) |
| 5 | Budget Controller ativo com caps configurados |
| 6 | DecisionRecords inspecionáveis pela usuária |
| 7 | caminho de feedback funcional |
| 8 | **Prospective Validation Protocol criado e travado** |

A condição 8 **não** é criada por este plano. Ela pertence a um gate posterior e segue a mesma disciplina do decision lock retrospectivo: critérios definidos e travados **antes** de qualquer número ser observado.

Manter as duas condições separadas é o que impede o erro previsível: usar a V0 por algumas semanas, olhar os números, e só então decidir o que contaria como sucesso.

---

## 32. Open implementation decisions

### BEFORE BATCH 1

`NONE`

As três lacunas de implementação (package manager, Postgres local, geração de IDs) foram resolvidas como `IMPLEMENTATION DEFAULT` na §3, com custo de substituição declarado. Nenhuma delas é arquitetural e nenhuma bloqueia o início.

### BEFORE FIRST REAL MODEL CALL

1. selecionar o provider inicial;
2. verificar política de retenção;
3. verificar uso para treinamento;
4. definir classes de dados permitidas e proibidas de atravessar a fronteira;
5. configurar os `OPERATIONAL SAFETY CAPS` (per-call, per-checkpoint, daily, monthly, retry) — `IMPLEMENTATION CONFIG REQUIRED`;
6. confirmar redaction/minimization implementada;
7. confirmar `ModelRun` logging funcionando.

Aparece como `S3-T15`. Não bloqueia os Slices 0, 1 e 2.

### BEFORE SLICE 5

1. **cadência de checkpoint** — o default é manual explícito (OQ-D1); confirmar antes de construir a Home;
2. **qual artifact preparável é barato e reversível** (OQ-D6) — se não houver resposta, a Prepare Policy fica **inativa** na V0 sem quebrar a vertical slice;
3. **Context Health mínimo por classe de intervenção** (OQ-D5) — default conservador já definido.

### BEFORE PROSPECTIVE VALIDATION

1. **Prospective Validation Protocol** versionado e travado;
2. para cada threshold herdado do decision lock retrospectivo, **documentar a equivalência semântica** — nada migra automaticamente;
3. **Gate B do ADR-21** — avaliação econômica com dados medidos e `n` visível.

Nenhuma decisão futura foi transformada em blocker do Batch 1.

---

## 33. O que este plano não faz

- não implementa código;
- não inicializa frameworks nem instala dependências;
- não altera a Architecture Package v0.2 Final;
- não altera a especificação técnica nem os ADRs;
- não seleciona provider de modelo;
- não define valores de safety caps;
- não cria o Prospective Validation Protocol;
- não marca hipótese alguma como testada — H-01 a H-06 permanecem `NOT TESTED`.

## Próximo gate

`Begin AVA V0 Implementation Batch 1`
