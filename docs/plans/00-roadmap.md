# Roadmap — iPhotos: Conta, Backup E2E e Classificação

> Última atualização: 2026-10-10 · Idioma: PT-BR (código e UI permanecem em inglês)
> Esta pasta (`docs/plans/`) contém o planejamento por tópicos. Cada documento é
> autocontido e pensado para ser implementado **um tópico por sessão de trabalho**.

## 1. Visão do produto

O iPhotos hoje é uma galeria local-first (clone local do Google Photos): timeline,
álbuns, favoritos, pasta trancada e busca estruturada, 100% offline.

A evolução planejada adiciona, sem perder o caráter local-first:

1. **Onboarding e conta** — primeira execução com introdução (logo/título/descrição)
   e botões de login/registro. **Login obrigatório (2026-10-09)**: o modo Offline
   sem conta foi removido; deslogado, o app fica na tela de login.
2. **Cloud** — assinatura mensal, backup com criptografia ponta a ponta, servidor
   zero-knowledge que apenas armazena blobs cifrados. (O antigo modo Offline com
   hospedagem custom via S3/WebDAV e licença vitalícia ficou no doc 02 como
   referência histórica/futura.)
3. **Backup** — inventário local, regras de pastas sincronizadas/ignoradas,
   upload cifrado com deduplicação, restore em novo dispositivo, importação por ZIP.
4. **Classificação (IA)** — busca semântica e labels no estilo Google Photos, com
   modelos locais no dispositivo e um serviço opcional de classificação na nuvem.

### Princípios

- **Local-first**: a galeria do dispositivo funciona sem rede; nada sai do
  aparelho sem consentimento (o app exige conta, mas a biblioteca local não
  depende dela).
- **Zero-knowledge (Cloud)**: o servidor armazena apenas blobs cifrados; nem o
  operador do serviço consegue ver as imagens.
- **Trade-offs explícitos**: qualquer recurso que exponha a imagem (ex.: classificação
  na nuvem) é opcional, com aviso claro do que muda na privacidade.

## 2. Documentos desta pasta

| Doc | Tópico | Resumo |
|-----|--------|--------|
| [01-onboarding.md](./01-onboarding.md) | Primeira execução | Tela de introdução (logo/título/descrição), botões de login/registro (sem conta removido em 2026-10-09) |
| [02-modos-offline-cloud.md](./02-modos-offline-cloud.md) | Modos & licenciamento | **Obsoleto (2026-10-09)**: modo Offline removido, login obrigatório; mantém o design de `StorageProvider`/licença vitalícia como referência |
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
| [14-web-desktop.md](./14-web-desktop.md) | Web & Desktop | Segundo cliente (Next.js + Electron) consumindo o mesmo backend: galeria cloud, upload, ZIP, billing, settings |
| [15-suporte-videos.md](./15-suporte-videos.md) | Suporte a vídeos | Ingestão em todos os caminhos (ZIP/multipart/presigned), poster + duração via ffmpeg, badge/player nos clientes |
| [16-mobile-styled-components.md](./16-mobile-styled-components.md) | Mobile: styled-components | Migração do `StyleSheet` para styled-components/native no app Expo: tema bridge, `<Component>.styles.ts`, tokenização estrita (D17) |
| [17-mobile-responsive-layout.md](./17-mobile-responsive-layout.md) | Mobile: layout responsivo | Escala proporcional na camada de tokens (`theme.ms`, clamps 0.85–1.25), janela reativa (`useWindowDimensions`), grade adaptativa 3/5/7 colunas, caps de conteúdo (D18) |
| [18-pessoas-e-labels-ia.md](./18-pessoas-e-labels-ia.md) | Pessoas & labels com IA | Rostos + clustering estilo Google Fotos (container ML self-hosted, insightface/ArcFace, abstração p/ nuvem) + labels de cena via endpoint OpenAI-compatible (Ollama/LM Studio/cloud); pgvector; toda inferência server-side (D19–D22) |

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

### Fase 6 — Web & Desktop (doc 14)
- 14A Scaffold Next.js/Electron + CORS no API + porte do contrato `src/data`
- 14B Shell responsivo + auth (login/registro) + rotas
- 14C Galeria cloud (grid virtualizado) + viewer overlay
- 14D Upload (3 caminhos), importação ZIP, billing, settings
- 14E Empacotamento desktop (electron-builder)

### Futuro — Hosting custom (modo Offline estendido)
- 02 §5: S3-compatible/WebDAV com credenciais do próprio usuário + licença vitalícia

### Futuro — Quase-dedup visual (cross-formato)
- **Problema**: o dedup atual é por SHA-256 dos bytes (exato e determinístico), então a
  mesma foto chegando em formatos diferentes — ex.: HEIC do iPhone transcodado a JPEG no
  app vs. o mesmo HEIC transcrito no servidor durante o import de zip — gera bytes e
  hashes distintos e não é detectada como duplicada (limitação inerente a hash de
  conteúdo; é como o Google Photos resolve, com assinatura visual + metadados).
- **Abordagem recomendada (simples antes de ML)**: índice secundário de *suspeita* por
  `(OwnerId, TakenAt, dimensões aproximadas)` para marcar possíveis quase-duplicados,
  com resolução manual na UI (manter/descartar). Embeddings visuais (reaproveitar o
  runtime CLIP on-device do 05A) só se a dor persistir.
