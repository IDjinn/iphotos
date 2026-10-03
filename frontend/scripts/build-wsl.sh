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
# WSL2 on a 16GB host gets ~7.7GB RAM. The stock Gradle (4GB) + Kotlin daemon (4GB)
# combo gets OOM-killed mid-build, so run Kotlin inside the Gradle daemon and cap
# parallel workers. Idempotent: appended once, survives rsync (excluded file would not,
# but gradle.properties is synced — hence re-append guarded by the marker).
GP="$BUILD_DIR/android/gradle.properties"
if ! grep -q "# wsl-build-tuning" "$GP"; then
  cat >> "$GP" <<'EOF'

# wsl-build-tuning: fit inside WSL2's ~7.7GB RAM cap (see scripts/build-wsl.sh)
org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m
kotlin.compiler.execution.strategy=in-process
org.gradle.workers.max=3
EOF
fi
(cd "$BUILD_DIR/android" && ./gradlew "assemble$VARIANT" "-PreactNativeArchitectures=$ABI")

echo "==> [4/4] Copying APK to Windows"
cp "$OUT_APK" "$OUT_WIN/iphotos-$VARIANT-$ABI.apk"
echo "Done: $OUT_WIN/iphotos-$VARIANT-$ABI.apk"
