# 07 — Configurações da conta e do backup

> **Status: 🟡 Fase 1 implementada (2026-08-16)** — seções Account (modo local + CTA login), Backup & sync (placeholders desabilitados) e Smart search com toggle/contagem; placeholder "Local only · phase 2" removido. Subtelas `/settings/account`, `/settings/backup` e `/settings/backup/folders` ficam para as Fases 2–3.
>
> Fase 1 (Conta básica) → Fase 2–3 (Backup, Segurança) · Depende de: 01, 02, 03, 04, 05, 06
> Objetivo: estruturar as Settings do app com as seções de **Conta**, **Modo ativo**,
> **Backup** (status, pastas, condições, restore, importar ZIP) e **Segurança/Privacidade**,
> substituindo o placeholder atual "Backup: Local only · phase 2".

## 1. Contexto atual

- `src/app/settings.tsx` é uma tela única com seções: Appearance, Feedback,
  Privacy (Locked Folder), About (Version + placeholder de Backup).
- Stores: `settings.ts` (tema/haptics), e os novos `account.ts` (doc 02),
  `backup.ts` (doc 03), `import-zip.ts` (doc 06), `classification.ts` (doc 05).
- Rotas: expo-router permite `settings.tsx` coexistir com `settings/*.tsx`
  (`/settings/account`, `/settings/backup`, …) no mesmo padrão de `album/[id]`.

## 2. Mapa de telas

```
/settings                       (existente, ganha seções novas)
 ├── /settings/account          Conta: perfil, plano, uso, sair, apagar
 ├── /settings/backup           Backup: status, condições, ações
 │     ├── /settings/backup/folders    Pastas sincronizadas/ignoradas (doc 04)
 │     └── (ação) restore              Fluxo do doc 03 §9
 └── (dentro de account)        Segurança: senha, chave de recuperação, classificação
```

## 3. Tela principal (`/settings`)

Novas seções acima de "About" (placeholder de Backup sai de About):

```
Account
 ┌────────────────────────────────────────────┐
 │ (C) lucas@…            Cloud · Pro 200GB ▸ │ ← com conta: email + plano → /settings/account
 └────────────────────────────────────────────┘
   — ou, modo offline —
 ┌────────────────────────────────────────────┐
 │ (C) Local mode — no account        ▸       │ ← "Set up cloud backup" como subtítulo
 └────────────────────────────────────────────┘

Backup & sync
 ┌────────────────────────────────────────────┐
 │ (⋎) Backup status    3.412 of 3.890 · 21GB ▸│ ← → /settings/backup
 │ (📥) Import from ZIP                        │ ← dispara doc 06
 └────────────────────────────────────────────┘
```

- No modo offline, "Backup status" mostra `Cloud only` desabilitado com CTA
  (doc 02 §2.2); "Import from ZIP" permanece ativo (recurso local).

## 4. `/settings/account`

- **Com conta**: e-mail; avatar gerado (hash do e-mail → cor/iniciais, sem serviço
  externo); plano atual + barra de uso (`GET /usage` do doc 03 §10); "Manage
  subscription" (deep link do billing, D5); **Sign out**; **Delete account**
  (fluxo destrutivo: exigir senha + oferecer "download all data antes" = restore
  completo; confirmação em 2 passos; agenda exclusão de blobs no servidor).
- **Segurança** (subseção): "Change password" (re-wrap da MasterKey, doc 03 §6.2);
  "Recovery key" (ver = exigir senha; regenerar = invalidar a anterior);
  "Cloud classification" (toggle opt-in do doc 05 §5, default off, com link para a
  explicação honesta de privacidade).
- **Sem conta**: a tela nem é alcançável (a linha da §3 leva ao onboarding/login).

## 5. `/settings/backup`

```
Backup
 Backing up      3.412 of 3.890 items · 21,4 GB of 22,1 GB
 Last run        Today, 14:02 · 12 pending · 2 failed  [Retry]

 [ Back up now ]   [ Pause ]

 Sync conditions
  (—) Wi-Fi only            [on]
  (⚡) Only while charging  [off]

 Content
  (uvez) Folders     4 of 5 included              ▸  → /settings/backup/folders

 Danger zone
  (⟳) Restore / migrate to this device…               (doc 03 §9)
  (⛔) Stop backup and remove cloud data…              (tombstones totais + confirmação)
```

- Dados vindos de `src/stores/backup.ts` (motor do doc 03): contadores por estado,
  `lastRun`, `running/paused`, condições persistidas.
- Falhas listadas ao toque (última mensagem de `last_error` por item).
- "Pause" desliga o worker sem perder a fila (retoma em "Back up now" ou automático).
- Notificação de pasta nova pendente de decisão (doc 04 §5) aparece aqui como card.

## 6. Especificação técnica

- Novas rotas: `src/app/settings/account.tsx`, `src/app/settings/backup.tsx`,
  `src/app/settings/backup/folders.tsx` (doc 04).
- Componentes reutilizados: `Section`/rows de `settings.tsx` (extrair para
  `src/components/settings/` se repetir), `Icon`, `ThemedText`, `PressableScale`,
  `BottomSheet` para confirmações destrutivas, `MiniToast` para feedback curto.
- Nenhuma tela fala com rede/DB direto: sempre via stores/repositories
  (`account.ts`, `backup.ts`, doc 03 engine).
- Estados de carregamento por tile (skeleton simples) — uso do plano e stats do
  backup chegam assíncronos.
- Acessibilidade: todos os rows com `accessibilityLabel` + `role="button"`;
  toggles com `accessibilityState`.

## 7. Tarefas

### Fase 1
- [ ] 7.1 Extrair componentes de settings (`Section`, `Row`, `ToggleRow`) p/ reuso
- [ ] 7.2 Seção "Account" refletindo modo offline (sem rede) → CTA login
- [ ] 7.3 Seção "Backup & sync" com estados desabilitados no modo offline
      (placeholder "Local only · phase 2" removido aqui)

### Fase 2
- [ ] 7.4 `/settings/backup` com stats do inventário (03A), condições (kv), link ZIP
- [ ] 7.5 `/settings/backup/folders` (doc 04)

### Fase 3
- [ ] 7.6 `/settings/account` completa (plano, uso, sign out, delete account)
- [ ] 7.7 Segurança: troca de senha, chave de recuperação (03F)
- [ ] 7.8 Ações "Back up now"/"Pause"/"Retry failed" ligadas ao motor
- [ ] 7.9 Restore como fluxo em tela própria (progresso por item — doc 03 §9)
- [ ] 7.10 Danger zone: stop + remove cloud data (confirmação dupla)

### Fase 5
- [ ] 7.11 Toggle de classificação cloud com copy honesta (doc 05 §5.2) + status
      de indexação local ("Indexed 8.212 of 9.000")

## 8. Critérios de aceite

1. Modo offline: nenhuma tela nova tenta rede; CTAs de cloud explicam o porquê de
   estarem desabilitados (doc 02 §2.2).
2. Placeholder "Local only · phase 2" não existe mais em nenhuma tela.
3. Todas as ações destrutivas (delete account, remove cloud data, stop backup)
   exigem confirmação explícita em 2 passos via `BottomSheet`.
4. Stats de backup refletem a fila em tempo real durante um upload de teste
   (contadores mudam sem reload manual).
5. Navegação Settings → subtelas funciona com back gesture/botão e deep links
   (`iphotos://settings/backup`).
6. Dark/light e fontes ampliadas verificados em todas as telas novas.
