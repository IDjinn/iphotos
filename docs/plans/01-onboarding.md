# 01 — Onboarding (primeira execução)

> **Status: ✅ implementado (2026-08-16)** — ver 00-roadmap §5.1. D8 resolvido mantendo a permissão no PermissionGate. Ajuste em relação ao spec: o gate só cerca o `/welcome` após a conclusão — `/login` e `/register` permanecem acessíveis (CTA da seção Account das Settings).
>
> Fase 1 · Depende de: nada · Alimenta: 02 (modos), 07 (settings)
> Objetivo: na primeira abertura do app, exibir uma introdução com logo, título e
> descrição, e botões de **login**, **registro** ou **continuar sem conta** (modo offline).

## 1. Contexto atual

- Stack de rotas raiz em `src/app/_layout.tsx`: `(tabs)`, `settings`, `album/[id]`,
  `locked`. **Não existe nenhum fluxo de primeira execução** além do
  `src/components/PermissionGate.tsx` (permissão de mídia) na aba Photos.
- Padrão de persistência a reaproveitar: zustand + `persist` com o adapter SQLite
  (`src/data/kv-storage.ts`), igual a `src/stores/settings.ts`.
- Componentes base: `ThemedText`, `Icon` (Ionicons), `PressableScale`, animações
  Reanimated (`FadeInDown` etc., ver `src/app/settings.tsx`), `haptic()` de
  `src/utils/haptics.ts`, tema de `src/theme/context.tsx`.
- A UI do app é em **inglês** — manter o idioma nas telas novas.

## 2. Especificação funcional

### 2.1 Gatilho

- Se `onboarding.completed === false` (default), o app abre em `/welcome` em vez de
  `(tabs)`. Qualquer navegação para `(tabs)`/`settings` com onboarding incompleto é
  redirecionada de volta para `/welcome`.
- Após concluir o onboarding (por qualquer caminho), nunca mais é exibido.
- [ABERTO D8] Permissão de mídia: **recomendação = continuar pedindo no
  PermissionGate da aba Photos**, mantendo a tela de boas-vindas sem fricção.
  Alternativa: pedir logo após escolher "Continuar sem conta".

### 2.2 Tela de boas-vindas (`/welcome`)

```
┌──────────────────────────────────────┐
│                                      │
│              [LOGO]                  │  ← animação de entrada (escala+fade)
│                                      │
│            iPhotos                   │  ← título (titleLarge)
│   Your photos. Private by default.   │  ← descrição curta (1–2 linhas)
│                                      │
│  ┌────────────────────────────────┐  │
│  │ • Works fully offline          │  │  ← 3 bullets curtos
│  │ • End-to-end encrypted backup  │  │
│  │ • Smart search, on-device      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │         Create account         │  │  ← botão primário → /register
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │             Log in             │  │  ← botão secundário → /login
│  └────────────────────────────────┘  │
│                                      │
│      Continue without account        │  ← link discreto (bodySmall/accent)
│                                      │
└──────────────────────────────────────┘
```

- Copy sugerida (EN): título `iPhotos`; descrição `Your photos. Private by default.`;
  bullets `Works fully offline`, `Optional end-to-end encrypted backup`,
  `Smart search that runs on your device`.
- Logo: usar o ícone/splash existente em `assets/`; se não houver marca, criar um
  componente `Wordmark` simples (ícone `images` do Ionicons + tipografia) — [ABERTO].

### 2.3 Telas de login e registro (`/login`, `/register`)

**Na Fase 1 o backend ainda não existe.** As telas são construídas completas
(formulário, validação, estados de loading/erro) e o submit chama um stub.

- **Registro**: nome (opcional), e-mail, senha, confirmação de senha. Validações:
  e-mail com regex simples, senha mínima de 8 caracteres com ao menos 1 número,
  confirmação igual. Checkbox "I understand that losing my password may make my
  cloud backups unrecoverable" (obrigatório — prepara o terreno da decisão D3).
- **Login**: e-mail + senha, link "Forgot password?" (apenas visual na Fase 1).
- Comportamento do submit no stub: exibe `MiniToast`/inline banner
  `Cloud service is not available yet — you can continue in offline mode.`
  e oferece botão `Continue offline` que conclui o onboarding em modo offline.
  Assim, a Fase 3 apenas troca o handler do submit pela chamada real de API
  (doc 03 §auth), sem retrabalho de UI.
