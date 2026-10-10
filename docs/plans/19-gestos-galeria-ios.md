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

Gaps (ordem sugerida):

1. **Pinch-to-dismiss** — pinch abaixo de 1× deve continuar no dismiss (maior assinatura ausente).
2. **Pinch de colunas na grade** — v1 discreta com snap + haptic; versão fluida é layout custom (referência SWM part 1).
3. **Zoomed pan edge-carry** para a foto vizinha (exclusividade entre o pan da imagem zoomada e o pan do pager).
4. Resistência nas extremidades do pager; conferir dismiss diagonal.
5. Scrubber de vídeo arrastável (controles custom do expo-video).

## 6. Estratégia de replicação (stack: RNGH 2.32 + Reanimated 4.5 + FlashList + expo-image)

- **Pinch-to-dismiss**: no `ZoomableImage`, quando o pinch ativo cair abaixo de `startScale * event.scale < 1`, alimentar os shared values de dismiss (scale/ty seguindo o focal) em vez de clampear em 1, e sinalizar o pager (o `pinching` já existe no controller); no `onEnd`, `scale < ~0.92` → `runOnJS(dismiss)()`, senão spring de volta a 1. Continuidade de dedo único — o papel que `PXPinchTracker`/`PXSwipeDownTracker` cumprem na Apple.
- **Pinch de colunas**: `Gesture.Pinch` na tela da grade mudando `numColumns` por limiar com `haptic('selection')`; FlashList re-renderiza (aceitável em v1). Versão fluida (v2): layout próprio com transform por item (SWM part 1).
- **Zoomed pan edge-carry**: pan da imagem com `.manualActivation` cedendo para o paging quando o gesto acumular na borda (`Gesture.Exclusive` / `simultaneousWithExternalGesture` / `blocksExternalGesture`).
- **Transição de abertura**: manter o hero próprio (cross-platform, já devolve ao tile). Não adotar o `AppleZoom` do Expo (iOS 18+ only, alpha, latência conhecida — expo#42797).
- **Haptics**: selection no snap de coluna, light no lift do long-press.
- Todos os valores numéricos (thresholds, springs, durações) calibrar contra o app Fotos real; as referências do §3 têm pontos de partida.

## 7. Decisões

- (Nenhuma ainda — ao implementar, propor D23: "UX da galeria segue o padrão iOS Fotos; sem libs externas de viewer".)

## 8. Registro

- Pesquisa: 2026-10-10.
