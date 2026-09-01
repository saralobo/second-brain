# Fontes do conceito visual

O protótipo usa duas famílias. Nenhum arquivo de fonte é versionado aqui, e a
razão é diferente para cada uma.

## SF Pro — a tipografia de interface

Fonte de sistema da Apple, e a escolha de interface da AVA.

**Não está neste repositório porque a licença da Apple não permite
redistribuição.** O uso é liberado para desenhar e desenvolver interface; subir
os arquivos `.otf` para um repositório é distribuição, e isso a licença proíbe.

### Como obter em cada máquina

| Sistema | O que fazer |
| --- | --- |
| **macOS** | Nada. `-apple-system` resolve para a San Francisco do sistema e o protótipo renderiza correto ao abrir |
| **Windows / Linux** | Baixar de <https://developer.apple.com/fonts/> — grátis, exige conta Apple. Instalar `SF Pro` e abrir o HTML de novo |
| **Qualquer uma, sem instalar** | Não fazer nada: o protótipo cai para Inter, que carrega do Google Fonts |

Na página da Apple, o pacote que interessa é **SF Pro**. `SF Compact` é para
watchOS e `SF Mono` não é usada aqui. `New York` é a serifada da Apple e foi
descartada no DNA.

## Inter — o fallback

Carregada do Google Fonts pelo `<link>` no topo do HTML. Licença SIL Open Font,
livre para redistribuir — se um dia o protótipo precisar funcionar offline,
Inter pode ser embarcada no repositório sem problema. SF Pro não.

## JetBrains Mono — identificadores e números

Também do Google Fonts, também SIL Open Font License. Usada apenas em
identificadores de evidência, horários, métricas e atalhos de teclado — nunca em
rótulo de interface.

## O stack, como está no arquivo

```css
--ui: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
      "Inter", "Helvetica Neue", sans-serif;
--mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

A ordem importa: `-apple-system` vem primeiro para que um Mac use a fonte do
sistema em vez de uma cópia instalada à mão, que pode estar em versão diferente.

## Uma regra do DNA que sobrevive à troca de fonte

Nenhum texto em caixa alta, em nenhuma superfície — nem rótulo, nem botão, nem
eyebrow, nem com letter-spacing "de design". Sempre primeira letra maiúscula e o
resto minúsculo. A hierarquia vem de tamanho, peso e cor.
