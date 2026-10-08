# 16 — Mobile: styled-components como mecanismo único de estilo

> Status: ✅ Implementado (2026-10-07) · Criado 2026-10-07 · Idioma: PT-BR (código/UI em inglês)

## 1. Objetivo

Eliminar o `StyleSheet` do React Native no app mobile (`frontend/`) e padronizar
toda a UI em **styled-components/native**, seguindo as regras Romero
(`~/.zcode/romero/react-native.md`): styles em arquivos irmãos
`<Component>.styles.ts`, props transient (`$`), tema via `ThemeProvider`, e
zero estilos inline fora das exceções sancionadas.

O cliente web (`web/`) já usa styled-components v6 com essa convenção (D16) —
este doc cobre apenas o mobile.

## 2. Decisões (aprovadas pelo autor, 2026-10-07)

1. **Paleta atual mantida** — os tokens semânticos de `src/theme/colors.ts`
   (estilo Google Photos/Material 3, com claro/escuro/sistema) permanecem.
   Sem reskin para zinc; a migração troca o mecanismo, não o visual.
2. **Tokenização estrita (Romero)** — todo espaçamento, tipografia e radius vem
   das escalas do tema (`theme.space`, `theme.type`, `theme.radius`);
   espaçamentos fora da grade de 4pt são normalizados para o passo mais próximo
   (pode deslocar sutilmente alguns espaçamentos).
3. **Verificação estática** — typecheck + lint + testes + grep (zero
   `StyleSheet`); a validação visual fica para o autor rodar via Metro.

Registrada como decisão **D17** no `00-roadmap.md` §6.

## 3. Convenção (Romero · react-native.md)

- `import styled from 'styled-components/native'`; arquivos irmãos
  `<Component>.styles.ts` contendo **somente** styled definitions e helpers
  `css` locais (sem JSX/hooks/lógica).
- **Exceção de localização para telas-rota** (`src/app/**`): o expo-router
  registra todo `.[jt]sx?` sob o app root como rota (sem ignore list nem opção
  de filtro — verificado no código do expo-router 57), então o styles file de
  uma tela-rota **não pode ser irmão**. Ele vive em `src/screens/` espelhando
  o caminho da rota (ex.: `src/app/(tabs)/index.tsx` →
  `src/screens/(tabs)/index.styles.ts`), importado via `@/screens/...`.
  Componentes fora de `src/app/` mantêm o arquivo irmão.
- Toda dimensão sai de uma escala do tema; o sufixo `px` é a convenção do
  styled-components no RN (o número chega unitless em dp ao RN).
- Props dinâmicas usam o prefixo transient `$` (ex.: `$pressed`, `$selected`,
  `$insetTop`), tipadas via generics no styled component.
- Cores só via `theme.colors.*`; nenhum hex fora de `src/theme/`.

### Exceções sancionadas (não migram)

- **Reanimated**: `useAnimatedStyle` permanece inline (movimento, não estilo) —
  PinPad, TabSwipe, BottomSheet, PressableScale, PhotoCell, ViewerPager,
  ViewerChrome, ViewerOverlay, ZoomableImage.
- **Tamanhos intrínsecos**: ícones, controles com tamanho próprio (tecla do
  PinPad 72×72, dots 12×12), imagens.
- **Valores medidos/derivados**: `GRID_CELL_SIZE`, tamanhos de `onLayout`,
  insets de safe area (chegam como props aos styled components).
- `StyleSheet.hairlineWidth` é substituído por `theme.hairline`
  (`1 / PixelRatio.get()`) — mantém o efeito sem importar `StyleSheet`.

## 4. Escalas novas no tema (`src/theme/tokens.ts`)

- `space` — grade de 4pt: `[0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64]`.
- `type` — tamanhos/pesos extraídos dos variants do `ThemedText`:
  display 28, title 20, titleMedium 16, body 15, bodySmall 13, label 12
  (pesos 400/500, letterSpacing 0.4 no label).
- `radius` — já existe (`RADIUS`: sm 8, md 12, lg 16, full 999); círculos
  passam a usar `radius.full`.
- `hairline` — `1 / PixelRatio.get()`.
- `border.width = 1` para bordas de 1px.

`src/theme/context.tsx` passa a renderizar o `ThemeProvider` do
**styled-components** com `{ dark, mode, colors, space, radius, type, hairline,
border }`; `useTheme()` preserva a API pública atual (StatusBar, SystemUI,
cor de ícones). O contrato do tema vive em `src/theme/styled.d.ts`
(`DefaultTheme`).

Helpers compartilhados em `src/theme/shared.ts`: `absoluteFill` (substitui
`StyleSheet.absoluteFill`), entre outros `css` helpers reutilizáveis.

