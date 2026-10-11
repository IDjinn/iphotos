#!/usr/bin/env bash
# Build the iPhotos APK inside WSL (Ubuntu). See docs/BUILD_WSL.md for prerequisites.
#
# Usage (from WSL):  bash /mnt/c/dev/react-native/iphotos/frontend/scripts/build-wsl.sh [debug|release] [abi]
# Default variant: release (standalone APK, JS bundled — no Metro needed).
# Default ABI: arm64-v8a (physical phones). For an emulator use x86_64.
#
# NOTE: for day-to-day TS/TSX iteration use Metro + Fast Refresh (expo start
# --dev-client) instead of this script — it skips Gradle entirely. This script
# is for standalone APK artifacts only.
set -euo pipefail

VARIANT_INPUT="${1:-release}"
ABI="${2:-arm64-v8a}"

case "${VARIANT_INPUT,,}" in
  debug)   VARIANT_LOWER=debug;   VARIANT_GRADLE=Debug;   ;;
  release) VARIANT_LOWER=release; VARIANT_GRADLE=Release; ;;
  *)
    echo "Invalid variant: $VARIANT_INPUT (use debug or release)" >&2
    exit 2
    ;;
esac

PROJECT_SRC=/mnt/c/dev/react-native/iphotos/frontend
BUILD_DIR="$HOME/build/iphotos"
OUT_APK="$BUILD_DIR/android/app/build/outputs/apk/$VARIANT_LOWER/app-$VARIANT_LOWER.apk"
OUT_WIN=/mnt/c/Users/lucas/Downloads

# --- toolchain env (JDK 17, Android SDK, Node 20 via nvm, bun) ---
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="$HOME/.bun/bin:$PATH"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

echo "==> [1/5] Syncing project to $BUILD_DIR (WSL-native fs for fast C++ builds)"
mkdir -p "$BUILD_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .expo \
  --exclude .kotlin \
  --exclude .hotpath \
  --exclude android/build \
  --exclude android/app/build \
  --exclude android/.gradle \
  --exclude android/app/.cxx \
  --exclude android/local.properties \
  "$PROJECT_SRC/" "$BUILD_DIR/"

# EXPO_PUBLIC_* vars are baked into the release JS bundle at bundle time, but
# Gradle doesn't track .env as a task input — a changed .env alone leaves the
# bundle UP-TO-DATE with stale values. Force a re-bundle when .env* changes.
# The fingerprint includes file NAMES (precedence between .env/.env.local/...
# matters, not just contents). The stamp is written only AFTER a successful
# build, so a failed build re-runs the invalidation next time.
ENV_STAMP="$HOME/build/.iphotos-env-hash"
ENV_HASH=$(
  cd "$PROJECT_SRC"
  find . -maxdepth 1 -type f -name '.env*' -print0 |
    sort -z |
    while IFS= read -r -d '' file; do
      printf '%s\0' "$file"
      sha256sum "$file"
    done |
    sha256sum | cut -d' ' -f1
)
ENV_CHANGED=0
if [ "$(cat "$ENV_STAMP" 2>/dev/null || true)" != "$ENV_HASH" ]; then
  echo "==> .env changed: forcing JS re-bundle (EXPO_PUBLIC_* baked into release bundle)"
  rm -rf "$BUILD_DIR/android/app/build/generated/assets/react" \
         "$BUILD_DIR/android/app/build/generated/assets/createBundleReleaseJsAndAssets" \
         "$BUILD_DIR/android/app/build/generated/res/react" \
         "$BUILD_DIR/android/app/build/generated/res/createBundleReleaseJsAndAssets"
  find "$BUILD_DIR/android/app/build/intermediates" -name "index.android.bundle*" -delete 2>/dev/null || true
  ENV_CHANGED=1
fi

echo "==> [2/5] Checking dependencies (bun runs only when they changed)"
DEPS_DIR="$BUILD_DIR/.hotpath"
DEPS_STAMP="$DEPS_DIR/deps.sha256"
mkdir -p "$DEPS_DIR"
DEPS_HASH=$(
  cd "$BUILD_DIR"
  find . \
    \( -type d \( -name node_modules -o -name .git -o -name .expo -o -name android \) -prune \) -o \
    \( -type f \( -name package.json -o -name bun.lock -o -name bun.lockb -o -name bunfig.toml \) -print0 \) |
    sort -z |
    while IFS= read -r -d '' file; do
      sha256sum "$file"
    done |
    sha256sum | cut -d' ' -f1
)
if [[ ! -d "$BUILD_DIR/node_modules" || "$(cat "$DEPS_STAMP" 2>/dev/null || true)" != "$DEPS_HASH" ]]; then
  echo "==> Dependencies changed; running bun install"
  (cd "$BUILD_DIR" && bun install --frozen-lockfile --prefer-offline)
  printf '%s\n' "$DEPS_HASH" > "$DEPS_STAMP"
else
  echo "==> Dependencies unchanged; skipping bun install"
fi

echo "==> [3/5] Applying WSL Gradle tuning (marker-guarded)"
# Sized for the 9GB WSL2 VM (.wslconfig): Gradle heap up, Kotlin compiled
# in-process (no separate daemon to OOM), moderate worker cap. Build Cache on
# so re-runs reuse task outputs. Appended after rsync on every run (marker-
# guarded) — last value wins over the -Xmx4096m in the tracked gradle.properties.
# Note: the Gradle configuration cache is NOT enabled here — Expo's react {}
# block shells out to node at configuration time (resolveAppEntry, hermes,
# codegen), which config-cache rejects.
GP="$BUILD_DIR/android/gradle.properties"
if ! grep -q "# wsl-build-tuning" "$GP"; then
  cat >> "$GP" <<'EOF'

# wsl-build-tuning: see scripts/build-wsl.sh
org.gradle.jvmargs=-Xmx3584m -XX:MaxMetaspaceSize=768m
kotlin.compiler.execution.strategy=in-process
org.gradle.workers.max=4
org.gradle.caching=true
EOF
fi

echo "==> [4/5] Building assemble$VARIANT_GRADLE"
# lintVital is the Play-Store-oriented crash-prevention lint; it runs on every
# release build for little value on a locally installed test APK. Skip it via
# task exclusion (release-only tasks — passing -x on a debug build fails).
LINT_SKIP=()
if [[ "$VARIANT_LOWER" == release ]]; then
  LINT_SKIP=(-x lintVitalAnalyzeRelease -x lintVitalReportRelease)
fi
(cd "$BUILD_DIR/android" && ./gradlew "assemble${VARIANT_GRADLE}" \
  "${LINT_SKIP[@]}" \
  "-PreactNativeArchitectures=$ABI" \
  --console=plain)

# Build succeeded — only now record the .env fingerprint.
if [[ "$ENV_CHANGED" == 1 ]]; then
  printf '%s\n' "$ENV_HASH" > "$ENV_STAMP"
fi

echo "==> [5/5] Copying APK to Windows"
cp "$OUT_APK" "$OUT_WIN/iphotos-$VARIANT_LOWER-$ABI.apk"
echo "Done: $OUT_WIN/iphotos-$VARIANT_LOWER-$ABI.apk"
