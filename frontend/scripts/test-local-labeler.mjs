/**
 * End-to-end validation of the on-device CLIP pipeline, run in Node:
 * real photo → resize/normalize (what the app's preprocessor does) → vision
 * ONNX → cosine against assets/ml/prompts.json → top labels.
 *
 * Usage: bun scripts/test-local-labeler.mjs [image-url-or-path]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import jpeg from 'jpeg-js';
import ort from 'onnxruntime-node';

const MODEL_URL = 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx';
const DEFAULT_IMAGE = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg';

const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
const SIZE = 224;

const source = process.argv[2] ?? DEFAULT_IMAGE;
let jpgBuffer;
if (/^https?:/.test(source)) {
  console.log('Fetching', source);
  jpgBuffer = Buffer.from(await (await fetch(source)).arrayBuffer());
} else {
  jpgBuffer = fs.readFileSync(source);
}

const modelFile = path.join(process.env.TEMP, 'vision_model_quantized.onnx');
if (!fs.existsSync(modelFile)) {
  console.log('Downloading vision model…');
  fs.writeFileSync(modelFile, Buffer.from(await (await fetch(MODEL_URL)).arrayBuffer()));
}

// --- decode + resize (bilinear squash — the app uses native resize) ---
const raw = jpeg.decode(jpgBuffer, { useTArray: true, formatAsRGBA: false });
console.log('decoded:', raw.width, 'x', raw.height);
const resized = new Float32Array(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  const sy = (y / SIZE) * raw.height;
  const y0 = Math.min(raw.height - 1, Math.floor(sy));
  const y1 = Math.min(raw.height - 1, y0 + 1);
  const fy = sy - y0;
  for (let x = 0; x < SIZE; x++) {
    const sx = (x / SIZE) * raw.width;
    const x0 = Math.min(raw.width - 1, Math.floor(sx));
    const x1 = Math.min(raw.width - 1, x0 + 1);
    const fx = sx - x0;
    const i00 = (y0 * raw.width + x0) * 3;
    const i01 = (y0 * raw.width + x1) * 3;
    const i10 = (y1 * raw.width + x0) * 3;
    const i11 = (y1 * raw.width + x1) * 3;
    const o = (y * SIZE + x) * 3;
    for (let c = 0; c < 3; c++) {
      const top = raw.data[i00 + c] * (1 - fx) + raw.data[i01 + c] * fx;
      const bottom = raw.data[i10 + c] * (1 - fx) + raw.data[i11 + c] * fx;
      resized[o + c] = top * (1 - fy) + bottom * fy;
    }
  }
}

// --- normalize to NCHW float32 (CLIP mean/std) ---
const tensor = new Float32Array(3 * SIZE * SIZE);
for (let p = 0; p < SIZE * SIZE; p++) {
  for (let c = 0; c < 3; c++) {
    tensor[c * SIZE * SIZE + p] = (resized[p * 3 + c] / 255 - MEAN[c]) / STD[c];
  }
}

// --- vision ONNX ---
const t0 = Date.now();
const session = await ort.InferenceSession.create(modelFile);
const out = await session.run({ pixel_values: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
const embed = out.image_embeds.data;
console.log(`inference: ${Date.now() - t0}ms, dims [${out.image_embeds.dims}]`);

// --- L2 normalize + cosine vs prompt matrix ---
let norm = 0;
for (let i = 0; i < embed.length; i++) norm += embed[i] * embed[i];
norm = Math.sqrt(norm) || 1;

const prompts = JSON.parse(fs.readFileSync('assets/ml/prompts.json', 'utf8'));
const matrix = new Float32Array(Buffer.from(prompts.embeddingsB64, 'base64').buffer);
const scores = [];
for (let i = 0; i < prompts.labels.length; i++) {
  let dot = 0;
  for (let j = 0; j < prompts.dim; j++) dot += matrix[i * prompts.dim + j] * (embed[j] / norm);
  scores.push({ label: prompts.labels[i], score: dot });
}
scores.sort((a, b) => b.score - a.score);
console.log('top labels:');
for (const s of scores.slice(0, 10)) console.log(`  ${s.score.toFixed(3)}  ${s.label}`);