- Ambas têm link de volta para `/welcome`.

### 2.4 Conclusão do onboarding

- "Continue without account" (e o fallback do stub) → `completeOnboarding('offline')`
  → `router.replace('/')`.
- Após login/registro reais (Fase 3): `completeOnboarding('cloud')`; exibir em
  sequência a geração da chave de recuperação (doc 03 §11) e o consentimento de
  classificação (doc 05 §5) — já especificados nos docs respectivos.

## 3. Especificação técnica

### 3.1 Tipo compartilhado

Definir em `src/data/types.ts` (evita dependência entre stores):

```ts
export type AppMode = 'offline' | 'cloud';
```

### 3.2 Store

`src/stores/onboarding.ts`, seguindo o padrão de `settings.ts`:

```ts
interface OnboardingState {
  completed: boolean;
  mode: AppMode | null;
  complete: (mode: AppMode) => void;
}
// persist { name: 'onboarding', storage: sqliteStorage }
```

### 3.3 Rotas

```
src/app/(public)/_layout.tsx    ← stack própria, header oculto, transição fade
src/app/(public)/welcome.tsx
src/app/(public)/login.tsx
src/app/(public)/register.tsx
```

- O grupo `(public)` não afeta URLs (`/welcome`, `/login`, `/register`).
- `(tabs)` precisa deixar de ser a rota inicial implícita: o gate decide.

### 3.4 Gate no layout raiz

Em `src/app/_layout.tsx`, envolver a `Stack` com a lógica de redirect
(hidratação do persist: renderizar `SplashScreen.preventAutoHideAsync()` até o
store reidratar, para evitar flash da tela errada):

```tsx
const completed = useOnboardingStore((s) => s.completed);
const segments = useSegments();
const inPublic = segments[0] === '(public)';

useEffect(() => {
  if (!completed && !inPublic) router.replace('/welcome');
  if (completed && inPublic) router.replace('/');
}, [completed, inPublic]);
```

### 3.5 Detalhes de UI

- Botões: cantos 14px (raio já usado no app), primário com `colors.accent`,
  secundário `colors.surface` + borda — mesmos tokens de `settings.tsx`.
- Animações: entrada do logo com `FadeInDown` + escala; bullets com stagger de 80ms;
  botões com `PressableScale` e `haptic('light')` no press (respeitando
  `hapticsEnabled`).
- Acessibilidade: `accessibilityLabel` em todos os botões; contraste AA nos textos
  secundários; ordem de foco logo → título → botões.

## 4. Tarefas

- [ ] 1.1 Adicionar `AppMode` em `src/data/types.ts`
- [ ] 1.2 Criar `src/stores/onboarding.ts` (persist SQLite)
- [ ] 1.3 Criar grupo de rotas `(public)` com `_layout` (stack, sem header)
- [ ] 1.4 Implementar `/welcome` (logo, título, descrição, bullets, 3 ações)
- [ ] 1.5 Implementar `/register` (formulário + validações + checkbox E2E + stub)
- [ ] 1.6 Implementar `/login` (formulário + stub)
- [ ] 1.7 Gate de redirect no `_layout` raiz + splash até reidratação
- [ ] 1.8 Polimento: animações, haptics, dark mode, acessibilidade
- [ ] 1.9 Testar fluxos: primeira execução → welcome → continuar sem conta → tabs;
      reopen não mostra onboarding de novo; deep link `/settings` com onboarding
      incompleto cai no welcome

## 5. Critérios de aceite

1. Primeira execução abre em `/welcome`; nenhuma tela do app é alcançável sem
   concluir o onboarding.
2. "Continue without account" leva à galeria com `mode = 'offline'` e o onboarding
   nunca reaparece (reiniciar o app mantém o estado).
3. `/login` e `/register` validam entrada e exibem o aviso do stub sem quebrar.
4. Fluxo funciona em dark/light e com fontes de sistema ampliadas.
5. Nenhum componente novo importa `expo-media-library` direto (regra do projeto).

## 6. Extensões futuras (fora do escopo da Fase 1)

- Tela de escolha de modo pós-login (Cloud vs Offline) quando ambos existirem.
- Re-onboarding opcional para anunciar novos recursos (flag versionada).
- deep link `iphotos://welcome` para reabrir a introdução a partir de Settings.
