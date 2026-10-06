# 09 — Backend API: contrato de integração app ↔ servidor

> **Status: ✅ backend implementado (2026-08-18)** — este doc é o contrato para
> conectar o front. Repo: `backend/` neste monorepo (antes em `C:\dev\csharp\iPhotos`; .NET 10 + PostgreSQL + worker de
> variantes, 107 testes unitários/integração com Testcontainers).
> Fase 3 · Depende de: 01 (telas de login/registro), 02 (modo cloud) · Alimenta: 03A (upload/dedup), 07 (conta/uso)
> Objetivo: documentar **como o app consome o backend v1** — endpoints, auth, upload,
> variantes, erros e o mapeamento para as seams existentes do app.

## 1. O que existe (e o que mudou nas premissas)

- Backend próprio (D2 confirmado): **.NET 10 + PostgreSQL 17**, API (`iPhotos.Core`) +
  **worker separado** (`iPhotos.Worker`). O upload multipart e a importação de zip geram
  as variantes (thumb 320px / preview 2048px) e indexam EXIF **sincronamente no
  upload** (os bytes já estão em memória) — a foto nasce `Ready`. O worker com a fila
  `variant_jobs` fica só para o fluxo de upload direto (presigned), em que os bytes não
  passam pela API. `docker compose up --build` sobe tudo (postgres + api +
  worker) com migrations aplicadas no startup.
- Modelo **servidor confiável estilo Immich** (decisão D11): o servidor vê as fotos
  para gerar thumb (320px) / preview (2048px) e indexar metadados (takenAt, câmera,
  GPS, dimensões). A premissa zero-knowledge do doc 03 fica para um modo futuro — a
  tabela `users` já reserva os campos E2E (`wrapped_master_key`, `kdf_salt`, `kdf_params`).
- Auth **e-mail + senha** (Argon2id no servidor) + JWT — D11 supersede a premissa
  OPAQUE do doc 03 §10 para o v1.
- Upload com **dedup por SHA-256 por conta** (mesmo algoritmo do inventário 03A),
  quota por usuário (default 15 GiB → HTTP 413). O limite por arquivo depende do
  **plano × qualidade de upload** (2026-10-06, §3.5): modos "original" rejeitam
  acima do cap; modos "storage saver" comprimem/transcodificam no worker.
- API em `http://localhost:5205`; OpenAPI em `/openapi/v1.json` (dev); health `/health`.

## 2. Base URL por ambiente

| Ambiente | Base URL |
|---|---|
| Android emulator | `http://10.0.2.2:5205` |
| iOS simulator | `http://localhost:5205` |
| Aparelho físico | `http://<LAN-IP>:5205` (ou `adb reverse tcp:5205 tcp:5205` → `http://localhost:5205`) |
| Produção | a definir (variável de ambiente) |

- Fonte da config no app: **exclusivamente** `EXPO_PUBLIC_API_URL` (`.env`), lida pelo
  `app.config.ts` (validação em build/start) e pelo `api-client.ts` (guarda em runtime).
  Não existe endpoint default — sem env válida o app falha com erro explícito. Nunca
  hardcode em componentes.

### CORS (2026-10-03)

O API aplica a policy `web` (`app.UseCors` antes do rate limiter — preflight nunca é
throttled). Origens permitidas configuráveis por `Cors:AllowedOrigins` (array; default
vazio = nenhuma origem de browser tem acesso; clientes nativos não são afetados por
CORS). O compose define `http://localhost:3000` (web dev) e `http://127.0.0.1:3210`
(desktop Electron) — doc 14/D16.

## 3. Contrato da API

### 3.1 Auth — `/api/auth` (rate limit: 20 req/min por IP → 429)