- Vídeos: ✅ suportados no import e no upload (doc 15, 2026-10-05) — dedup via SHA-256
  + índice único `(OwnerId, ContentHash)` reutilizado como previsto; o **backup da
  câmera** continua foto-only (risco 4K/chunking no doc 03, etapa futura).

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
| 01 Onboarding | 1 | ✅ **Implementado** (2026-08-16): welcome + login/registro stub + gate no layout raiz. **2026-10-09**: welcome sem "Continuar sem conta"; onboarding só conclui ao autenticar e o gate raiz exige sessão (splash segura até `sessionResolved`) |
| 02 Modos offline/cloud | 1 (base) / 3 (billing) / futuro (S3) | 🔴 **Modo Offline removido (2026-10-09)**: login é obrigatório — `AppMode`/`account.mode`/`setMode` eliminados, escapatórias offline de welcome/login/registro fora, gate de rotas manda deslogado para `/login` (cobre logout manual, 401 pós-refresh rejeitado e deep links). Boot offline com refresh token salvo continua entrando no app (`restoreSession` só descarta a sessão em rejeição do servidor). Logout limpa caches + metadados da conta (`logout-cleanup.ts`: cloud-cache, thumbnails, cache dir, originais baixados, disco do expo-image, inventário de backup, regras de pasta, buscas recentes, purchase token) e colapsa a pilha em `/login`; cofre, modo encriptado e biblioteca local ficam intactos. Billing (Fase 3) e S3/WebDAV (futuro, doc 02 §4) seguem pendentes |
| 03 Backup E2E | 2–3 | ✅ **03A implementado** (2026-08-22): tabela `backup_inventory` (migração v11), scan incremental com cache `size+mtime`, hash SHA-256 em chunks (`file-hash.ts`), migração one-time dos ids do `kv`, motor v2 com dedup pelo hash local (seed único do servidor após reinstall) e tela `settings/backup` com estatísticas + "Scan now" offline. Estados transientes se recuperam de crash. **Pendências**: exclusão por regras de pasta (doc 04), backoff/tombstones e todo o E2E 03B–F (doc 11) |
| 04 Pastas sync/ignore | 2 | ✅ **Implementado** (2026-10-06): migração v13 `sync_rules` + `idx_inventory_folder`; precedência no scan (trancada → regra → política de pasta nova → include, módulo puro `folder-rules.ts`); tela `settings/backup/folders` (toggles, busca, filtros All/Included/Excluded, resumo) com card/badge de pastas novas ("Needs a decision") em `settings/backup` e Settings; reconciliação no toggle (`setSyncRule`: include repõe linhas com hash direto a `queued` sem re-hash; exclude tira do ciclo o que não subiu — blobs já enviados **ficam na nuvem**, remoção remota com tombstones fica para o 03E); stats por pasta lazy com cache (TTL 10 s + invalidação em scan/regra). `newFolderPolicy` fixo em `ask` (picker no doc 07); `knownFolders` semeado do inventário no upgrade. Primeira suíte de testes do app (vitest, 9 testes sobre a lógica pura). Detalhes no doc 04 §7.1 |
| 05 Classificação | 4 (local) / 5 (cloud) | 🔴 **Labeling fora do mobile (2026-10-09)**: depois da remoção do runtime ONNX (2026-10-08), saiu todo o resto — heurística de pastas (`source='local'`), AI labeling via endpoint do usuário (`source='ai'`, `/settings/ai-labeling`), telas `/labels` + `/label/[label]`, chips "Your labels" da Search e os toggles de Settings (store `classification` inteira). **Fica só a estrutura de dados**: tabela `asset_labels` + `labels-repository.ts` (`LabelSource='cloud'`) como contrato do sync futuro; migration do SQLite purga as linhas legadas `source IN ('ml','ai','local')`. **Próximo passo**: labeling por IA + busca semântica viram feature de **backend** (05B / `/v1/classify`, doc 09 §7) |
| 06 Importação ZIP | 2 | 🟡 **Server-side implementado** (2026-10-02, revisão da abordagem): `POST /api/imports/zip` + worker (`zip_import_jobs`) com extração no servidor, HEIC→JPEG via Magick.NET/libheif, dedupe por hash idempotente, vídeos/sidecars ignorados; front: `/settings/import-zip` (upload com progresso + poll + relatório); 2026-10-03: upload chunked via túnel implementado e revertido (não funcionou como esperado); ingresso grande voltou a ser o endereço LAN direto (`http://<ip>:5205`, docs 09 §3.4), row real nas Settings (contrato no 09 §3.4). **2026-10-04 — import Takeout-aware**: sidecars JSON nos dois layouts (`<arquivo>.json` e `.supplemental-metadata.json`) semeiam `takenAt`/GPS/`title`/`description` (colunas novas em `photos`, seed autoritativo com EXIF fill-if-missing), pastas `YYYY-MM-DD` semeiam data ausente, contador `videosIgnored` nos relatórios; fila do worker migrada para Postgres LISTEN/NOTIFY (fallback 30 s); painel web invalida galeria/usage ao fim do job. **2026-10-04b — staging local**: o zip bruto não vai mais ao S3 — `POST /api/imports/zip` grava no provider `filesystem` do storage host (`StorageService:StagingProvider`, keyed `IBlobStorage` "staging") e responde 202 em segundos; o worker processa do staging local e só fotos processadas sobem ao S3; web mostra "Storing archive on server…" pós-100% com watchdog de 15 min. **2026-10-05b — progresso sobrevive ao reload**: novo estado `Uploading` (job persistido antes do primeiro byte do corpo; `jobId` client-side na query, duplicado → 409; falha de conexão = falha permanente do job; worker falha órfãos `Uploading` >30 min no startup) + restore do painel web consertado no StrictMode (promise memoizada em ref) — recarregar `/import` no meio de upload/queue/processing mostra as linhas e retoma o polling. **2026-10-09 — limpeza de contadores + restore**: `videosIgnored` (legado, sempre 0) removido do contrato/backend/clients; card "Ignored" ganha descrição ("Files that aren't valid for upload"); painel web não restaura mais jobs finalizados (`Done|Failed`) após reload — na sessão corrente os resultados continuam visíveis, e o histórico segue no servidor (`GET /api/imports`). **2026-10-10 — cleanup de órfãos de staging**: `ZipImportCleanupWorker` (startup + a cada 15 min, `ZipImportCleanup:IntervalMinutes`) falha uploads abandonados (30 min no startup via `StartupStaleUploadMinutes` — semântica do sweep antigo movido para cá; 24 h nos passes periódicos via `StaleUploadHours`, idades grandes provam que o stream morreu) e apaga o zip staged de todo job terminal (`Failed`/`Done`), registrando `blob_deleted_at` (migration `AddZipImportBlobDeletedAt`) para não reescanear o histórico; delete idempotente, falha só loga e tenta na próxima passada — ~15,7 GB de zips órfãos de crashes no meio do upload removidos. **Pendente**: fluxo device-side original deste doc (modo offline / salvar vídeos na galeria) como fase futura |
| 07 Configurações da conta | 1–3 | 🟡 **Fase 1 implementada**: seções Account, Backup & sync e Smart search; `/settings/account` conectada ao backend (usage, logout real — 2026-08-18); `/settings/backup` completa nas fases 2–3. **2026-10-09**: logout colapsa a pilha em `/login` com limpeza local completa (doc 02); Settings sem mais os estados "Local mode"/"Requires Cloud" |
| 08 Pasta Segura (cofre cifrado) | — | 🟡 **Implementado** (2026-08-16): itens movidos para a Pasta Segura são cifrados com AES-256-GCM em storage privado e removidos da galeria do sistema; migração dos itens hide-only antigos; ver doc `08-pasta-segura-cofre.md` |
| 09 Backend API | 3 | ✅ **Implementado** (2026-08-18): backend .NET 10 + PostgreSQL em `C:\dev\csharp\iPhotos` — auth e-mail+senha+JWT (Argon2id, refresh rotativo), upload multipart com dedup SHA-256 e quota, variantes thumb/preview/original via worker separado, indexação EXIF (data/câmera/GPS/dimensões), listagem com filtros, usage; 107 testes (TDD) + compose. **Integração front ✅** (2026-08-18, commit `e547c82`): `api-client.ts` (refresh single-flight em 401), login/registro/logout reais, backup-engine v1, timeline remota `/cloud-photos` com thumbs autenticadas, `GET /api/usage` na conta. **2026-10-04 — variantes síncronas no upload**: `UploadAsync` gera EXIF + thumb/preview inline (bytes já em memória) — multipart e import de zip nascem `Ready`, sem job/fila nem re-download do original do S3; worker de variantes resta só para o fluxo presigned (upload-ticket → complete), que segue async. **2026-10-05 — filtros de galeria**: `GET /api/photos` ganha `sortBy=takenAt|createdAt` + `order=asc|desc` (400 em valor inválido); `CloudGallery` (mobile) e a galeria web ganham filtro de tipo de mídia (todas/fotos/vídeos) e ordenação (mais recentes/antigas primeiro), com `mediaType`/`order` na URL do web. **2026-10-05 — cache de mídia da nuvem (mobile)**: `cloud-media-cache.ts` cacheia em disco (`Documents/cloud-cache/`) todas as thumbnails da `CloudGallery` — revisitas nunca tocam a rede — e faz prefetch do preview das 100 fotos mais recentes (concorrência 3, evict da janela). Configurável em Settings → Cloud cache: `default` (descrito acima), `limited` (teto em MB com evict LRU por modificationTime) e `all` (preview de toda a biblioteca, sem evict). Hook `use-cloud-file.ts` serve a célula do disco, com fallback para a URL autenticada só em falha de download. **2026-10-05 — throughput de upload + multipart presignado**: worker de variantes com lanes paralelas fast/slow (8 fotos + 2 vídeos, env `Worker:PhotoLaneConcurrency`/`VideoLaneConcurrency`) e timeout por job (`PhotoJobTimeoutMinutes`/`VideoJobTimeoutMinutes`) que reenfileira em vez de travar a lane; backup mobile com duas pools (`EXPO_PUBLIC_UPLOAD_PHOTO_LANES`=8 / `EXPO_PUBLIC_UPLOAD_VIDEO_LANES`=2). S3 client configurável (`Providers:S3:ConcurrentServiceRequests`=8, `PartSizeBytes`=32 MiB, `MaxErrorRetry`, `SinglePutTimeoutMinutes`=30, retry mode Standard). Uploads diretos ≥ 5 GiB (S3 cap do PUT único) agora usam multipart presignado: ticket volta com `multipartUploadId`+`partSizeBytes`, partes presignadas via `POST /api/photos/{id}/part-url`, `complete` recebe `{ multipartUploadId, parts[] }`, `abort` cancela a sessão; expiração do presigned PUT escala com o tamanho (`Upload:AssumedUploadMbps`, teto `Upload:UploadUrlMaxExpiryHours`); `OrphanUploadSweeper` aborta sessões órfãs. Migração `AddPhotoMultipartUploadId`; 105 testes unit + suíte verde. **2026-10-06 — qualidade de upload (Google Fotos)**: escolha por conta `original` × `storageSaver` (`users.upload_quality`, migração `AddUploadQuality`; default por plano preserva o comportamento anterior), caps por plano × qualidade (§3.5 do doc 09: free original 64 MB/1 GB, free saver 16 MB/1 GB, pago original 500 MB/30 GB, pago saver 250 MB/10 GB); compressão/transcode em modo saver migrou do upload para o **worker** (passo no `VariantProcessingHandler`, vídeos com downscale 1080p) — vale para multipart, presigned e import de ZIP; `GET/PUT /api/me/preferences` com `mismatchedPhotoCount` e rewrite em massa de fotos existentes (`applyToExisting` reenfileira jobs); UI nas Settings do app (confirmar "atualizar existentes" vs "manter") e no painel web; 328 testes verde. **2026-10-10 — fotos live do iPhone**: coluna `photos.is_live` (migração `RemoveVideosIgnored`); import ZIP detecta pares Apple (still + `.mov` de mesmo stem na mesma pasta — export iCloud/Takeout): still entra como foto `isLive: true` e o `.mov` pareado não vira vídeo (conta em `ignored`; still falhou → `.mov` cai como vídeo comum; reimport do par promove still dedupado a live). Contrato (doc 09 §3.2): `isLive` no PhotoDto, filtro `isLive` no listing e em `/months`, `livePhotoCount` no `/api/usage`; galeria mobile ganha badge live (anéis concêntricos — grid cloud e grid local via subtipo `livePhoto` do media store) e chip "Live" que só aparece com mais de uma foto live na base |
| 10 Billing & assinaturas | 5 | ✅ **Implementado** (2026-10-03): abstração `IBillingProvider` + provider sandbox (`test`) conforme decisão D5; produto único `iphotos.cloud.1tb.monthly` (1 TB = US$ 15/mês, catálogo por config), tabela `billing_purchases`, endpoints `/api/billing/products|verify|status|restore`, worker de expiração com grace de 3 dias, paywall `/settings/subscription`, plano em Settings/Account e gatilho 413 no backup. 19 testes unit + 5 integração. **Follow-up**: `GooglePlayBillingProvider`/Stripe + RTDN/webhooks (doc 10 §8) |
| 13 IA off + previews + modo encriptado | — | ✅ **Implementado** (2026-08-20): master switch "Artificial intelligence" nas Settings (desliga CLIP local, labeling cloud, indexação automática e esconde labels/entradas de IA, sem apagar dados); pipeline local de thumbnails ~512px (`src/data/thumbnails.ts`, tabela `thumbnails`, `PhotoCell` usa preview com fallback); modo encriptado offline (`docs/plans/13-encrypted-mode.md`) — fotos cifradas AES-256-GCM com chave derivada de senha (PBKDF2 200k), removidas da galeria do sistema, galeria interna com previews descriptografados sob demanda, original decriptado ao abrir, cache de sessão purge no lock/background, disable decripta tudo de volta. **2026-10-09**: o master switch "Artificial intelligence" foi removido junto com todo o labeling (doc 05) — a seção Privacy fica com Pasta Segura + modo encriptado; thumbnails e modo encriptado seguem como descrito |
| 14 Web & Desktop | 6 | ✅ **Implementado** (2026-10-03): cliente cloud completo em `web/` — Next.js + shadcn/ui + styled-components, Electron desktop com servidor embutido e instalador NSIS; CORS configurável no API (D16); contrato REST portado para `web/src/data`. Galeria virtualizada + viewer, upload (picker/drop/paste), ZIP import, billing sandbox, settings/tema. Verificação: unit 14/14, E2E Playwright 3/3, smoke real contra o backend (upload→worker→thumbnail autenticada). Detalhes no doc 14 §7 |
| 15 Suporte a vídeos | — | ✅ **Implementado** (2026-10-05): vídeos aceitos em todos os caminhos de ingestão — import ZIP (sidecar Takeout já semeava), multipart e presigned; processamento `IVideoProcessor` com **ffmpeg/ffprobe** nos containers (api + worker) extrai dimensões/duração/`creation_time` e poster JPEG, que vira Preview/Thumbnail pelo pipeline ImageSharp; `photos.media_type` + `photos.duration_seconds` + `zip_import_jobs.videos_imported` (migração `AddVideoSupport`); serving inalterado (Range já habilitado); contrato `mediaType`/`durationSeconds` + filtro `GET /api/photos?mediaType=`; web com badge/player/`<video>`/upload de vídeo e mobile com badge + `CloudVideoPlayer` (download autenticado → expo-video). Backup da câmera segue foto-only (risco 4K no doc 03). Ver doc `15-suporte-videos.md` |
| 16 Mobile styled-components | — | ✅ **Implementado** (2026-10-07, commit `0c8711e`): `StyleSheet` eliminado do app mobile — styled-components/native v6 como mecanismo único (D17), tema bridged no `ThemeProvider` existente (paleta mantida), 33 `<Component>.styles.ts` novos, tokenização estrita (grade 4pt com snapp documentado), `ThemedText` com API pública intacta. Verificação: typecheck limpo, vitest 13/13, zero `StyleSheet` em `src`. Detalhes no doc 16 §6 |
| 17 Mobile layout responsivo | — | ✅ **Implementado** (2026-10-07): lacuna do doc 16 fechada (D18) — constantes de tela estáticas (`SCREEN_WIDTH`/`GRID_CELL_SIZE`) substituídas por `useWindowDimensions` + `theme/scale.ts` (fator clampado 0.85–1.25 sobre base 390 dp); tema reconstruído reativamente com `space`/`type`/`radius`/`ms()` escalados; grade de fotos adaptativa (3/5/7 colunas por largura); 90 literais `Npx` → `theme.ms(N)` em 31 styles files; ícones escalam no `Icon` central; tiles de álbum e telas de lista com max-width. Retrato mantido travado. Verificação: typecheck limpo, vitest 27/27 (14 testes novos em `scale.test.ts`), lint sem erros novos (68 pré-existentes). Detalhes no doc 17 §6 |
| 18 Pessoas & labels IA | — | ✅ **Implementado** (2026-10-09/10): container `ml/` (FastAPI + ONNX + insightface buffalo_l, imagem CPU universal, EP auto-detect rocm→cuda→cpu) + Postgres `pgvector/pgvector:pg17` (compose e Testcontainers) + migração `AddPeopleAndFaces` (persons/photo_faces/photo_labels/ml_jobs + trigger `pg_notify`); `MlJobWorker` por kind (faces 2 lanes, labels 1, cluster 1) + `MlBackfillSweeper`; enfileiramento nos 3 pontos Ready (upload síncrono, variantes, ZIP); API `/api/people`, `/api/faces/{id}/crop`, `/api/labels*`; clustering Chinese Whispers no .NET (nomes preservados, centróides exatos, merge/move/delete); frontend: "People" + chips de labels na Search, `/people`, `/person/[id]` (rename/merge/delete), `/label/[label]`, `CloudPhotoGrid`, i18n en/pt. **Backfill da biblioteca antiga é opt-in** (`Ai:BackfillEnabled`, default **off** — evita GETs em massa no S3; só fotos novas entram na pipeline). Verificação: backend 348 testes verde (integração contra pgvector real), tsc/vitest do front limpos, `ml` saudável no compose (`provider CPUExecutionProvider`). Decisões D19–D22 |
| Timeline da galeria (agrupamento mensal + fast scroll) | — | ✅ **Implementado** (2026-10-09): fotos com mais de 1 mês perdem o cabeçalho por dia (corte `oneMonthAgoStart` em `utils/dates.ts`; `buildGridData` aceita `now` injetável — lista newest-first, o corte cruza no máx. 1×); a grade ganha fast-scroll estilo Google Fotos (`components/grid/FastScroll.tsx`): rail arrastável na borda direita de toda grade (`PhotoGrid`, prop `fastScroll`), bolha com o mês durante o scrub, tick háptico por mês (`haptic('selection')`), snap animado no header do mês ao soltar, auto-hide 700 ms, `accessibilityRole="adjustable"` (pular mês ±1), reduced-motion respeitado. Base: `data/grid-metrics.ts` (offsets prefix-sum + busca binária offset→mês) e alturas de header determinísticas (`line-height` fixo nos headers via `TYPE.line.title`; helpers `monthHeaderHeight`/`dayHeaderHeight` em `GridHeaders.styles.ts`). **Alcance total (nuvem)**: novo endpoint `GET /api/photos/months` (buckets `"yyyy-MM"` + count por `takenAt`, undated por último sob `month: ""`; `sortBy`/`mediaType` validados como no listing) — `PhotoMonthBucket` (Dtos), `IPhotoRepository.ListMonthBucketsAsync`, serviço + endpoint com os mesmos error codes; galeria cloud mobile (`CloudGallery`) e web (`gallery-screen` + `month-rail.tsx`) com rail de timeline completa: scrub ao vivo dentro da janela carregada e **rebase** ao soltar num mês não carregado (mobile: página 1 com `to`/`from` do mês; web: filtros `from`/`to` na URL do mês). **Follow-up restante**: histograma de meses do media library para alcance total na galeria local. Verificação: backend 330 testes verde (+2 integração), vitest mobile 38/38, web vitest 15/15, tsc/eslint limpos nos arquivos tocados, API reconstruída no compose (health 200; `/api/photos/months` → 401 sem token) |

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

