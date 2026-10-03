# iPhotos

A local-first, privacy-focused photo gallery for Android — a Google Photos-style experience that works entirely offline. Timeline, albums, favorites, semantic search over AI-generated labels, and an encrypted Locked Folder. Nothing leaves the device unless you explicitly configure it.

Built with Expo SDK 57 / React Native 0.86 / React 19.

## Features

- **Timeline gallery** — newest-first grid with sticky month/day headers (FlashList 2), swipeable viewer with hero (shared-element) transitions, and video playback via `expo-video`.
- **Albums, favorites & bulk actions** — device albums with covers, favorites shelf, and multi-select actions (delete, share, add/remove from album).
- **Locked Folder** — gated by PIN or biometrics (Face ID / fingerprint). Assets are encrypted with AES-256-GCM before being written to app storage; the 256-bit key lives in the hardware-backed keystore. Locked assets are never sent to any labeling pipeline.
- **On-device AI labeling** — a quantized CLIP ViT-B/32 vision encoder (~35 MB) runs locally through ONNX Runtime. Incremental background indexing labels new photos, resumes across runs, and works fully offline.
- **Optional cloud labeling** — connect any OpenAI-compatible vision endpoint (OpenAI, OpenRouter, or a local Ollama/LM Studio instance). Disabled by default; the privacy trade-off is stated on the setup screen.
- **Search** — structured queries (`videos`, `today`, `august 2026`) plus free-text search matched against the label index, with recent searches and a full label browser.
- **Craft** — automatic dark/light themes, haptics, reduced-motion support, React Compiler, typed routes.

## How on-device labeling works

The trick that keeps the app small: the CLIP **text** encoder never runs on device.

1. `scripts/generate-clip-prompts.mjs` encodes a curated PT/EN prompt list offline and bundles the embeddings as JSON (`assets/ml/prompts.json`).
2. On device, each photo is decoded, preprocessed into a 224×224 float tensor, and run through the CLIP **vision** encoder in ONNX Runtime.
3. The image embedding is ranked against the precomputed prompt matrix by cosine similarity; the top labels above a calibrated threshold are stored in SQLite.
4. Those labels power free-text search and the label browser — no tokenizer, no text tower, no network.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 57, React Native 0.86, React 19, TypeScript |
| Navigation | expo-router (file-based, typed routes) |
| State | Zustand |
| Storage | expo-sqlite (label index), SecureStore (vault key) |
| Media | expo-media-library, expo-image, expo-video, expo-video-thumbnails |
| ML | onnxruntime-react-native, CLIP ViT-B/32 (int8) |
| Crypto | react-native-quick-crypto (AES-256-GCM vault) |
| UI | FlashList 2, Reanimated 4, react-native-gesture-handler |

## Getting started

Prerequisites: Node 20+, [Bun](https://bun.sh), and an Android SDK (or use the Docker/WSL build below).

```bash
bun install
bun start          # Metro dev server — scan the QR with Expo Go, hot reload, no build
bun run android    # native dev build (expo run:android)
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit
```

> The backend endpoint must be set in `.env` (`EXPO_PUBLIC_API_URL`) before either workflow starts.

### Expo Go vs native build

The app boots and hot-reloads in **Expo Go** with plain `bun start` — no compile step. The **ZIP
import** (file picker → multipart upload → job polling), cloud photo browsing and search all work
fully. On Android 13+, Expo Go cannot hold media-library permissions at all, so the Photos tab
falls back to rendering the cloud-backed library instead of the device gallery.

Features that rely on custom native modules degrade gracefully with an in-app notice:

| Feature | Expo Go | Native build (`bun run android`) |
| --- | --- | --- |
| ZIP import, cloud photos, search, settings | ✅ | ✅ |
| Photos tab | ✅ renders cloud photos (`CloudGallery`) | ✅ device timeline |
| Backup from the device gallery | ❌ (needs media library) | ✅ |
| File hashing (backup dedup) | ✅ pure-JS SHA-256 fallback (`@noble/hashes`) | ✅ native (quick-crypto, faster) |
| Locked Folder / encrypted mode | ❌ notice on screen | ✅ AES-256-GCM via quick-crypto |
| On-device AI labeling | ❌ readable error on run | ✅ ONNX Runtime |

The gates live in `src/data/native-crypto.ts` (native crypto/ORT are never evaluated in Expo Go —
Metro turns missing-binding module-scope throws into fatal crashes) and `src/data/media-repository.ts`
(media-library rejections become the typed `MediaLibraryUnavailableError` and a denied permission
response; `use-gallery-feed` branches on `isExpoGo` for the gate).

> Gallery permissions (`expo-media-library`) require a development build — they don't work in Expo Go.

## Building an APK locally

The repo ships a pinned Android toolchain for local releases, with two flavors:

- **Docker** — `docker compose run --rm android` (JDK 17 + Node 22 + android-36/NDK 27.1 image, see `Dockerfile`).
- **WSL** — `scripts/build-wsl.sh`, documented step by step in [`docs/BUILD_WSL.md`](../docs/BUILD_WSL.md).

Both produce a debug-signed standalone APK (JS bundled, no Metro needed) straight from the `android/` Gradle project — no EAS queue, no login.

## Project structure

```
src/
  app/          # expo-router routes: tabs, viewer, album, labels, locked, settings
  components/   # grid, viewer chrome, sheets, selection bar, inputs
  data/         # repositories (media, albums, labels, vault), SQLite, ML pipeline
  data/ml/      # CLIP vision session, preprocessing, prompt matrix, indexer
  stores/       # Zustand stores (library, selection, ai-labeling, locked-session…)
  theme/        # color tokens, dark/light theming
  hooks/, utils/, animations/
../docs/        # repo-level docs (shared with the backend)
  BUILD_WSL.md  # local release-APK build guide
  plans/        # product roadmap and per-topic implementation plans
scripts/
  generate-clip-prompts.mjs  # offline prompt-matrix generator
  build-wsl.sh               # one-shot WSL build
```

## Roadmap

Planned (see `../docs/plans/`): onboarding and accounts with an offline "no account" mode, zero-knowledge E2E-encrypted cloud backup, folder sync/ignore rules, ZIP import, and an optional cloud classification service — always as opt-in additions on top of the local-first core.

## Known limitations

- On 16 KB-page devices (mostly newer emulators) without a compatible native build, the ONNX Runtime module may fail to register; the app detects this and reports it on the labeling screen instead of crashing.
- The release APK is debug-signed — fine for local testing, not for the Play Store.
