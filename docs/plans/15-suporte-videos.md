# 15 — Suporte a vídeos

> **Status**: ✅ Implementado (2026-10-05). Vídeos são aceitos em todos os caminhos
> de ingestão do backend (import ZIP, upload multipart e fluxo presigned) e exibidos
> nos dois clientes (mobile e web/desktop).

## 1. Objetivo

O sistema tratava vídeo como descarte: o import ZIP contava os vídeos em
`videosIgnored` e as rotas de upload aceitavam apenas `image/jpeg|png|webp`. Este
doc registra o design da camada de vídeo: ingestão, processamento, armazenamento,
serving e exibição.

## 2. Decisões

| # | Decisão | Racional |
|---|---------|----------|
| V1 | O original nunca é transcodado — servido como está | Evitar farm de transcode; navegadores/aparelhos tocam os formatos comuns (H.264/HEVC) |
| V2 | Capa (poster) + metadados no servidor via **ffmpeg/ffprobe** | O import ZIP não tem cliente para gerar capa; imagens Docker crescem ~200 MB (padrão de mercado: Immich, PhotoPrism) |
| V3 | Poster entra como variantes `Preview` (2048px) e `Thumbnail` (320px) JPEG | Grids e viewers existentes continuam funcionando sem nova variante no contrato |
| V4 | Dedup idêntico ao de fotos: SHA-256 + índice único `(OwnerId, ContentHash)` | Já previsto no roadmap §3; dedup funciona entre caminhos (zip → multipart vira duplicado) |
| V5 | Mobile backup da câmera fica **foto-only** nesta etapa | Vídeos 4K/chunking exigem repensar a fila (limite multipart de 200 MB) — risco já mapeado no doc 03 |
| V6 | Sem transcodificação adaptativa (HLS/DASH) | v1; documentos como `Ranged requests` já bastam para seeking no original |

## 3. Formatos aceitos

| Extensões | MIME |
|-----------|------|
| `.mp4`, `.m4v` | `video/mp4` |
| `.mov` | `video/quicktime` |
| `.webm` | `video/webm` |
| `.avi` | `video/x-msvideo` |
| `.3gp` | `video/3gpp` |

Fontes de verdade no backend: `SupportedVideoTypes` (upload) e `VideoExtensions`
+ `MimeFor` (import ZIP), ambos em `iPhotos.Application`. Limites: multipart
segue os 200 MB do Kestrel; presigned e ZIP não têm teto além da quota.

## 4. Pipeline

### 4.1 Ingestão

- **Multipart (`POST /api/photos`)** — `PhotoService.UploadAsync` detecta o MIME e
  desvia para `UploadVideoAsync`: bytes para temp file seekable (fora da LOH),
  hash, dedup/quota, `IVideoProcessor.ProcessAsync` (probe + poster), put do
  original e das variantes, nascendo `Ready` (mesma política das fotos).
- **Import ZIP** — `ZipImportHandler` ingere vídeos pela mesma `PhotoService` (o
  seed de sidecar do Takeout já era agnóstico ao tipo). Contadores: `videosImported`
  (novo, subconjunto de `imported`) e `videosIgnored` (legado na época; removido
  em 2026-10-09).
  Vídeo com probe falho conta como `failed`, sem abortar o job.
- **Presigned (`upload-ticket` → PUT → complete)** — ticket valida MIME de vídeo,
  `CompleteUploadAsync` enfileira `VariantJob`, e o `VariantProcessingHandler`
  detecta `photo.MediaType == Video` e roda ffprobe/ffmpeg em vez de EXIF/ImageSharp.

### 4.2 Processamento (`FfmpegVideoProcessor`)

- `ffprobe -print_format json` → dimensões, duração, `creation_time` (usado como
  `takenAt` com fill-if-missing do seed, igual ao EXIF). Rotação do `displaymatrix`
  (ou tag `rotate`) é aplicada às dimensões exibidas.
- `ffmpeg -ss <25% da duração, cap 1s> -frames:v 1 -vcodec mjpeg` → poster JPEG
  (fallback sem `-ss` para clipes curtos). O poster alimenta o gerador de variantes
  do ImageSharp, então Preview/Thumbnail têm os mesmos tamanhos/qualidades das fotos.
- Abstração: `IVideoProcessor` (`iPhotos.Application/Abstractions`), implementação
  em `iPhotos.Imaging`, binários configuráveis (`VideoProcessor:FfmpegPath/FfprobePath`,
  default `PATH`). Dockerfiles de api e worker instalam `ffmpeg` via apt.

### 4.3 Schema e contrato

Migração `AddVideoSupport`:
- `photos.media_type` (`photo` default/backfill, string `Photo|Video`),
  `photos.duration_seconds` (double precision, nullable),
  `zip_import_jobs.videos_imported`.

Contrato REST (docs 09):
- `PhotoDto` ganha `mediaType` (string `Photo|Video`) e `durationSeconds`.
- `GET /api/photos?mediaType=video|photo` (case-insensitive; valor inválido → 400).
- `ZipImportJob` ganha `videosImported`; `videosIgnored` permanece (legado; removido em 2026-10-09).
- Serving `/api/photos/{id}/files/{kind}` inalterado — `original` de vídeo responde
  `video/*` com `Accept-Ranges: bytes` (seek funciona).

## 5. Clientes

- **Web/Desktop** — upload aceita `video/*` (validação e `accept`), grid mostra
  badge de play + duração, viewer reproduz o original em `<video>` (poster =
  preview blob), painel de import mostra "Videos added" e o toast passou a "N items added".
- **Mobile** — `CloudGallery` ganha badge/duração (mesmo padrão da galeria local)
  e o `CloudVideoPlayer`: baixa o original autenticado para o cache (progresso na
  tela) e reproduz via `expo-video` com controles nativos; saídas = botão fechar +
  back. Download de original usa a extensão real do `fileName` (antes fixava `.jpg`).
- **Backup da câmera** — continua foto-only (V5); `backup-inventory`/`upload-prepare`
  não mudaram.

## 6. Limitações v1 (conhecidas)

- AVI/3GP podem não reproduzir em alguns navegadores (sem transcode) — a capa
  garante o grid; candidatos a transcodar on-demand no futuro.
- Multipart limitado a 200 MB; vídeos maiores entram pelo ZIP ou presigned.
- Mobile backup de vídeos, modo encriptado para vídeos e transcodificação
  adaptativa ficam para etapas futuras.
- `takenAt` de vídeo vem do `creation_time` do container — nem todo arquivo carrega.

## 7. Verificação

- Unit/integration: fakes `FakeVideoProcessor` cobrindo upload multipart de vídeo,
  import com sidecar, probe falho, dedup, fluxo presigned e contador do job.
- Smoke real (compose local): import de Takeout com mp4+sidecar →
  `videosImported: 1` com duração/GPS/título semeados; upload multipart → `Ready`
  com duração 3 s; `Range: bytes=0-1023` no original → 206; thumb/preview JPEG
  servidos; ticket aceita `video/quicktime` e rejeita `video/x-flv`.
