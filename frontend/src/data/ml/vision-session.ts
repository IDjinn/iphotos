import { NativeModules } from 'react-native';

import type { InferenceSession } from 'onnxruntime-react-native';

import { modelUri } from './model-files';

/**
 * Singleton ORT session over the downloaded CLIP vision encoder.
 * Input: "pixel_values" (1,3,224,224) float32 → output: "image_embeds" (1,512).
 *
 * The onnxruntime import is deferred and guarded: the package evaluates
 * `NativeModules.Onnxruntime.install()` at module scope, and on devices where
 * that native module fails to register (e.g. 16 KB-page emulators without a
 * compatible native build) the evaluation throws — which would crash the app
 * at route load. Requiring it here turns the same failure into a readable
 * error for the labeling run instead.
 */
type OrtModule = typeof import('onnxruntime-react-native');

let ort: OrtModule | null = null;
let session: InferenceSession | null = null;

function loadOrt(): OrtModule {
  if (ort) return ort;
  // The pre-check matters more than it looks: if the native module failed to
  // register, requiring the package would evaluate its binding.js, whose
  // module-scope `NativeModules.Onnxruntime.install()` throws — and Metro
  // reports module-scope failures as fatal no matter what try/catch sits
  // around the require() call. Bailing out here keeps the failure catchable.
  if (!NativeModules.Onnxruntime) {
    throw new Error(
      'On-device AI runtime unavailable on this device — the native library did not load (16 KB-page devices in compatibility mode are known to reject it).'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ort = require('onnxruntime-react-native') as OrtModule;
  return ort;
}

export async function getVisionSession(): Promise<InferenceSession> {
  if (session) return session;
  // The session is created from the file path: ORT's JSI layer reads the model
  // with native file IO. Loading the ~85 MB file as a base64 string into the
  // JS/Java heap instead OOMs the 192 MB Dalvik heap growth limit.
  session = await loadOrt().InferenceSession.create(modelUri(), {
    intraOpNumThreads: 2,
    enableCpuMemArena: false,
    enableMemPattern: false,
  });
  return session;
}

/** Drops the loaded session (e.g. after deleting the model file). */
export function disposeVisionSession(): void {
  session?.release();
  session = null;
}

/** Runs the vision tower on one preprocessed tensor and returns the raw embedding. */
export async function embedTensor(tensor: Float32Array): Promise<Float32Array> {
  const active = await getVisionSession();
  const { Tensor } = loadOrt();
  const feeds = { pixel_values: new Tensor('float32', tensor, [1, 3, 224, 224]) };
  const output = await active.run(feeds);
  return output.image_embeds.data as Float32Array;
}
