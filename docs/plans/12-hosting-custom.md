# 12 — Hosting custom (modo Offline estendido): S3/WebDAV + licença vitalícia

> Futuro (expande o doc 02 §5) · Depende de: 03 (motor de backup — idealmente o
> modo E2E do doc 11, para que o provedor externo também não veja conteúdo) ·
> Alimenta: 02 (matriz de modos), 07 (Settings)
> Objetivo: quem não quer assinatura leva o backup para **storage próprio**
> (S3-compatible ou WebDAV) com credenciais do usuário + **licença vitalícia**
> do app — o servidor do iPhotos sai do caminho (ou nem é contatado, além da
> validação da licença).

## 1. Contexto atual

- Doc 02 §5 define a intenção; a seam prevista é a interface `StorageProvider`
  (ainda não criada — o backend v1 usa `cloud-photos-repository` direto).
- Motor de backup: `backup-engine.ts` acoplado ao backend próprio (multipart
  `POST /api/photos` + poll). Este doc introduz a abstração para múltiplos destinos.
- Crypto cliente disponível: quick-crypto (cofre) — no modo custom o backup é
  **cifrado no cliente** (reuso do doc 11 03B/03C), pois WebDAV/S3 do usuário é
  confiança mínima.

## 2. Modelo de produto

| | Modo Offline (grátis) | Modo Offline estendido (licença vitalícia) | Modo Cloud (assinatura) |
|---|---|---|---|
| Galeria/labels locais | ✔ | ✔ | ✔ |
| Backup | ✖ | ✔ no storage próprio (S3/WebDAV) | ✔ no backend iPhotos |
| Restore em novo device | ✖ | ✔ | ✔ |
| Variantes/EXIF server-side | — | ✖ (cliente, como no doc 11) | ✔ |
| Custo | 0 | pagamento único | mensal/anual |

- Licença vitalícia: compra única (Play Billing produto `iphotos.lifetime` no
  Android; doc 10 §2) que desbloqueia o modo custom. Validação offline-tolerante:
  após verificada uma vez no backend (`plan='lifetime'`), o app guarda um
  **token de licença assinado** (JWT longo ou chave pública embutida) e funciona
  sem revalidar a cada abertura [ABERTO: período de revalidação, ex. 90 dias].

## 3. `StorageProvider` (seam)

```ts
// src/data/storage-provider.ts
export interface StorageProvider {
  id: 'cloud' | 's3' | 'webdav';
  testConnection(): Promise<void>;        // usado na tela de configuração
  headBlob(key: string): Promise<boolean>;// dedup
  putBlob(key: string, file: string, opts: PutOpts): Promise<void>;  // multipart/retomada quando suportado
  getBlob(key: string, dest: string): Promise<void>;
  deleteBlob(key: string): Promise<void>;
  putIndex(doc: string): Promise<void>;   // índice cifrado (doc 11 §6)
  getIndex(): Promise<string | null>;
  usage(): Promise<{ usedBytes: number }>;
}
```

- `backup-engine` é refatorado para consumir a interface; `cloud-photos-repository`
  vira a implementação `cloud` (envolvendo `api-client`).
- Formato de blob/chunks/índice: **idêntico ao doc 11** — o provider é um destino
  opaco; só o transporte muda.

## 4. Implementações

### 4.1 `s3StorageProvider`
- AWS SDK JS v3 (clientes modulares `@aws-sdk/client-s3` + multipart) com
  `endpoint` custom (MinIO, Hetzner, B2, Wasabi, rclone-serve…) — assinatura
  SigV4 roda em JS puro, sem nativo.
- Config do usuário: `{ endpoint, region, bucket, accessKeyId, secretAccessKey }`
  — segredos em SecureStore; suporte a path-style para MinIO.
- Multipart nativo do S3 (`parts_json` no `backup_inventory` para retomada).

### 4.2 `webdavStorageProvider`
- `webdav` (npm) sobre fetch/axios; config `{ baseUrl, username, password }`
  (ou basic auth token) em SecureStore.
- Sem multipart: chunks enviados como arquivos separados
  (`{blobKey}/{seq}.chunk`) — retomada por chunk existente (`PROPFIND`).
- Limites práticos documentados (throughput, servidores caseiros).

## 5. Fluxo de configuração (UI)

```
Settings → Backup → Custom storage (visível só com licença)
  → escolhe S3-compatible | WebDAV
  → formulário de credenciais
  → [Test connection] (head/put/delete em arquivo de teste)
  → backup passa a usar o provider; badge do destino na tela de backup
```

- Erros comuns mapeados (DNS/403/clock skew p/ SigV4; 401/405 em WebDAV
  read-only) com mensagens claras.
- Troca de provider: bloqueada enquanto houver fila ativa; inventário registra
  `provider_id` por item (backup em dois destinos é [ABERTO] — v1: um destino).

## 6. Restore e timeline no modo custom

- Reuso integral do doc 11 §6–7 (índice cifrado no provider, decifração local,
  restore em device limpo) — a timeline remota `/cloud-photos` ganha um modo
  "custom provider" com as mesmas telas, mudando só a fonte.

## 7. Tarefas

- [ ] 12.1 Extrair `StorageProvider` e refactor do `backup-engine` (cloud vira
      implementação — sem mudança de comportamento)
- [ ] 12.2 Licença vitalícia: produto Play Billing `iphotos.lifetime` + endpoint
      `POST /api/billing/verify` (reuso doc 10) + token de licença offline
- [ ] 12.3 `s3StorageProvider` (SigV4, endpoint custom, multipart) + testes
      contra MinIO local (docker) via TDD de contrato da interface
- [ ] 12.4 `webdavStorageProvider` (chunks por arquivo, PROPFIND) + testes
      contra servidor WebDAV de teste
- [ ] 12.5 UI de configuração + teste de conexão + badge de destino
- [ ] 12.6 Restore/ timeline no provider custom (reuso doc 11)
- [ ] 12.7 Testes E2E: backup→wipe→restore via MinIO; credenciais erradas;
      retomada de multipart

## 8. Critérios de aceite

1. Usuário com licença configura MinIO próprio e completa backup + restore em
   dispositivo limpo, sem que o servidor iPhotos receba qualquer byte de foto.
2. Sem licença, o modo custom aparece bloqueado com paywall claro; galeria local
   segue 100% funcional.
3. Kill no meio de upload multipart S3 → retomada das partes já enviadas.
4. Credenciais nunca aparecem em logs e ficam apenas no SecureStore.
5. O formato dos blobs é o mesmo do doc 11 — uma conta pode migrar de destino
   (copiar blobs) sem re-cifrar.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Diversidade de S3-compatible (quirks) | Testes de contrato contra MinIO + B2; path-style configurável |
| WebDAV lento/instável | Chunks pequenos, retry com backoff, limites documentados |
| AWS SDK pesado no bundle | Importar só módulos S3 (tree-shake); medir tamanho do APK |
| Suporte a credenciais perdidas = dados perdidos | Copy honesta; teste de conexão antes de ativar |