| Endpoint | Body | Sucesso | Erros típicos |
|---|---|---|---|
| `POST /api/auth/register` | `{ "email", "password", "displayName?" }` | **201** `{ userId, email, displayName, tokens }` | 409 e-mail duplicado · 400 senha < 8 chars / e-mail inválido |
| `POST /api/auth/login` | `{ "email", "password" }` | **200** tokens no nível raiz (`{ accessToken, refreshToken, refreshTokenExpiresAt }`, sem wrapper `tokens`; sem `userId`/`email`) | 401 credenciais inválidas |
| `POST /api/auth/refresh` | `{ "refreshToken" }` | **200** tokens no nível raiz (rotaciona) | 401 token inválido/expirado/revogado |
| `POST /api/auth/logout` | `{ "refreshToken" }` + Bearer | **204** revoga o refresh | 401 sem access token |

> **Divergência verificada ao vivo (2026-08-18):** apenas o `register` aninha os
> tokens em `{ tokens }`; `login` e `refresh` os devolvem flat. O api-client do app
> normaliza os dois formatos (`extractTokens`).

```jsonc
// tokens (AuthTokens):
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",   // JWT HS256, 15 min, claims sub/email/jti
  "refreshToken": "base64-256-bit",           // 30 dias, ROTATIVO
  "refreshTokenExpiresAt": "2026-09-17T19:18:11.56+00:00"
}
```

- Refresh é rotativo: cada `refresh` revoga o token usado. **Reuso de refresh já
  revogado → 401** (tratar como sessão comprometida → deslogar).

### 3.2 Fotos — `/api/photos` (todos exigem `Authorization: Bearer <accessToken>`)

| Endpoint | Descrição |
|---|---|
| `POST /api/photos` | Upload **multipart/form-data, campo `file`** (nome do arquivo preservado). EXIF + variantes gerados inline: → **201** `{ photo, duplicated: false }` já em `state: "Ready"` com as 3 variantes, ou **200** `{ photo, duplicated: true }` (mesmo SHA-256 já enviado por esta conta). **400** se os bytes não forem uma imagem decodificável. Fallback do fluxo direto |
| `POST /api/photos/upload-ticket` | Upload **direto ao storage**: body JSON `{ fileName, contentType, sizeBytes, contentHash }`. Valida mime, dedup (hash) e quota **antes** dos bytes existirem; cria a foto em `state: "PendingUpload"` (reserva de quota) e → **201** `{ photo, duplicated: false, uploadUrl, expiresAt }` (PUT presigned, com expiração escalada pelo tamanho: mínimo 15 min, `Upload:AssumedUploadMbps` como throughput assumido, teto `Upload:UploadUrlMaxExpiryHours`) ou **200** `{ photo, duplicated: true }` sem URL. Arquivos ≥ `Upload:DirectMultipartThresholdBytes` (default 5 GiB, o cap físico do PUT único no S3) voltam com sessão multipart: `{ photo, duplicated: false, multipartUploadId, partSizeBytes }` (partes de 32 MiB, sem `uploadUrl`). **501** quando o storage configurado não presigna (ex.: filesystem) → cliente cai no multipart |
| `POST /api/photos/{id}/complete` | Confirma o PUT presigned: verifica existência do blob, move `PendingUpload → PendingProcessing`, enfileira o processamento → **200** PhotoDto. **404** se os bytes ainda não chegaram (cliente pode reenviar e completar depois) |
| `POST /api/photos/{id}/part-url` | Presigna UMA parte da sessão multipart direta: body `{ partNumber }` (1–10000) → **200** `{ url, partNumber, expiresAt }`. O cliente faz PUT presigned de cada parte direto ao storage. **501** quando o storage não presigna multipart |
| `POST /api/photos/{id}/abort` | Cancela o upload direto: aborta a sessão multipart (partes descartadas no S3), remove blob parcial e a row → **204** |
| `GET /api/photos` | Listagem paginada com filtros: `from`, `to`, `fileName` (contains, case-insensitive), `camera`, `mediaType` (`photo`\|`video`), `sortBy` (`takenAt`\|`createdAt`, default `takenAt`), `order` (`asc`\|`desc`, default `desc`), `page` (≥1), `pageSize` (1–100, default 20) |
| `GET /api/photos/{id}` | Metadados completos + `variants[]` |
| `DELETE /api/photos/{id}` | **204** — hard delete v1 (tombstones/GC são futuro, doc 03 §8) |
| `GET /api/photos/{id}/files/{kind}` | `kind` = `original` \| `preview` \| `thumbnail` → stream (variantes em JPEG; original com mime original). Suporta Range. **404 se a variante ainda não foi gerada**. Cacheável: `Cache-Control: private, max-age=31536000, immutable` + `ETag` (`{contentHash}-{kind}`) — `If-None-Match` correspondente responde **304** sem ler o blob (as blobs são imutáveis; grid/viewer não repetem o download) |
| `GET /api/usage` | `{ usedBytes, quotaBytes, photoCount, variantCount }` — alimenta a barra de uso do doc 07 |
| `GET /health` | `{ status, utcNow }` — sem auth, para o app checar conectividade |

