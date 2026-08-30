# Current Architecture Baseline

```text
Current baseline:
Architecture Package v0.2 Final

Status:
FROZEN

Git tag:
architecture-v0.2-final

Next gate:
Validation Sprint 0
```

- **Baseline:** [architecture-package-v0.2-final.md](architecture-package-v0.2-final.md)
- **Purpose:** Official architecture baseline for Validation Sprint 0
- **Verification:** [architecture-verification-v0.2.md](architecture-verification-v0.2.md) — 21 PASS / 3 PARTIAL / 0 FAIL / 0 blockers

## Política de mudança

Após o freeze, a baseline não deve ser alterada silenciosamente.

Uma mudança arquitetural futura exige pelo menos um dos seguintes:

1. evidência gerada por experimento;
2. novo Architecture Decision Record;
3. nova versão arquitetural explicitamente versionada.

Correções puramente tipográficas podem ocorrer, mas nunca devem mudar significado arquitetural sem registro.

## Notas operacionais

- O `Architecture Package v0.2 Final` já carrega, no próprio cabeçalho, seu status de freeze e a nota de verificação. Este arquivo não duplica esse conteúdo: ele existe para que metadata documental futura seja registrada aqui, e não dentro da baseline congelada.
- Versões anteriores permanecem acessíveis e não são substituídas. Ver [README.md](README.md).
- Novos ADRs posteriores ao freeze vivem em [../decisions/](../decisions/README.md), não dentro da baseline.
