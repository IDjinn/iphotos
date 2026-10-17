# iPhotos

A Google Photos clone: a photo and video gallery with optional self-hosted cloud backup.

- **Timeline** — newest-first grid with month/day headers and a full-screen viewer.
- **Albums & favorites** — organize and bulk-manage photos.
- **Search** — find photos by date, type, or AI-generated labels.
- **Locked Folder** — private space behind a PIN or biometrics.
- **Backup & sync** — optional upload to your own server, with dedup and multiple image sizes.
- **Web & desktop** — browse the same library from the browser or an Electron app.

## Repository layout

| Folder | What it is |
|---|---|
| [`mobile/`](mobile/) | Android app (Expo / React Native) — [README](mobile/README.md) |
| [`web/`](web/) | Web (Next.js) and desktop (Electron) client — [README](web/README.md) |
| [`backend/`](backend/) | .NET API and worker, run with Docker Compose — [README](backend/README.md) |
| [`ml/`](ml/) | Python ML service — [README](ml/README.md) |
| [`docs/`](docs/) | Build guide ([`BUILD_WSL.md`](docs/BUILD_WSL.md)) and plans ([`docs/plans/`](docs/plans/00-roadmap.md)) |

## Quick start

```bash
# Backend (API on http://localhost:5205)
cd backend && docker compose up --build -d

# Mobile
cd mobile && bun install && bun start

# Web (http://localhost:3000)
cd web && bun install && bun dev
```

See each folder's README for configuration details.
