import type { PhotoAsset } from '../types';
import { topLabelsForEmbedding } from './prompts';
import { photoToTensor } from './preprocess';
import { embedTensor } from './vision-session';

/** Zero-shot labels for one photo, fully on device. Throws with a readable message on failure. */
export async function localLabelsForPhoto(asset: PhotoAsset): Promise<string[]> {
  const tensor = await photoToTensor(asset);
  const embedding = await embedTensor(tensor);
  return topLabelsForEmbedding(embedding).map((s) => s.label);
}
