# 02 — Modos principais: Offline e Cloud

> **Status: 🟡 base implementada (2026-08-16)** — `AppMode`, store `account` (mode/user/plan/signOut) e matriz refletida na UI (Settings mostra modo local + recursos desabilitados com explicação). `StorageProvider`, transições cloud e billing ainda não implementados (§3, §5, §6).
>
> **Atualização 2026-08-18 (D11):** o backend do modo Cloud **v1 já existe** e é um
> **servidor confiável estilo Immich** (doc 09): auth e-mail+senha+JWT, upload em
> texto claro com dedup SHA-256, variantes thumb/preview geradas no servidor e EXIF
> indexado no PostgreSQL. Isso muda a linha "Servidor vê as fotos" do modo Cloud:
> no v1 o servidor **vê** as fotos enviadas (não há criptografia de cliente).
> O zero-knowledge do §5 e o `StorageProvider` (§3) permanecem como design futuro
> (hosting custom / modo E2E) — os campos E2E já estão reservados no backend.
>
> Fase 1 (base) → Fase 3 (billing) → Futuro (hosting custom) · Depende de: 01 · Alimenta: 03, 07, 09
> Objetivo: definir os dois modos de operação do app, o que cada um habilita e
> como o usuário transita entre eles, incluindo o modelo de licenciamento
> (vitalícia para hosting custom no Offline; assinatura mensal no Cloud).

## 1. Contexto atual

- Já existe o seam `AssetRepository` (`src/data/asset-repository.ts`) comentado como
  ponto de extensão para "remote backend (self-hosted or cloud)".
- `src/app/settings.tsx` tem o placeholder `Backup: Local only · phase 2`.
- Não existe store de conta nem noção de modo — o app é implicitamente offline.

## 2. Modelo de modos

### 2.1 Definição

```ts
export type AppMode = 'offline' | 'cloud'; // em src/data/types.ts (doc 01)
```

| Aspecto | **Offline** | **Cloud** |
|---|---|---|
| Conta | Não requerida | Requer login |
| Galeria local completa (timeline, álbuns, favoritos, pasta trancada, busca) | ✔ | ✔ |
| Importação por ZIP (doc 06) | ✔ | ✔ |
| Classificação local on-device (doc 05A) | ✔ | ✔ |
| Backup | Nenhum (Fase 1–2). **Futuro:** hospedagem custom do usuário (S3/WebDAV) via licença vitalícia | Serviço mensal, E2E, storage-only (doc 03) |
| Classificação na nuvem (doc 05B) | ✖ | Opt-in (incluso/adicional à assinatura) |
| Servidor vê as fotos | Nunca (nada é enviado) | Nunca em repouso; apenas de forma efêmera/anônima se o usuário ativar a classificação cloud (D4) |

### 2.2 Regra de UI

- Recursos indisponíveis no modo atual **aparecem desabilitados com explicação e
  CTA**, não escondidos. Ex.: card "Backup" nas Settings no modo offline mostra
  `Available in Cloud mode — upgrade` (e, no futuro, `or connect your own storage`).
- Estado do modo mora em `src/stores/account.ts` (zustand + persist SQLite):

```ts
interface AccountState {
  mode: AppMode;                    // default 'offline'
  user: null | { email: string };   // null no modo offline
  plan: null | { id: string; label: string; renewsAt?: number };
  setMode(mode: AppMode): void;
  signOut(): void;                  // volta para 'offline', mantém dados locais
}
```

- `onboarding.mode` (doc 01) inicializa `account.mode` na primeira conclusão.

## 3. Interface `StorageProvider` (evolução do seam)

Toda escrita/leitura remota passa por uma interface única, para que Cloud e
hosting custom compartilhem o motor de backup do doc 03 (que só fala com esta
interface + a camada de criptografia):

```ts
// src/data/storage-provider.ts
export interface BlobInfo { key: string; sizeBytes: number; modifiedAt: number; }

export interface StorageProvider {
  id: string; // 'cloud' | 's3' | 'webdav'
  /** Envia um blob (já cifrado) — chunked, com retomada. */
  put(key: string, source: string /* file uri */, onProgress?: (p: number) => void): Promise<void>;
  head(key: string): Promise<BlobInfo | null>;   // dedup/existência
  get(key: string, dest: string): Promise<void>; // download p/ arquivo local
  delete(key: string): Promise<void>;
  list(): Promise<BlobInfo[]>;
}
```

- Fase 3 implementa `cloudStorageProvider` (API do serviço, doc 03 §10).
- Futuro implementa `s3StorageProvider` (credenciais do usuário, AWS SDK ou API
  compatível MinIO/B2/R2) e `webdavStorageProvider`.
- `AssetRepository` permanece sendo a fonte **local** de verdade; o backup é uma
  projeção cifrada do acervo local — não existe modo "cloud-only" (mantém o app
  local-first e simplifica conflitos).

## 4. Modo Offline — hospedagem customizada (futuro)

