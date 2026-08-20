# 03 — Motor de backup com criptografia ponta a ponta (E2E)

> **Atualização 2026-08-18 (D11): superseded para o v1.** O backend implementado
> (doc 09) é um **servidor confiável**: upload em texto claro com dedup SHA-256,
> variantes geradas no servidor e EXIF indexado no PostgreSQL — **sem criptografia
> de cliente**. O estágio **03A (inventário local) continua 100% válido e é o próximo
> passo** (o `content_hash` SHA-256 casa exatamente com o dedup do backend); o upload
> da fase 3 usa `cloud-photos-repository` (doc 09 §4) no lugar de `StorageProvider` +
> cifragem. Os estágios B–F (criptografia, chave de recuperação, GC/tombstones com
> grace period) permanecem planejados para o **modo E2E futuro** — expansão
> detalhada no **doc 11** (`11-e2e-zero-knowledge.md`); a tabela `users`
> do backend já reserva os campos (`wrapped_master_key`, `kdf_salt`, `kdf_params`).
>
> Fase 2 (estágio A, local) → [03B–F: futuro, modo E2E] · Depende de: 02 · Alimenta: 04, 05B, 06, 07, 09
> Objetivo: planejar **como os backups das imagens serão feitos**: inventário local
> com hashes, fila com retomada, criptografia do lado do cliente (o servidor nunca
> vê conteúdo), upload deduplicado, restore em novo dispositivo e limpeza de exclusões.

## 1. Contexto atual (atualizado 2026-08-19)

- **Motor v1 simplificado já existe** (entregue junto com a integração do doc 09,
  2026-08-18): `src/data/backup-engine.ts` — upload sequencial com progresso via
  `expo-file-system.uploadAsync`, dedup consultando os hashes SHA-256 que o backend
  já conhece (`GET /api/photos`), conversão HEIC→JPEG, poll do estado até
  `Ready|Failed`, skip de itens da Pasta Segura, tratamento de 413 (quota), 429
  (rate-limit) e offline. Estado na store `src/stores/backup.ts`.
- **Limitação do v1**: não há inventário persistido — a lista de itens já enviados
  vive como ids na tabela `kv` (zustand persist), sem `content_hash`, sem cache
  `size+mtime` e sem estados por item. **O estágio 03A abaixo formaliza isso** na
  tabela `backup_inventory` e o motor passa a ler/escrever nela (migração dos ids
  já enviados → `state='uploaded'`). O `content_hash` SHA-256 calculado no cliente
  casa exatamente com o dedup por conta do backend (doc 09 §4), eliminando a
  listagem completa para dedup no v2.
- Fonte local de mídia: `src/data/media-repository.ts` (consultas paginadas
  newest-first, listener de mudanças da biblioteca, `listDeviceFolders()` e
  `forEachFolderAsset()` — já usados pelo indexer de labels) sobre
  `expo-media-library/legacy`.
- DB: `src/data/db.ts` — SQLite com migrações por `PRAGMA user_version`
  (nova tabela = nova migração).
- Crypto disponível: `react-native-quick-crypto` (AES-256-GCM/HKDF nativos, já
  usados no cofre da Pasta Segura — doc 08/D6); `expo-crypto` (digests SHA-256);
  `expo-secure-store` para segredos do dispositivo.
- Backend v1 (D11, servidor confiável): upload em texto claro com dedup SHA-256
  por conta, variantes geradas no servidor, EXIF indexado — **sem criptografia de
  cliente**. Os estágios B–F abaixo permanecem para o **modo E2E futuro**
  (detalhados no doc 11).

## 2. Visão geral do pipeline

```
Scan incremental (media-repository)
        │
        ▼
Regras de pastas (doc 04) ── excluídas marcam state='excluded'
        │
        ▼
Inventário (backup_inventory) ── hash SHA-256 por asset (cache por size+mtime)
        │
        ▼
[modo cloud] Derivar FileKey → cifrar em chunks → PUT via StorageProvider
        │                          │
        ▼                          └── [opt-in] classificação cloud anônima (doc 05B)
Índice cifrado (metadados) → PUT index.enc
        │
        ▼
Estado 'uploaded' + estatísticas p/ UI (doc 07)
```

Princípios: **o acervo local é a fonte de verdade**; o backup é uma projeção cifrada.
Sem modo "cloud-only". Toda operação é resumível (app pode morrer no meio).

## 3. Inventário local (estágio 03A — não requer rede nem conta)

### 3.1 Tabela (nova migração em `db.ts`)