Adições de 2026-08-22 (estágio 03A — inventário local de backup):

- **Migração v11** em `db.ts`: tabela `backup_inventory` (schema do doc 03 §3.1,
  índices por estado e hash) + `purgeAssetMetadata` também limpa o inventário.
- **Migração one-time** dos ids `backup.uploadedIds.v1` (kv) para linhas
  `state='uploaded'` (size/mtime 0 → o próximo scan preenche sem re-subir nada).
- **Novos módulos**: `file-hash.ts` (SHA-256 streaming em chunks de 1 MB,
  substitui a leitura integral do arquivo na memória),
  `upload-prepare.ts` (`prepareForUpload` extraído do motor),
  `backup-inventory-repository.ts` (upsert do scan com reset apenas quando
  `size+mtime` muda, `removeAbsent` via temp table, stats GROUP BY, seed por
  hash, recuperação de estados `hashing`/`uploading` órfãos) e
  `backup-inventory.ts` (`runInventoryScan` por pasta — só fotos, itens
  trancados nunca entram; `hashPendingItems` em lotes; hash sempre dos bytes
  enviados — HEIC transcodado antes).
- **Motor v2** (`backup-engine.ts`): fases `inventory → hashing → uploading`;
  dedup pelo hash local; listagem completa do backend **apenas uma vez** para
  semear após reinstall/novo dispositivo; falhas gravam `attempts`/`last_error`;
  `duplicated:true` do servidor conta como skipped.
