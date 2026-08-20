# 10 — Billing & assinaturas (decisão D5)

> Fase 5 · Depende de: 09 (backend integrado; `plan`/quota já existem no `users`) ·
> Alimenta: 02 (matriz de modos), 07 (Settings)
> Objetivo: monetizar o modo Cloud — assinatura mensal/anual que controla quota de
> backup — com verificação server-side, paywall no app e ciclo de vida completo
> (upgrade, downgrade, cancelamento, grace period).

## 1. Contexto atual

- Backend (repo `C:\dev\csharp\iPhotos`): tabela `users` já tem `plan` e a quota
  (15 GiB no v1) é aplicada no upload (413 quando excede). `GET /api/usage`
  expõe bytes usados vs quota. **Não existem** endpoints de billing nem tabela de
  assinaturas/compras.
- App: `src/stores/account.ts` guarda sessão; `/settings/account` mostra usage
  (barra) via `GET /api/usage`. Sem noção de plano na UI.
- Modos (doc 02): Offline (sem conta, grátis) × Cloud (assinatura). A matriz de
  funcionalidades já reflete isso.

## 2. Decisão D5 — Play Billing vs Stripe

| | Play Billing (Android) | Stripe (web/checkouts) |
|---|---|---|
| Distribuição | Nativa no Play Store; pagamento familiar | Requer checkout hospedado fora do app (política do Play: bens digitais **devem** usar Play Billing) |
| Verificação | Google Play Developer API (server-to-server) | Webhooks assinados (server-to-server) |
| Taxa | ~15–30% | ~3–5% |
| Cobertura | Só Android | Qualquer plataforma (futuro web/iOS/desktop) |
| Setup | Conta de desenvolvedor + produtos criados no console | Conta Stripe + endpoint de webhook |

**Recomendação (a confirmar — D5):** **Play Billing no v1** (o app só existe no
Android hoje e a política do Google obriga Play Billing para bens digitais
consumidos no app), com a verificação de compra feita no backend via Google Play
Developer API. Desenhar o backend com uma abstração `IBillingProvider` para
acrescentar Stripe depois como segundo provider (web checkout) sem mudar o domínio.

## 3. Planos (matriz inicial)

| | Free (modo Offline) | Cloud (assinatura) |
|---|---|---|
| Galeria local, álbuns, favoritos, Pasta Segura | ✔ | ✔ |
| Labels/busca local (05A) | ✔ | ✔ |
| Backup na nuvem | ✖ | ✔ quota por plano |
| Timeline remota / restore | ✖ | ✔ |
| Classificação cloud (05B, futuro) | ✖ | ✔ |

- Produtos Play Billing: `iphotos.cloud.monthly` e `iphotos.cloud.yearly`
  (assinaturas). Quota inicial única de 15 GiB [ABERTO: tiers].
- Preço/testes: conta de licença de teste no Play Console para sandbox.

## 4. Fluxo de compra e verificação

```
App: Paywall → Play Billing (purchase flow do Google) → purchaseToken
  → POST /api/billing/verify { productId, purchaseToken }
Backend: Google Play Developer API (purchases.subscriptionsv2.get)
  → valido? → users.plan = 'cloud', expiresAt = expiryTime
  → responde plano/quota atualizados
App: atualiza account store; destrava quota/timeline remota
```

Renovações/cancelamentos: notificações em tempo real do Play (RTDN — pub/sub) ou
polling diário [ABERTO: RTDN no v1 vs v1.1]; backend baixa `plan` para `free`
quando `expiresAt < agora` após **grace de 3 dias** [ABERTO].

### Ciclo de vida

| Evento | Efeito no backend |
|---|---|
| Compra confirmada | `plan='cloud'`, `expiresAt` = expiry do Play |
| Renovação (RTDN/poll) | estende `expiresAt` |
| Cancelamento | mantém acesso até `expiresAt`; depois grace 3 dias |
| Expirado de fato | `plan='free'`; uploads bloqueados (413/403); **fotos existentes permanecem** — restore/download continua por 90 dias [ABERTO], depois política de retenção avisada por e-mail |
| Reembolso | igual expiração; tombstone das métricas |

## 5. Endpoints novos (backend)

| Endpoint | Função |
|---|---|
| `POST /api/billing/verify` | valida purchaseToken no Google, ativa plano |
| `GET /api/billing/status` | plano atual, `expiresAt`, estado da assinatura (active/grace/expired) |
| `POST /api/billing/restore` | revalida assinatura da conta Google logada (reinstalação) |
| [ABERTO] RTDN receiver | endpoint público para notificações do Play |

App usa `expo-in_app_expense`? **Não** — `react-native-iap` (maduro, dev build já
é o fluxo) ou `expo-iap` [ABERTO: avaliar manutenção na época].

## 6. Paywall e UI

- Gatilhos: backup configurado pela 1ª vez, upload passando da quota (413),
  tentativa de restore em device limpo, item "iPhotos Cloud" nas Settings.
- Tela de paywall: benefícios, preço mensal/anual, botão de assinar (Play sheet),
  "Restore purchase" e link dos termos.
- Sem assinatura forçada: banner discreto, app 100% funcional local.
- `/settings/account` ganha seção do plano: estado, expiração, gerenciar
  assinatura (deep-link `https://play.google.com/store/account/subscriptions?sku=…`).

## 7. Tarefas

### 10A — Backend
- [ ] 10.1 `IBillingProvider` + `GooglePlayBillingProvider` (credentials via config)
- [ ] 10.2 Tabela `billing_purchases(userId, productId, purchaseToken, purchaseState, expiresAt, updatedAt)` única por purchaseToken
- [ ] 10.3 `POST /api/billing/verify` (idempotente; valida no Google; atualiza `users.plan`/quota)
- [ ] 10.4 `GET /api/billing/status` + `POST /api/billing/restore`
- [ ] 10.5 Job diário de expiração (grace 3 dias) + testes TDD (happy, token inválido, já expirado, reembolso)

### 10B — App
- [ ] 10.6 Lib de IAP no app (D5/escolha acima) + wrapper `src/data/billing.ts`
- [ ] 10.7 Tela de paywall + gatilhos (413, primeira config de backup)
- [ ] 10.8 Seção do plano em `/settings/account` (estado, gerenciar, restore)
- [ ] 10.9 account store reflete `plan` (matriz do doc 02) e bloqueia upload acima da quota com copy clara
- [ ] 10.10 Testes: fluxo sandbox completa assinatura → quota aplicada; expiração → downgrade sem perder fotos

## 8. Critérios de aceite

1. Compra sandbox: `GET /api/billing/status` retorna `cloud` ativo e upload até a
   quota funciona; app reflete o plano sem reinstalação.
2. Compra forjada (token inválido/reusado de outra conta) → rejeitada pelo
   backend (409/400) e o plano não muda.
3. Expiração + grace vencido: uploads bloqueados, timeline local intacta, fotos
   na nuvem preservadas conforme política do §4.
4. Restore purchase em reinstalação recupera o plano.
5. Modo Offline não vê nenhum paywall além do informativo.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Política do Play (bens digitais) | Usar Play Billing no Android desde o v1; Stripe só via web checkout |
| RTDN setup (pub/sub) mais complexo que o esperado | v1 com polling diário no job de expiração; RTDN como follow-up |
| Fraude de client-side claim | Backend **sempre** valida com a Play Developer API antes de mudar `plan` |
| Loot boxes de estado (client desatualizado) | Server decide tudo; app só reflete `GET /api/billing/status` |
