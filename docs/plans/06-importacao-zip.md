# 06 — Importação de fotos por ZIP

> Fase 2 · Depende de: 03A (inventário/hashes p/ dedupe) · Alimenta: 07 (settings)
> Objetivo: permitir importar para a galeria do dispositivo um arquivo `.zip`
> contendo fotos/vídeos, com validação, extração segura, deduplicação, progresso
> cancelável e relatório final.

> **Revisão 2026-10-02 — abordagem server-side implementada.** A decisão do usuário
> foi por extração no **backend** (não no dispositivo): o zip é enviado via
> `POST /api/imports/zip` e processado pelo worker (contrato em 09 §3.4). HEIC é
> transcrito no servidor (Magick.NET/libheif); vídeos e sidecars do Takeout são
> ignorados e contados; dedupe idempotente por hash; sem álbuns. Este documento
> descreve o fluxo **device-side** original, mantido como fase futura (útil p/
> modo offline e para salvar vídeos na galeria) — as seções §3/§4 (validação,
> zip-slip, ignorados) continuam como referência de regras.

> **Revisão 2026-10-04 — import Takeout-aware (server-side).** O worker agora
> entende o formato Google Takeout e preserva metadados:
> - **Sidecars JSON** ao lado da mídia, nos dois layouts — `<arquivo>.json` (legado)
>   e `<arquivo>.supplemental-metadata.json` (atual), casados por caminho no mesmo
>   diretório (case-insensitive). Fornecem `photoTakenTime`→`takenAt` (fallback
>   `creationTime`), `geoDataExif`/`geoData`→GPS (`0,0` = sem local), `title` e
>   `description` (colunas novas em `photos`; contrato 09 §3.2).
> - **Pastas de data**: `YYYY-MM-DD` no caminho semeia `takenAt` ausente; pastas
>   só-ano (ex. "Fotos de 2025") não semeiam — o EXIF do worker de variantes
>   preenche lacunas depois (fill-if-missing; seed é autoritativo, nunca
>   sobrescrito).
> - **Vídeos**: ✅ importados desde 2026-10-05 (doc 15) — `mp4 m4v mov webm avi 3gp`
>   entram pelo mesmo `PhotoService` (poster/duração via ffmpeg no worker) e o
>   sidecar do Takeout os semeia igual às fotos; contador novo `videosImported`
>   no job. O contador `videosIgnored` (2026-10-04) permanece no contrato como
>   legado (desde então permanece 0). Parte real analisada na época (part 005,
>   8,6 GiB): 1.672 imagens (5,19 GiB), 394 vídeos (2,84 GiB), 1.502 sidecars.
> - **Multi-parte**: cada parte (`takeout-…-1-00N.zip`) é um job independente —
>   importar todas as partes; duplicadas entre partes viram `duplicated`.
> - **Limites server-side vigentes** (nota: a tabela §3 abaixo descreve a fase
>   device-side futura e está desatualizada vs. o server-side): zip até
>   `ZipImport:MaxZipBytes` (100 GiB), máx. 50.000 entradas (`ZipImport:MaxEntries`),
>   ingresso grande apenas via LAN (túnel Cloudflare corta em ~100 MB — 09 §3.4).
> - **Fila**: worker acorda via Postgres LISTEN/NOTIFY (sem polling quente;
>   fallback 30 s) — 09 §3.4.

> **Revisão 2026-10-04b — staging local (o zip não vai mais ao S3).** Até então o
> zip bruto era replicado ao provider de blobs principal (S3) antes do 202: para
> uma parte de 8,6 GiB o upload ao S3 levava dezenas de minutos com a UI presa em
> "100%" (o 202 só voltava após o PUT completo ao S3 e o worker baixava o zip de
> volta de lá). Agora o arquivamento bruto vai para um **provider de staging em
> disco local**: `POST /api/imports/zip` grava em `StorageService:StagingProvider`
> (compose: provider `filesystem` do storage host, volume `storage-data`) e responde
> 202 assim que o zip está staged (segundos, escrita local). O worker lê o zip do
> staging local e só as **fotos processadas** sobem ao provider principal (S3).
> Fluxo vigente: **client → API → staging local → unzip → processamento → S3**.
> Endpoints/handler usam o `IBlobStorage` com chave `"staging"`; sem
> `StagingProvider` configurado, o staging aliasa o backend principal
> (retrocompatível). Web: após 100% dos bytes a UI mostra "Storing archive on
> server…" e um watchdog de 15 min converte travamento do servidor em erro claro.

## 1. Contexto atual

- Library tab (`src/app/(tabs)/library.tsx`) já tem o padrão de "utility cards"
  (Favorites, Locked Folder) — o card "Import from ZIP" segue esse padrão. Hoje há
  um placeholder "Coming soon" nas Settings apontando para esta fase.
- Salvamento na galeria: `expo-media-library` (`saveToLibraryAsync`) — encapsular
  em `src/data/media-repository.ts` (regra do projeto).
- Deleção/compartilhamento já usam padrões em `src/utils/share.ts`.
- Inventário do doc 03A fornece `content_hash` para dedupe.

## 2. Fluxo do usuário