- **UI**: tela `settings/backup` (estatísticas por estado com bytes, "Scan now"
  offline, "Back up now" só no modo cloud, erros); linha Backup nas Settings
  agora navega (visível também offline, com resumo do inventário); store
  `backup.ts` expõe `stats`/`scan()`.

Adições de 2026-10-03 (billing & assinaturas — doc 10, decisões D5/D15):

- **Backend**: entidade `BillingPurchase` + tabela `billing_purchases` (unique por
  purchase_token, migração `AddBillingPurchases`); `BillingService` com verify
  idempotente (token reusado de outra conta → 400), status computado
  (`Free|Active|Grace|Expired`) e restore; `TestBillingProvider` (sandbox, prefixo
  `test_`); `BillingExpiryHandler` + worker diário no iPhotos.Worker — expiração
  com grace de 3 dias rebaixa o usuário para free/15 GiB sem apagar fotos.
  Catálogo por config (`Billing:Products`, hoje só `iphotos.cloud.1tb.monthly` =
  1 TB, US$ 15/mês); endpoints `GET /api/billing/products`, `POST /verify`,
  `GET /status`, `POST /restore`. 19 testes unit + 5 integração (fluxo completo
  com expiração simulada).
- **App**: `src/data/billing.ts` (contrato, sem detalhes de backend); account
  store populariza `plan` (antes sempre null); tela `/settings/subscription`
  (paywall + status + restore, botão sandbox só quando `catalog.sandbox`); row
  "iPhotos Cloud" nas Settings e seção do plano em `/settings/account`; gatilho
  413 no backup (`quotaExceeded` no engine/store → "Upgrade storage"); cleanup:
  `formatBytes` compartilhada em `src/utils/format.ts` (com tier TB) — removida
  de 4 telas.

