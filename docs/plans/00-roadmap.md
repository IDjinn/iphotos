# Roadmap — iPhotos: Conta, Backup E2E e Classificação

> Última atualização: 2026-08-19 · Idioma: PT-BR (código e UI permanecem em inglês)
> Esta pasta (`docs/plans/`) contém o planejamento por tópicos. Cada documento é
> autocontido e pensado para ser implementado **um tópico por sessão de trabalho**.

## 1. Visão do produto

O iPhotos hoje é uma galeria local-first (clone local do Google Photos): timeline,
álbuns, favoritos, pasta trancada e busca estruturada, 100% offline.

A evolução planejada adiciona, sem perder o caráter local-first:

1. **Onboarding e conta** — primeira execução com introdução (logo/título/descrição)
   e opções de login/registro ou continuação sem conta.
2. **Dois modos principais** — **Offline** (sem conta; hospedagem customizada via
   S3/WebDAV no futuro, com licença vitalícia) e **Cloud** (assinatura mensal,
   backup com criptografia ponta a ponta, servidor zero-knowledge que apenas
   armazena blobs cifrados).
3. **Backup** — inventário local, regras de pastas sincronizadas/ignoradas,
   upload cifrado com deduplicação, restore em novo dispositivo, importação por ZIP.
4. **Classificação (IA)** — busca semântica e labels no estilo Google Photos, com
   modelos locais no dispositivo e um serviço opcional de classificação na nuvem.

### Princípios

- **Local-first**: tudo funciona sem conta; nada sai do aparelho sem consentimento.
- **Zero-knowledge (Cloud)**: o servidor armazena apenas blobs cifrados; nem o
  operador do serviço consegue ver as imagens.
- **Trade-offs explícitos**: qualquer recurso que exponha a imagem (ex.: classificação
  na nuvem) é opcional, com aviso claro do que muda na privacidade.

## 2. Documentos desta pasta

| Doc | Tópico | Resumo |
|-----|--------|--------|
| [01-onboarding.md](./01-onboarding.md) | Primeira execução | Tela de introdução (logo/título/descrição), botões de login/registro e "Continuar sem conta" |
| [02-modos-offline-cloud.md](./02-modos-offline-cloud.md) | Modos & licenciamento | `AppMode` offline/cloud, matriz de funcionalidades, interface `StorageProvider`, assinaturas |
| [03-backup-e2e.md](./03-backup-e2e.md) | Motor de backup + E2E | Inventário com hashes, fila de upload, criptografia ponta a ponta, restore, GC |
| [04-pastas-sync-ignore.md](./04-pastas-sync-ignore.md) | Pastas do backup | Regras de pastas sincronizadas/ignoradas, UI de seleção, reconciliação |
| [05-classificacao.md](./05-classificacao.md) | Classificação (IA) | Modelos locais on-device + serviço opcional de classificação na nuvem |
| [06-importacao-zip.md](./06-importacao-zip.md) | Importação por ZIP | Seleção, validação, extração, dedupe, salvamento em lote, relatório |
| [07-configuracoes-conta.md](./07-configuracoes-conta.md) | Configurações da conta | Telas de conta, backup, segurança e privacidade nas Settings |
| [08-pasta-segura-cofre.md](./08-pasta-segura-cofre.md) | Pasta Segura (cofre) | Itens cifrados com AES-256-GCM em storage privado, invisíveis à galeria do sistema |
| [09-backend-api.md](./09-backend-api.md) | Backend API (contrato) | Endpoints reais do backend v1 (auth JWT, upload, variantes, usage) e o mapeamento para as seams do app |
| [10-billing-assinaturas.md](./10-billing-assinaturas.md) | Billing & assinaturas | Decisão D5 (Play Billing vs Stripe), sync de `plan`/quota com o backend, paywall e matriz de planos |
| [11-e2e-zero-knowledge.md](./11-e2e-zero-knowledge.md) | Modo E2E zero-knowledge | Estágios 03B–03F detalhados: cripto de cliente, chave de recuperação (D3), upload cifrado, restore, GC |
| [12-hosting-custom.md](./12-hosting-custom.md) | Hosting custom (Offline estendido) | `StorageProvider` S3/WebDAV com credenciais do usuário + licença vitalícia |

## 3. Fases de implementação

Cada fase agrupa documentos/estágios que podem ser entregues juntos. Dentro dos
docs, os estágios estão rotulados (ex.: 03A, 03B…).

### Fase 1 — Fundação de conta (sem backend)
- 01 Onboarding completo (welcome + telas de login/registro com stub de serviço)
- 02 `AppMode`, account store, matriz de modos na UI
- 07 Seção "Conta" nas Settings (estado "modo local")