- **Licença vitalícia (one-time purchase)** desbloqueia a configuração de
  armazenamento próprio: S3-compatible (AWS S3, MinIO, Backblaze B2, Cloudflare R2)
  e WebDAV (Nextcloud etc.).
- A criptografia é **idêntica** à do modo Cloud (doc 03 §6): o usuário é o único
  detentor das chaves; o provedor de hospedagem guarda apenas blobs cifrados.
  Diferença: as chaves derivam de um segredo local (senha do cofre/senha do app),
  pois não existe conta/servidor para wrap.
- Restore funciona a partir de qualquer dispositivo com as credenciais do storage
  + a senha do cofre.
- [ABERTO] Formato da licença: compra na loja (Play Billing non-consumable) vs
  chave de licença própria (LicenseKey assinada, validada offline).
- [ABERTO] Limites da licença: por dispositivo? por storage? (recomendação: por
  usuário, 1 storage configurado por vez).

## 5. Modo Cloud — serviço por assinatura

- **Posicionamento**: serviço de hospedagem zero-knowledge. O servidor **não**
  oferece galeria web nem processamento de imagens (exceto o serviço opcional de
  classificação, efêmero — D4, doc 05B). Ele armazena blobs cifrados, controla
  cota e cobrança.
- O que o servidor vê / não vê:

| Servidor vê | Servidor NUNCA vê |
|---|---|
| E-mail da conta, cota, uso em bytes | Senha (derivada localmente — doc 03 §6) |
| Quantidade/tamanho dos blobs | Conteúdo, nome de arquivo, pastas, metadados |
| Chaves dos blobs (HMACs pseudônimos) | Chave mestra, chaves de arquivo |
| Eventos de billing | Resultados de classificação (chegam já cifrados — doc 05B) |

- **Planos**: [ABERTO] tiers por armazenamento (ex.: 50 GB / 200 GB / 2 TB),
  trial gratuito, plano familiar. A estrutura `plan.id` suporta tiers desde o início.
- **Billing**: [ABERTO D5] Play Billing (assinaturas no Android, comissão ~15–30%,
  UX nativa) vs Stripe (web + app, menor comissão, exige conta própria). O doc 03
  não depende desta decisão — o app valida entitlement via `plan` sincronizado.
- **Cancelamento/inadimplência**: entrada em modo somente-leitura (download e
  restore funcionam; upload bloqueado) por 90 dias [ABERTO: prazo] e depois exclusão
  dos blobs, com 3 avisos por e-mail.

## 6. Transições de modo

| Transição | Comportamento |
|---|---|
| Offline → Cloud (login/upgrade) | Gera/deriva chaves (doc 03), executa primeiro backup completo; regras de pastas (doc 04) passam a valer |
| Cloud → Offline (logout) | Dados locais permanecem ilesos; sincronização pausada; aviso de que novas fotos não serão copiadas |
| Cloud → Offline (cancelamento) | Igual ao logout + política de retenção do §5; sugerir "baixar tudo" antes (doc 03 §9) |
| Offline (custom) → Cloud | Futuro: migração = upload dos mesmos blobs cifrados do storage próprio p/ o serviço (mesma criptografia, mesmo `blobKey`) |

- Mudança de modo nunca deleta dados locais. Exclusões destrutivas exigem fluxo
  próprio com confirmação (doc 07 §account).

## 7. Tarefas

### Fase 1 (base)
- [ ] 2.1 `AppMode` em `types.ts` (já no doc 01) + store `account.ts`
- [ ] 2.2 Helper `useFeatureFlag(mode)` ou mapa `FEATURES_BY_MODE` p/ UI decidir o que desabilita
- [ ] 2.3 Settings: seção "Account" refletindo o modo (detalhes no doc 07)

### Fase 3 (cloud)
- [ ] 2.4 `cloudStorageProvider` (junto ao estágio 03C)
- [ ] 2.5 Integração de billing + sincronização de `plan` (decisão D5 antes)
- [ ] 2.6 Fluxos de cancelamento/readonly

### Futuro (hosting custom)
- [ ] 2.7 `s3StorageProvider` + `webdavStorageProvider`
- [ ] 2.8 UI de configuração de credenciais (testadas com `head/list`)
- [ ] 2.9 Licença vitalícia: validação e gates

## 8. Critérios de aceite

1. Um build roda 100% funcional no modo offline, sem qualquer chamada de rede.
2. `account.mode` persiste entre reinícios e é a fonte única da UI para habilitar
   recursos (nenhuma tela checa `user !== null` solto).
3. Feature desabilitada por modo mostra sempre o porquê + CTA.
4. Logout não remove fotos/álbuns/pasta trancada do dispositivo.
5. A matriz do §2.2 está refletida em testes manuais documentados (checklist no PR).

## 9. Pontos abertos

- D2 (backend próprio vs BaaS), D5 (billing), formato da licença vitalícia,
  tiers/preço, prazo de retenção pós-cancelamento, plano familiar.
