# 18 — Pessoas & labels com IA (rostos, clustering e classificação de cena, server-side)

> Status: ✅ Implementado (2026-10-09) · Criado 2026-10-09 · Idioma: PT-BR (código/UI em inglês)
>
> Implementação (2026-10-09): container `ml/` (FastAPI + ONNX + insightface buffalo_l,
> imagem default CPU, EP auto-detect rocm→cuda→cpu), Postgres trocado por
> `pgvector/pgvector:pg17` (compose + Testcontainers), migração `AddPeopleAndFaces`
> (persons/photo_faces/photo_labels/ml_jobs + trigger `pg_notify` + CHECKs), workers
> `MlJobWorker` (uma instância por kind) + `MlBackfillSweeper` (recovery + backfill),
> enfileiramento nos três pontos onde fotos ficam Ready (upload síncrono, worker de
> variantes, ZIP via PhotoService), API `/api/people` + `/api/labels` + crops,
> frontend: repos `people-repository.ts`/`cloud-labels-repository.ts`, componente
> `CloudPhotoGrid`, seção "People" + chips de labels na Search, rotas `/people`,
> `/person/[id]` (rename/merge/delete), `/label/[label]`; i18n en/pt. Nota de
> infra: o design-time do `dotnet ef` exige o pacote `Pgvector.EntityFrameworkCore`
> referenciado **também no startup** (iPhotos.Core) — os targets MSBuild do pacote
> injetam o `DesignTimeServicesReference` no assembly de startup.
> Backend: 348 testes verde (unit + integração contra pgvector real); frontend:
> tsc limpo + vitest 38/38. **Validação ao vivo (2026-10-10)**: serviço ML rodando
> na **AMD RX 6700 XT via DirectML** no host Windows (`ml/start-host-directml.ps1`,
> `DmlExecutionProvider` — ROCm não suporta RDNA2 em WSL2; DML cobre qualquer GPU
> DX12); compose aponta para ele por `IPHOTOS_ML_BASE_URL=http://host.docker.internal:5207`
> (o container `ml` CPU permanece como fallback). Job de faces ponta a ponta
> validado (S3 → worker → GPU → `photo_faces` → Done). Correções da validação:
> CHECK de `ml_jobs.kind` usa os valores do EF ('Faces','Labels','Cluster'),
> `IFaceCropper` registrado no DI do worker, migração extra
> `SyncEmbeddingModelSnapshot` (ValueComparers pós-migração deixavam o modelo
> "pending" e o EF 10 abortava o `MigrateAsync` em bancos existentes).
>
> **Round 2 (2026-10-10)** — web People + sugestões + 3 bugs de runtime que a
> primeira validação não pegou (o clustering nunca tinha rodado de verdade):
> (1) **workers Cluster/Labels nunca iniciavam** — `AddHostedService` deduplica via
> `TryAddEnumerable` pelo tipo de implementação e os 3 workers compartilham
> `MlJobWorker`; agora registrados via `AddSingleton<IHostedService>` na extensão
> `AddMlJobWorkers` (worker), com testes de registro (`iPhotos.Worker.UnitTests`)
> pinando 1 worker por kind + handler keyed para todo `MlJobKind`; (2) **FK
> violation no recluster** — `SaveChanges` descarrega tudo que está tracked, então
> `PersonClusterJobService` insere as pessoas novas **antes** de marcar faces
> modificadas; (3) **estado do job nunca persistia** — a entidade reclamada no
> escopo do loop chega *detached* no handler, cujo `SaveChanges` não a enxerga
> (faces persistiam, `Complete/Fail` não; cada claim virava `Processing` eterno e
> cada restart reenfileirava milhares) — `MlJobWorker` agora persiste o estado
> final com `jobs.SaveAsync` (Update reanexa). Web: stage 14F no doc 14 (People +
> fila de revisão §7.4); endpoint `GET /api/people/suggestions` +
> `POST /api/people/suggestions/accept` (`SuggestThreshold`, default 0.65) e knobs
> expostos no compose (`IPHOTOS_ML__*`, `IPHOTOS_ML_DET_SIZE`); crops com
> `Cache-Control: immutable` e cache persistente de crops no mobile
> (`ensureFaceCrop`/`useFaceCropSource`). Instance policy: detecção 0.75,
> auto-match 0.90, revisão 0.75–0.90 (backend/.env).
>
> **Round 3 (2026-10-10)** — fila de revisão "é a mesma pessoa?" por pessoa
> (estilo Google Fotos, §7.4) + confiança por pessoa: `GET /api/people/suggestions`
> passa devolver `{ newPeople, merges }` — `merges` agrupa rostos sem pessoa pelo
> **melhor centróide** de pessoa existente ≥ `SuggestThreshold` (faixa 0.75–0.90 na
> instância; cada rosto entra em no máximo um grupo) e `newPeople` mantém os
> clusters Chinese Whispers do restante; `POST /api/people/suggestions/merge`
> aceita o merge (owner-checked, faces já atribuídas são puladas). Novo
> `GET /api/people/{id}` com `Confidence` = similaridade cosseno média
> membro→centroide (coerência do grupo, 0..1) — barra no topo da pessoa na web.
> Listagem ordena **nomeadas antes de Unnamed** (backend, beneficia mobile e web).
> Web: cards de revisão dentro do slot da pessoa no grid + seção "Unnamed" +
> "New faces"; margens `lg` alinhadas à galeria. Testes: `PersonServiceTests` (8).
>
> **Round 4 (2026-10-10)** — **PersonMerges** (§7.4): `GET /api/people/suggestions`
> passa a devolver também `personMerges` — pares de pessoas existentes cujos
> centróides dão `≥ min(Suggest, Match)` (o caso "uma pessoa partida em vários
> Unnamed"); source é sempre unnamed, named/lado maior absorve, cada pessoa entra
> em no máximo uma sugestão (greedy), pares nome↔nome nunca sugeridos; aceite
> reusa `POST /api/people/merge`. Web: card de revisão no slot da pessoa de
> origem (dois avatars + "Merge"/"Add to X"). Testes: `PersonServiceTests` (13).
> Sinal de timestamp/burst (fotos em sequência) avaliado e **não** implementado —
> ver §7.5 (próximo passo: boost de aresta no grafo do Chinese Whispers).
>
> **Round 5 (2026-10-10)** — feedback da biblioteca real: (1) pares greedies +
> cap 20 deixavam de fora os duplicados óbvios (ex. trio 68/48/46 faces da mesma
> pessoa) — trocados por **grupos transitivos** (union-find) ordenados por total
> de faces, `PersonMergeGroups` (§7.4); (2) cards dentro do grid do hub quebravam
> o alinhamento — revisão movida para **banner na página da pessoa** (sobre o
> grid de fotos) e hub volta a ser grade uniforme com ponto de pendência;
> (3) grid de fotos da pessoa sem margem lateral — `PersonCell` reusa o
> `CellWrap` da galeria. Web blindada contra payload antigo em cache
> (`?? []` nos arrays da fila). Testes: `PersonServiceTests` (13, semântica de
> grupos).
>
> **Round 6 (2026-10-10)** — decisões de revisão **por rosto** (§7.4): tabela
> `face_review_decisions` + `POST /api/people/suggestions/review`; stepper ganha
> "Not sure" (Deferred — volta quando a pessoa ganha rostos) e "Not the same"
> (Rejected — nunca mais para aquela pessoa); grupos mostram confiança por
> candidato (`PersonMergeMemberDto.Similarity`); hub colapsa membros pendentes no
> tile do alvo ("+N groups · review"). Testes: `PersonServiceTests` (17).
>
> Depende de: 09 (backend, fotos `Ready` com variante `preview`) · Alimenta: 07 (settings), 05 (labels/busca semântica)
> Objetivo: replicar o "People" do Google Fotos — detectar rostos, agrupar fotos da
> mesma pessoa por semelhança facial, deixar o usuário nomear/mesclar pessoas — e
> retomar os **labels de cena** ("beach", "food", "dog") como feature de backend
> (caminho 05B do doc 05). Toda a inferência é **server-side** (nada on-device —
> modelos móveis já foram descartados no doc 05, 2026-10-08/09).

## 1. Contexto e decisões do autor (2026-10-09)

- **Sem inferência no aparelho.** O pipeline on-device (CLIP via ONNX) foi removido
  do mobile por custo/qualidade (doc 05); o rótulo do autor para este recurso:
  "modelos mobile não são muito bons". Toda IA passa a rodar no servidor.
- **Self-hosted por padrão, com abstração para nuvem.** Rostos exigem modelo
  especializado (detector + ArcFace) — **Ollama/LM Studio não servem para rostos**:
  são runtimes de LLM e não produzem embeddings faciais confiáveis. A infraestrutura
  do autor (Ollama/LM Studio) entra na parte de **labels de cena**, via endpoint
  compatível com OpenAI. A face inference fica atrás de uma abstração com
  implementação self-hosted (v1) e adaptadores de nuvem plugáveis depois (Rekognition,
  Azure Face, Face++…).
- **Hardware do host: AMD, auto-detect.** O container ML detecta o execution
  provider na inicialização (ROCm → CPU; CUDA via override) e sempre tem fallback
  CPU — a imagem default é universal (CPU).
- **Escopo: pessoas + labels** no mesmo doc, em frentes separadas (fases A–I, §12).

## 2. Decisões técnicas (registradas como D19–D22 no 00-roadmap.md §6)

| # | Decisão |
|---|---------|
| D19 | **IA 100% server-side** — nenhum modelo no app mobile/web; o backend é servidor confiável (D11) e processa as fotos que já armazena |
| D20 | **Rostos: container ML dedicado self-hosted** (`ml/`, FastAPI + ONNX Runtime + insightface buffalo_l: SCRFD-10G detecção + ArcFace w600k_r50, embeddings 512-d) atrás da abstração `IFaceInferenceProvider` (modo embeddings v1; modo face-index para adaptadores de nuvem); execution provider auto-detectado (ROCm/CUDA/CPU) |
| D21 | **Labels de cena: cliente .NET para endpoint OpenAI-compatible** (`POST /chat/completions` com imagem base64) configurável por env — funciona com Ollama, LM Studio, OpenAI, Gemini (OpenAI-compat), etc. Supersede o desenho anônimo/efêmero do 05B (doc 05 §5) no v1 servidor-confiável; o desenho do 05 permanece referência para o modo E2E futuro |
| D22 | **pgvector** — imagem Postgres trocada por `pgvector/pgvector:pg17` (drop-in, mesmo volume `pgdata`) + `CREATE EXTENSION vector`; embeddings faciais em `vector(512)`; abre caminho para busca semântica (doc 05 §3) e quase-dedup visual no futuro |

## 3. Arquitetura

```
                    ┌────────────────────────── backend compose ──────────────────────────┐
 app mobile ──API──►│  iPhotos.Core (API)            iPhotos.Worker                       │
 web (Next.js) ────►│   /api/people, /api/faces       FaceProcessingWorker ──┐             │
                    │   /api/labels, crops            LabelProcessingWorker ─┤             │
                    │                                 PersonClusterWorker    │ HTTP        │
                    │  Postgres 17 + pgvector  ◄──────────────────────────────┘             │
                    │  persons / photo_faces / photo_labels / ml_jobs                       │
                    │                                        │                              │
                    │  iPhotos.Storage (S3)  ◄─ preview 2048px│        ml (FastAPI) ◄───────┘
                    │  {owner}/{photo}/faces/*.jpg            └──── /v1/faces/detect
                    └────────────────────────────────────────────────────────────────────────┘
                                                   ▲
              labels: VisionLabeler (.NET) ──► endpoint OpenAI-compatible do usuário
                                                (Ollama :11434/v1 · LM Studio :1234/v1 · OpenAI · …)
```

- O `ml` é **stateless e burro**: bytes de imagem entram, JSON (bboxes + embeddings)
  sai. Toda regra (thresholds, clustering, persons) fica no backend .NET.
- Labels **não passam** pelo container Python: o backend chama o endpoint
  OpenAI-compatible direto (`VisionLabeler`).
- Novo diretório `ml/` na raiz do repo (irmão de `backend/`, `frontend/`, `web/`);
  o serviço entra no `backend/compose.yaml` com `build: ../ml`.

## 4. Container ML (`ml/`)

### 4.1 Stack

- Python 3.12-slim + FastAPI + Uvicorn + `onnxruntime` (wheel CPU no build default) +
  `insightface` + `numpy` + `opencv-python-headless`.
- Modelos **baked no build** (download pinado na image build, não no runtime): pacote
  `buffalo_l` (det SCRFD-10G + rec ArcFace w600k_r50, ~330 MB). Reprodutível e
  offline-safe depois do build.
- `[ABERTO]` licença dos pesos buffalo_l é research/non-commercial (insightface model
  zoo). Para uso pessoal/self-hosted, ok. Se o produto for comercializar, trocar por
  stack permissiva (YuNet + SFace do OpenCV Zoo, Apache-2.0 — embeddings 128-d) — a
  troca é suportada: `photo_faces.model` versiona o embedding (§5.1).

### 4.2 Execução (auto-detect, AMD primeiro)

- Env `ML_EXECUTION_PROVIDER=auto|cpu|cuda|rocm` (default `auto`): no startup, o
  serviço lista os providers disponíveis no build do ONNX Runtime e escolhe pela
  ordem `rocm → cuda → cpu` (auto), logando o provider ativo no `/health`.
- Imagem default: CPU (universal, sempre funciona). Overrides de compose opcionais:
  `compose.ml.rocm.yaml` (AMD — primeiro cenário do autor; nota: wheels ROCm do
  onnxruntime são o ponto frágil, ver Riscos) e `compose.ml.cuda.yaml` (NVIDIA).
- Desempenho esperado: 0,3–1 s/foto em CPU (preview 2048px, detector com input
  ~640px); concorrência interna 1–2 slots (semáforo) — escala pessoal não exige GPU.

### 4.3 Contrato HTTP

- `GET /health` → `{ "status": "ok", "provider": "CPUExecutionProvider", "model": "buffalo_l" }`
- `POST /v1/faces/detect` — body: bytes JPEG (a variante `preview`); resposta:

```json
{
  "model": "buffalo_l",
  "faces": [
    { "bbox": [x, y, w, h], "detScore": 0.98, "embedding": [/* 512 floats */] }
  ]
}
```

- `bbox` em pixels do preview recebido (o worker recorta desse mesmo preview —
  coordenadas mapeiam 1:1, sem re-download).
- Auth interna por `X-Api-Key` (mesmo padrão do Storage.Host), rede interna do compose
  (sem porta pública; `127.0.0.1:5207` opcional para debug).

## 5. Modelo de dados (EF Core + pgvector, migração única `AddPeopleAndFaces`)

Pré-requisito da migração: imagem do Postgres já trocada para `pgvector/pgvector:pg17`
(mesmo volume `pgdata`; a extensão é criada por `CREATE EXTENSION IF NOT EXISTS
vector` no topo da migração). Pacote novo: `Pgvector.EntityFrameworkCore`.

### 5.1 Tabelas

```sql
-- pessoas (cluster nomeável), sempre owner-scoped como o resto do schema
CREATE TABLE persons (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  name text,                          -- null = "Unnamed"
  cover_face_id uuid,                 -- melhor rosto (fill-in pós-insert, FK adicionada depois)
  face_count integer NOT NULL DEFAULT 0,   -- denormalizado, mantido pelas operações de pessoa
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_persons_owner ON persons (owner_id);

CREATE TABLE photo_faces (
  id uuid PRIMARY KEY,
  photo_id uuid NOT NULL REFERENCES photos ON DELETE CASCADE,
  owner_id uuid NOT NULL,             -- denormalizado p/ índices owner-scoped
  person_id uuid REFERENCES persons ON DELETE SET NULL,  -- null = não atribuído
  model text NOT NULL,                -- 'buffalo_l' (versiona o embedding)
  bbox_x real NOT NULL, bbox_y real NOT NULL, bbox_w real NOT NULL, bbox_h real NOT NULL,
  det_score real NOT NULL,
  embedding vector(512) NOT NULL,
  crop_blob_path text NOT NULL,       -- {owner}/{photo}/faces/{faceId}.jpg (recorte 160px)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_faces_photo ON photo_faces (photo_id);
CREATE INDEX idx_faces_person ON photo_faces (person_id);
CREATE INDEX idx_faces_owner_model ON photo_faces (owner_id, model);
-- ANN p/ vizinhos/centróides (opcional no v1 — clustering bruta-force atende escala pessoal):
CREATE INDEX idx_faces_embedding ON photo_faces USING hnsw (embedding vector_cosine_ops);

CREATE TABLE photo_labels (
  photo_id uuid NOT NULL REFERENCES photos ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  label text NOT NULL,                -- normalizado: minúsculas, singular, en (UI traduz)
  score real NOT NULL,
  model text NOT NULL,                -- ex. 'qwen2.5vl:7b'
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, label)
);
CREATE INDEX idx_labels_owner_label ON photo_labels (owner_id, label);

-- fila espelhando variant_jobs (Kind separa as duas pipelines + clustering por owner)
CREATE TABLE ml_jobs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  photo_id uuid REFERENCES photos ON DELETE CASCADE,  -- null nos jobs Kind=cluster
  kind text NOT NULL CHECK (kind IN ('faces','labels','cluster')),
  state text NOT NULL CHECK (state IN ('Queued','Processing','Done','Failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ml_jobs_state ON ml_jobs (state, created_at);
```

- Trigger `AFTER INSERT` em `ml_jobs` → `pg_notify('iphotos_jobs_queued', …)`,
  exatamente como em `20261004045114_AddPhotoMetadataAndQueueNotifications.cs` — o
  `PostgresQueueListener` existente acorda os workers novos sem mudança.
- Labels ficam **no backend**; o app continua com o contrato de sync `asset_labels`
  (`source='cloud'`, `frontend/src/data/labels-repository.ts`) — §10.
- Fotos da Pasta Segura/modo encriptado são locais e nunca sobem — logo nunca têm
  face/label (coerente com o desenho atual).

## 6. Pipeline de inferência

### 6.1 Enfileiramento

- **Novas fotos**: no fim do `VariantProcessingHandler` (quando a foto vai a
  `Ready`), enfileirar `ml_jobs` Kind `faces` e `labels` (se `Ai:Enabled`).
- **Backfill da biblioteca existente: opt-in, default OFF** (decisão do autor,
  2026-10-10): cada foto retroalimentada re-baixa o preview do blob storage
  (milhares de GETs no S3 para bibliotecas grandes). O sweep existe
  (`MlBackfillSweeper`: recovery de jobs presos em Processing a cada boot +
  enfileiramento em lotes de fotos `Ready` sem linhas) e só indexa a biblioteca
  antiga com `Ai:BackfillEnabled=true` (`IPHOTOS_AI_BACKFILL_ENABLED`). O default
  é **só fotos novas** pela pipeline normal de upload.
- Flag server-side `Ai:Enabled` (default on quando o `ml` está configurado) desliga
  o enfileiramento; jobs já na fila concluem e o dado permanece (sem kill-switch no
  app nesta fase — a seção Privacy do app já foi simplificada em 2026-10-09).
- **Vídeos ficam fora da v1** (fotos apenas; posters de vídeo podem entrar depois
  como uma linha de follow-up).
- **Cache local de inputs de ML (implementado 2026-10-10, decisão do autor: "usar
  arquivos locais, sem requisições S3"):** quem gera as variantes (`VariantProcessingHandler`
  e o upload direto no `PhotoService`) grava o preview/thumbnail recém-gerado em
  `IMlInputCache` (`DiskMlInputCache`, dir de `Ml:InputCacheDir`) junto ao upload do
  blob. Os workers de faces/labels leem primeiro do cache e só caem no download do
  blob storage em cache miss (restart do worker, eviction, backfill) — **o caminho
  feliz não faz nenhum GET no S3 por foto nova**. No compose o cache é um volume
  nomeado `ml-inputs` montado em api e worker (o upload direto gera variantes no
  processo da API; o job é consumido pelo worker). Sucesso do job consome/apaga o
  arquivo; o `MlBackfillSweeper` apaga órfãos com mais de 48h. Toda operação do cache
  é best-effort: falha de IO degrada ao fallback, nunca falha o job.

### 6.2 Workers (espelham o `VariantProcessingWorker`)

- `FaceProcessingWorker`: claim `FOR UPDATE SKIP LOCKED` sobre `ml_jobs`
  (Kind `faces`), lanes dedicadas (2 bastam), wall-clock CTS (budget ~2 min/job),
  retry ≤ 3. Fluxo: baixa o `preview` via `IBlobStorage` → `POST ml/v1/faces/detect`
  → filtra detecções (`detScore ≥ 0.5`, `bbox_w ≥ 40px` no preview) → recorta cada
  rosto do preview com ImageSharp (160px JPEG q80) e sobe para
  `{owner}/{photo}/faces/{faceId}.jpg` → grava `photo_faces` → atribuição incremental
  (§7.1) → enfileira job `cluster` do owner (se não houver um já `Queued`).
- `LabelProcessingWorker`: claim Kind `labels`, lanes 1–2 (latência de VLM é de
  segundos), budget ~5 min. Fluxo: baixa `preview` (ou `thumbnail` 320px, o VLM não
  precisa de 2048px) → `VisionLabeler.ClassifyAsync` (§8) → grava `photo_labels`
  substitutivamente (re-execução limpa as linhas da foto).
- `PersonClusterWorker`: consome Kind `cluster` por owner (§7.2).

### 6.3 Configuração (padrão `Options` do backend)

```jsonc
"Ai":  { "Enabled": true, "BackfillEnabled": false },
"Ml":  { "BaseUrl": "http://ml:8080", "ApiKey": "...", "TimeoutSeconds": 60,
         "MinDetScore": 0.5, "MinFaceSizePx": 40,
         "MatchThreshold": 0.55, "ClusterThreshold": 0.55, "MinClusterFaces": 2 },
"Vision": { "BaseUrl": "http://host.docker.internal:11434/v1", "ApiKey": "",
            "Model": "qwen2.5vl:7b", "MaxLabels": 8, "MinScore": 0.4,
            "TimeoutSeconds": 90 }
```

Knobs de reconhecimento — consumidos só pelo worker; no compose ficam expostos como
`IPHOTOS_ML__*` em `backend/compose.yaml` (ajuste sem recompilar, basta restart):

| Opção (`Ml:*`) | Env no compose | Default | O que controla | Efeito de aumentar |
|---|---|---|---|---|
| `MinDetScore` | `IPHOTOS_ML__MIN_DET_SCORE` | 0.5 | Confiança mínima da detecção (SCRFD) | Menos falsos rostos; pode descartar rostos difíceis (perfil, pouca luz) |
| `MinFaceSizePx` | `IPHOTOS_ML__MIN_FACE_SIZE_PX` | 40 | Tamanho mín. do bbox no preview (px) | Menos lixo; rostos pequenos (fotos de grupo) deixam de ser indexados |
| `MatchThreshold` | `IPHOTOS_ML__MATCH_THRESHOLD` | 0.55 | Cosseno mín. p/ atribuir rosto novo a pessoa existente (§7.1) | Grupos mais limpos; mais rostos ficam "Unnamed" até o recluster |
| `ClusterThreshold` | `IPHOTOS_ML__CLUSTER_THRESHOLD` | 0.55 | Aresta mín. do Chinese Whispers (§7.2) | Separa pessoas com mais facilidade; pode dividir a mesma pessoa em duas |
| `SuggestThreshold` | `IPHOTOS_ML__SUGGEST_THRESHOLD` | 0.65 | Limite inferior da faixa de revisão "é a mesma pessoa?" (§7.4): rostos sem pessoa agrupados como sugestões | Revisão mais rigorosa; mais rostos ficam sem sugestão |
| `MinClusterFaces` | `IPHOTOS_ML__MIN_CLUSTER_FACES` | 2 | Mín. de rostos p/ criar pessoa nova | Menos pessoas "de uma foto só"; singletons ficam soltos por mais tempo |

Do lado do serviço `ml`, o `ML_DET_SIZE` (default 640, env `IPHOTOS_ML_DET_SIZE` no
compose) decide o menor rosto detectável: o detector redimensiona a imagem inteira para
esse tamanho, então ele — e não a resolução da original — é a alavanca para rostos
pequenos. Subir para 800–1024 ajuda em fotos de grupo e custa compute ~quadrático.

## 7. Clustering (regra de negócio no .NET)

### 7.1 Atribuição incremental (novo rosto)

1. Carrega os centróides das pessoas do owner (média dos embeddings dos membros,
   normalizada) — materializados em memória por owner.
2. Similaridade cosseno do novo embedding vs cada centróide
   (`TensorPrimitives.CosineSimilarity`, SIMD).
3. `sim ≥ MatchThreshold` (default 0.55) → atribui à melhor pessoa (recalcula
   centróide/capa/contagem); senão o rosto fica `person_id = null` até o recluster.

### 7.2 Recluster completo (job `cluster` por owner)

1. Carrega todos os embeddings do owner (`photo_faces`).
2. k-NN bruta-force (cosseno, top-8 por rosto) — escala pessoal (≲50k rostos ≈
   segundos com SIMD); o índice HNSW (§5.1) é o caminho de escala [ABERTO].
3. Agrupa com **Chinese Whispers** sobre as arestas `sim ≥ ClusterThreshold`
   (default 0.55) — robusto, sem exigir número de clusters, padrão em face
   clustering.
4. **Preserva nomes**: componente com maioria dos rostos numa pessoa existente
   herda o `person_id` dela; componentes novas criam pessoas (só com ≥ 2 rostos;
   singletons ficam soltos até ganhar vizinhos); pessoas que zeram são apagadas;
   capa = rosto de maior `detScore × sqrt(bbox_w·bbox_h)`.

### 7.3 Operações de pessoa (manual)

- **Renomear** (`PATCH`): `name` (ou null → "Unnamed").
- **Mesclar** (`POST /people/merge`): move os rostos da origem para o alvo, apaga a
  origem, recalcula centróide/capa/contagem do alvo.
- **Mover rosto** (`POST /people/{id}/faces`): para outro `personId` ou `new` — é o
  mecanismo de correção/split (mover vários rostos de uma pessoa vira uma pessoa nova).
- **Excluir** (`DELETE`): rostos voltam a `person_id = null` (podem ser re-agrupados
  no próximo recluster).

### 7.4 Fila de revisão "é a mesma pessoa?" (sugestões)

Derivada on-the-fly (`PersonService.SuggestAsync`, nada persistido) sobre os rostos
sem pessoa do owner, dividida por **destino** como no Google Fotos:

- **Merges (por pessoa existente)** — para cada rosto sem pessoa, melhor
  similaridade cosseno contra os centróides persistidos; `≥ SuggestThreshold`
  (limitado por `MatchThreshold`) agrupa o rosto naquela pessoa. Cada rosto entra
  em **no máximo um** grupo (o melhor match), então merges e candidatos a pessoa
  nova nunca compartilham membros. DTO `MergeSuggestionDto` carrega
  `personId/personName/personCoverFaceId`, a faixa de rostos candidatos e
  `Similarity` (média do grupo) — a confiança exibida na revisão.
- **NewPeople (pessoa nova)** — o restante passa pelo Chinese Whispers a
  `min(Suggest, Match)`; grupos ≥ 2 viram `PersonSuggestionDto`.
- **Estabilidade/despriorização**: id = SHA-256 truncado dos face ids ordenados
  (merges misturam o `personId` no hash) — cliente guarda dismissals por id; o
  grupo pode reaparecer se os membros mudarem. Caps: 20 sugestões, 200 faces,
  8 fotos de amostra por sugestão.
- **Aceite**: `POST /suggestions/accept` cria pessoa nova com os rostos;
  `POST /suggestions/merge` atribui os rostos à pessoa existente — ambos
  owner-checked (404 cross-owner), pulam faces já atribuídas e disparam
  recompute exato (centróide/capa/contagem).

**PersonMergeGroups (pessoa ↔ pessoa, Rounds 4–5)** — um `ClusterThreshold`
rígido (0.90 na instância) costuma partir uma pessoa em vários grupos "Unnamed"
cujos centróides continuam próximos. Pares com centróides `≥ min(Suggest, Match)`
encadeiam **transitivamente** (A≈B≈C via union-find; pares nome↔nome nunca geram
aresta — e componente com 2+ nomeadas é descartada) e viram **um** card só
`PersonMergeGroupDto` (`target` = lado nomeado ou o maior; `members` ordenados
por faceCount; `MinSimilarity` = elo mais fraco do grupo, exibido como % match
conservador). A fila ordena por **total de faces** (os duplicados óbvios da
biblioteca vêm primeiro), cap de 20. Id = SHA-256 truncado com tag `"pmg"` +
ids dos membros ordenados. Nada é mesclado automaticamente: o aceite (um clique)
reusa `POST /api/people/merge` uma vez por membro. **UI (web)**: a revisão mora
**dentro da página da pessoa** (banner sobre o grid de fotos — "Merge all" no
alvo, "Merge into X" nos membros, "Not now" persistido no mesmo localStorage);
o hub `/people` volta a ser grade uniforme de círculos com um **ponto** nos tiles
com revisão pendente. O botão "Review faces" abre o julgamento **um por um**
(referência ao lado do candidato em crops grandes; avanço com contador e barra de
progresso). **Round 6**: o stepper de faces tem três vereditos — "Same person",
"Not sure" e "Not the same" — gravados no backend via `POST /suggestions/review`
(novo payload com as 3 listas de face ids): **Rejected** nunca mais sugere o rosto
para aquela pessoa (ainda pode ir para outra); **Deferred** fica em silêncio até a
pessoa **ganhar rostos** (`FaceCount` > snapshot gravado na decisão = embedding
melhorou) e então volta à fila — o "re-processar com embedding melhor" do Google
Fotos. Entidade `FaceReviewDecision` (`face_review_decisions`, FKs cascade p/ face
e pessoa; merge de pessoas reatribui as decisões da origem ao alvo). O review de
grupos mostra a **confiança por candidato** (`PersonMergeMemberDto.Similarity`,
centroide do membro vs. do alvo). **Listagem colapsada**: membros de um grupo
pendente somem da grade do hub e aparecem como linha "+N groups · review" no tile
do alvo — uma entrada por pessoa visual, sem mudar dado; dispensar a revisão
devolve os tiles.

### 7.5 Sinais auxiliares de agrupamento — timestamp/burst (design, não implementado)

Pergunta do autor (Round 4): usar timestamp/metadados melhora o agrupamento?
**Sim** — fotos tiradas em sequência (burst/mesmo evento) quase sempre contêm as
mesmas pessoas, e dois rostos na **mesma foto** são garantidamente pessoas
diferentes. O uso correto é como **peso de grafo**, não regra dura:

- **Boost temporal** — no grafo do Chinese Whispers, pares de rostos cujas fotos
  têm `TakenAt` a ≤ N segundos (burst; N ≈ 10) recebem um boost no peso da aresta
  (ex. +0.15 no cosseno): pares de fronteira (0.75–0.90) cruzam o limiar, rostos
  dissimilares continuam separados.
- **Restrição negativa (mesma foto)** — aresta proibida entre dois rostos do
  mesmo `PhotoId` (evita agrupar duas pessoas da mesma cena).
- **Custo**: muda o contrato `IFaceClusterer.Cluster` (de embeddings para pares
  `(embedding, takenAt?)`) + join faces→photos no job de recluster + testes —
  rodada própria. O `SuggestAsync` (passes 1–3) continua só-embeddings.
- **GPS/local** (se existir no EXIF ingerido) seguiria a mesma ideia por evento,
  mas timestamp já cobre a maior parte do ganho para bursts.

## 8. Labels de cena (`VisionLabeler`, .NET)

- Cliente HTTP tipado para o formato OpenAI (`POST {BaseUrl}/chat/completions`,
  `messages[].content` com `image_url` em data-URL base64 + prompt de sistema),
  `response_format: json_object` quando suportado. Um único cliente serve
  **Ollama** (`http://host.docker.internal:11434/v1`, ex. `qwen2.5vl:7b`),
  **LM Studio** (`http://host.docker.internal:1234/v1`) e nuvens
  (OpenAI `gpt-4o-mini`, Gemini via OpenAI-compat etc.) — troca-se BaseUrl/Model/Key.
- Prompt curado (EN) pedindo JSON `{ "labels": [{ "name", "score" }] }` com tags
  canônicas em inglês, minúsculas/singular, ≤ `MaxLabels`, `score ≥ MinScore`;
  parse tolerante (VLMs quebram JSON: retry 1× com prompt reforçado, depois falha
  o job normal pela fila).
- Nada de regras de negócio no cliente: labels são dado bruto do backend, o app só
  exibe (contrato, não implementação).

## 9. API pública (grupo autorizado, owner-scoped — padrão `PhotoEndpoints.cs`)

| Endpoint | Descrição |
|---|---|
| `GET /api/people` | `[{ id, name, faceCount, coverFaceId }]` — nomeadas primeiro, depois Unnamed (faceCount desc) |
| `GET /api/people/{id}` | detalhe: `PersonDetailDto` com `Confidence` (similaridade média membro→centroide, 0..1; null sem centróide) |
| `GET /api/people/{id}/photos` | fotos da pessoa (paged, mesmo formato de `GET /api/photos`) |
| `PATCH /api/people/{id}` | `{ name: string \| null }` |
| `POST /api/people/merge` | `{ sourceId, targetId }` |
| `POST /api/people/{id}/faces` | `{ faceId, targetPersonId: uuid \| "new" }` |
| `DELETE /api/people/{id}` | pessoa some; rostos ficam não atribuídos |
| `GET /api/people/suggestions` | `{ newPeople: [...], merges: [...], personMergeGroups: [...] }` (§7.4) |
| `POST /api/people/suggestions/review` | `{ personId, acceptedFaceIds, rejectedFaceIds, unsureFaceIds }` — vereditos do review um a um (§7.4) |
| `POST /api/people/suggestions/accept` | `{ faceIds }` → cria pessoa com os rostos |
| `POST /api/people/suggestions/merge` | `{ personId, faceIds }` → atribui os rostos à pessoa |
| `GET /api/faces/{id}/crop` | JPEG do rosto (auth igual `files/{kind}`, `Cache-Control: immutable`) |
| `GET /api/labels` | `[{ label, count }]` (top N do owner) |
| `GET /api/labels/{label}/photos` | fotos da label (paged) |
| `GET /api/photos/{id}/labels` | labels da foto |

Erros no formato `{ error }` existente; 404 cross-owner. Documentar no doc 09 §7
(quando implementar, marcar o item "labels/classificação sync" como coberto por este doc).

## 10. Frontend (mobile e web — web no doc 14 stage 14F)

- **`src/data/people-repository.ts`** — contrato tipado no padrão
  `cloud-photos-repository.ts` (`apiJson<T>`, `PagedResult`); crops via
  `GET /api/faces/{id}/crop` com `authHeaders()` (padrão `use-cloud-file.ts`).
- **Aba Search** (`src/app/(tabs)/search.tsx`): linha horizontal "People" (círculos
  com crop de rosto + nome/`n photos`, "See all" → `/people`) e retorno dos chips de
  labels (agora de `GET /api/labels`) — espelhando o Google Fotos.
- **Rotas novas** (estilos em `src/screens/**` espelhando, regra D17):
  `/people` (grade de cards de pessoa) e `/person/[id]` — polimórfica como
  `album/[id]`: carrega ids de fotos da pessoa → `PhotoGrid` compartilhada, nome
  editável no header, ações por action sheet (rename/merge/delete; mover rosto fica
  para a v2 — a UI de "same person?" por pessoa já existe na **web**, doc 14 stage
  14F; o mobile consome o mesmo contrato quando entrar).
- **`/label/[label]`** volta, orientada ao backend (mesma UX removida em 2026-10-09).
- Sync local de labels: manter opcional — v1 lê direto da API como a galeria cloud;
  a tabela `asset_labels` (`source='cloud'`) permanece como cache futuro, sem UI
  nova em cima dela agora.
- i18n `src/i18n/locales/{en,pt}.json`; zero detalhe de backend no app (só contrato).

## 11. Privacidade e limitações

- **Self-hosted default**: fotos de rosto não saem do servidor do usuário; o `ml`
  roda na rede interna do compose.
- **Adaptadores de nuvem = opt-in por configuração** (espírito D4): quando um
  provider cloud estiver plugado, documentar aviso explícito — APIs de nuvem
  mantêm índices faciais persistentes do lado delas (diferente do desenho efêmero
  do doc 05 §5).
- **E2E (doc 11)**: no modo zero-knowledge futuro o servidor não vê as fotos —
  faces/labels não existem para itens E2E nesta fase (limitação assumida; a versão
  E2E exigiria inferência no cliente ou modelo no enclave — fora do escopo).
- O servidor já é confiável para variantes/EXIF (D11); o acréscimo de face/label
  não muda o modelo de confiança — mas os **embeddings/crops são dados biométricos**:
  ficam no Postgres/storage do próprio usuário e somem em cascata com as fotos.

## 12. Tarefas (fases — implementar uma por sessão)

### Fase A — Container ML
- [x] A.1 `ml/` (Dockerfile com modelos baked, FastAPI, `/health`, `POST /v1/faces/detect`, auto-detect de EP com fallback CPU)
- [x] A.2 Serviço `ml` no `backend/compose.yaml` (rede interna, `X-Api-Key`, env `Ml__*` nos serviços api/worker) + override ROCm documentado
- [x] A.3 Teste de fumaça: imagem construída e `GET /health` respondendo provider/model

### Fase B — Schema
- [x] B.1 Swap da imagem Postgres → `pgvector/pgvector:pg17` (compose + Testcontainers) + `Pgvector.EntityFrameworkCore` + migração `AddPeopleAndFaces` (§5.1, trigger `pg_notify` inclusive)
- [x] B.2 Entidades/repositorios (`PersonRepository`, `FaceRepository`, `LabelRepository`, `MlJobRepository` com claim SKIP LOCKED)

### Fase C — Worker de faces + clustering
- [x] C.1 `IFaceInferenceProvider` + `HttpMlFaceProvider` (Application/Infrastructure, options `Ml`)
- [x] C.2 `FaceProcessingService` + `MlJobWorker` (download preview → detect → crops ImageSharp → `photo_faces` → incremental → job `cluster`)
- [x] C.3 `PersonClusterJobService` (Chinese Whispers + preservação de nomes + capas)
- [x] C.4 Enfileiramento `MlJobEnqueuer` nos três pontos Ready (upload síncrono, `VariantProcessingHandler`, ZIP via PhotoService) + `MlBackfillSweeper` (recovery + backfill)
- [x] C.5 Testes: unit (clustering/centróides, thresholds, parser do provider ML, enqueuer opt-out) — 348 testes verde; o fluxo upload→faces→persons ponta a ponta exige o container ml real e fica como verificação manual (§13.1–13.2)

### Fase D — API pessoas/rostos
- [x] D.1 Endpoints do §9 (`PeopleEndpoints`: list, photos, rename, merge, move-face, delete; `GET /api/faces/{id}/crop` owner-checked)

### Fase E — Frontend pessoas
- [x] E.1 `people-repository.ts` + seção "People" na Search + `/people`
- [x] E.2 `/person/[id]` (`CloudPhotoGrid` reuso do viewer cloud, rename, merge via BottomSheet, delete com ConfirmDialog)

### Fase F — Labels backend
- [x] F.1 `OpenAiCompatibleVisionLabeler` + options `Vision` + worker de labels + endpoints (`GET /api/labels`, `/api/labels/{label}/photos`, `/api/photos/{id}/labels`)
- [x] F.2 Testes: parse tolerante do completion, mapping da resposta de detect, opt-out (`Ai:Enabled=false` → nenhum job; sem Vision → só faces)

### Fase G — Frontend labels
- [x] G.1 Chips de labels na Search + `/label/[label]` orientadas à API

### Fase H — Docs
- [x] H.1 Doc 09 §7 atualizado (labels sync coberto; endpoints novos), §5/§6 do roadmap atualizados com status/datas

## 13. Critérios de aceite

1. Upload de uma foto com rosto → sem intervenção, aparece em `GET /api/people`
   (pessoa "Unnamed") e na seção People da Search do app; renomear persiste.
2. Duas fotos da mesma pessoa (ângulos distintos) convergem para a mesma pessoa;
   fotos de pessoas distintas não convergem (validar com corpus próprio; thresholds
   ajustáveis por env sem rebuild).
3. Merge/move-face/delete refletem imediatamente na API e no app; reinício do
   worker não duplica pessoas (recluster idempotente).
4. Com `Ai:Enabled=false` ou container `ml` fora: uploads continuam funcionando
   (jobs enfileirados ou não criados, sem erro no fluxo de upload); workers
   retomam sozinhos quando o serviço volta.
5. Labels: foto de praia rotulada sem intervenção; `GET /api/labels` traz
   `beach` com contagem; app lista e navega.
6. Cross-owner: nenhum endpoint vaza dado de outro usuário (404).
7. Falha do VLM/ML não trava a fila (retry ≤ 3, `Failed` visível, lane continua).

## 14. Riscos

| Risco | Mitigação |
|---|---|
| Wheels ROCm do ONNX Runtime instáveis (AMD no Docker/WSL2 só em RDNA3 suportado) | Imagem default CPU universal (atende escala pessoal); ROCm como override opcional; DirectML fora do escopo (container Linux) |
| Licença não-comercial dos pesos buffalo_l | Uso pessoal ok; caminho de troca preparado (`model` na tabela, abstração de provider); alternativas Apache-2.0 (YuNet+SFace) mapeadas |
| Thresholds de clustering mal calibrados (mescla errada vs fragmentação) | Valores defaults conservadores + todas as correções possíveis pela UI (move-face/merge); recluster idempotente re-executável com novos limiares |
| Custo/latência de VLM no labeling (cloud pago, Ollama local lento em CPU) | Label usa thumbnail 320px; lanes dedicadas; provedor trocável por env; `Ai:Enabled` desliga tudo |
| Crescimento da tabela de embeddings (2 KB/rosto) | Escala pessoal (100k rostos ≈ 200 MB + índice); HNSW como caminho de escala já previsto |
| Adaptadores cloud (Rekognition etc.) não exportam embeddings | Abstração com dois modos (embeddings × face-index) definida desde o início — o modo face-index troca clustering local por `SearchFaces` (tarefa futura, fora da v1) |
