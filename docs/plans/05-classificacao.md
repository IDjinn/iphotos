# 05 — Classificação de imagens (estilo Google Photos)

> **Status: 🟡 base local implementada (2026-08-16)** — tabela `asset_labels` + labels **v1 por heurística de pastas** (sem ML), indexer incremental (`label-indexer.ts`), toggle "Smart search & labels" nas Settings (default on), texto livre da busca consulta o índice e chips "Your labels". **Navegação por labels (2026-08-17)**: tela `/labels` (todas as labels + contagem + filtro, "See all" na Search) e álbum `/label/[label]` (todas as fotos da label, sem o teto de 200 da busca); indexer reporta progresso `{scanned, total}` e falhas por pasta, exibidos no Settings como "Indexing… X%" + último erro. **AI labeling interim via endpoint do usuário (2026-08-17)**: `/settings/ai-labeling` configura qualquer servidor de visão compatível com OpenAI (`ai-labeler.ts`, chave na SecureStore); `ai-indexer.ts` rotula fotos incrementalmente (`source='ai'`, pula Locked Folder, aborta após 5 falhas seguidas) com progresso % e último erro no Settings, na tela `/labels` (botão de reload no header) e botão "Label photos now"/"redo from scratch". Fotos saem do aparelho **apenas** para o endpoint escolhido pelo usuário — distinto do 05B (serviço próprio). **Runtime local ONNX (2026-08-17, tarefas 5.2–5.4)**: `onnxruntime-react-native` + `expo-image-manipulator` + `upng-js`; CLIP ViT-B/32 int8 (~85 MB) baixado sob demanda do `Xenova/clip-vit-base-patch32` com progresso; matriz de prompts PT+EN (150 conceitos ×2) gerada offline por `scripts/generate-clip-prompts.mjs` e embutida em `assets/ml/prompts.json` (sem tokenizer/text-encoder no aparelho); pré-processamento resize 224 + decode PNG + tensor NCHW; `src/data/ml/` (session ORT singleton, indexer incremental `source='ml'`, aborta após 10 falhas) com download/progresso/erro na tela `settings/ai-model` ("Download model"/"Label photos now"/redo/delete) e no botão de reload de `/labels`. Pipeline validado ponta a ponta em Node (`scripts/test-local-labeler.mjs`: foto de futebol → soccer/futebol no topo, ~250 ms/imagem x64). **Hardening de memória/nativo (2026-08-17)**: a sessão ORT é criada **a partir do caminho do arquivo** (`InferenceSession.create(modelUri())` — o JSI lê o modelo com IO nativo; ler os ~85 MB como base64 no heap JS estourava o limite Dalvik de 192 MB com `OutOfMemoryError`) com opções enxutas (`intraOpNumThreads: 2`, arenas desligadas) e yield de GC a cada 8 fotos no indexer; `loadOrt()` checa `NativeModules.Onnxruntime` **antes** do require (throw de module-scope no binding do ORT vira fatal pelo Metro mesmo dentro de try/catch — em emuladores 16 KB, onde o nativo não registra, o app agora mostra erro legível no card em vez de crasar); `runLabeling` pré-aquece a sessão para falhar rápido. Faltam: embeddings por asset + busca semântica (5.5), indexação em background agendada (expo-task-manager), fallback MobileNet (runtime hoje roda CLIP em qualquer device) e todo o 05B.
>
> Fase 4 (05A local) → Fase 5 (05B cloud) · Depende de: 03C (apenas 05B) · Alimenta: 07
> Objetivo: busca semântica ("praia", "cachorro", "nota fiscal") e labels por imagem,
> com **modelos locais no dispositivo** e um **serviço opcional de classificação na
> nuvem** (decisão D4): durante o upload, a imagem é enviada de forma anônima para
> classificação e o resultado volta ao cliente, que o cifra e armazena junto ao asset.

## 1. Contexto atual

- `src/data/search-providers.ts` já define o seam `SearchProvider` e o parser local
  (`parseQuery`) com flag `freeText` — o comentário do próprio código diz que a
  "semantic search arrives with the phase-2 AI pipeline". Este doc é esse pipeline.
- Busca atual: strings estruturadas (tipo/data/álbum) + títulos de álbuns. A aba
  Search tem chips e buscas recentes (`search-repository.ts`).
- SQLite síncrono (`runSync`/`getAllSync`) — índice de vetores cabe no mesmo banco.

## 2. Conceitos

- **Labels**: etiquetas legíveis por imagem (`beach`, `dog`, `food`), com score.
- **Embeddings**: vetor por imagem (ex.: 512 dims) que permite busca por similaridade
  com o embedding do texto da query.
- **Fontes**: `local` (modelo on-device) ou `cloud` (serviço opcional, doc §5).
  Um asset pode ter labels de ambas; embedding mantém **um por modelo** (tabela).
- **Auto-álbuns** derivados de labels na Library: [ABERTO] fase posterior.

## 3. Índice local (novo, serve para 05A e 05B)