```sql
CREATE TABLE backup_inventory (
  asset_id    TEXT PRIMARY KEY,   -- id do MediaStore
  content_hash TEXT,              -- SHA-256 hex (null até hashear)
  size_bytes  INTEGER NOT NULL,
  mtime_ms    INTEGER NOT NULL,
  folder      TEXT,               -- pasta/bucket p/ regras (doc 04)
  state       TEXT NOT NULL DEFAULT 'pending',
    -- pending | hashing | queued | uploading | uploaded | failed | excluded
  blob_key    TEXT,               -- derivado do hash (§6.4), após upload
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  uploaded_at INTEGER
);
CREATE INDEX idx_inventory_state ON backup_inventory(state);
CREATE INDEX idx_inventory_hash  ON backup_inventory(content_hash);
```

### 3.2 Scan incremental

- `onLibraryChange` (listener existente) + scan completo na primeira execução e ao
  abrir `settings/backup` (doc 07).
- Novo asset → `pending`. Asset que sumiu → tombstone (§8). `size+mtime` iguais →
  reutiliza `content_hash` (não re-hashea).
- Hashing em lote (ex.: 20 assets por vez) com prioridade: novos > mais recentes >
  resto; pausável; roda em JS thread via worklets ou em idle (medir; [ABERTO]).

### 3.3 Deduplicação

- `content_hash` é a identidade do conteúdo: dois assets idênticos (ex.: mesma foto
  em pastas diferentes) = 1 blob remoto. No upload, `head(blobKey)` antes de subir;
  existindo, apenas marca `uploaded`.

## 4. Máquina de estados da fila

| De → Para | Evento | Regra |
|---|---|---|
| pending → hashing | worker pega o item | 1 hashing por vez |
| hashing → queued | hash pronto (modo cloud) | — |
| hashing → excluded | regra de pasta excluiu (doc 04) | limpa hash se órfão |
| queued → uploading | slot de upload livre | 1 upload por vez (prefetch do próximo hash) |
| uploading → uploaded | PUT + index OK | grava `blob_key`, `uploaded_at` |
| uploading → queued | falha transitória (rede) | backoff exponencial 30s→1m→5m→30m, máx 10 tentativas |
| queued/uploading → failed | esgotou tentativas | segue a fila; re-tentativa manual ou diária |
| failed → queued | retry manual / novo ciclo | zera `attempts` |
| uploaded → pending | arquivo mudou (novo hash) | re-upload como novo blob; antigo vira tombstone se sem referências |

- Executor: `src/data/backup-engine.ts` (sem UI), estado exposto via
  `src/stores/backup.ts` (zustand) para telas e notificação.
- Condições para rodar (persistidas, editáveis em doc 07): `wifiOnly` (default **on**),
  `chargingOnly` (default off), bateria > 20% [ABERTO].
- Continuidade Android: avaliar foreground service durante upload ativo
  (`expo-foreground-actions` ou módulo nativo) — [ABERTO, Fase 3].

## 5. Formato dos arquivos e chunking

- Todo asset é cifrado/uploadado **em chunks de 16 MB** (fotos viram 1 chunk),
  permitindo retomada por chunk e multipart no S3.
- Envelope do blob (binário concatenado):

```
blob   := header | chunk+
header := magic "IPHB1" (5B) | version u8 | chunkCount u32
chunk  := magic "IPHC1" (5B) | seq u32 | nonce 24B | ciphertext | tag 16B
```

- Cada chunk cifrado com AEAD independente (XChaCha20-Poly1305 ou AES-256-GCM,
  §6.3). AAD do chunk = `blobKey | seq` (liga o chunk ao blob e à posição).
- Upload S3: `CreateMultipartUpload` → `UploadPart` por chunk → `CompleteMultipartUpload`.
  ETags por parte persistidas em `backup_inventory` (colunas `parts_json`) para
  retomar sem re-subir partes concluídas.
- Download/restore lê chunk a chunk, decifra e valida tags antes de gravar.

## 6. Criptografia E2E (estágio 03B)

### 6.1 Hierarquia de chaves

```
MasterKey (32B aleatória, gerada no registro, única por conta)
 ├── NamingKey  = HKDF-SHA256(MasterKey, info="naming")   → deriva blob keys
 ├── IndexKey   = HKDF-SHA256(MasterKey, info="index")    → cifra metadados
 └── FileKey(b) = HKDF-SHA256(MasterKey, info="file", ctx=blobId) → cifra chunks do blob b
       ChunkKey(b,n) = HKDF-SHA256(FileKey(b), info="chunk", ctx=n)
```