### Fase 2 — Backup local (sem rede)
- 03A Inventário local (scan + hashes + estatísticas)
- 04 Regras de pastas sincronizadas/ignoradas
- 06 Importação por ZIP (reaproveita o inventário para dedupe)

### Fase 3 — Cloud v1 (backend ✅ implementado + integração no app)
- 09 Integração front↔backend: auth real (e-mail+senha+JWT), upload com dedup,
  variantes (thumb/preview/original), polling de estado, usage
- 07 Telas de backup/conta conectadas ao serviço (`GET /api/usage`, logout real)
- 02 Billing/planos (Play Billing ou Stripe — decisão D5)
- E2E/zero-knowledge (03B–03F): **futuro** — o backend v1 é servidor confiável (D11)
  e já reserva os campos E2E na tabela `users`

### Fase 4 — Classificação local
- 05A Runtime de modelos on-device, indexação em background, busca semântica

### Fase 5 — Classificação cloud + assinaturas completas
- 05B Serviço opcional de classificação no fluxo de upload (opt-in anônimo)

### Futuro — Hosting custom (modo Offline estendido)
- 02 §5: S3-compatible/WebDAV com credenciais do próprio usuário + licença vitalícia

## 4. Dependências entre tópicos

```
01 onboarding ──► 02 modos ──► 03 backup (A→B→C→D→E)
                                │            │
                                ├──► 04 pastas (precisa de 03A)
                                ├──► 06 zip import (precisa de 03A p/ dedupe)
                                └──► 05B classificação cloud (precisa de 03C)
05A classificação local (independente — pode rodar antes mesmo das fases 1–3)
07 settings (parcial na fase 1; completa conforme 03/05 avançam)
09 backend-api (backend já implementado; o front da fase 3 consome este contrato)
```

## 5. Status

| Tópico | Fase | Status |
|--------|------|--------|
| 01 Onboarding | 1 | ✅ **Implementado** (2026-08-16): welcome + login/registro stub + gate no layout raiz |
| 02 Modos offline/cloud | 1 (base) / 3 (billing) / futuro (S3) | 🟡 **Base implementada**: `AppMode`, store de conta, matriz refletida na UI; `StorageProvider`, billing e S3 ficam para as fases seguintes |
| 03 Backup E2E | 2–3 | 🟡 **Motor v1 simplificado** (2026-08-18, junto com a integração 09): `backup-engine.ts` com lista de uploaded-ids no `kv`, upload sequencial com progresso, dedup vs hashes do servidor, HEIC→JPEG, poll `Ready/Failed`, skip de itens trancados, tratamento 413/429/offline. O **03A formal (inventário `backup_inventory`)** ainda pendente — ver doc 03 §1; E2E (03B–F) detalhado no doc 11 |
| 04 Pastas sync/ignore | 2 | ⬜ Não iniciado |
| 05 Classificação | 4 (local) / 5 (cloud) | 🟡 **05A local implementado** (2026-08-17): runtime ONNX (`src/data/ml/`) com CLIP ViT-B/32 int8 (~85 MB, download sob demanda), labels zero-shot PT+EN (`prompts.json`), indexer incremental `source='ml'` com progresso/último erro, telas `/settings/ai-model` e `/settings/ai-labeling` (endpoint do usuário, `source='ai'`), navegação `/labels` + `/label/[label]`. **Faltam**: tabela `asset_embeddings` + busca semântica (tarefa 5.5), indexação em background via `expo-task-manager`, fallback MobileNet e todo o 05B |
| 06 Importação ZIP | 2 | ⬜ Não iniciado (placeholder "Coming soon" nas Settings) |
| 07 Configurações da conta | 1–3 | 🟡 **Fase 1 implementada**: seções Account, Backup & sync e Smart search; `/settings/account` conectada ao backend (usage, logout real — 2026-08-18); `/settings/backup` completa nas fases 2–3 |
| 08 Pasta Segura (cofre cifrado) | — | 🟡 **Implementado** (2026-08-16): itens movidos para a Pasta Segura são cifrados com AES-256-GCM em storage privado e removidos da galeria do sistema; migração dos itens hide-only antigos; ver doc `08-pasta-segura-cofre.md` |
| 09 Backend API | 3 | ✅ **Implementado** (2026-08-18): backend .NET 10 + PostgreSQL em `C:\dev\csharp\iPhotos` — auth e-mail+senha+JWT (Argon2id, refresh rotativo), upload multipart com dedup SHA-256 e quota, variantes thumb/preview/original via worker separado, indexação EXIF (data/câmera/GPS/dimensões), listagem com filtros, usage; 107 testes (TDD) + compose. **Integração front ✅** (2026-08-18, commit `e547c82`): `api-client.ts` (refresh single-flight em 401), login/registro/logout reais, backup-engine v1, timeline remota `/cloud-photos` com thumbs autenticadas, `GET /api/usage` na conta |
| 13 IA off + previews + modo encriptado | — | ✅ **Implementado** (2026-08-20): master switch "Artificial intelligence" nas Settings (desliga CLIP local, labeling cloud, indexação automática e esconde labels/entradas de IA, sem apagar dados); pipeline local de thumbnails ~512px (`src/data/thumbnails.ts`, tabela `thumbnails`, `PhotoCell` usa preview com fallback); modo encriptado offline (`docs/plans/13-encrypted-mode.md`) — fotos cifradas AES-256-GCM com chave derivada de senha (PBKDF2 200k), removidas da galeria do sistema, galeria interna com previews descriptografados sob demanda, original decriptado ao abrir, cache de sessão purge no lock/background, disable decripta tudo de volta |

