# 17 — Mobile: layout responsivo (escala proporcional + janela reativa)

> Status: ✅ Implementado (2026-10-07) · Criado 2026-10-07 · Idioma: PT-BR (código/UI em inglês)

## 1. Objetivo

Fechar a lacuna deixada pelo doc 16: a migração styled-components (D17) trocou o
**mecanismo** de estilo, mas manteve todo o dimensionamento **fixo em dp** — o app
renderizava o mesmo layout em qualquer tela. Três problemas concretos:

1. `src/theme/tokens.ts` capturava `Dimensions.get('window')` **uma vez, na
   inicialização do módulo** (`SCREEN_WIDTH`, `SCREEN_HEIGHT`, `GRID_CELL_SIZE`) —
   valores que ficam *stale* em iPad split-view e foldables.
2. A grade de fotos era **fixa em 3 colunas** em qualquer dispositivo: em tablets
   as células ficavam gigantes.
3. ~103 literais fixos nos arquivos de estilo (barras 52, teclas do PIN 72×72,
   fontes 11–28) não acompanhavam o tamanho da tela.

Nota: o sufixo `px` do styled-components/native **não** é pixel de CSS — é
descartado e o número chega ao RN como dp (density-independent). O problema nunca
foi a unidade; foi a ausência de qualquer reação ao *tamanho* da janela.

## 2. Decisões (aprovadas pelo autor, 2026-10-07)

1. **Escopo "reativo + grid adaptativo"** — constantes de tela viram reativas
   (`useWindowDimensions`), a grade ganha colunas em telas largas, containers
   críticos ganham `max-width`. **Retrato mantido travado** (`app.config.ts`);
   landscape/orientação livre ficam para um doc futuro.
2. **Escala proporcional global** — os tamanhos crescem com a tela (estilo
   `react-native-size-matters`), **na camada de tokens**: o tema é reconstruído
   a partir da janela e entrega `theme.space`, `theme.type`, `theme.radius` e um
   helper `theme.ms(size)` já escalados. Os arquivos de estilo continuam
   consumindo só `theme.*` — a regra D17 permanece intacta.
3. **Clamps de segurança** — fator limitado a `[0.85, 1.25]` contra uma base de
   390 dp: telefones pequenos não encolhem controles abaixo do toque confortável
   e tablets crescem no máximo 25% (a grade ganha colunas em vez de inflar
   botões 2.6×).

Registrada como decisão **D18** no `00-roadmap.md` §6. Complementa o D17
(mecanismo de estilo) na dimensão que ele não cobria: **tamanho**.

## 3. Modelo de escala (`src/theme/scale.ts`)

Módulo puro (sem RN, testável):

| Símbolo | Valor | Papel |
|---|---|---|
| `BASE_WIDTH` | `390` | largura de referência (iPhone médio) onde fator = 1.0 |
| `MIN_SCALE` / `MAX_SCALE` | `0.85` / `1.25` | clamps do fator |
| `scaleFactor(width)` | `clamp(width/390, 0.85, 1.25)` | fator da janela atual |
| `ms(width, size)` | `round(size × fator)` | escala um dp de referência |
| `columnsFor(width)` | `<600 → 3`, `600–899 → 5`, `≥900 → 7` | colunas da grade de fotos |
| `cellSizeFor(w, cols, gap)` | `floor((w − gap·(cols−1)) / cols)` | célula da grade |
| `CONTENT_MAX_WIDTH` | `640` (não escalado) | cap de conteúdo das telas de lista |

## 4. Tema reativo (`src/theme/context.tsx`)

- `ThemeProvider` consome `useWindowDimensions()` e reconstrói o tema via
  `useMemo([dark, mode, width])` — mudou a janela (foldable, split view), o tema
  inteiro atualiza e todos os styled-components re-renderizam.
- Escalados: `space`, `type.size`, `type.line`, `radius` (exceto `radius.full`,
  sentinela de pílula = 999).
- **Não escalados** (físicos/derivados): `hairline` (`1/PixelRatio`), `border`,
  `letterSpacing`.
- Novos campos no tema: `scale` (fator atual) e `ms(size)` (helper para os
  tamanhos intrínsecos de controle). Contrato atualizado em `styled.d.ts`.
- `tokens.ts` deixa de exportar dimensões estáticas (`SCREEN_WIDTH`,
  `SCREEN_HEIGHT`, `GRID_CELL_SIZE` removidos); `GRID_COLUMNS`/`GRID_GAP`
  permanecem como defaults de telefone. Token novo: `TYPE.size.micro: 10`
  (badge do ai-model, que era o único font-size fora do tema).

## 5. Mudanças por camada

- **Consumidores de dimensão viram reativos**: `PhotoGrid` (colunas/célula do
  hook, `extraData` no FlashList para re-layout), `ViewerPager` (largura de
  página via transient `$width`; `offset` e gestos ressincronizam na troca de
  largura), `ZoomableImage`/`ViewerOverlay` (`containFit` recebe o viewport;
  hero flight e fit/clamp recalculam), `TabSwipe` (distâncias de swipe 25%/30%
  da largura computadas no componente).
- **Sweep dos literais** (codemod, 90 substituições em 31 `.styles.ts`):
  `Npx` → `${({ theme }) => theme.ms(N)}px` para N ≥ 2. Exceções mantidas
  fixas: `0px`/`1px` (hairline-grade, no-op sob o clamp), linhas de sombra
  (geometria física), `font-size` (token: `10px` → `theme.type.size.micro`).
- **Ícones escalam centralizado**: `Icon` aplica `ms()` ao prop `size` — os
  ~130 call sites `size={N}` não mudaram.
- **Adaptativo pontual**: tiles de álbum (`AlbumCardWrap`) com
  `max-width: ms(200)` + grid centralizado; telas de lista (Settings raiz e
  subpáginas, aba Library, labels) com `contentContainerStyle` limitado a
  `CONTENT_MAX_WIDTH` centralizado — em telefones (<600 dp) nada muda.
- **Sombras** (`theme/shared.ts`, text-shadows dos overlays): ficam fixas —
  geometria de render, não layout.

## 6. Registro

- `theme/scale.ts` novo; `theme/context.tsx` reescrito (buildTheme reativo);
  `styled.d.ts` com tipos afrouxados para os valores escalados (números puros).
- **Testes novos**: `src/theme/scale.test.ts` (14 testes sobre o módulo puro —
  clamps, arredondamento, limiares de colunas, célula da grade); vitest 27/27.
- Verificação: `tsc --noEmit` limpo; lint com os mesmos
  **68 erros pré-existentes** do HEAD (dívida `react-hooks`/React Compiler
  documentada no roadmap §5.2 — nada novo introduzido; warnings 65 → 63).
- Limitações conhecidas: a troca de janela re-renderiza a árvore toda (evento
  raro — aceitável); retrato travado significa que o caminho landscape/split-view
  só se exercita em iPad/foldables.

## 7. Critérios de aceite

1. Nenhuma dimensão estática de tela em `src` (grep `SCREEN_WIDTH|SCREEN_HEIGHT|GRID_CELL_SIZE` → 0).
2. Grade de fotos com colunas por largura (3/5/7) e célula recalculada na troca de janela.
3. Todo controle/tipo escala com a largura dentro dos clamps, via `theme.*`/`theme.ms()` — sem helper solto nos componentes.
4. Literais `Npx` (N ≥ 2) nos `.styles.ts` apenas nas exceções do §5 (sombras).
5. Checks estáticos verdes sem novos erros de lint.
