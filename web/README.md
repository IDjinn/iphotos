# iPhotos — Web & Desktop

Browser client (Next.js) and desktop shell (Electron) for iPhotos Cloud.
The Android app lives in [`frontend/`](../frontend); both consume the same
backend contract ([docs/plans/09-backend-api.md](../docs/plans/09-backend-api.md)).
Planning: [docs/plans/14-web-desktop.md](../docs/plans/14-web-desktop.md).

## Stack

- Next.js (App Router) + TypeScript, styled-components for layout, shadcn/ui primitives, Tailwind for the primitives' internals
- TanStack Query (server state) + zustand (UI state)
- Electron for the desktop build; electron-builder for packaging

## Getting started

```bash
bun install
cp .env.example .env          # set NEXT_PUBLIC_API_URL (e.g. http://localhost:5205)
bun dev                       # web on http://localhost:3000
```

The build fails if `NEXT_PUBLIC_API_URL` is missing — there is no default endpoint
(same contract as the mobile app). Note the value is inlined at build time.

## Commands

| Command | What it does |
| --- | --- |
| `bun dev` | Next dev server (browser) |
| `bun build` / `bun start` | Production build / serve |
| `bun dev:electron` | Next dev + Electron window (desktop dev) |
| `bun start:electron` | Electron over an existing production build |
| `bun dist` | Production build + Windows installer (`dist-electron/`) |
| `bun lint` / `bunx tsc --noEmit` | ESLint / TypeScript |
| `bunx playwright test` | E2E (starts the production server itself) |

## Structure

```
src/
├── app/            # routes: (public)/login|register, (app)/photos|import|subscription|settings
├── components/     # shell, auth, gallery, viewer, upload, billing, settings, ui (shadcn)
├── data/           # API contract (typed modules, no backend internals)
├── stores/         # zustand: auth, theme, ui (viewer/upload queue)
├── styles/         # shared style helpers (breakpoints, focus, motion)
└── lib/            # config (API URL), formatting
electron/           # main.cjs (embedded Next server), preload.cjs
```

## Desktop notes

- The Electron main process boots the built Next server on `127.0.0.1:3210` and
  loads it — that origin is allow-listed in the backend CORS config
  (`Cors__AllowedOrigins__1` in `backend/compose.yaml`).
- `Alt+←/→` navigate history, `Ctrl+W` closes the window, mouse side buttons work.
- Context isolation is on; no Node APIs are exposed to the renderer.
