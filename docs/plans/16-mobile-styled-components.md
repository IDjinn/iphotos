# 16 — Mobile: styled-components como mecanismo único de estilo

> Status: 🔄 Em andamento · Criado 2026-10-07 · Idioma: PT-BR (código/UI em inglês)

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

- [ ] `bun add styled-components` + `bun add -d babel-plugin-styled-components`
      e `babel.config.js` (`babel-preset-expo` + plugin) no `frontend/`
- [ ] `src/theme/tokens.ts`: escalas `space`, `type`, `hairline`, `border`
- [ ] `src/theme/styled.d.ts`: `DefaultTheme`
- [ ] `src/theme/context.tsx`: ponte com o `ThemeProvider` do styled-components
- [ ] `src/theme/shared.ts`: `absoluteFill` e helpers

### Fase B — Componentes (`src/components/`)

- [ ] Base: ThemedText (API pública intacta), LabeledInput, EmptyState,
      MiniToast, PermissionGate, SelectionBar, BottomSheet, AlbumPickerSheet,
      PinPad (dois objetos → um styles file), TabSwipe
- [ ] Grid: PhotoCell, PhotoGrid, GridHeaders
- [ ] Viewer/media: ViewerOverlay, ViewerPager, ViewerChrome, VideoPage,
      ZoomableImage, CloudGallery, CloudVideoPlayer

### Fase C — Telas (`src/app/`)

- [ ] Tabs: `(tabs)/index`, `(tabs)/library`, `(tabs)/search`
- [ ] Públicas: `(public)/welcome`, `(public)/login`, `(public)/register`
- [ ] Navegação: `album/[id]`, `labels/index`, `label/[label]`,
      `locked/index`, `cloud-photos`
- [ ] Settings: `settings`, `settings/account`, `settings/ai-labeling`,
      `settings/ai-model`, `settings/backup`, `settings/backup/folders`,
      `settings/encrypted-mode`, `settings/import-zip`,
      `settings/subscription`

### Fase D — Verificação

- [ ] `bun run typecheck`, `bun run lint`, `bun test` verdes em `frontend/`
- [ ] `rg "StyleSheet" frontend/src` → 0 matches
- [ ] `style={{}}` restante apenas nas exceções sancionadas (§3)
- [ ] Snapp de espaçamentos fora da grade 4pt registrado abaixo
- [ ] Roadmap §5 atualizado

## 6. Registro da migração

- **Snapps de espaçamento** (valor antigo → token): _preencher ao concluir_.
- Sem mudança de paleta, tipografia ou radius; `ThemedText` mantém
  variant/color/style como API pública (~100 call sites intactos).

## 7. Critérios de aceite

1. Nenhum `StyleSheet` (import, `create`, `flatten`, `absoluteFill`,
   `hairlineWidth`) em `frontend/src`.
2. Todo estilo de UI vive em `<Component>.styles.ts` (ou helpers de tema),
   com dimensões vindas das escalas do tema.
3. `useTheme()` continua disponível com a mesma API.
4. Checks estáticos verdes; mudanças visuais limitadas aos snapps da grade
   de 4pt documentados no §6.