```jsonc
// PagedResult (GET /api/photos):
{ "items": [ /* PhotoDto */ ], "page": 1, "pageSize": 20, "totalCount": 412, "totalPages": 21 }

// PhotoDto (camelCase):
{
  "id": "56bae659-...",
  "ownerId": "75c9749c-...",
  "fileName": "vacation.jpg",
  "mimeType": "image/jpeg",
  "mediaType": "Photo",          // Photo|Video (2026-10-05, doc 15)
  "sizeBytes": 2710,
  "width": 640,            // EXIF/ffprobe; null só no fluxo direto antes do worker processar
  "height": 200,
  "durationSeconds": null,       // vídeos apenas (2026-10-05)
  "takenAt": "2025-12-25T10:30:00+00:00",  // EXIF/ffprobe ou seed de import (doc §3.4); UTC; null se não houver
  "cameraMake": "Google", "cameraModel": "Pixel 9",
  "gpsLatitude": -22.9, "gpsLongitude": -43.2,
  "title": null,                 // seed de import (Takeout sidecars), 2026-10-04
  "description": null,           // idem (legenda do Google Fotos)
  "state": "Ready",              // PendingUpload|PendingProcessing|Processing|Ready|Failed
  "lastError": null,             // preenchido quando state=Failed
  "contentHash": "939298ea...",  // SHA-256 hex (igual ao do inventário 03A)
  "createdAt": "2026-08-18T19:18:11.56+00:00",
  "variants": [                   // multipart/zip: já preenchidas na resposta do upload; fluxo direto: preenchidas pelo worker
    { "kind": "Original", "blobPath": "...", "width": 640, "height": 200, "sizeBytes": 2710, "format": "jpeg" },
    { "kind": "Preview", "width": 640, "sizeBytes": 2693, "format": "jpeg", "...": "..." },
    { "kind": "Thumbnail", "width": 320, "height": 100, "sizeBytes": 1172, "format": "jpeg" }
  ]
}
// Vídeos: Original = arquivo original (format mp4/mov/webm/avi/3gp, nunca
// transcodado); Preview/Thumbnail = poster JPEG extraído pelo ffmpeg (doc 15).
```

**Ciclo do upload:** multipart/zip é **síncrono** — `201` já traz `state: "Ready"`,
metadados indexados e as 3 variantes; o app não precisa fazer poll (só de defesa,
tratar `PendingProcessing`/`Processing` como "aguarde"). **Fluxo direto continua
async**: após `complete`, o worker processa (poll padrão 0,5 s) até `Ready|Failed`.
Variantes nunca upscale e respeitam orientação EXIF.

**Fluxo direto (preferido quando o app tem o hash):** `upload-ticket` → **PUT presigned
direto ao S3** (bytes não passam pela API/túnel; sem o cap de ~100 MB do Cloudflare) →
`complete` → mesmo ciclo async acima. O hash do ticket é o mesmo SHA-256 do inventário
03A (confiança no cliente, decisão D11); órfãos (`PendingUpload` sem `complete`) são
varridos pelo worker após `OrphanSweep:MaxAgeHours` (default 24 h).

