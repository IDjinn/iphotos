# iPhotos

A local-first, privacy-focused photo gallery for Android, with an optional self-hosted backend. This repository is a monorepo:

- [`frontend/`](frontend/) — Expo SDK 57 / React Native app: timeline, albums, Locked Folder and on-device CLIP labeling. See [frontend/README.md](frontend/README.md).
- [`backend/`](backend/) — .NET backend services (`iPhotos.sln`), run locally via Docker Compose. See [backend/README.md](backend/README.md).
- [`docs/`](docs/) — shared documentation: local build guide (`BUILD_WSL.md`) and product/implementation plans (`docs/plans/`).
