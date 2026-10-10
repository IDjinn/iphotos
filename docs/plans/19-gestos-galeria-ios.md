# 19 — Gestos e animações da galeria no padrão do app Fotos (iOS)

## 1. Objetivo

Aproximar ao máximo os gestos do app mobile do app Fotos da Apple (grade + viewer).
Este documento consolida a pesquisa de 2026-10-10: como os gestos do app Fotos
funcionam, o que existe de referência (documentação, headers e projetos que já
replicaram o comportamento em 2024–2026) e o gap atual do nosso app.

## 2. Avaliação dos recursos originais

| Recurso | O que contém | Veredito |
|---|---|---|
| [PhotosUI (docs Apple)](https://developer.apple.com/documentation/photosui) | API pública apenas de **picker** (`PHPickerViewController`) e editing extensions | ❌ Não expõe grade, viewer nem gestos do app Fotos |
| [Photos.framework (runtime headers)](https://github.com/nst/iOS-Runtime-Headers/tree/master/Frameworks/Photos.framework) | Interface dumps (só assinaturas, sem implementação) da camada de **dados**: `PHAsset`, `PHCachingImageManager`, etc. | ❌ Nenhuma classe de UI/gesto |
| [PhotoLibraryServices.framework (runtime headers)](https://github.com/nst/iOS-Runtime-Headers/tree/master/PrivateFrameworks/PhotoLibraryServices.framework) | Camada de **serviços/dados**: sync cloud, recursos, change notifications | ❌ Nenhuma classe de UI/gesto |

O framework que realmente contém a UI do app Fotos nos dumps é o
**`PhotosUICore.framework`** (privado), não a `PhotoLibraryServices`. As classes
`PX*` confirmam a arquitetura interna (nomes apenas — **sem física/valores**):

- `PXGestureProvider`, `PXPinchTracker`, `PXSwipeDownTracker`, `PXSwipeDownSettings` — providers de gesto separados por intenção;
- `PXOneUpPresentation`, `PXPageViewController` — o viewer ("one up") e o paging;
- `PXGridLayoutGenerator`, `PXGridLayoutMetrics`, `PXGridSettings`, `PXMagazineGrid` — a grade;
- `PXTileZoomAnimationOptions`, `PXTilingControllerZoomAnimationCoordinator` — o morph tile↔viewer;
- `PXAutoScroller`, `PXSwipeSelectionManager`, `PX*Scrubber*` — auto-scroll, seleção por swipe e scrubber de vídeo.

**Conclusão**: a Apple não publica a implementação dos gestos; os headers servem
de vocabulário. A física (thresholds, springs, curvas) precisa ser calibrada a
olho contra o app real ou aproveitada de projetos que já mediram (§3).

## 3. Referências úteis — quem já replicou (2024–2026)

1. **Software Mansion — "Recreating Apple & Google Photos in React Native"** (série 2025, time do Reanimated):
   - Blog: [part 1 — image list](https://swmansion.com/blog/react-native-image-list-recreating-apple-google-photos-in-react-native-part-1-7f73fb74fc63/) (a mais relevante: grade fluida estilo Fotos + observações de performance), [part 2 — multiplatform](https://swmansion.com/blog/react-native-multiplatform-recreating-apple-google-photos-in-react-native-part-2-832398eb0d4c/), [part 3 — Vega](https://swmansion.com/blog/react-native-for-vega-recreating-apple-google-photos-in-rn-part-3-f015e9272aed/), [part 4 — busca semântica](https://swmansion.com/blog/on-device-image-semantic-search-recreating-apple-google-photos-in-react-native-part-4-1aeedc044289/)
   - Repo: [software-mansion-labs/swm-react-native-labs-swm-photos](https://github.com/software-mansion-labs/swm-react-native-labs-swm-photos) (um branch por episódio, atualizado dez/2025). Stack próxima da nossa (RNGH + Reanimated + Expo). Provedores internos úteis como referência: `GalleryUISettingsProvider` (colunas/gaps), `CachedPhotosProvider` (mipmaps), `FocusRefProvider`.
2. **Expo Router — [zoom transition](https://docs.expo.dev/router/advanced/zoom-transition/)** (SDK 55+, alpha): usa a *zoom transition* nativa do iOS 18 (`Link.AppleZoom` / `Link.AppleZoomTarget`) para o morph tile→viewer, com `usePreventZoomTransitionDismissal`. **Limitação dura para nós: iOS 18+ apenas** — no Android cai no fallback standard (tracking no [react-native-screens #2885](https://github.com/software-mansion/react-native-screens/issues/2885)). Nosso hero próprio (§5) já cobre as duas plataformas.
3. **notjust.dev — ["iOS 18 Photos Clone with React Native and Reanimated"](https://www.notjust.dev)** (ago/2024, vídeo + código): passo a passo de grid + viewer + gestos.
4. **[pavelbabenko/react-native-awesome-gallery](https://github.com/pavelbabenko/react-native-awesome-gallery)** (610★, último push set/2024): viewer estilo Fotos (swipe-to-dismiss, pinch, pan). **Cuidado**: era Reanimated 2/3 — arriscado com nossa stack (RN 0.86 + Reanimated 4.5, new arch). Usar como referência de código, não como dependência.
5. Viewers prontos mais simples (abaixo do padrão Fotos): [dwqs/react-native-image-viewer](https://github.com/dwqs/react-native-image-viewer) (jan/2025), [@cicko/react-native-image-viewing](https://www.npmjs.com/package/@cicko/react-native-image-viewing) (abr/2025).
6. Técnica alternativa de morph: [shared element com Expo + Reanimated (flofuchs)](https://flofuchs.com).

## 4. Especificação dos gestos do app Fotos (alvo de paridade)

### 4.1 Grade

- **Pinch** muda o número de colunas continuamente, ancorado no focal point, com snap por coluna + haptic (o colapso para views Year/Month com morph fica fora de escopo v1).
- **Long-press**: célula "levanta" (scale + sombra), backdrop escurece/blur, menu de contexto com spring; arrastar para cima abre preview; haptic no lift.
- **Tap**: abre o viewer com morph do tile.
- Scroll com momentum + fast scroll (já temos `FastScroll` estilo Google Fotos).

### 4.2 Viewer ("one up")

- **Pan** (qualquer direção, inclusive diagonal) arrasta a foto com leve tilt/escala; ao soltar: dismiss se `|dy| > ~1/3` da tela **ou** `velocityY > ~800 dp/s`; senão spring de volta; backdrop some proporcional ao arrasto.
- **Pinch ≥ 1×**: zoom ancorado no focal point; pan da imagem com clamp elástico nas bordas.
- **Pinch < 1× (assinatura do app)**: continuar pinchando além do mínimo (1×) converte o gesto em dismiss — a foto encolhe e volta ao tile da grade no mesmo dedo (é para isso que existe o `PXPinchTracker`).
- **Double-tap**: alterna 1× ↔ ~2× ancorado no ponto tocado.
- **Single-tap**: alterna o chrome (barras com fade + parallax).
- **Swipe horizontal**: pagina entre fotos (sem gap visível, leve parallax); resistência nas extremidades.
- **Zoomed pan edge-carry**: com a foto zoomada, pan com momentum na borda continua para a foto vizinha.
- **Vídeo**: scrubber arrastável com preview de tempo, tap play/pause, double-tap ±10 s.

## 5. Estado atual do app (2026-10-10) — gap

Já implementado:

- **Hero flight tile↔viewer** com registro de células por asset id (`src/animations/hero.ts`; o close re-mediu a célula para devolver ao tile certo) e handoff pixel-invisível do ponto onde o drag soltou (`ViewerOverlay.tsx`, efeitos de open/close).
- **Pan-to-dismiss** com tilt + scale + backdrop (`ViewerPager.tsx`: `dy > 120 || velocityY > 900`; spring de volta `Springs.gentle`) e paging com carry de velocidade.
- **Pinch 1×..MAX** com clamp focal + **double-tap 2×** ancorado + **single-tap** (`ZoomableImage.tsx`).
- Chrome (`ViewerChrome`), vídeo (`VideoPage`), `FastScroll`, haptics (`expo-haptics`).

Gaps identificados na pesquisa — **todos implementados em 2026-10-10** (§8):

1. ~~**Pinch-to-dismiss**~~ ✅ implementado (§8.1) — a maior assinatura ausente.
2. ~~**Pinch de colunas na grade**~~ ✅ implementado na versão discreta com snap + haptic (§8.3); a versão fluida (morph contínuo) segue pendente.
3. ~~**Zoomed pan edge-carry**~~ ✅ implementado (§8.2). A resistência nas extremidades do paging já existia (fator 0.3).
4. ~~**Scrubber de vídeo arrastável**~~ ✅ implementado (§8.4).

## 6. Estratégia de replicação (stack: RNGH 2.32 + Reanimated 4.5 + FlashList + expo-image)

- **Pinch-to-dismiss**: no `ZoomableImage`, quando o pinch ativo cair abaixo de `startScale * event.scale < 1`, alimentar os shared values de dismiss (scale/ty seguindo o focal) em vez de clampear em 1, e sinalizar o pager (o `pinching` já existe no controller); no `onEnd`, `scale < ~0.92` → `runOnJS(dismiss)()`, senão spring de volta a 1. Continuidade de dedo único — o papel que `PXPinchTracker`/`PXSwipeDownTracker` cumprem na Apple.
- **Pinch de colunas**: `Gesture.Pinch` na tela da grade mudando `numColumns` por limiar com `haptic('selection')`; FlashList re-renderiza (aceitável em v1). Versão fluida (v2): layout próprio com transform por item (SWM part 1).
- **Zoomed pan edge-carry**: pan da imagem com `.manualActivation` cedendo para o paging quando o gesto acumular na borda (`Gesture.Exclusive` / `simultaneousWithExternalGesture` / `blocksExternalGesture`).
- **Transição de abertura**: manter o hero próprio (cross-platform, já devolve ao tile). Não adotar o `AppleZoom` do Expo (iOS 18+ only, alpha, latência conhecida — expo#42797).
- **Haptics**: selection no snap de coluna, light no lift do long-press.
- Todos os valores numéricos (thresholds, springs, durações) calibrar contra o app Fotos real; as referências do §3 têm pontos de partida.

## 7. Decisões

- **D23** (2026-10-10): a UX da galeria segue o padrão do app Fotos (iOS); gestos replicados em **JS puro** (RNGH + Reanimated, cross-platform), **sem libs externas de viewer**; a transição tile↔viewer permanece no hero próprio (o AppleZoom do Expo é iOS 18+ only e não cobre Android).

## 8. Implementação (2026-10-10)

1. **Pinch-to-dismiss** (`ZoomableImage.tsx` + drivers em `ViewerPager.tsx`): o pinch que cruza 1× para baixo passa a dirigir os mesmos canais do pull-down (`dismissScale`/`dismissTy`/`backdropOpacity`/`hideNeighbors`), com shrink ancorado no focal; commit no release quando `scale ≤ 0.92` ou `velocity ≤ −1.0` (`shouldCommitPinchDismiss`), senão spring de volta (`Springs.gentle`). O close flight do overlay já começa do ponto onde o pinch soltou — handoff pixel-invisível reutilizado. Sem os drivers (vídeo), o pinch clampa em 1× como antes.
2. **Zoomed pan edge-carry** (`ViewerPager.tsx`, MODE_ZOOM): o excesso horizontal além dos bounds do zoom carrega para o offset do pager (resistência 0.35; rubber-band 0.15 na primeira/última página); no release vira página se o excesso > 20% da tela, ou > 24 dp com `|velocityX| > 600` na mesma direção; caso contrário a foto assenta de volta nos bounds com momentum semeado. `onFinalize` cobre o cancelamento do gesto.
3. **Pinch de colunas** (`usePinchColumns.ts`): gesto contínuo com acumulador (passo por fator 1.3×, clamp 2–7 colunas, `haptic('selection')` por passo, estado por sessão — iOS não persiste). `PhotoGrid` é agnóstico a colunas (linhas pré-loteadas) e preserva a âncora da 1ª foto visível entre re-batches (`photoAnchorAtOffset`/`offsetForPhotoIndex` em `grid-metrics.ts`); `CloudGallery`/`CloudPhotoGrid` remontam a FlatList com `key={columns}` (exigência do RN) e restauram o offset escalado pela razão de colunas; rail da CloudGallery parametrizado.
4. **Scrubber de vídeo** (`VideoPage.tsx` + styles): barra fina no rodapé espelhando o chrome (`chromeVisible` thread Overlay→Pager→página); `timeUpdate` alimenta shared values (sem re-render; labels `m:ss`/`-m:ss` re-renderizam só no segundo inteiro); arraste pausa e faz seek ao vivo (retoma se estava tocando), thumb + labels aparecem ao agarrar; double-tap na superfície pula ±10 s e o single-tap espera o double falhar (mesmo trade-off do iOS).
5. **Módulo puro** `src/animations/gestures.ts` (`shouldCommitPinchDismiss`, `applyPinchStep` + constantes de calibração) — sem imports de RN, testável e usado em worklets; testes novos em `gestures.test.ts` e âncoras em `grid-metrics.test.ts`.

Constantes: `DISMISS_COMMIT_SCALE = 0.92`, `DISMISS_COMMIT_VELOCITY = −1.0`, `PINCH_FLOOR = 0.45`, `EDGE_COMMIT_RATIO = 0.2`, `EDGE_COMMIT_MIN = 24`, `EDGE_COMMIT_VELOCITY = 600`, `EDGE_RESISTANCE = 0.35`, `EDGE_RUBBER = 0.15`, `PINCH_STEP = 1.3`, `COLUMNS_MIN = 2`, `COLUMNS_MAX = 7`. Springs existentes reutilizados (`gentle/snappy/slide`).

Verificação: `tsc --noEmit` limpo, vitest 49/49 (+11 novos), lint sem classes de erro novas (os erros `react-hooks/immutability` em `.value` de worklets são falso-positivos pré-existentes na base).

## 9. Registro

- Pesquisa: 2026-10-10.
- Implementação dos gaps (pinch-to-dismiss, edge-carry, pinch de colunas, scrubber): 2026-10-10.