**Restrições do upload:** mime `image/jpeg` | `image/png` | `image/webp` (HEIC não —
converter no cliente com `expo-image-manipulator`) e, desde 2026-10-05 (doc 15),
`video/mp4` | `video/quicktime` | `video/webm` | `video/x-msvideo` | `video/3gpp`;
quota excedida → **413**. O limite por arquivo vem da matriz plano × qualidade
(§3.5): em modos "original" arquivos acima do cap → **400** (no multipart e no
ticket); em modos "storage saver" o upload é aceito e o worker comprime depois —
o teto real é a quota.

**Listagem:** além dos filtros `from/to/fileName/camera`, `GET /api/photos` aceita
`?mediaType=photo|video` (case-insensitive; valor inválido → 400) e os parâmetros de
ordenação `?sortBy=takenAt|createdAt` (default `takenAt`) com `?order=asc|desc`
(default `desc`) — valor inválido → 400. Com `sortBy=takenAt`, fotos sem `taken_at`
vão para o fim no `desc` e para o começo no `asc`, com fallback `created_at`.

### 3.3 Formato de erros e convenções

- Corpo de erro único: `{ "error": "mensagem" }` — 400 validação · 401 token/credencial ·
  404 não encontrado · 409 e-mail duplicado · 413 quota · 429 rate limit · 500 inesperado.
- Enums serializados como **strings** (`"Ready"`, `"Thumbnail"`, …).
- Todas as datas em **UTC ISO 8601** (offset `+00:00`).
- Ordenação da listagem: `takenAt DESC NULLS LAST`, depois `createdAt DESC`.

### 3.4 Importação por ZIP — `/api/imports` (todos exigem Bearer)

> Implementado 2026-10-02 (server-side). O zip (ex.: Google Takeout) é enviado por
> upload multipart, o servidor extrai e ingera as fotos pelo mesmo pipeline de
> `POST /api/photos` (dedupe por hash, variantes, quota). O dispositivo nunca abre
> o arquivo. Regras de conteúdo e limites: doc 06 (revisão server-side).

**`POST /api/imports/zip`** — multipart, campo `file` (obrigatório ser um ZIP real:
validação por magic bytes `PK\x03\x04`). Query opcional `?fileName=<nome>` — o nome
real do arquivo (uploaders nativos podem enviar um filename opaco no multipart).
Payload máximo: `ZipImport:MaxZipBytes` (default **100 GiB** desde 2026-10-03; excedido → **413**).
Resposta **202**: `{ "jobId": "<guid>" }`. O processamento é assíncrono (worker).

> **Hops de payload grandes (2026-10-03)** — o zip atravessa dois saltos de streaming
> até o storage: browser → API (override por requisição do limite do Kestrel em
> `ImportEndpoints`) e API → storage host (`PUT /api/objects/{owner}/imports/{jobId}.zip`).
> Para isso funcionar acima de 200 MB: o storage host aceita até `Storage:MaxBodyBytes`
> (default **110 GiB**, acima do teto de import); `HttpBlobStorage` não impõe timeout
> total a PUT/GET de payload (ficam limitados ao `CancellationToken` — abort do browser
> ou shutdown do worker; `StorageService:TimeoutSeconds` vale só para head/delete/presign);
> e `S3ObjectStore` usa upload multipart (partes de 32 MB) acima de 128 MB, contornando
> o limite de 5 GB do PutObject único — um objeto de 100 GiB ≈ 3200 partes (limite S3:
> 10 000). O SDK S3 roda sem timeout por request (default 100 s do SDK foi removido).

> **Staging local (2026-10-04b)** — o zip bruto **não vai mais ao provider de blobs
> principal (S3)**: o endpoint grava o arquivo em `StorageService:StagingProvider`
> (compose: provider `filesystem` do storage host, volume `storage-data`) via o
> seletor de provider por requisição (`?provider=`) e responde **202 assim que o
> zip está staged em disco local**. Antes, o 202 esperava o PUT completo ao S3 —
> dezenas de minutos para uma parte multi-GB, com o cliente preso em "100%". O
> worker lê (e apaga) o zip do mesmo provider de staging; só as fotos processadas
> sobem ao provider principal. DI: `IBlobStorage` com chave `"staging"` no endpoint
> e no `ZipImportHandler`; sem `StagingProvider` (ou em modo filesystem), o staging
> aliasa o backend principal (retrocompatível). O parágrafo acima segue válido para
> os hops de streaming (browser → API → storage host); o multipart S3 aplica-se
> agora apenas às fotos.

