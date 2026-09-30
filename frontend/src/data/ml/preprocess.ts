import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import UPNG from 'upng-js';
import { Buffer } from 'react-native-quick-crypto';

import type { PhotoAsset } from '../types';

/**
 * CLIP ViT-B/32 preprocessing, on device: native resize to 224×224 → PNG
 * (lossless, so the JS decode below is exact) → RGBA → normalized NCHW
 * float32. The reference pipeline center-crops after resizing to the shortest
 * side; we squash-resize instead — close enough for zero-shot labels and one
 * less native step.
 */
const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

export async function photoToTensor(asset: PhotoAsset): Promise<Float32Array> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
  const uri = info.localUri ?? info.uri ?? asset.uri;
  if (!uri) throw new Error('No readable file for this asset');

  const context = ImageManipulator.manipulate(uri).resize({ width: SIZE, height: SIZE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ base64: true, compress: 1, format: SaveFormat.PNG });
  if (!saved.base64) throw new Error('PNG encode failed');

  const pngBuffer = Buffer.from(saved.base64, 'base64');
  const png = UPNG.decode(pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength));
  const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);

  const plane = SIZE * SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let p = 0; p < plane; p++) {
    tensor[p] = (rgba[p * 4] / 255 - MEAN[0]) / STD[0];
    tensor[plane + p] = (rgba[p * 4 + 1] / 255 - MEAN[1]) / STD[1];
    tensor[2 * plane + p] = (rgba[p * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return tensor;
}
