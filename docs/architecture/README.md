# Architecture

Índice histórico da arquitetura do projeto (placeholder: **Second Brain**). O nome definitivo do produto ainda não existe.

Esta pasta guarda a linhagem completa dos documentos arquiteturais. Nenhum documento histórico é reescrito ou substituído: cada versão permanece acessível de forma independente.

## Documentos

| Document | Status | Purpose |
| --- | --- | --- |
| [Architecture Package v0.1](architecture-package-v0.1.md) | Historical | Original architecture hypothesis |
| [Adversarial Review v0.1](adversarial-review-v0.1.md) | Historical | Independent adversarial review |
| [Architecture Package v0.2](architecture-package-v0.2.md) | Superseded draft | Reconciled architecture before final freeze |
| [Architecture Verification v0.2](architecture-verification-v0.2.md) | Historical gate | Final verification before freeze |
| [Architecture Package v0.2 Final](architecture-package-v0.2-final.md) | **CURRENT BASELINE** | Architecture governing Validation Sprint 0 |

A baseline corrente e sua política de mudança estão registradas em [BASELINE.md](BASELINE.md).

## Fluxo

```text
Architecture Package v0.1
↓
Adversarial Review v0.1
↓
Architecture Package v0.2
↓
Architecture Verification
↓
Architecture Package v0.2 Final
↓
Validation Sprint 0
```

## Como ler

- Para entender **o que governa o trabalho atual**, leia apenas o `Architecture Package v0.2 Final`.
- Para entender **por que** a arquitetura tem a forma que tem, leia v0.1 → Adversarial Review v0.1 → v0.2.
- Para entender **o que foi verificado antes do freeze**, leia a Architecture Verification v0.2.

## Relacionados

- [Decisions](../decisions/README.md) — ADRs posteriores ao freeze.
- [Validation](../validation/README.md) — Validation Sprint 0 e artefatos de validação.
