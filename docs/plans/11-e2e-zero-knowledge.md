# 11 — Modo E2E zero-knowledge (expansão dos estágios 03B–03F)

> Futuro (pós-Fase 5) · Expande o doc 03 §5–§10 · Depende de: 03A (inventário),
> backend v1 (doc 09 — campos já reservados) · Alimenta: 02 (modo Cloud pleno), 07
> Objetivo: evoluir o backend confiável (D11) para **zero-knowledge de verdade**:
> o servidor armazena apenas blobs cifrados; nem o operador vê conteúdo, nomes ou
> metadados. Decide também a chave de recuperação (D3).

> **Nota de escopo:** este doc detalha o que o 03 §5–§10 define, adaptado ao
> backend real que existe (`.NET/PostgreSQL`, `POST /api/photos`, variantes no
> worker). Onde o 03 é abstrato, aqui é concreto; onde conflitam, prevalece o 03.

## 1. Contexto atual

- Backend v1 (D11): servidor **confiável** — upload claro, dedup SHA-256 por conta,
  variantes thumb/preview geradas no worker, EXIF indexado no PostgreSQL
  (`C:\dev\csharp\iPhotos`). A tabela `users` já reserva `wrapped_master_key`,
  `kdf_salt`, `kdf_params` para este modo.
- App: `api-client.ts` (JWT + refresh), `backup-engine.ts` v1 (upload claro com
  dedup), `cloud-photos-repository.ts` (timeline remota usa variantes do servidor).
- Crypto cliente já operacional (doc 08/D6): `react-native-quick-crypto`
  (AES-256-GCM, chave em SecureStore) no cofre da Pasta Segura — reusar para o
  módulo `src/data/crypto.ts`.

## 2. Impacto nas features do servidor confiável

Zero-knowledge **custa** processamento server-side — estas features precisam de
equivalentes no cliente:

| Feature v1 (servidor vê) | Equivalente E2E |
|---|---|
| Variantes thumb/preview no worker | Thumbnails geradas **no cliente** na exibição da timeline remota (download do original ou preview enviado já cifrado pelo cliente — §5) |
| EXIF indexado no PostgreSQL | Metadados vivem **apenas no índice cifrado** (§6); filtros de busca rodam no cliente |
| Dedup por SHA-256 por conta | Dedup por `blobKey = HMAC(NamingKey, hash)` (§5.2) — dedup **por conta** preservado, cross-account impossível por design |
| Timeline remota (`GET /api/photos` com filtros) | `GET /index` + filtros locais |

## 3. Estágio 03B — Criptografia de cliente

- Módulo `src/data/crypto.ts` sobre `react-native-quick-crypto` (+ Argon2id:
  avaliar `react-native-argon2` ou libsodium; [ABERTO] — quick-crypto não tem
  Argon2 nativo. Fallback: PBKDF2-SHA256 com iterações altas via quick-crypto).
- Hierarquia de chaves (doc 03 §6.1): MasterKey 32B → NamingKey/IndexKey/FileKey
  via HKDF-SHA256. Algoritmo: **XChaCha20-Poly1305** se libsodium for adotada;
  senão **AES-256-GCM** (nonce 12B) com quick-crypto — decidir junto com a lib (D6).
- Formato de blob em chunks de 16 MB com AAD `blobKey|seq` (doc 03 §5) e retomada
  por chunk.
- Testes de round-trip unitários antes de qualquer rede (critério do 03 §12.2).

## 4. Estágio 03B′ — Registro/login E2E (D11 → transição)

- Registro E2E: cliente gera MasterKey + `kdf_salt`; envia
  `wrapped_master_key = AEAD(MasterKey, Argon2id(senha, salt))` + `kdf_params`
  nos campos já reservados do `users`. Login: baixa o wrap, deriva KEK localmente,
  abre a MasterKey (senha continua indo para `/api/auth/login` — auth JWT
  existente; a senha sozinha **não** decifra nada no servidor porque o KEK nunca
  sai do cliente).
- **Chave de recuperação (D3 — confirmar):** gerada no registro (base32, ~48
  chars), `RecoveryWrap = AEAD(MasterKey, Argon2id(recoveryKey))` armazenado ao
  lado do wrap. Copy honesta: sem senha **e** sem chave = dados irrecuperáveis.
  Troca de senha: unwrap com antiga + re-wrap com nova (troca da chave análoga).