> **Ingresso (revisão 2026-10-03)** — o túnel Cloudflare (`api.lucas-romero.com`)
> limita o corpo de requisição a 100 MB, então uploads grandes (zip multi-GB, fotos)
> devem usar o endereço LAN do servidor (`http://<ip-local>:5205`, porta exposta no
> compose). Um experimento de upload chunked via túnel foi implementado e revertido
> no mesmo dia — não funcionou como esperado.

**`GET /api/imports`** (2026-10-05) — lista os jobs de import mais recentes do próprio
usuário, **mais novos primeiro** (teto de 50; sem paginação — alimenta a restauração da
fila no painel web após reload). Mesmo JSON de `GET /api/imports/{id}`, como array.
Outro owner nunca aparece na lista (escopo por owner no repositório).

**`GET /api/imports/{id}`** — status do job do próprio usuário (outro owner → **404**):

```json
{
  "id": "…", "state": "Queued|Processing|Done|Failed",
  "fileName": "takeout.zip", "sizeBytes": 123,
  "totalEntries": 300, "processedEntries": 180,
  "imported": 150, "videosImported": 40, "duplicated": 20, "ignored": 10,
  "videosIgnored": 0, "failed": 0,
  "error": null, "createdAt": "…", "completedAt": null
}
```

- `totalEntries`/contadores preenchem conforme o worker processa; poll a cada ~3 s
  até `Done|Failed`. `videosImported` (2026-10-05) conta vídeos importados
  (subconjunto de `imported`). `videosIgnored` (2026-10-04) é legado do período em
  que video hosting não era suportado — desde 2026-10-05 permanece em 0.
- Mídia suportada no zip: fotos `jpg/jpeg/png/webp/heic/heif` (HEIC/HEIF é
  transcrito para JPEG no servidor, preservando EXIF) e **vídeos
  `mp4/m4v/mov/webm/avi/3gp`** (doc 15: poster + duração via ffmpeg). Sidecars
  restantes (`json/html/csv`), `__MACOSX/`, ocultos, `Thumbs.db` e zips aninhados
  são **ignorados** e contados. Vídeo com decodificação falha conta como
  `failed`, sem abortar o job.

> **Metadados Google Takeout (2026-10-04)** — o import semeia metadados do catálogo
> antes do processamento de variantes: sidecar JSON ao lado da mídia, nos dois
> layouts (`<arquivo>.json` legado e `<arquivo>.supplemental-metadata.json` atual,
> casamento por caminho no mesmo diretório, case-insensitive) fornece
> `photoTakenTime`→`takenAt` (fallback `creationTime`), `geoDataExif`/`geoData`→GPS
> (`0,0` = sem local), `title` e `description`; pastas `YYYY-MM-DD` no caminho
> preenchem só um `takenAt` ausente (pastas só-ano, ex. "Fotos de 2025", **não**
> semeiam data — uma data errada impediria o EXIF de preencher depois). Sidecar
> corrompido não falha a foto. O EXIF do processamento de variantes preenche apenas
> lacunas (`MarkReady` fill-if-missing): metadado semeado é autoritativo.
> `photos.title` (500) e `photos.description` (2000) entram no contrato de foto
> (§3.2) e são exibidos nos viewers.

> **Fila do worker — LISTEN/NOTIFY (2026-10-04)** — triggers `AFTER INSERT` em
> `variant_jobs`/`zip_import_jobs` fazem `pg_notify('iphotos_jobs_queued', …)` e o
> worker escuta o canal (Npgsql), acordando na hora do enqueue em vez de fazer
> polling quente a cada 0,5 s. NOTIFY é fire-and-forget: o worker mantém um fallback
> ocioso de 30 s (`Worker:IdlePollSeconds`) para notificações perdidas
> (reconexões); jobs enfileirados com o worker fora do ar são pegos na primeira
> iteração. O claim continua `FOR UPDATE SKIP LOCKED`; `Worker:PollIntervalSeconds`
> virou apenas o intervalo de retry após erro.
- Zip criptografado → job `Failed` com `"Protected/encrypted ZIPs are not supported."`;
  quota estourada → `Failed` com mensagem clara. Falhas transitórias reenfileiram
  (até 3 tentativas) — reprocessar é seguro porque o dedupe vira `duplicated`.
