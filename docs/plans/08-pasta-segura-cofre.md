# 08 — Pasta Segura: cofre criptografado

> **Status: 🟡 implementado (2026-08-16)** — mover itens para a Pasta Segura agora os
> **cifra com AES-256-GCM** em storage privado do app e os **remove da galeria do
> sistema** (invisíveis para qualquer outro app). Acesso apenas via PIN/biometria.
> Itens "hide-only" antigos (ids na `locked_assets`) são migrados sob confirmação.

## 1. Conceito

Duas gerações de itens coexistem:

- **Vault (novo)**: arquivo cifrado nosso + row em `vault_assets`. Invisível no
  sistema; o id é um UUID nosso, não um id do MediaStore.
- **Legacy hide-only (antigo)**: apenas um id na `locked_assets`; o arquivo segue
  na galeria do sistema. A tela da Pasta Segura oferece o banner **"Encrypt now"**
  que converte os legados via `migrateLegacyLocked()`.

## 2. Criptografia

- **Runtime**: `react-native-quick-crypto` (Nitro; dev build — mesma premissa de D6).
- **Algoritmo**: AES-256-GCM, IV aleatório de 12 bytes por arquivo, chunks de 1 MB
  via `FileHandle` (`expo-file-system` nova API).
- **Formato do arquivo**: `[ IV 12B | ciphertext | tag GCM 16B ]` em
  `Documents/vault/<uuid>.bin` (vídeos também geram `<uuid>.poster.bin` com um
  frame via `expo-video-thumbnails`).
- **Chave**: 256 bits aleatória, criada uma vez e guardada em SecureStore
  (`vault.key.v1`, keystore hardware). O PIN/biometria é o gate de acesso na UI
  (fluxo existente de `locked/index.tsx`), não deriva a chave.
- **Hardening futuro (ABERTO)**: envolver a chave com PBKDF2(PIN) para que a
  promessa seja "sem o PIN, nem com o aparelho, nada é legível". Exige desenhar o
  caminho biométrico (cópia da chave atrás de autenticação StrongBox) ou aceitar
  que só o PIN abra.

## 3. Fluxos (`src/data/vault-repository.ts`)

- **importToVault**: por item — resolve `localUri`, cifra (vídeo: + poster),
  insere a row, deleta do MediaLibrary (`deleteAssetsAsync`; se o usuário cancelar
  o diálogo do sistema, faz rollback do item), `purgeAssetMetadata`. Sem passo de
  verificação pré-delete por decisão do autor (GCM detecta corrupção na leitura).
- **Grade desbloqueada**: fotos decriptam inteiras no cache de sessão; vídeos só o
  poster. O arquivo jogável do vídeo decripta on-demand ao abrir no viewer
  (`resolveVaultPlayback`, usado por `VideoPage` via `PhotoAsset.vaultId`).
- **exportFromVault** ("Unlock"): decripta → `saveToLibraryAsync` → remove row+arquivos.
- **deleteFromVault**: remove row + arquivos cifrados + cache.
- **Cache de sessão**: `Cache/vault-session/` — único lugar com texto claro,
  purgado em todo re-lock (`locked-session` store chama `purgeVaultSessionCache()`
  quando o app sai do foreground).

## 4. Riscos e avisos honestos

- **Desinstalar o app apaga os itens do cofre permanentemente** (cópia única em
  storage privado) — o aviso aparece nos diálogos de mover/migrar.
- Android 10+ mostra o diálogo do sistema na primeira exclusão em lote
  (`deleteAssetsAsync`) — esperado; recusar faz rollback do item correspondente.
- O backup E2E (doc 03) deverá tratar itens do cofre à parte (ABERTO: excluir do
  backup por padrão, como já recomendado na §5.4 do doc 05).
- Falha de decriptação (chave perdida/tag inválida): o item permanece listado com
  célula vazia em vez de desaparecer silenciosamente.

## 5. Tarefas seguintes (ABERTO)

- [ ] Auto-lock com timer (hoje só background).
- [ ] Tela de troca/desativação do PIN com o cofre ativo.
- [ ] Envolver a chave com PBKDF2(PIN) (hardening §2).
- [ ] Política do cofre no backup (doc 03/04).