```sql
CREATE TABLE asset_labels (
  asset_id TEXT NOT NULL,
  label    TEXT NOT NULL,
  score    REAL NOT NULL,
  source   TEXT NOT NULL CHECK(source IN ('local','cloud')),
  PRIMARY KEY (asset_id, label, source)
);
CREATE TABLE asset_embeddings (
  asset_id TEXT NOT NULL,
  model    TEXT NOT NULL,      -- ex. 'clip-vit-b32-int8'
  dim      INTEGER NOT NULL,
  vector   BLOB NOT NULL,      -- float32 packed
  source   TEXT NOT NULL CHECK(source IN ('local','cloud')),
  PRIMARY KEY (asset_id, model)
);
```

- Busca: embeddar a query → varredura de similaridade (cosseno) em SQLite. Até
  ~50k assets a busca bruta é aceitável (<300ms alvo, medir); acima disso avaliar
  `sqlite-vec` [ABERTO futuro].
- Resultado semântico entra na aba Search como seção "Semantic results" ao lado dos
  resultados estruturados existentes — implementar como um `SearchProvider` novo
  (`semantic-search-provider.ts`) plugado na mesma UI.

## 4. 05A — Pipeline local (on-device)

### 4.1 Runtime e modelo (decisão D9)

- **Runtime recomendado:** `onnxruntime-react-native` (ONNX Runtime Mobile) —
  dev build (já é o fluxo do app via `scripts/build-wsl.sh`). Alternativa: TFLite
  via `react-native-fast-tflite`.
- **Modelo recomendado:** CLIP ViT-B/32 quantizado int8 (~25–50 MB), que dá
  **embedding de imagem e de texto no mesmo modelo** — habilita busca semântica
  multilíngue (PT/EN) e labels zero-shot com uma lista de prompts.
  - Fallback p/ aparelhos fracos: MobileNetV3-small (~4 MB) só p/ labels fixos (EN)
    — aceitar perda de qualidade.
  - [ABERTO] Baixar o modelo sob demanda (primeiro uso) vs embutir no APK.
    Recomendação: baixar sob demanda + cache (APK enxuto).
- Labels zero-shot: manter lista curada de ~200–400 prompts PT+EN (praia, cachorro,
  comida, documento, recibo, screenshot…) versionada no app.

### 4.2 Indexação em background

- Incremental: apenas assets sem embedding no modelo ativo (query de "faltantes").
- Agendamento: `expo-task-manager` + `expo-background-task`; lote de N imagens por
  ciclo; pausa com bateria baixa; prioriza recentes.
- Progresso exposto em `src/stores/classification.ts` (p/ UI do doc 07):
  `indexed/total`, `running`, `model`, `lastError`.
- Reindex ao trocar de modelo (nova linha `model`; antiga mantida até GC manual).

### 4.3 Integração na Search

- `parseQuery` mantém `freeText` → provider semântico consulta embeddings; fundir
  resultados (estruturados primeiro, semânticos como grade complementar).
- Chips da Search ganham labels frequentes (top do `asset_labels`).
- Zero dependência de rede: tudo local (princípio local-first).

## 5. 05B — Serviço opcional de classificação na nuvem (decisão D4)

> Serviço **opt-in** dentro da assinatura. A imagem é enviada **em texto claro,
> de forma anônima** para classificação durante o fluxo de backup; o resultado
> volta ao cliente, que cifra e grava no índice. O servidor classifica de forma
> efêmera e não persiste nada da imagem.

### 5.1 Fluxo

```
Upload do blob cifrado concluído (doc 03, estado 'uploaded') ──► hook opt-in
        │
        ▼ (em paralelo ao resto da fila — não bloqueia o backup [ABERTO: seq vs paralelo])
POST /v1/classify  (imagem original, sem Authorization de conta, TLS)
        │           header: token de cota efêmero e não-identificativo (§5.3)
        ▼
Servidor: carrega o bytes em memória → inferência (modelo maior que o local)
        → responde { labels[], embedding }  → descarta a imagem (sem disco, sem log de conteúdo)
        │
        ▼
Cliente: cifra labels+embedding com IndexKey (doc 03 §7) → grava no índice local
         e no index.enc remoto → restore em novo dispositivo recupera a classificação
         sem reprocessar nada
```

- **Anonimato**: a requisição não carrega identidade da conta (sem bearer token de
  usuário). Controle de cota por token efêmero (§5.3).
- **Efemeridade**: processamento em memória, sem persistência, sem logs de conteúdo;
  política publicada no produto ("o classificador esquece a imagem no mesmo instante").
- O blob em repouso **continua cifrado** no S3 — a classificação não altera o
  armazenamento; é um evento passageiro no pipeline de upload.

### 5.2 O que a promessa E2E preserva × abre mão (honestidade na UI)

| | Estado |
|---|---|
| Fotos em repouso (armazenamento) | ✔ Sempre cifradas, servidor nunca vê |
| Metadados/nomes/pastas | ✔ Sempre cifrados |
| Classificação local | ✔ Nada sai do aparelho |
| Classificação cloud (opt-in) | ⚠ A imagem atravessa o servidor em texto claro, de forma anônima e efêmera, **na hora do upload** |