> Atualizar esta tabela ao concluir cada estágio.

### 5.1 O que entrou na implementação de 2026-08-16

- `AppMode` (`src/data/types.ts`); stores `onboarding`, `account`, `classification` (zustand + SQLite persist).
- Rotas públicas `(public)/welcome|login|register` com stub de nuvem ("Continue offline") e gate no `src/app/_layout.tsx` (login/registro continuam acessíveis via Settings depois do onboarding).
- Migração SQLite `asset_labels` + `labels-repository` + `label-indexer` (labels v1 derivadas de pastas do MediaStore + heurística de screenshots por nome de arquivo; incremental por marker de contagem por pasta; idempotente).
- `media-repository`: `listDeviceFolders()` e `forEachFolderAsset()`.
- Settings: seção **Account** (modo local, CTA para login), **Backup & sync** (dois placeholders desabilitados com explicação), toggle **Smart search & labels** com contagem de itens.
- Busca: texto livre agora consulta o índice de labels; chips "Your labels" com os labels mais frequentes; card de IA com copy honesta do estado atual.
- `purgeAssetMetadata` limpa labels junto com o resto.

Adições de 2026-08-16 (seleção de modelos + cofre da Pasta Segura):

- `model-registry.ts` (catálogo CLIP/MobileNet/SigLIP + capability de hardware via `expo-device` + recomendação por RAM) e store `ai-model` (persistido); tela `settings/ai-model` com badge "Recommended", bloqueio por RAM e seção Cloud "coming soon".
- Cofre: `vault-crypto.ts` (AES-256-GCM streaming via `react-native-quick-crypto`, chave em SecureStore, formato `[IV 12B | ciphertext | tag 16B]`), tabela `vault_assets`, `vault-repository.ts` (import/export/delete/migração), integração em viewer/bulk-actions/share, purge do cache de sessão no re-lock.
- Deps novas: `expo-device`, `expo-video-thumbnails`, `react-native-quick-crypto` (+ `react-native-nitro-modules`, `buffer`) — **exige rebuild do APK**.

Adições de 2026-08-17 (navegação por labels + progresso da indexação):

- Tela `/labels`: todas as labels com contagem (`listAllLabels`, sem ficar só nos 6 chips) + filtro local; acessível pelo "See all" da aba Search.
- Tela `/label/[label]`: álbum com **todas** as fotos da label (`getLabelAssetIds`, sem o teto de 200 da busca), ordenado por data, com seleção/share/favorite/delete.
- Indexer (`label-indexer.ts`) reporta progresso `{scanned, total}` das pastas pendentes e falhas de leitura por pasta; store `classification` expõe `progress`/`lastError` (erro persistido) e o Settings mostra "Indexing… X% (a of b)" + último erro em vermelho.
- Correção de build: **removido `expo-video-thumbnails` do array `plugins` do app.json** — o pacote não exporta config plugin e quebrava a resolução de config do CLI/prebuild ("No app.plugin.js found"); o autolink da dep continua válido.

Adições de 2026-08-18 (backend v1 implementado, doc 09):

- **Backend próprio** em `C:\dev\csharp\iPhotos` (.NET 10 + PostgreSQL 17, TDD): API
  (`/api/auth/*`, `/api/photos*`, `/api/usage`, `/health`) + **worker separado** que
  consome a fila `variant_jobs` (FOR UPDATE SKIP LOCKED) e gera **thumbnail 320px /
  preview 2048px** e indexa **EXIF** (takenAt, câmera, GPS, dimensões).