Adições de 2026-10-09 (timeline da galeria — agrupamento mensal + fast scroll):

- **Agrupamento**: `oneMonthAgoStart` (`utils/dates.ts`); `buildGridData`
  suprime day headers após o corte de 1 mês (fotos antigas ficam só com o
  header do mês, como no Google Fotos). `now` injetável para testes.
- **Fast scroll**: `FastScroll` (Gesture.Pan + Reanimated) sobre o
  `PhotoGrid` — rail arrastável, bolha do mês, háptico por mês, snap no
  header do mês ao soltar; `data/grid-metrics.ts` mapeia offset→mês
  (offsets exatos: alturas de header determinísticas via `line-height`
  fixo + `TYPE.line.title` novo).
- **Testes**: `grouping.test.ts` + `grid-metrics.test.ts` (11 novos);
  stub `react-native` no `vitest.config.mts` para módulos puros que puxam
  `theme/tokens`.
- **Endpoint de meses (backend)**: `GET /api/photos/months` —
  `PhotoMonthBucket` (Dtos), `ListMonthBucketsAsync` no repositório/serviço
  (GroupBy por ano/mês de `takenAt`, undated por último; Npgsql traduz
  `.Year`/`.Month` de DateTimeOffset), endpoint com `mediaType`/`sortBy`
  validados no mesmo estilo do listing; 2 testes de integração novos
  (bucketing + fluxo HTTP) e fake atualizado. Sem mudança de sort/filtros
  existentes.
