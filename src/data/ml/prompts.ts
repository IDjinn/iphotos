import { Buffer } from 'react-native-quick-crypto';

import promptsJson from '@/assets/ml/prompts.json';

/**
 * The zero-shot prompt matrix, generated offline by
 * scripts/generate-clip-prompts.mjs with CLIP's text encoder (PT+EN twins so
 * search works in both languages). Bundled as JSON so the app never needs a
 * tokenizer or the text tower on device.
 */
interface PromptsAsset {
  modelId: string;
  dim: number;
  labels: string[];
  embeddingsB64: string;
}

export interface ScoredLabel {
  label: string;
  score: number;
}

/** Labels below this cosine similarity are dropped (calibrated on a test corpus). */
const MIN_SCORE = 0.22;
const TOP_K = 8;

let cache: { labels: string[]; dim: number; matrix: Float32Array } | null = null;

function load(): { labels: string[]; dim: number; matrix: Float32Array } {
  if (!cache) {
    const asset = promptsJson as PromptsAsset;
    const bytes = Buffer.from(asset.embeddingsB64, 'base64');
    cache = {
      labels: asset.labels,
      dim: asset.dim,
      matrix: new Float32Array(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      ),
    };
  }
  return cache;
}

/** Ranks an (unnormalized) image embedding against every prompt. */
export function topLabelsForEmbedding(embedding: Float32Array): ScoredLabel[] {
  const { labels, dim, matrix } = load();
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm) || 1;

  const scored: ScoredLabel[] = [];
  for (let i = 0; i < labels.length; i++) {
    let dot = 0;
    for (let j = 0; j < dim; j++) dot += matrix[i * dim + j] * (embedding[j] / norm);
    if (dot >= MIN_SCORE) scored.push({ label: labels[i], score: dot });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_K);
}