- Nenhuma chave é persistida em texto claro no servidor; o servidor só guarda o
  `WrappedMasterKey` (§6.2).
- No dispositivo, a MasterKey fica no `expo-secure-store` (evita re-derivar a senha
  a cada abertura). Opcional: protegê-la por biometria (reusar padrões da pasta
  trancada, `src/stores/locked-session.ts`).

### 6.2 Wrap da MasterKey pela senha

- No registro: `KEK = Argon2id(password, salt16B)`; servidor recebe
  `WrappedMasterKey = AEAD(MasterKey, KEK)` + `salt` + `Argon2 params`.
- No login: baixa `WrappedMasterKey` + `salt`, deriva `KEK` **localmente** e abre a
  MasterKey. A senha nunca é enviada (registro/login usam OPAQUE ou prova de posse
  da MasterKey — §10 auth).
- Troca de senha: des-wrap com a antiga, re-wrap com a nova (doc 07 §segurança).
- **Chave de recuperação** (recomendação D3, [ABERTO]): gerada no registro
  (ex.: 48 chars base32), `RecoveryWrap = AEAD(MasterKey, Argon2id(recoveryKey))`
  armazenado ao lado; fluxo "esqueci a senha" usa a chave de recuperação para
  re-wrap com a nova senha. Sem senha e sem chave = dados irrecuperáveis (copy
  honesta já no `/register`, doc 01).

### 6.3 Algoritmos e biblioteca (decisão D6)

- Algoritmos: **XChaCha20-Poly1305** (nonce 24B, é o default do libsodium) ou
  AES-256-GCM. Recomendação: XChaCha20-Poly1305.
- Biblioteca (app já faz dev build próprio — `scripts/build-wsl.sh`, Docker):
  - **Recomendado:** `react-native-libsodium` (ou `sodium-react-native`) — AEAD,
    Argon2id, HKDF, tudo nativo e auditado.
  - Alternativa: `react-native-quick-crypto` (AES-GCM/HKDF nativos; Argon2 exige
    lib extra ou PBKDF2 com iterações altas).
  - Pura-JS (`libsodium-wrappers`): descartada para arquivos (lenta para vídeos 4K);
    aceitável só como fallback de teste em Expo Go.
- `expo-crypto.digestStringAsync` (SHA-256) serve para o inventário (§3).
- Implementar como módulo único `src/data/crypto.ts` (API: `deriveKeys`,
  `encryptStream`, `decryptChunk`, `wrapMaster`, `unwrapMaster`) com **testes de
  round-trip** antes de qualquer rede.

### 6.4 Nomeação de blobs (sem vazar conteúdo)

- `blobKey = base64url( HMAC-SHA256(NamingKey, contentHash) )`
- Estável → dedup entre dispositivos da mesma conta.
- Pseudônimo → o servidor não pode confirmar "esta conta tem a foto X" por dicionário
  de hashes conhecidos (o HMAC usa chave secreta por conta).
- Nomes de arquivos, pastas e datas ficam **apenas no índice cifrado** (§7).

## 7. Índice de metadados (cifrado)

- Por item (JSON, cifrado com `IndexKey`): `{ assetId, contentHash, filename,
  folder, createdAt, durationMs, mediaType, widthPx, heightPx, exifSubset? }`.
  Fase 5 acrescenta `labels`, `embedding` produzidos pela classificação (doc 05).
- Consolidado: um documento `index.enc` (JSON/array cifrado, versionado com
  `generation` + `updatedAt`) enviado ao servidor via `PUT /index`. O servidor só
  guarda o binário e o número da geração (para detecção de conflito multi-dispositivo).
- Conflitos (dois dispositivos alteram): resolução por item por `contentHash`
  (união; exclusões perdem para inclusões dentro da mesma geração). Multi-dispositivo
  completo é [ABERTO — Fase 3+]; Fase 3 entrega 1 dispositivo por conta + restore.

## 8. Exclusões e garbage collection

- Deleção local confirmada (o app já usa `MediaLibrary.deleteAssetsAsync` em
  `src/utils/share.ts`) → linha em `backup_tombstones(asset_id, content_hash,
  deleted_at)`; blob só é removido do storage quando nenhum asset vivo referencia
  o hash (dedup) e após **grace de 30 dias** [ABERTO] (janela para desfazer).
- Servidor: `DELETE /blobs/:key` após o grace;GC diário dispara lista de tombstones
  vencidos.