```
[Card "Import from ZIP" na Library]  ou  [Settings → Backup → Import ZIP]
   → seleção do arquivo (document picker)
   → tela de resumo: nome, tamanho, nº de entradas válidas, botão Import
      [x] Criar álbum "Imported — <nome do zip>"   (default: on)
   → progresso (extração → hashing → salvando) com Cancel
   → relatório: importadas X · duplicadas Y · ignoradas Z · falhas W (+ detalhes)
```

- Entradas duplicadas são **puladas e contabilizadas** (não perguntar por item).
- Cancelamento: interrompe entre itens; itens já salvos permanecem; limpa cache.

## 3. Validação do ZIP

| Regra | Valor / comportamento |
|---|---|
| Extensões aceitas | `jpg jpeg png heic heif webp gif mp4 mov m4v` [ABERTO: webm/avi] |
| Ignorados silenciosamente | `__MACOSX/**`, arquivos ocultos (`.*`), Thumbs.db, `.DS_Store` |
| ZIP criptografado | Erro claro: "protected/encrypted ZIPs are not supported" |
| ZIP aninhado | Ignorado com aviso no relatório (sem recursão na Fase 2) |
| Tamanho máximo do zip | 4 GB (depende da lib — §5) |
| Máx. de entradas | 10.000 (falha rápida com aviso antes de extrair) |
| Entrada individual | ≤ 4 GB; nome de saída sanitizado |
| Espaço livre | Checar antes de extrair: tamanho do zip × 1.2 disponível em cache |
| Zip vazio/sem mídia | Erro "no supported files found in this ZIP" |

## 4. Segurança

- **Zip-slip**: ao extrair, normalizar cada caminho e rejeitar entradas com `..`
  ou caminho absoluto. Extração **aplanada** para o cache (sem subdiretórios —
  nomes renomeados `import-<n>.<ext>` se colidirem), eliminando o risco por design.
- Memória: **nunca** carregar o zip inteiro em RAM — extração item a item para
  `FileSystem.cacheDirectory/import-zip/`.
- Limpeza do cache em `finally` (sucesso, erro ou cancel).
- Zips são somente-leitura como fonte: nada é sobrescrito no local original.

## 5. Biblioteca (decisão D7)

| Opção | Prós | Contras |
|---|---|---|
| **A. `react-native-zip-archive` (nativa)** — recomendada | Extração nativa streaming p/ disco, zips gigantes, zip64 | Exige dev build (já é o fluxo do app) |
| B. `fflate`/`jszip` (JS) | Compatível com Expo Go | Memória limita a ~100–200 MB; sem streaming prático |

- Wrapper `src/utils/zip.ts` esconde a lib do resto do app:
  `inspectZip(uri) → { entries, encrypted, totalSize }` e
  `extractNext(entry) → { filePath }` (iterador arquivo a arquivo).
- A escolha não afeta o restante do fluxo — trocar depois é local.

## 6. Dedupe e salvamento

1. Extrair entrada → `SHA-256` do arquivo (mesma rotina do inventário).
2. Hash já presente em `backup_inventory` (ou em `asset_hashes` de imports
   anteriores) → marcar duplicada, **não salvar**.
3. Senão → `MediaLibrary.saveToLibraryAsync(path)` (lote com pausa p/ cancelar);
   registrar hash no inventário como `pending` (entra no backup conforme regras
   de pastas — cairá na pasta de destino padrão do sistema, ex. Pictures).
4. Álbum opcional: `albums-repository.createAlbum('Imported — <nome>')` e
   `addAssets` com os ids salvos (se ≥1 salvo).

## 7. Progresso e estado

- `src/stores/import-zip.ts`: `{ phase: 'validating'|'extracting'|'hashing'|'saving'|'done'|'error',
  current, total, lastReport, cancel() }` — UI lê daqui; única importação por vez.
- Relatório persiste até a próxima importação (revisível da tela de origem).
- Notificação local opcional ao concluir em background [ABERTO futuro].

## 8. Tarefas

- [ ] 6.1 Adicionar lib (D7) + wrapper `src/utils/zip.ts` (inspect/extract iterativo)
- [ ] 6.2 Validações do §3 (incl. zip-slip, espaço livre, falha rápida 10k entradas)
- [ ] 6.3 Store `import-zip.ts` com fases e cancelamento
- [ ] 6.4 Pipeline: extrair → hash → dedupe → save em lote
- [ ] 6.5 Álbum opcional "Imported — <nome>"
- [ ] 6.6 Card na Library + entrada em Settings (doc 07)
- [ ] 6.7 Tela de progresso + relatório detalhado (expandir falhas/duplicadas)
- [ ] 6.8 Testes: zip com 1k fotos; zip corrompido; zip criptografado; cancel no meio;
      dedupe real (importar 2x o mesmo zip → 2ª vez 100% duplicadas)

## 9. Critérios de aceite

1. Importar um zip de 500 MB com 300 fotos em dispositivo médio sem estourar
   memória (perfil de RAM verificado).
2. Reimportar o mesmo zip → "300 duplicated, 0 imported" e nenhuma cópia nova na galeria.
3. Zip com `__MACOSX` e arquivos ocultos importa só a mídia válida.
4. Cancelar no meio preserva os itens já salvos e limpa o cache por completo.
5. Zip criptografado/corrompido gera mensagem clara, sem crash.
6. Fotos importadas aparecem na galeria, entram no inventário e respeitam as regras
   de backup (doc 04) sem passos extras.
