# 13 — AI kill-switch, local previews and encrypted offline mode

Status: **implemented** (2026-08-20).

## 1. AI master switch

- `useClassificationStore.aiEnabled` (persisted, default `true`) + `setAiEnabled`.
- Settings → Privacy → **Artificial intelligence** switch. When off:
  - hides the "Smart search & labels" switch, AI labeling row, AI model row;
  - hides the labels section and AI card in the Search tab;
  - stops auto-indexing on app open (`_layout.tsx`), `runIndexation`,
    `runAiIndexation` and local CLIP `runLabeling`.
- Nothing is deleted: labels stay in SQLite and come back when re-enabled.

## 2. Local low-res preview pipeline

- `src/data/thumbnails.ts`: ~512px JPEG (quality 0.75) per photo at
  `Documents/thumbnails/{assetId}.jpg`, bookkept in the `thumbnails` table.
- Generation is on-demand per grid cell (`useThumbnailUri`) plus an
  incremental library-wide batch (Settings → Appearance → **Photo previews**)
  with progress and orphan pruning (`pruneOrphanThumbnails`).
- `PhotoCell` renders the thumbnail with fallback to the original URI;
  `purgeAssetMetadata` removes thumbnail rows alongside other metadata.
- Videos are excluded (no frames without `expo-video-thumbnails`).

## 3. Encrypted offline mode

Opt-in mode that removes the photos from the system media store and keeps
them encrypted locally, unlocked with a password.

### Key hierarchy

- Random 256-bit data key wraps nothing — it encrypts files directly
  (AES-256-GCM, `[IV | ciphertext | tag]`, chunked, reusing `vault-crypto`
  with an explicit key).
- The data key is wrapped with an AES-256-GCM key derived from the user's
  password via PBKDF2-SHA256, 200k iterations (`encrypted-crypto.ts`).
  The wrapped key + salt + IV live in SecureStore (`encryptedMode.key.v1`).
- The unwrapped key exists only in memory for the duration of an unlocked
  session; locking purges the session cache. No recovery: a lost password
  means unrecoverable photos (by design).

### Migration

- `encryptLibrary` pages through every photo, generates its thumbnail,
  encrypts original + thumbnail to `Documents/encrypted/{assetId}.bin`
  (`.thumb.bin`), records it in `encrypted_assets`, then deletes it from the
  media library (same rollback semantics as the vault when the system
  refuses the delete). Resumable: already-encrypted ids are skipped.
- `decryptAllBack` restores everything to the media library and destroys the
  key config (disable flow).

### Browsing

- `loadEncryptedGridAssets` decrypts thumbnails into
  `Cache/encrypted-session` and feeds a `PhotoGrid` inside
  `/settings/encrypted-mode` (unlocked state).
- Tapping a photo decrypts the original on demand
  (`resolveEncryptedOriginal`) and opens the global viewer; other pages keep
  their preview until visited.
- The app re-locks (and purges plaintext) whenever it leaves the foreground,
  same as the Locked Folder.

### Scope / future work

- Photos only — videos stay in the media library untouched.
- Encrypted photos are excluded from cloud backup and AI indexing while
  locked (they are no longer in the media store).
- Nice-to-haves: biometric unlock wrap, background migration with
  `expo-task-manager`, password change (re-wrap), integration of the
  encrypted grid into the main Photos tab.
