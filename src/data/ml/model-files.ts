import * as LegacyFileSystem from 'expo-file-system/legacy';

/**
 * On-disk location of the CLIP vision encoder (int8 ONNX), downloaded on
 * demand from the same repo the bundled prompt matrix was generated from —
 * see scripts/generate-clip-prompts.mjs; the two must stay in sync.
 *
 * All IO here goes through the legacy expo-file-system API: on some devices
 * (16 KB-page emulators in compatibility mode) the new File API's metadata
 * calls misbehave — returning null sizes or hanging — while the legacy
 * module, which also performs the download, has proven reliable.
 *
 * The model file itself is never read into the JS heap: ORT's session is
 * created from modelUri() and loads it with native file IO (see
 * vision-session.ts).
 */
export const VISION_MODEL_URL =
  'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx';
export const VISION_MODEL_SIZE_LABEL = '~85 MB';

/** A real model is ~85 MB; anything far smaller is a broken/partial download. */
const MIN_VALID_MODEL_BYTES = 80 * 1024 * 1024;

export function modelUri(): string {
  return `${LegacyFileSystem.documentDirectory}ml/vision_model_quantized.onnx`;
}

export async function ensureModelDir(): Promise<string> {
  const dir = `${LegacyFileSystem.documentDirectory}ml`;
  const info = await LegacyFileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return modelUri();
}

export interface ModelCheck {
  ok: boolean;
  exists: boolean;
  size: number | null;
}

/** Validates the downloaded file without an exact-byte check (CDN variance is tolerated). */
export async function checkModel(): Promise<ModelCheck> {
  // Legacy FileInfo carries size for regular files with no option needed.
  const info = await LegacyFileSystem.getInfoAsync(modelUri());
  const exists = info.exists && !info.isDirectory;
  const size = exists && typeof info.size === 'number' ? info.size : null;
  return { ok: exists && (size === null || size >= MIN_VALID_MODEL_BYTES), exists, size };
}

export async function deleteModelFile(): Promise<void> {
  await LegacyFileSystem.deleteAsync(modelUri(), { idempotent: true }).catch(() => undefined);
}