- Falha no meio do caminho não reaproveita: cada job é independente e idempotente
  (reenviar o mesmo zip → 100% `duplicated`).
- **Nota de rede**: túneis Cloudflare (free/quick) limitam upload a ~100 MB — zips
  grandes exigem acesso direto/LAN à API. O blob do zip é descartado do storage ao
  fim do job.

### 3.5 Preferências da conta — `/api/me/preferences` (2026-10-06, todos exigem Bearer)

> Qualidade de upload no estilo Google Fotos: a escolha vive **na conta**
> (`users.upload_quality`), vale para todos os devices e para o import de ZIP, e é
> aplicada **no servidor** — o worker comprime/transcodifica, o cliente nunca o faz.

| Modo | Fotos | Vídeos | Acima do cap |
|---|---|---|---|
| free + `original` | até 64 MB | até 1 GB | **400** |
| free + `storageSaver` | >16 MB → comprime a ≤16 MB | >1 GB → transcodifica a ≤1 GB **+ 1080p** | comprime no worker |
| pago + `original` | até 500 MB | até 30 GB | **400** |
| pago + `storageSaver` | >250 MB → comprime a ≤250 MB | >10 GB 1080p → transcodifica | comprime no worker |

- Default por plano (migration): free → `storageSaver`, pago → `original` — preserva
  o comportamento anterior à escolha. A preferência sobrevive a upgrade/downgrade de
  plano (os caps resolvem dinamicamente do plano atual).
- A compressão storage-saver roda no **worker** (passo anterior às variantes, dentro
  do job de `variant_jobs`): o resultado comprimido vira o original armazenado
  (blob, hash, tamanho e mime atualizados — imagens viram JPEG, vídeos MP4) e os
  bytes enviados são descartados, exatamente como a antiga compressão in-flight do
  plano free. O rewrite é **one-way** (não há como restaurar o original descartado).
- Mismatch ("colisão") acionável = foto `Ready` com `stored_quality = original`
  acima do cap saver do modo atual. No modo `original` o mismatch acionável é
  sempre 0 (bytes comprimidos são finais).
- `Upload:SaverVideoMaxHeight` (default 1080) limita a altura dos vídeos
  transcodificados em modo saver (o CRF ladder continua decidindo a qualidade).

| Endpoint | Body | Sucesso | Erros típicos |
|---|---|---|---|
| `GET /api/me/preferences` | — | **200** `{ uploadQuality, mismatchedPhotoCount, imageCapBytes, videoCapBytes }` (caps efetivos do plano × qualidade atual) | 404 sem token válido |
| `PUT /api/me/preferences` | `{ "uploadQuality": "original"\|"storageSaver", "applyToExisting": false }` | **200** mesmo DTO já refletindo a nova qualidade. Com `applyToExisting: true`, reenfileira o job de variantes de cada mismatch (rewrite em massa pelo worker) | **400** qualidade desconhecida |

> Fluxo do cliente (web e app): `PUT` com `applyToExisting: false` → o DTO traz
> `mismatchedPhotoCount` da nova qualidade → se > 0, confirmar com o usuário
> ("atualizar existentes" vs "manter como estão") → `PUT` repetido com
> `applyToExisting: true`. Idempotente: repetir o PUT não duplica reescritas além
> dos jobs já enfileirados (fotos `Ready` ainda fora do conform).

## 4. Mapeamento para as seams do app