- **Rails cloud com alcance total**: `FastScroll` ganha
  `windowOffset`/`windowHeight`/`onJumpToMonth` (timeline inteira × janela
  carregada); `CloudGallery` (mobile) busca os buckets e faz rebase via
  página 1 com `to`/`from` do mês; galeria web ganha `month-rail.tsx`
  (drag + bolha + teclado, role="slider") que filtra pela URL do mês.

## 5.2 Próximas etapas (pós-implementação, em ordem recomendada)

1. **09 — Integração front↔backend** ✅ (2026-08-18): `api-client.ts` + tokens em
   SecureStore, login/registro reais (troca os stubs do 01), upload com progresso e poll
   `Ready|Failed`, thumbs autenticadas no grid, `GET /api/usage` na conta. Detalhes no doc 09 §5.
2. **03A — Inventário local** ✅ (2026-08-22): tabela `backup_inventory`, scan incremental com SHA-256 e cache por `size+mtime`, migração dos ids do `kv`, estatísticas e motor v2 com dedup local (seed único do servidor). Detalhes no doc 03 §1.
3. **04 — Pastas sincronizadas/ignoradas**: ✅ **implementado** (2026-10-06) —
   `sync_rules` (migração v13), precedência no scan, tela `settings/backup/folders`
   com toggles/busca/filtros, reconciliação no toggle (include sem re-hash; exclude
   mantém blobs na nuvem até o 03E), card de pastas novas com policy `ask`, stats
   lazy por pasta e suíte vitest da lógica pura. Detalhes no doc 04 §7.1.
4. **06 — Importação por ZIP**: ✅ **server-side implementado** (2026-10-02) — upload multipart → worker extrai e ingera pelo pipeline de fotos (dedupe por hash, HEIC transcrito no servidor). Follow-up futuro: fluxo device-side deste doc (offline / vídeos na galeria).
5. **05A-ML — Modelo local de verdade**: `onnxruntime-react-native` (dev build), CLIP ViT-B/32 int8 baixado sob demanda, tabela `asset_embeddings`, indexação via `expo-task-manager` em background (substituindo a indexação na abertura), provider semântico na busca. A interface atual (labels + `source`) já acomoda o novo modelo sem migração de dados, e a escolha do modelo já vem de `model-registry`/tela `/settings/ai-model`.
6. **02/D5 — Billing**: ✅ **implementado** (2026-10-03) — infraestrutura completa com `IBillingProvider` + provider sandbox (decisão D5 resolvida: abstração agora, Play Billing/Stripe depois), produto único 1 TB a US$ 15/mês, verificação server-side, expiração com grace e paywall no app. Detalhes no doc 10 §7 e §5.1.
7. **Futuro — E2E zero-knowledge (03B–F)**: plano detalhado no **doc 11** (cripto de cliente, chave de recuperação D3, sobre os campos reservados no backend); **Futuro — Hosting custom**: plano detalhado no **doc 12** (`s3StorageProvider`/`webdavStorageProvider` + licença vitalícia); **Futuro — Quase-dedup visual (cross-formato)**: ver §3 (suspeita por `TakenAt`+dimensões com resolução manual; embeddings CLIP só se a dor persistir).
8. **18 — Pessoas & labels com IA**: ✅ **implementado** (2026-10-09/10, decisões D19–D22) — faces/clustering com container ML self-hosted (`ml/`, insightface buffalo_l) + abstração p/ APIs de nuvem, labels de cena via endpoint OpenAI-compatible (Ollama/LM Studio/cloud), pgvector; backfill da biblioteca antiga fica **opt-in** (`Ai:BackfillEnabled`, default off — ver doc 18 §6.1). Follow-ups: UI de move-face/split e sugestões de mescla, adaptadores cloud (Rekognition etc.), labels para vídeos.

