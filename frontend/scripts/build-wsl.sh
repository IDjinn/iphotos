#!/usr/bin/env bash
# Build the iPhotos APK inside WSL (Ubuntu). See docs/BUILD_WSL.md for prerequisites.
#
# Usage (from WSL):  bash /mnt/c/dev/react-native/iphotos/frontend/scripts/build-wsl.sh [debug|release] [abi]
# Default variant: release (standalone APK, JS bundled — no Metro needed).
# Default ABI: arm64-v8a (physical phones). For an emulator use x86_64.
set -euo pipefail

VARIANT="${1:-release}"
ABI="${2:-arm64-v8a}"
PROJECT_SRC=/mnt/c/dev/react-native/iphotos/frontend
BUILD_DIR="$HOME/build/iphotos"
OUT_APK="$BUILD_DIR/android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
OUT_WIN=/mnt/c/Users/lucas/Downloads

# --- toolchain env (JDK 17, Android SDK, Node 20 via nvm, bun) ---
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="$HOME/.bun/bin:$PATH"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

echo "==> [1/4] Syncing project to $BUILD_DIR (WSL-native fs for fast C++ builds)"
mkdir -p "$BUILD_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .expo \
  --exclude .kotlin \
  --exclude android/build \
  --exclude android/app/build \
  --exclude android/.gradle \
  --exclude android/app/.cxx \
  --exclude android/local.properties \
  "$PROJECT_SRC/" "$BUILD_DIR/"

# EXPO_PUBLIC_* vars are baked into the release JS bundle at bundle time, but
# Gradle doesn't track .env as a task input — a changed .env alone leaves the
# bundle UP-TO-DATE with stale values. Force a re-bundle when .env* changes.
ENV_STAMP="$HOME/build/.iphotos-env-hash"
ENV_HASH=$(cat "$PROJECT_SRC"/.env* 2>/dev/null | sort | sha256sum | cut -d' ' -f1)
if [ "$(cat "$ENV_STAMP" 2>/dev/null || true)" != "$ENV_HASH" ]; then
  echo "==> .env changed: forcing JS re-bundle (EXPO_PUBLIC_* baked into release bundle)"
  rm -rf "$BUILD_DIR/android/app/build/generated/assets/react" \
         "$BUILD_DIR/android/app/build/generated/assets/createBundleReleaseJsAndAssets" \
         "$BUILD_DIR/android/app/build/generated/res/react" \
         "$BUILD_DIR/android/app/build/generated/res/createBundleReleaseJsAndAssets"
  find "$BUILD_DIR/android/app/build/intermediates" -name "index.android.bundle*" -delete 2>/dev/null || true
  echo "$ENV_HASH" > "$ENV_STAMP"
fi

echo "==> [2/4] Installing dependencies (bun)"
(cd "$BUILD_DIR" && bun install)

echo "==> [3/4] Building assemble$VARIANT"
# Sized for the 9GB WSL2 VM (.wslconfig): Gradle heap up, Kotlin compiled
# in-process (no separate daemon to OOM), moderate worker cap. Appended after
# rsync on every run (marker-guarded) — last value wins over the -Xmx4096m in
# the tracked gradle.properties. Note: the Gradle configuration cache is NOT
# enabled here — Expo's react {} block shells out to node at configuration
# time (resolveAppEntry, hermes, codegen), which config-cache rejects.
GP="$BUILD_DIR/android/gradle.properties"
if ! grep -q "# wsl-build-tuning" "$GP"; then
  cat >> "$GP" <<'EOF'

# wsl-build-tuning: see scripts/build-wsl.sh
org.gradle.jvmargs=-Xmx3584m -XX:MaxMetaspaceSize=768m
kotlin.compiler.execution.strategy=in-process
org.gradle.workers.max=4
EOF
fi
# lintVital is the Play-Store-oriented crash-prevention lint; it runs on every
# release build for little value on a locally installed test APK. Skip it via
# task exclusion (release-only tasks — passing -x on a debug build fails).
LINT_SKIP=""
[ "$VARIANT" = "release" ] && LINT_SKIP="-x lintVitalAnalyzeRelease -x lintVitalReportRelease"
(cd "$BUILD_DIR/android" && ./gradlew "assemble$VARIANT" $LINT_SKIP "-PreactNativeArchitectures=$ABI")

echo "==> [4/4] Copying APK to Windows"
cp "$OUT_APK" "$OUT_WIN/iphotos-$VARIANT-$ABI.apk"
echo "Done: $OUT_WIN/iphotos-$VARIANT-$ABI.apk"