| Seam existente | Como conecta |
|---|---|
| `src/stores/account.ts` | Após login/registro: guarda `userId`, `email`, tokens; `setMode('cloud')`; `signOut()` chama `POST /api/auth/logout` antes de voltar a `offline` |
| Rotas `(public)/login\|register` (doc 01) | Trocam o stub pela chamada real (endpoints §3.1) — UI não muda |
| Novo `src/data/api-client.ts` | Cliente **axios** com baseURL estrita de `EXPO_PUBLIC_API_URL` (erro se não setada), injeta Bearer, **auto-refresh single-flight** em 401 (refresh → retry 1x → `signOut()`), parse de `{ error }`, tipos das respostas |
| Tokens | **SecureStore** (nunca AsyncStorage); access em memória; refresh no SecureStore |
| Novo `src/data/cloud-photos-repository.ts` | upload/list/get/delete/usage sobre o api-client; o motor de backup (03) usa este repositório no v1 no lugar do `cloudStorageProvider` (não há criptografia de cliente — D11) |
| Upload com progresso | `expo-file-system.uploadAsync` (multipart + progress callback) — mantém a fila/retomada do 03A |
| Grid remoto / viewer | `expo-image` (ou RN `Image`) aceitam headers: `source={{ uri, headers: { Authorization } }}` — **as URLs de arquivo NÃO são públicas**. Grid → `/files/thumbnail`; viewer → `/files/preview`; download → `/files/original` |
| Inventário 03A | `content_hash` do servidor = mesmo SHA-256 do inventário local → estado `uploaded` pode casar por hash sem re-upload (dedup server-side devolve `duplicated: true`) |
| Restore (03D v1) | `GET /api/photos` (paginação) → por item `GET .../files/original` → `MediaLibrary.saveToLibraryAsync` em lotes → registra hash no inventário |

## 5. Tarefas (uma sessão cada)

> **Status 2026-08-18: integração front implementada.** `api-client.ts` (Bearer +
> refresh single-flight, tokens: access em memória / refresh em SecureStore),
> login/registro reais com restauração de sessão no boot, `cloud-photos-repository.ts`,
> motor de backup (inventário 03A com SHA-256 + dedup server-side + HEIC→JPEG no
> cliente + poll `Ready|Failed`), timeline remota em `/cloud-photos` (thumbs/preview
> autenticados, download do original, delete), `/settings/account` com `GET /api/usage`
> e logout com revogação, erros 413/429/offline mapeados. Base URL exclusivamente via
> `EXPO_PUBLIC_API_URL` (`.env`) — sem default; build/start falham se não estiver setada.

- [x] 9.1 `api-client.ts` + tokens em SecureStore + interceptor 401 com single-flight
- [x] 9.2 Login/registro reais nas rotas `(public)` (troca os stubs do doc 01; conectar `account.ts`)
- [x] 9.3 Upload no motor de backup: fila 03A → `uploadAsync` com progresso → poll até `Ready|Failed` → estado no inventário
- [x] 9.4 Restore/timeline remota: grid com thumbs autenticadas + viewer com `preview`/`original`
- [x] 9.5 `/settings/account` real: `GET /api/usage` (barra de uso), logout com revogação
- [x] 9.6 Tratamento fino de erros: 413 quota (mensagem + CTA), 429 (backoff), offline

## 6. Critérios de aceite

- Login/registro persistem entre restarts do app; refresh em 401 é automático e
  imperceptível (sem logout até o refresh expirar).
- Upload de foto nova → 201 → vira `Ready` com dimensões/takenAt/câmera indexados;
  re-upload do mesmo arquivo → `duplicated: true` sem novo blob.
- Grid mostra thumbs autenticadas; viewer carrega `preview` e permite baixar `original`
  byte-a-byte idêntico ao enviado.
- Quota excedida → mensagem clara (413); rajada de logins → 429 tratado com backoff.
- Nada disso é acessível no modo offline (matriz de modos do doc 02 segue válida).

## 7. Follow-ups do backend (não bloqueiam o front)

- Reset/troca de senha (hoje sem recuperação — manter o aviso do doc 01 até existir).
- Favoritos/álbuns sync, labels/classificação sync (05), tombstones/GC (03 §8),
  HEIC server-side, S3/MinIO no lugar do filesystem, multi-device, galeria web.