- "Remover da nuvem também" ao excluir uma pasta do backup: doc 04 §7.

## 9. Restore (novo dispositivo) — estágio 03D

```
Login → deriva/abre MasterKey → baixa index.enc → lista de assets (p/ pasta, data)
  → usuário escolhe tudo/pastas → download chunk a chunk → decifra → verifica hash
  → MediaLibrary.saveToLibraryAsync em lotes → registra no inventário como uploaded
```

- Barra de progresso por item e total; retomável; valida `contentHash` após decifrar
  (detecção de corrupção); falhas isoladas não abortam o lote (relatório final).
- Dedup no restore: `head(blobKey)` local já existente → só registra metadados.

## 10. Contrato do serviço (backend "burro")

REST + S3-compatible (resumo; detalhes na implementação da Fase 3):

| Endpoint | Função |
|---|---|
| `POST /auth/register` | cria conta; recebe `WrappedMasterKey`, `salt`, params |
| `POST /auth/login` (OPAQUE) | autentica **sem** o servidor ver a senha |
| `HEAD/GET/PUT/DELETE /blobs/:key` | blobs opacos (PUT multipart p/ chunks) |
| `PUT/GET /index` | documento cifrado versionado |
| `GET /usage` | bytes usados vs. cota do plano |

- Armazenamento do servidor: `users(email, wrapped_master, salt, params, plan)`,
  `blobs(key, size, owner)`, `index(user, generation, blob)`, `tombstones`.
  Nenhuma tabela guarda material para descriptografar.
- [ABERTO] Auth exata: OPAQUE (SRP-like, recomendado, `libsodium` tem OPAQUE) vs
  login simples com token + MasterKey wrapped (mais simples, senha transita sob TLS).

### Hook de classificação (detalhes no doc 05B)

Pós-upload, se opt-in: envio anônimo da imagem p/ classificação e gravação cifrada
do resultado no índice. O ponto de extensão no pipeline é o estado `uploaded`.

## 11. Estágios e tarefas

- [ ] **03A (Fase 2, local):** migração + `backup_inventory` (inclui migrar os ids
      já enviados do `kv` para `state='uploaded'`); scan incremental;
      hashing com cache; exclusão por regras (doc 04); estatísticas (X itens,
      Y GB) expostas em `src/stores/backup.ts`; motor v1 passa a deduplicar pelo
      `content_hash` local em vez de listar tudo do backend
- [ ] **03B (Fase 3):** `src/data/crypto.ts` + round-trip tests; derivação de
      chaves; wrap/recovery (D3 decidir antes)
- [ ] **03C (Fase 3):** `cloudStorageProvider`; upload chunked multipart com
      retomada; dedup por `head`; conditions (wifi/charging)
- [ ] **03D (Fase 3):** restore completo em dispositivo limpo
- [ ] **03E (Fase 3):** tombstones + GC + desfazer dentro do grace
- [ ] **03F (Fase 3):** UI de chave de recuperação (ver/confirmar/regenerar — doc 07)

## 12. Critérios de aceite

1. **03A**: com 1.000 fotos, o inventário completa sem rede; reabrir o app não
   re-hashea nada (log de cache hits); exclusão de pasta reflete em `excluded`.
2. **Zero-knowledge**: um dump do banco do servidor contém apenas blobs
   indistinguíveis de aleatórios e HMACs; teste automatizado tenta decifrar com
   tudo que o servidor tem e falha.
3. Kill do app no meio de um upload → reabrir retoma do último chunk enviado
   (nada re-subido além do chunk corrente).
4. Foto idêntica em duas pastas → 1 blob único no storage.
5. Restore em dispositivo limpo reproduz a galeria com hashes idênticos aos de
   origem.
6. Perda de senha sem chave de recuperação = dados irrecuperáveis (documentado e
   comunicado no registro).
7. Toda a fila respeita `wifiOnly`/`chargingOnly` (testado com condição simulada).

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Perda da MasterKey (senha+recuperação) | Copy honesta, chave de recuperação, confirmação obrigatória no registro |
| Doze/bateria interrompe uploads | Chunks pequenos, retomada por parte, foreground service [ABERTO] |
| Vídeos 4K grandes | Chunking + multipart; limitar concorrência; medir memória |
| Crescimento do índice (100k+ itens) | Consolidado compacto (JSON packed); paginação no restore; medir |
| Multi-dispositivo (futuro) | Geração no índice + resolução por hash (§7) |
