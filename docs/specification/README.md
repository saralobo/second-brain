# Specification

```text
Current document:
AVA Technical V0 Specification v0.1

Status:
READY FOR IMPLEMENTATION PLANNING

Blocking questions:
NONE

Architecture baseline:
Architecture Package v0.2 Final (FROZEN, tag architecture-v0.2-final)

Code implemented:
NONE
```

- **Spec:** [ava-technical-v0-specification-v0.1.md](ava-technical-v0-specification-v0.1.md)
- **Validation strategy:** [Prospective Validation Strategy v0.1](../validation/prospective-validation-strategy-v0.1.md)
- **Architecture baseline:** [Architecture Package v0.2 Final](../architecture/architecture-package-v0.2-final.md)

A especificação traduz a arquitetura congelada em contratos implementáveis. Ela **não** valida a arquitetura, **não** a altera e **não** marca hipótese alguma como testada.

Em conflito, a autoridade é: Architecture Package v0.2 Final > esta especificação.

## Blockers resolvidos

| ID | Questão | Resolução |
| --- | --- | --- |
| OQ-B1 | gate de custo da baseline §26 em dependência circular | [ADR-21](../decisions/ADR-21-prospective-cost-latency-gate.md) — gate dividido em Gate A (pre-build guardrail) e Gate B (viabilidade econômica com dados medidos, **ainda aberto**) |
| OQ-B2 | política de provedor e localidade dos dados | [ADR-22](../decisions/ADR-22-v0-data-provider-boundary.md) — `LOCAL-FIRST PERSISTENCE + PROVIDER-AGNOSTIC MODEL INTERFACE` |

**Blocking before Implementation Plan: `NONE`.**

Permanece um gate posterior, `BLOCKING BEFORE FIRST EXTERNAL MODEL CALL`: selecionar o provedor inicial, verificar seu tratamento de dados contra o ADR-22 e configurar os operational safety caps do ADR-21. Ele não bloqueia o Slice 0. Enquanto estiver aberto, nenhum conteúdo real pode ser enviado a um provedor externo.

O requisito de custo **não** foi removido, e nenhuma hipótese foi validada. Ver §33 da especificação.

## Próximo gate

`Create AVA V0 Implementation Plan v0.1`
