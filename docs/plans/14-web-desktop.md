# 14 — Web & Desktop (Next.js + Electron)

> Criado: 2026-10-03 · Idioma: PT-BR (código e UI em inglês)
> Cliente cloud do iPhotos para navegador (Next.js) e desktop (Electron), consumindo
> o mesmo backend do doc 09. O app mobile (Expo/Android, `frontend/`) permanece
> intocado — este doc cobre um **segundo cliente**, não um port.

## 1. Contexto e objetivo

### Por que um cliente novo (e não react-native-web)

O app mobile depende de módulos nativos sem caminho para web:

- `react-native-reanimated` **v4** (usado em praticamente todas as telas) não roda na web;
- `react-native-quick-crypto`/Nitro (cofre, modo encriptado, hash), `onnxruntime-react-native`
  (05A), `expo-media-library` (fonte de toda a galeria local) e o novo `expo-file-system`
  (`File`/`Directory`/`Paths`) — todos só-nativo.

Reusar o código RN exigiria adapters para cada um e reescrita da camada de animação.
O que **é** reaproveitado: os módulos de contrato TS puro (`src/data/*` REST) — copiados
e adaptados para `web/src/data/` (ver §3).

### Escopo v1 (decisão do autor, 2026-10-03)

**Cliente cloud completo** — o backend (doc 09) expõe: auth, fotos (upload/list/delete/files),
usage, imports ZIP e billing. Portanto o web/desktop faz:

- Login e registro (JWT)
- Galeria da nuvem: grid responsivo com paginação, filtros do contrato (período, fileName,
  câmera), visualizador em overlay, exclusão (individual e em lote) e download do original
- Upload com os três caminhos de input (seleção de arquivos, drag-and-drop na superfície
  inteira, colar do clipboard)
- Importação por ZIP (`POST /api/imports/zip` + polling do job)
- Assinatura: catálogo, status, verify sandbox e paywall
- Configurações: conta (usage/quota, logout) e tema

**Fora do escopo v1** (sem endpoints no backend; são features locais do mobile):
álbuns, favoritos, labels/busca semântica, Pasta Segura, backup do dispositivo.

## 2. Decisões (D16 no roadmap §6)

| Tema | Decisão | Rejeitadas |
|------|---------|------------|
| Stack web | Next.js (App Router) + shadcn/ui (primitivos) + styled-components (layout, `<Component>.styles.ts`) + Tailwind só para os primitivos | Expo react-native-web (bloqueadores nativos acima); SPA Vite |
| Desktop | Electron: main sobe o build Next (`next({ dev: false })`) em `127.0.0.1:3210` e carrega | Tauri; `file://` com export estático (origin quebrada para CORS/fetch) |
| Tema | Dark default (classe `.dark` antes do primeiro paint), tokens stock shadcn/zinc | Tema claro default |
| Auth web | Access token em memória; **refresh token em localStorage** (v1 — app self-hosted, coerente com D11). Hardening com cookie httpOnly é follow-up | Cookie httpOnly agora (exigiria mudança no backend) |
| Imagens autenticadas | `GET /api/photos/{id}/files/{kind}` com header `Authorization` → fetch → object URL, cache LRU com revoke. `<img src>` direto é impossível (URLs não são públicas) | URLs assinadas (mudaria o contrato) |
| Upload na web | Multipart `POST /api/photos` (contrato, cap 200 MB/arquivo). Fluxo presigned (D14) permanece mobile-only por ora — exigiria CORS no Storage.Host | Presigned na v1 |
| CORS do API | `Cors:AllowedOrigins` (array, default vazio = desligado); compose define `http://localhost:3000` (web dev) e `http://127.0.0.1:3210` (Electron) | Same-origin reverse proxy (redundante no self-host) |

## 3. Arquitetura

```
web/
├── src/
│   ├── app/                    # App Router: rotas e layouts
│   │   ├── (public)/login|register/
│   │   ├── (app)/photos|import|subscription|settings/
│   │   └── layout.tsx          # script .dark, providers, registry SSR, Toaster
│   ├── components/             # shadcn/ui + componentes do app (shell, AuthImage, viewer)
│   ├── data/                   # CONTRATO (portado de frontend/src/data — TS puro, axios)
│   │   ├── api-client.ts       # access em memória, refresh single-flight, storage adapter
│   │   ├── cloud-photos-repository.ts / billing.ts / import-repository.ts / types.ts
│   │   └── auth-errors.ts
│   ├── stores/                 # zustand: auth/ui (viewer), theme
│   └── styles/                 # helpers compartilhados (breakpoints rem, focus, motion)
├── electron/                   # main.ts (servidor embutido + janela), preload.ts
└── next.config.ts              # compiler.styledComponents, output standalone p/ desktop
```

- **Auth guard**: client-side (sem sessão de servidor — Bearer). Layout `(app)` redireciona
  para `/login` quando não autenticado; `/login` redireciona para `/photos` quando autenticado.
