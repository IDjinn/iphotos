# 09 — Backend API: contrato de integração app ↔ servidor

> **Status: ✅ backend implementado (2026-08-18)** — este doc é o contrato para
> conectar o front. Repo: `C:\dev\csharp\iPhotos` (.NET 10 + PostgreSQL + worker de
> variantes, 107 testes unitários/integração com Testcontainers).
> Fase 3 · Depende de: 01 (telas de login/registro), 02 (modo cloud) · Alimenta: 03A (upload/dedup), 07 (conta/uso)
> Objetivo: documentar **como o app consome o backend v1** — endpoints, auth, upload,
> variantes, erros e o mapeamento para as seams existentes do app.

## 1. O que existe (e o que mudou nas premissas)

- Backend próprio (D2 confirmado): **.NET 10 + PostgreSQL 17**, API (`iPhotos.Core`) +
  **worker separado** (`iPhotos.Worker`) que gera variantes e indexa EXIF via fila
  `variant_jobs` no banco. `docker compose up --build` sobe tudo (postgres + api +
  worker) com migrations aplicadas no startup.
- Modelo **servidor confiável estilo Immich** (decisão D11): o servidor vê as fotos
  para gerar thumb (320px) / preview (2048px) e indexar metadados (takenAt, câmera,
  GPS, dimensões). A premissa zero-knowledge do doc 03 fica para um modo futuro — a
  tabela `users` já reserva os campos E2E (`wrapped_master_key`, `kdf_salt`, `kdf_params`).
- Auth **e-mail + senha** (Argon2id no servidor) + JWT — D11 supersede a premissa
  OPAQUE do doc 03 §10 para o v1.
- Upload com **dedup por SHA-256 por conta** (mesmo algoritmo do inventário 03A),
  quota por usuário (default 15 GiB → HTTP 413), limite de upload 200 MB.
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
| `POST /api/photos` | Upload **multipart/form-data, campo `file`** (nome do arquivo preservado). → **201** `{ photo, duplicated: false }` ou **200** `{ photo, duplicated: true }` (mesmo SHA-256 já enviado por esta conta) |
| `GET /api/photos` | Listagem paginada com filtros: `from`, `to`, `fileName` (contains, case-insensitive), `camera`, `page` (≥1), `pageSize` (1–100, default 20) |
| `GET /api/photos/{id}` | Metadados completos + `variants[]` |
| `DELETE /api/photos/{id}` | **204** — hard delete v1 (tombstones/GC são futuro, doc 03 §8) |
| `GET /api/photos/{id}/files/{kind}` | `kind` = `original` \| `preview` \| `thumbnail` → stream (variantes em JPEG; original com mime original). Suporta Range. **404 se a variante ainda não foi gerada** |
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
  "sizeBytes": 2710,
  "width": 640,            // null até processar
  "height": 200,
  "takenAt": "2025-12-25T10:30:00+00:00",  // EXIF, UTC; null se não houver
  "cameraMake": "Google", "cameraModel": "Pixel 9",
  "gpsLatitude": -22.9, "gpsLongitude": -43.2,
  "state": "PendingProcessing",  // PendingProcessing|Processing|Ready|Failed
  "lastError": null,             // preenchido quando state=Failed
  "contentHash": "939298ea...",  // SHA-256 hex (igual ao do inventário 03A)
  "createdAt": "2026-08-18T19:18:11.56+00:00",
  "variants": [                   // preenchidas pelo worker
    { "kind": "Original", "blobPath": "...", "width": 640, "height": 200, "sizeBytes": 2710, "format": "jpeg" },
    { "kind": "Preview", "width": 640, "sizeBytes": 2693, "format": "jpeg", "...": "..." },
    { "kind": "Thumbnail", "width": 320, "height": 100, "sizeBytes": 1172, "format": "jpeg" }
  ]
}
```

**Ciclo do upload (async):** `201` com `state: "PendingProcessing"` → worker processa
(poll padrão 2 s) → `Ready` (metadados indexados + 3 variantes) ou `Failed`
(`lastError`). O app faz **poll** de `GET /api/photos/{id}` até `Ready|Failed`.
Variantes nunca upscale e respeitam orientação EXIF.

**Restrições do upload:** mime `image/jpeg` | `image/png` | `image/webp` (HEIC não —
converter no cliente com `expo-image-manipulator`); ≤ 200 MB; quota excedida → **413**.

### 3.3 Formato de erros e convenções

- Corpo de erro único: `{ "error": "mensagem" }` — 400 validação · 401 token/credencial ·
  404 não encontrado · 409 e-mail duplicado · 413 quota · 429 rate limit · 500 inesperado.
- Enums serializados como **strings** (`"Ready"`, `"Thumbnail"`, …).
- Todas as datas em **UTC ISO 8601** (offset `+00:00`).
- Ordenação da listagem: `takenAt DESC NULLS LAST`, depois `createdAt DESC`.

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