- Copy do consentimento (EN): `Send this photo (without any account info) to our
  classifier during upload? It is processed in memory and immediately discarded.
  This can be turned off at any time.`
- Toggle em `settings` → Privacy (doc 07 §4); default **off**.

### 5.3 Pontos técnicos do endpoint

- `POST /v1/classify` — multipart/binary; resposta JSON `{labels:[[label,score]…],
  embedding:[float…]}`.
- Cota: token efêmero obtido via endpoint autenticado em lote (ex.: 50 tokens/dia),
  **não vinculados** às imagens nem ao e-mail no momento do uso; rate limit por IP
  + token. [ABERTO] desenho exato anti-abuso sem quebrar anonimato.
- Modelo do servidor: maior que o local (ex.: SigLIP base ou CLIP ViT-L), mesmos
  campos de resposta; registrar `model` na resposta p/ índice.
- Dedup de trabalho: se o asset já tem embedding do modelo cloud, não reenviar.

### 5.4Quando não usar

- Modo offline (sem conta): serviço indisponível por definição (card desabilitado).
- Fotos sensíveis: recomendação de UX — excluir pasta trancada é automático
  (nunca sai do aparelho); o usuário pode ainda excluir pastas específicas do
  fluxo combinando com regras do doc 04? [ABERTO — as regras de pasta controlam
  *backup*, não classificação; avaliar regra separada "não classificar" por pasta].

## 6. Tarefas

### 05A (Fase 4)
- [x] 5.1b Base de seleção de modelos: catálogo + capability de hardware + recomendação + tela `/settings/ai-model` (2026-08-16; o runtime de inferência em si fica em 5.2)
- [ ] 5.1 Migração `asset_labels`/`asset_embeddings` + repositories
- [x] 5.2 Runtime ONNX no app — `onnxruntime-react-native` 1.24 + session singleton (`src/data/ml/vision-session.ts`); CLIP ViT-B/32 int8, validado ponta a ponta via `scripts/test-local-labeler.mjs` (2026-08-17)
- [x] 5.3 Download/cache do modelo + prompts versionados — download sob demanda (~85 MB) com progresso (`model-files.ts`, `stores/local-ml.ts`) + matriz de prompts PT+EN gerada offline (`scripts/generate-clip-prompts.mjs` → `assets/ml/prompts.json`) (2026-08-17)
- [x] 5.4 Indexação incremental + store de progresso — `src/data/ml/indexer.ts` (`source='ml'`, pula já-rotuladas e Locked Folder, progresso %/último erro) (2026-08-17; falta o agendamento em background via expo-task-manager)
- [ ] 5.5 `semantic-search-provider.ts` + fusão de resultados na aba Search
- [x] 5.6 Chips de labels frequentes (chips "Your labels" + tela `/labels` com todas as labels/contagem + álbuns `/label/[label]` — 2026-08-17; hoje com labels de pasta, ML pluga depois)
- [x] 5.6b AI labeling interim por endpoint do usuário (opt-in): `/settings/ai-labeling` + `ai-labeler.ts`/`ai-indexer.ts` + progresso/erro/redo — 2026-08-17. Substituído pelo pipeline local em 5.2–5.4 quando este chegar.

### 05B (Fase 5)
- [ ] 5.7 Endpoint `/v1/classify` + política efêmera + cota anônima (serviço)
- [ ] 5.8 Hook pós-upload no motor de backup (doc 03) com fila paralela
- [ ] 5.9 Gravação cifrada do resultado no índice local + remoto
- [ ] 5.10 Consentimento (toggle, copy honesta) em Settings → Privacy
- [ ] 5.11 Testes: opt-in off → nenhuma requisição sai; restore recupera labels

## 7. Critérios de aceite

1. Com o modo cloud desligado/opt-out, o app faz **zero** chamadas de rede ligadas
   à classificação (verificado por proxy/log).
2. Busca "praia" retorna fotos de praia nunca rotuladas manualmente, offline,
   em biblioteca com 10k itens em <1s (alvo; medir em dispositivo médio Android).
3. Indexação sobrevive a kill do processo e retoma do último asset.
4. Com classificação cloud ativa: resultado aparece como `source='cloud'`; blob em
   repouso segue cifrado; requisição não contém e-mail/account id (inspecionada).
5. Restore em dispositivo limpo traz labels/embeddings sem reprocessar imagens.
6. Remoção do consentimento para novas fotos (histórico classificado permanece).

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Modelo local pesado p/ aparelhos fracos | Fallback MobileNet; medir no emulador x86 e device ARM low-end |
| Bateria/dados na indexação | Background task com pausa por bateria; indexar só plugged [ABERTO default] |
| Tamanho do índice (vetores) | float32 packed; ~2KB/asset — 50k ≈ 100MB? medir; opção quantizar p/ int8 no armazenamento |
| Anonimato vs abuso no endpoint | Tokens efêmeros + rate limit; revisar com visão de segurança antes do launch |
| Qualidade de labels zero-shot | Lista curada PT/EN + testes manuais em corpus próprio |