- **Upload**: um único caminho de validação (tipo/tamanho/contagem) para os três inputs.
- **Erros**: sempre mensagem simples + retry; detalhe cru só em toast de dev (Sonner).
  Nenhum vocabulário de backend na UI (Regras Romero).

## 4. Estágios

### 14A — Scaffold, tema e contrato
- [x] CORS no API (`CorsSettings`, `UseCors` antes do rate limiter) + compose env (2026-10-03)
- [x] Next.js + shadcn/ui (zinc) + styled-components com registry SSR; `.dark` default sem flash
- [x] `NEXT_PUBLIC_API_URL` validado (build falha sem ele, como no mobile)
- [x] Porte dos módulos de contrato para `web/src/data/` (SecureStore → storage adapter)
- [x] `AuthImage` + hook de blob autenticado (LRU + revoke)
- Aceite: `next build` limpo; contrato sem nenhuma referência a detalhes de backend. ✔

### 14B — Shell, auth e rotas
- [x] Shell responsivo (sidebar desktop, Sheet em larguras menores), top bar com busca
- [x] `/login` e `/register` (validação inline, estados de loading/erro)
- [x] Auth guard client-side; command palette `Cmd/Ctrl+K`
- Aceite: ambos os temas; teclado completo (Tab order, focus ring, Esc); back do browser coerente. ✔

### 14C — Galeria e viewer
- [x] Grid virtualizado (`@tanstack/react-virtual`), colunas responsivas, paginação infinita
- [x] Skeletons com aspect-ratio exato; empty/error com retry
- [x] Seleção múltipla + delete em lote; download do original
- [x] Viewer overlay: ←/→/Esc, integração com browser back, preview→original
- Aceite: 3 larguras + 200% zoom sem scroll horizontal; overlay com 2 saídas. ✔

### 14D — Upload, ZIP, billing, settings
- [x] Upload: picker + drag-and-drop (superfície inteira, estado dragover) + paste; validação única
- [x] Fila de upload com progresso por arquivo; erros neutros (413 → paywall)
- [x] `/import`: upload de ZIP + polling do job (contadores)
- [x] `/import` múltiplos zips: uploads em sequência sem esperar o processamento (job enfileirado no backend); polling concorrente por job, falha de um arquivo não para o lote
- [x] `/import` persiste entre reloads: `GET /api/imports` restaura a fila (jobs ativos voltam a ser acompanhados)
- [x] `/subscription`: catálogo + status + verify sandbox; usage/quota na settings
- [x] `/settings`: conta (usage, logout), tema (dark/light/system)
- Aceite: três caminhos de input com a mesma validação; paywall aciona por quota excedida. ✔

### 14E — Electron (desktop)
- [x] Main + preload (`contextIsolation`, sem nodeIntegration); servidor Next embutido
- [x] Menu/aceleradores: `Alt+←/→` histórico, `Ctrl+W` fecha janela; botões laterais do mouse (Chromium)
- [x] electron-builder (Windows/NSIS); scripts `dev:electron`, `dist`
- Aceite: instalador gerado; execução interativa no Windows fica como smoke do usuário.

## 5. Verificação (checklist Romero)

- Ambos os temas em todas as telas; dark é o default.
- Loading = skeleton no lugar (página montada); empty com próxima ação; erro com retry.
- Todo overlay fecha por affordance visível + Esc/back; modais com focus trap e restore.
- `rem`/`em` apenas; breakpoints em `rem`; sem `px` (exceto hairlines de 1px).
- Motion: ≤300ms, transform/opacity, `prefers-reduced-motion` com variante gentil.
- Zero detalhe de backend na UI/copy; erros crus logados, nunca renderizados.

## 6. Status

| Estágio | Status |
|---------|--------|
| 14A Scaffold + tema + contrato | ✅ Implementado (2026-10-03) |
| 14B Shell + auth | ✅ Implementado (2026-10-03) |
| 14C Galeria + viewer | ✅ Implementado (2026-10-03) |
| 14D Upload/ZIP/billing/settings | ✅ Implementado (2026-10-03) |
| 14E Electron | ✅ Implementado (2026-10-03; instalador NSIS gerado) |

## 7. Verificação executada (2026-10-03)

- `tsc --noEmit`, `eslint` e `next build` limpos; 14 testes unitários (Vitest) verdes.
- E2E Playwright (Chromium) 3/3: registro → estado vazio → upload pelo dialog
  (filechooser) → "Uploaded" → foto no grid → viewer abre e fecha por Esc;
  credenciais inválidas mostram mensagem neutra; sem overflow horizontal a 390px.
- Smoke contra o backend real (compose, CORS para `localhost:3000`): registro,
  login, upload multipart com `Origin` (201), listagem, processamento pelo worker
  (`Ready`) e thumbnail autenticada (200).
- Capturas headless (Edge/Chromium): dark a 1280px e 2× zoom, card centrado, sem FOUC.
- Instalador Windows (`dist-electron/iPhotos Setup 0.1.0.exe`) gerado pelo electron-builder.