- Contas existentes (v1 confiável): migração opt-in foto a foto — o cliente tem o
  original localmente, então re-envia cifrado e pede remoção do claro; endpoint
  `POST /api/account/e2e-migrate` marca a conta como E2E [ABERTO: progressiva vs
  big-bang por conta].

## 5. Estágio 03C — Upload/storage cifrado

- Upload: `PUT /api/blobs/{blobKey}` (novo endpoint; multipart por chunks com
  ETags persistidas no `backup_inventory.parts_json`) substitui `POST /api/photos`
  no modo E2E.
- Dedup: `HEAD /api/blobs/{blobKey}` antes de subir (doc 03 §6.4 — blobKey é
  HMAC, não vaza o hash para dicionários).
- Preview opcional: cliente pode cifrar e subir um preview 2048px como blob
  auxiliar (`previewKey = blobKey|p`) para acelerar a timeline remota sem baixar
  originais [ABERTO].
- Quota/usage continua server-side (bytes são visíveis em tamanho, não em
  conteúdo — aceitável).

## 6. Índice cifrado e timeline remota

- `PUT/GET /api/index` — documento JSON cifrado com `IndexKey`, versionado por
  `generation` (doc 03 §7): `{ assetId, contentHash, filename, folder, createdAt,
  durationMs, mediaType, width, height }` (+ labels/embeddings na Fase 5).
- Timeline remota E2E: baixa índice → filtros locais → download+decifra do
  preview/original sob demanda → thumbnails em memória/cache cifrado do app.
- Conflito multi-dispositivo: união por `contentHash` (doc 03 §7); v1 entrega
  1 dispositivo ativo + restore.

## 7. Estágios 03D–03F (resumo — detalhe no 03)

- **03D Restore:** login → unwrap MasterKey → índice → download chunk a chunk →
  decifra → valida hash → `saveToLibraryAsync` em lotes (doc 03 §9).
- **03E GC/tombstones:** `backup_tombstones` local + `DELETE /api/blobs/:key`
  após grace de 30 dias, só quando nenhum asset vivo referencia o hash (doc 03 §8).
- **03F UI da chave de recuperação:** ver (uma vez, com confirmação de digitação),
  regenerar, "esqueci a senha" via chave (doc 07).

## 8. Tarefas

- [ ] 11.1 (03B) `src/data/crypto.ts` + round-trip tests (deriveKeys, chunk
      AEAD, wrap/unwrap) — decisão final da lib (D6)
- [ ] 11.2 (03B′) Registro/login E2E nos campos reservados + chave de recuperação
      (D3) + fluxo de troca de senha
- [ ] 11.3 (03C) Backend: `PUT/HEAD/DELETE /api/blobs/{key}` (multipart, retomada)
      + `PUT/GET /api/index` versionado — TDD
- [ ] 11.4 (03C) App: upload cifrado no `backup-engine` (chunks, ETags, dedup HEAD)
- [ ] 11.5 Timeline remota E2E (índice cifrado + decifração + thumbs locais)
- [ ] 11.6 (03D) Restore em dispositivo limpo com validação de hash
- [ ] 11.7 (03E) Tombstones + GC com grace
- [ ] 11.8 (03F) UI da chave de recuperação + migração opt-in de contas v1
- [ ] 11.9 Testes de adversário: dump do banco não decifra nada; servidor
      forjado não consegue corromper índice sem detecção (tag AEAD)

## 9. Critérios de aceite

1. Dump completo do PostgreSQL + storage contém apenas blobs cifrados e HMACs;
   teste automatizado falha em decifrar com tudo que o servidor tem (03 §12.2).
2. Restore em device limpo reproduz a galeria com hashes idênticos à origem.
3. Kill no meio do upload → retomada do último chunk enviado.
4. Perda de senha sem chave de recuperação = irrecuperável (documentado + copy
   no registro).
5. Conta v1 migrada opt-in: nenhuma foto clara permanece no storage após a
   migração concluída (verificado por job).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Sem variantes server-side → timeline remota mais lenta | Preview cifrado opcional (§5); cache local; medir |
| Argon2id fora do quick-crypto | Avaliar libsodium completo (D6); PBKDF2 alto como fallback |
| Migração de contas v1 complexa | Opt-in, progressiva, com relatório por item |
| Usuário perde senha+chave | Copy honesta, chave de recuperação obrigatória no registro E2E |