- Auth **e-mail + senha** com Argon2id + JWT (access 15 min, refresh 30 dias rotativo,
  reuso de refresh revogado → 401). Upload multipart (JPEG/PNG/WebP, 200 MB) com
  **dedup por SHA-256 por conta** e quota 15 GiB (413). Erros como `{ error }`
  (400/401/404/409/413/429). Enums como strings, datas UTC.
- Rodar: `docker compose up --build` (postgres + api + worker, migrations no startup);
  API em `http://localhost:5205`, OpenAPI `/openapi/v1.json`. Testes: `dotnet test`.
- Decisões novas: **D11** (auth padrão / servidor confiável, supersede OPAQUE no v1)
  e **D12** (stack do backend). Campos E2E ficam reservados na tabela `users`.

Adições de 2026-08-19 (planejamento das fases restantes):

- **Integração front↔backend registrada** (item 1 do §5.2 ✅, commit `e547c82`):
  `api-client.ts` + `cloud-photos-repository` + `backup-engine` v1 + timeline
  `/cloud-photos` + usage na conta.
- **Novos docs de plano** para as fases que faltavam detalhamento:
  **10-billing-assinaturas.md** (D5 — Play Billing vs Stripe, sync de `plan`/quota,
  paywall), **11-e2e-zero-knowledge.md** (estágios 03B–03F do doc 03 expandidos
  para modo E2E futuro sobre os campos já reservados no backend) e
  **12-hosting-custom.md** (`StorageProvider` S3/WebDAV + licença vitalícia).
- Docs 03/04/06 revisados contra o código atual (motor v1 simplificado,
  `listDeviceFolders`/`forEachFolderAsset` já existem no `media-repository`).

## 5.2 Próximas etapas (pós-implementação, em ordem recomendada)

1. **09 — Integração front↔backend** ✅ (2026-08-18): `api-client.ts` + tokens em
   SecureStore, login/registro reais (troca os stubs do 01), upload com progresso e poll
   `Ready|Failed`, thumbs autenticadas no grid, `GET /api/usage` na conta. Detalhes no doc 09 §5.
2. **03A — Inventário local**: tabela `backup_inventory`, scan incremental com SHA-256 e cache por `size+mtime`, estatísticas. Desbloqueia 04 e 06. O `content_hash` casa com o dedup do backend (doc 09 §4).
3. **04 — Pastas sincronizadas/ignoradas**: `sync_rules`, tela `settings/backup/folders`, reconciliação com o scan (reusa `listDeviceFolders`).
4. **06 — Importação por ZIP**: lib nativa + wrapper, dedupe pelos hashes do 03A, álbum "Imported — <nome>".
5. **05A-ML — Modelo local de verdade**: `onnxruntime-react-native` (dev build), CLIP ViT-B/32 int8 baixado sob demanda, tabela `asset_embeddings`, indexação via `expo-task-manager` em background (substituindo a indexação na abertura), provider semântico na busca. A interface atual (labels + `source`) já acomoda o novo modelo sem migração de dados, e a escolha do modelo já vem de `model-registry`/tela `/settings/ai-model`.
6. **02/D5 — Billing**: plano detalhado no **doc 10** (recomendação Play Billing v1 + Stripe como follow-up); sincronização de `plan` (o backend já expõe `plan`/quota no `users`).
7. **Futuro — E2E zero-knowledge (03B–F)**: plano detalhado no **doc 11** (cripto de cliente, chave de recuperação D3, sobre os campos reservados no backend); **Futuro — Hosting custom**: plano detalhado no **doc 12** (`s3StorageProvider`/`webdavStorageProvider` + licença vitalícia).

Dividas técnicas conhecidas da implementação atual:
- Regra `react-hooks/set-state-in-effect` falha no repo inteiro (pré-existente; ~57 erros antes desta implementação). Tratar em uma passada própria de lint.
- Indexação roda na abertura do app (JS thread, lotes de 1k com await entre páginas). Mover para background task na etapa 4.
- Markers de pasta usam contagem de assets: trocas de fotos com total igual não re-indexam aquela pasta.
- Labels v1 não têm tradução nem normalização de nomes de pastas localizados (ex.: "Capturas de tela").

## 6. Registro de decisões