Dividas técnicas conhecidas da implementação atual:
- Regra `react-hooks/set-state-in-effect` falha no repo inteiro (pré-existente; ~57 erros antes desta implementação). Tratar em uma passada própria de lint.
- Indexação roda na abertura do app (JS thread, lotes de 1k com await entre páginas). Mover para background task na etapa 4.
- Markers de pasta usam contagem de assets: trocas de fotos com total igual não re-indexam aquela pasta.
- Labels v1 não têm tradução nem normalização de nomes de pastas localizados (ex.: "Capturas de tela").

## 6. Registro de decisões

| # | Decisão | Status |
|---|---------|--------|
| D1 | Documentos de plano em PT-BR; código/UI em inglês | ✔ Decidido |
| D2 | Backend do modo Cloud: **premissa de trabalho = backend próprio enxuto + storage S3-compatible** (alternativa: BaaS) | ✔ **Implementado** (2026-08-18): backend próprio em `C:\dev\csharp\iPhotos` (.NET 10 + PostgreSQL). **Storage S3 ✔** (2026-09-30): serviço standalone `iPhotos.Storage.Host` (payload → URL) com providers FileSystem/S3-compatible (AWS, Wasabi, MinIO, B2, R2)/WebDAV/Google Drive; api+worker passam a consumir via HTTP (`BlobStorage:Mode=Http`) |
| D3 | Recuperação E2E: **recomendação = chave de recuperação** gerada no cadastro (padrão Proton); sem senha e sem chave = dados irrecuperáveis | Recomendação — decidir quando o modo E2E (03B–F, futuro) for implementado |
| D4 | Classificação cloud: **inferência no servidor, opt-in, anônima** — a imagem é enviada durante o upload para classificação e o resultado volta cifrado ao cliente; servidor processa de forma efêmera, sem persistir a imagem e sem vínculo com a conta | ✔ Decidido pelo autor |
| D5 | Billing: Play Billing vs Stripe (ou ambos) | 🟡 Recomendação no doc 10 (Play Billing v1 no Android + verificação no backend; Stripe como follow-up web/desktop) — confirmar antes de implementar |
| D6 | Biblioteca de criptografia: nativa via dev build (libsodium/quick-crypto) vs pura-JS | Parcial — `react-native-quick-crypto` adotado no cofre da Pasta Segura (08); backup E2E (03) pode seguir na mesma |
| D7 | Biblioteca de ZIP: nativa (dev build) vs JS (compatível com Expo Go) | ✔ **Superseded 2026-10-02**: a extração foi para o backend (BCL `System.IO.Compression` + SharpZipLib p/ detecção de zip cifrado; Magick.NET/libheif p/ HEIC) — ver 09 §3.4. A decisão original vale para o fluxo device-side futuro |
| D8 | Permissão de mídia pedida no onboarding ou mantida no PermissionGate da aba Photos | Recomendação em 01 |
| D9 | Modelos locais: CLIP/SigLIP quantizado (embeddings + labels zero-shot) vs MobileNet (labels) | Recomendação em 05 |
| D10 | Labels v1 = heurísticas de pasta do MediaStore (sem ML), toggle "Smart search" default **on**, busca por texto livre consulta o índice | ✔ Implementado 2026-08-16 |
| D11 | Auth do v1: **e-mail + senha + JWT (servidor confiável, estilo Immich)** — o servidor vê as fotos para gerar variantes e indexar EXIF; **supersede a premissa OPAQUE/zero-knowledge do 03 para o v1**. O modo zero-knowledge permanece como futuro: a tabela `users` do backend já reserva `wrapped_master_key`/`kdf_salt`/`kdf_params` | ✔ Decidido 2026-08-18 |
| D12 | Stack do backend: .NET 10 + PostgreSQL + EF Core (migrations) + worker separado para variantes (fila `variant_jobs`, SKIP LOCKED) + ImageSharp 3.1 (fixado: a 4.0 exige chave de licença no build Docker); TDD com Testcontainers | ✔ Implementado 2026-08-18 |
| D13 | Storage desacoplado em serviço próprio (`iPhotos.Storage` + `iPhotos.Storage.Host` na mesma solution, isolado da lógica principal): API simples "payload → URL" (PUT objeto → URL assinada/presigned), providers FileSystem, S3-compatible (AWS/Wasabi/MinIO/B2/R2 via endpoint+path-style), WebDAV e Google Drive (SA); auth `X-Api-Key`, URLs assinadas (HMAC ou SigV4), guard SSRF para endpoints privados; o backend consome via `IBlobStorage` Http (DB continua guardando keys) | ✔ Implementado 2026-09-30 |
| D14 | Upload de fotos **direto ao storage com URL presigned** (`upload-ticket` → PUT SigV4 direto do app ao S3 → `complete`), encerrando o proxy api→storage que atravessava túnel+rede 2× por foto. Dedup por hash do cliente (mesma confiança D11), quota reservada no ticket, estado `PendingUpload` + sweeper de órfãos (24 h) no worker; multipart `/api/photos` permanece como fallback (storages sem presign → 501). Otimizações no mesmo pacote: worker baixa o original 1× (antes 3×), poll 2 s → 0,5 s, backup com 3 uploads paralelos no app | ✔ Implementado 2026-10-03 |
| D15 | Billing: **abstração `IBillingProvider` + provider sandbox (`test`) no v1** — toda a infraestrutura (verificação server-side idempotente por token, tabela `billing_purchases`, expiração com grace, paywall) independe da loja; `GooglePlayBillingProvider`/Stripe entram depois sem tocar domínio/endpoints/app. Catálogo de produtos por config (preço nunca é regra do backend); produto v1: `iphotos.cloud.1tb.monthly` (1 TB, US$ 15/mês), mensal | ✔ Implementado 2026-10-03 |
| D16 | **Web & Desktop: segundo cliente novo em `web/` (Next.js App Router + shadcn/ui + styled-components; Electron para desktop com servidor Next embutido)** — não é port do app Expo (reanimated v4, quick-crypto, onnx, media-library e file-system não rodam na web); reusa os módulos de contrato REST (`src/data`) por cópia adaptada. Auth: refresh token em localStorage na v1 (hardening httpOnly depois). Upload web: multipart (presigned D14 segue mobile-only até haver CORS no Storage.Host). CORS do API configurável por `Cors:AllowedOrigins` | ✔ Decidido 2026-10-03 (doc 14) |
| D17 | **Mobile: styled-components/native como único mecanismo de estilo no app Expo** — `StyleSheet`/inline styles eliminados (exceções Romero: `useAnimatedStyle` do Reanimated, tamanhos intrínsecos, valores medidos); styles em arquivos irmãos `<Component>.styles.ts` com props transient `$`; tema via `ThemeProvider` reusando a paleta semântica existente (`src/theme/colors.ts`, sem zinc) com tokenização estrita (`theme.space`/`type`/`radius`, grade 4pt; espaçamentos fora da grade fazem snap). Ajuste 2026-10-07: o styles file de telas-rota (`src/app/**`) não pode ser irmão — o expo-router registra todo `.ts`/`.tsx` do app root como rota — e vive em `src/screens/` espelhando o caminho da rota, importado via `@/screens/...` | ✔ Implementado 2026-10-07 (doc 16) |
| D18 | **Mobile: escala proporcional na camada de tokens + janela reativa** — o tema é reconstruído de `useWindowDimensions` e entrega `space`/`type`/`radius`/`ms(size)` escalados por `clamp(width/390, 0.85, 1.25)` (`src/theme/scale.ts`); grade de fotos adaptativa (3/5/7 colunas); zero dimensão estática de tela; controles intrínsecos via `theme.ms()`; caps de conteúdo `CONTENT_MAX_WIDTH` (640) nas telas de lista; retrato permanece travado (landscape fica para doc futuro). Complementa o D17 na dimensão "tamanho" sem tocar a regra "só escalas do tema" | ✔ Implementado 2026-10-07 (doc 17) |
| D19 | **IA 100% server-side** — nenhum modelo on-device no app (modelos móveis descartados por qualidade/custo no doc 05, 2026-10-08/09); o backend (servidor confiável, D11) processa as fotos que já armazena. Ollama/LM Studio do autor entram só em labels de cena — LLMs não produzem embeddings faciais | ✔ Decidido 2026-10-09 (doc 18) |
| D20 | **Rostos: container ML dedicado self-hosted** — `ml/` (FastAPI + ONNX Runtime + insightface buffalo_l: SCRFD detecção + ArcFace 512-d, modelos baked no build), stateless, atrás de `IFaceInferenceProvider` (modo embeddings v1; modo face-index para adaptadores de nuvem — Rekognition/Azure Face/Face++ não exportam embeddings); EP auto-detectado (rocm → cuda → cpu, imagem default CPU universal); crops e clustering no backend .NET | ✔ Decidido 2026-10-09 (doc 18) |
| D21 | **Labels de cena: cliente .NET para endpoint OpenAI-compatible** configurável por env (BaseUrl/Model/Key — Ollama `:11434/v1`, LM Studio `:1234/v1`, OpenAI, Gemini compat.); resultado vira `photo_labels` no backend, sincronizado ao app pelo contrato `asset_labels` (`source='cloud'`). Supersede o desenho anônimo/efêmero do 05B (doc 05 §5) no v1 servidor-confiável — o desenho do 05 permanece referência para o modo E2E futuro | ✔ Decidido 2026-10-09 (doc 18) |
| D22 | **pgvector** — imagem Postgres trocada por `pgvector/pgvector:pg17` (drop-in, mesmo volume), `CREATE EXTENSION vector`; embeddings faciais em `vector(512)` (+ HNSW opcional); também serve busca semântica (doc 05 §3) e quase-dedup visual no futuro | ✔ Decidido 2026-10-09 (doc 18) |

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
- Backup atual: tela `src/app/settings/backup.tsx` (estágio 03A — inventário,
  scan offline e upload em modo cloud); regras de pasta (04) e ZIP (06) chegam
  nas próximas fases.
- **Backend v1 implementado** (2026-08-18, repo `C:\dev\csharp\iPhotos`): .NET 10 +
  PostgreSQL 17 + worker de variantes; auth e-mail+senha+JWT, upload com dedup,
  thumb/preview/original, indexação EXIF, usage. Contrato completo para o front no
  doc `09-backend-api.md` (endpoints, formatos, base URL por ambiente e mapeamento
  para as seams: `account.ts`, `api-client.ts`, `cloud-photos-repository.ts`).