## 5. Fases

### Fase A — Fundação

- [x] `bun add styled-components` + `bun add -d babel-plugin-styled-components`
      e `babel.config.js` (`babel-preset-expo` + plugin) no `frontend/`
- [x] `src/theme/tokens.ts`: escalas `space`, `type`, `hairline`, `border`
- [x] `src/theme/styled.d.ts`: `DefaultTheme`
- [x] `src/theme/context.tsx`: ponte com o `ThemeProvider` do styled-components
- [x] `src/theme/shared.ts`: `absoluteFill` e helpers

### Fase B — Componentes (`src/components/`)

- [x] Base: ThemedText (API pública intacta), LabeledInput, EmptyState,
      MiniToast, PermissionGate, SelectionBar, BottomSheet, AlbumPickerSheet,
      PinPad (dois objetos → um styles file), TabSwipe
- [x] Grid: PhotoCell, PhotoGrid, GridHeaders
- [x] Viewer/media: ViewerOverlay, ViewerPager, ViewerChrome, VideoPage,
      ZoomableImage, CloudGallery, CloudVideoPlayer

### Fase C — Telas (`src/app/`)

- [x] Tabs: `(tabs)/index`, `(tabs)/library`, `(tabs)/search`
- [x] Públicas: `(public)/welcome`, `(public)/login`, `(public)/register`
- [x] Navegação: `album/[id]`, `labels/index`, `label/[label]`,
      `locked/index`, `cloud-photos`
- [x] Settings: `settings`, `settings/account`, `settings/ai-labeling`,
      `settings/ai-model`, `settings/backup`, `settings/backup/folders`,
      `settings/encrypted-mode`, `settings/import-zip`,
      `settings/subscription`

### Fase D — Verificação

- [x] `bun run typecheck`, `bun run lint`, `bun test` verdes em `frontend/`
- [x] `rg "StyleSheet" frontend/src` → 0 matches
- [x] `style={{}}` restante apenas nas exceções sancionadas (§3)
- [x] Snapp de espaçamentos fora da grade 4pt registrado abaixo (§6)
- [x] Roadmap §5 atualizado

## 6. Registro da migração

- **Snapps de espaçamento** (valor antigo → token): 2→4, 6→4 (gap), 7→8 (inset),
  10→8, 13→12, 14→12, 18→16, 22→20, 26→24, 28→24 (padding de sheet, agora
  `radius.xl`), 44→40 (padding de EmptyState) — somente margens/gaps; nenhum
  tamanho de controle mudou (teclas do PIN, dots, badges, barras).
- Novos tokens semânticos de cor (mesmos valores visuais):
  `onAccent` (#0B0B0D no check de seleção), `onMediaAccent` (#7EACF8 no coração
  do viewer), `backgroundSoft` (header sticky ~95% opaco), `scrimSolid`
  (#000000 fullscreen media).
- `ThemedText` mantém variant/color/style como API pública (~100 call sites
  intactos); o variant `label` herdou peso médio como antes.
- **Style files criados**: 33 (`components/**` + `app/**`), além de
  `theme/shared.ts` (`absoluteFill`, `elevationLow/Medium`).
- **Inline styles restantes** (sancionados): providers raiz em `_layout.tsx`
  (`GestureHandlerRootView`/`SafeAreaProvider` + background programático),
  tamanhos medidos (`PhotoCell` size, `ZoomableImage` contain-fit), frações
  computadas de progresso (`flex`/`width %`) e wrappers Reanimated
  (`useAnimatedStyle`).
- **Verificação**: `tsc --noEmit` limpo; `vitest` 13/13; `rg StyleSheet src`
  → 0 usos (2 menções em comentários); lint mantém apenas a dívida
  `react-hooks` pré-existente documentada no roadmap §5.2 (padrões idênticos
  aos originais — migração não alterou lógica).
- build: `babel-plugin-styled-components` com `displayName` só em dev e
  `pure: true`; se o Metro reclamar do plugin, removê-lo não afeta o runtime.

## 7. Critérios de aceite

1. Nenhum `StyleSheet` (import, `create`, `flatten`, `absoluteFill`,
   `hairlineWidth`) em `frontend/src`.
2. Todo estilo de UI vive em `<Component>.styles.ts` (ou helpers de tema),
   com dimensões vindas das escalas do tema; para telas-rota de `src/app/**`
   o arquivo vive em `src/screens/` espelhando o caminho da rota (o
   expo-router trata todo `.ts`/`.tsx` do app root como rota).
3. `useTheme()` continua disponível com a mesma API.
4. Checks estáticos verdes; mudanças visuais limitadas aos snapps da grade
   de 4pt documentados no §6.
