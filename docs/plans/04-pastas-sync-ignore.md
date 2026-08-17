# 04 — Pastas sincronizadas / ignoradas no backup

> Fase 2 · Depende de: 03A (inventário) · Alimenta: 03 (motor), 07 (settings)
> Objetivo: permitir ao usuário escolher **quais pastas do dispositivo entram no
> backup** e quais são ignoradas, com regras persistentes, estatísticas por pasta e
> reconciliação com a fila de backup.

## 1. Contexto atual

- `src/data/media-repository.ts` encapsula `expo-media-library/legacy`; álbuns do
  sistema (fotos da câmera, screenshots, pastas de apps como WhatsApp) aparecem como
  *albums* do MediaStore — cada um corresponde a um bucket/pasta do dispositivo.
- O inventário do doc 03A grava `folder` por asset em `backup_inventory`.
- Regra do projeto: telas nunca importam `expo-media-library` direto — tudo via
  `media-repository` (estender lá o que faltar).

## 2. Modelo de regras

### 2.1 Fonte de verdade

- Pasta = bucket do MediaStore identificado de forma **estável** (id/caminho quando
  disponível; fallback: título do álbum). Tarefa de verificação: conferir quais
  campos a API legacy expõe no Android (`directory`/`bucketId`) e fixar a chave.
- Recomendação: chave estável = caminho relativo da pasta quando acessível
  (`DCIM/Camera`), pois títulos podem ser localizados/duplicados.

### 2.2 Persistência (nova migração em `db.ts`)

```sql
CREATE TABLE sync_rules (
  folder     TEXT PRIMARY KEY,   -- chave estável da pasta (§2.1)
  mode       TEXT NOT NULL CHECK(mode IN ('include','exclude')),
  updated_at INTEGER NOT NULL
);
```

Configurações gerais (kv/zustand persist, editáveis em doc 07): `wifiOnly` (on),
`chargingOnly` (off) e `newFolderPolicy: 'ask' | 'include' | 'exclude'`
(default **'ask'**).

### 2.3 Precedência (ordem de avaliação durante o scan)

1. **Hard-excludes do sistema**: pasta trancada (`locked_assets`) **nunca** sincroniza
   [ABERTO: permitir sync cifrado opt-in no futuro]; assets já excluídos pela UI.
2. **Regra específica** da pasta (`sync_rules`).
3. **Default**: incluir (`pending`), respeitando `newFolderPolicy` para pastas
   vistas pela primeira vez (§5).

## 3. UI — `settings/backup/folders`

```
Backup folders                          [Tudo ▾]
┌──────────────────────────────────────────────┐
│ ⊙ Camera                       3.412 · 18 GB │ ← toggle on (include)
│ ⊙ Screenshots                    220 · 400MB │
│ ⊙ WhatsApp Images              1.102 · 2,1GB │
│ ○ Telegram                     4.870 · 9,8GB │ ← off (exclude)
│ ⊙ Downloads                       31 · 900MB │
└──────────────────────────────────────────────┘
Resumo: 4 de 5 pastas · 21,4 GB no backup
[ ] Confirmar antes de remover da nuvem        ← ver §6
```

- Lista ordenada por tamanho descrito; busca por nome; cada linha mostra contagem
  de itens e soma de bytes (estatísticas computadas de forma **lazy a partir do
  inventário** e cacheadas — nunca escanear a biblioteca inteira na abertura da tela).
- Filtro no topo: `All / Included / Excluded`.
- Toggle por pasta grava `sync_rules` imediatamente (sem botão salvar).
- Empty state quando não há backup ativo: manter a tela navegável no modo cloud com
  CTA; no modo offline mostrar estado desabilitado (doc 02 §2.2).

## 4. Reconciliação com a fila de backup

- Toda mudança de regra dispara **re-scan incremental** (doc 03A §3.2) apenas das
  pastas afetadas:
  - `exclude → include`: itens da pasta voltam a `pending` (se já tinham hash, vão
    direto a `queued`).
  - `include → exclude`: itens marcados `excluded`; se já estavam `uploaded`,
    perguntar (modal, default **manter**):
    - *Keep in cloud* → blobs permanecem, apenas saem do ciclo (restore os mantém).
    - *Also remove from cloud* → tombstones (doc 03 §8), respeitando grace de 30 dias.
- Mudanças em massa mostram estimativa antes de aplicar ("isso remove 9,8 GB da nuvem").

## 5. Pastas novas

- Com `newFolderPolicy='ask'`: nenhuma interrupção automática — card informativo em
  `settings/backup` ("1 nova pasta detectada: Telegram") + badge na Settings.
  Enquanto não respondido, a pasta fica `pending` **sem** entrar na fila (estado
  visual "aguardando decisão" na lista de pastas).
- `include`: entra no backup direto; `exclude`: fica de fora até toggle manual.

## 6. Casos de borda

| Caso | Comportamento |
|---|---|
| Pasta com mídia mista (fotos+vídeos) | Regra é por pasta inteira (granularidade por tipo é [ABERTO] futuro) |
| Pasta deixa de existir | Regra órfã é mantida (histórico) e marcada "não encontrada" na UI |
| Duas pastas com mesmo nome | Chave estável (§2.1) distingue; exibir sufixo de caminho |
| Asset movido entre pastas | Hash não muda → blob permanece; regras das duas pastas são reavaliadas no scan |
| Pasta trancada | Sempre excluída (hard-exclude §2.3) — não aparece na lista |

## 7. Tarefas

- [ ] 4.1 Verificar campos da API legacy p/ chave estável de pasta; expor
      `getFoldersWithStats()` em `media-repository.ts`
- [ ] 4.2 Migração `sync_rules` + repository (`sync-rules-repository.ts`)
- [ ] 4.3 Integrar precedência no scan do inventário (03A)
- [ ] 4.4 Tela `settings/backup/folders` (lista, toggles, busca, filtros, resumo)
- [ ] 4.5 Estatísticas lazy + cache (por pasta: count/bytes)
- [ ] 4.6 Fluxo include→exclude com modal manter/remover da nuvem
- [ ] 4.7 `newFolderPolicy` + card de pastas novas (doc 07)
- [ ] 4.8 Testes: mudança de regra não re-hashea inalterados; exclusão gera
      tombstones apenas quando pedido

## 8. Critérios de aceite

1. Toggle de pasta persiste entre reinstalações do app (mesma DB) e aplica no
   próximo ciclo sem intervenção.
2. Excluir pasta grande mostra estimativa e confirmação antes de agendar remoção
   remota; dentro do grace de 30 dias é reversível.
3. Nenhuma foto da pasta trancada jamais aparece no inventário como elegível.
4. Abrir a tela de pastas com 50k itens no inventário é instantâneo (stats do cache).
5. Pasta nova com policy 'ask' não entra na fila silenciosamente.