| # | Decisão | Status |
|---|---------|--------|
| D1 | Documentos de plano em PT-BR; código/UI em inglês | ✔ Decidido |
| D2 | Backend do modo Cloud: **premissa de trabalho = backend próprio enxuto + storage S3-compatible** (alternativa: BaaS) | ✔ **Implementado** (2026-08-18): backend próprio em `C:\dev\csharp\iPhotos` (.NET 10 + PostgreSQL); storage S3-compatible segue como follow-up (hoje filesystem) |
| D3 | Recuperação E2E: **recomendação = chave de recuperação** gerada no cadastro (padrão Proton); sem senha e sem chave = dados irrecuperáveis | Recomendação — decidir quando o modo E2E (03B–F, futuro) for implementado |
| D4 | Classificação cloud: **inferência no servidor, opt-in, anônima** — a imagem é enviada durante o upload para classificação e o resultado volta cifrado ao cliente; servidor processa de forma efêmera, sem persistir a imagem e sem vínculo com a conta | ✔ Decidido pelo autor |
| D5 | Billing: Play Billing vs Stripe (ou ambos) | 🟡 Recomendação no doc 10 (Play Billing v1 no Android + verificação no backend; Stripe como follow-up web/desktop) — confirmar antes de implementar |
| D6 | Biblioteca de criptografia: nativa via dev build (libsodium/quick-crypto) vs pura-JS | Parcial — `react-native-quick-crypto` adotado no cofre da Pasta Segura (08); backup E2E (03) pode seguir na mesma |
| D7 | Biblioteca de ZIP: nativa (dev build) vs JS (compatível com Expo Go) | Recomendação em 06 |
| D8 | Permissão de mídia pedida no onboarding ou mantida no PermissionGate da aba Photos | Recomendação em 01 |
| D9 | Modelos locais: CLIP/SigLIP quantizado (embeddings + labels zero-shot) vs MobileNet (labels) | Recomendação em 05 |
| D10 | Labels v1 = heurísticas de pasta do MediaStore (sem ML), toggle "Smart search" default **on**, busca por texto livre consulta o índice | ✔ Implementado 2026-08-16 |
| D11 | Auth do v1: **e-mail + senha + JWT (servidor confiável, estilo Immich)** — o servidor vê as fotos para gerar variantes e indexar EXIF; **supersede a premissa OPAQUE/zero-knowledge do 03 para o v1**. O modo zero-knowledge permanece como futuro: a tabela `users` do backend já reserva `wrapped_master_key`/`kdf_salt`/`kdf_params` | ✔ Decidido 2026-08-18 |
| D12 | Stack do backend: .NET 10 + PostgreSQL + EF Core (migrations) + worker separado para variantes (fila `variant_jobs`, SKIP LOCKED) + ImageSharp 3.1 (fixado: a 4.0 exige chave de licença no build Docker); TDD com Testcontainers | ✔ Implementado 2026-08-18 |

## 7. Como usar estes documentos

1. Escolha **um** tópico/estágio por sessão de implementação.
2. Leia o doc inteiro antes de codar (seções "Contexto atual" apontam arquivos reais).
3. Siga o checklist de tarefas daquele estágio; respeite os critérios de aceite.
4. Ao concluir, marque o status na tabela do §5 e, se surgirem novas decisões,
   registre-as no §6 com data.
5. Pontos marcados como **[ABERTO]** não bloqueiam a implementação do resto do
   estágio — trate-os como valores defaults substituíveis.

## 8. Contexto técnico (já existente no app)

- Expo ~57 (CNG, prebuild `android/`), React Native 0.86, TypeScript strict, bun.
- Navegação: `expo-router` (rotas em `src/app/`), tema próprio (`src/theme/`),
  animações Reanimated, listas FlashList.
- Dados: `expo-sqlite` (`src/data/db.ts`, migrações via `PRAGMA user_version`),
  repositórios em `src/data/*-repository.ts`, zustand + persist em SQLite
  (`src/stores/`, `src/data/kv-storage.ts`).
- Mídia: `expo-media-library/legacy` encapsulado em `src/data/media-repository.ts`.
- Seams de fase 2 já preparados: `AssetRepository` (`src/data/asset-repository.ts`)
  e `SearchProvider` (`src/data/search-providers.ts`).
- Placeholder atual de backup: `src/app/settings.tsx` → "Backup: Local only · phase 2".
- **Backend v1 implementado** (2026-08-18, repo `C:\dev\csharp\iPhotos`): .NET 10 +
  PostgreSQL 17 + worker de variantes; auth e-mail+senha+JWT, upload com dedup,
  thumb/preview/original, indexação EXIF, usage. Contrato completo para o front no
  doc `09-backend-api.md` (endpoints, formatos, base URL por ambiente e mapeamento
  para as seams: `account.ts`, `api-client.ts`, `cloud-photos-repository.ts`).
