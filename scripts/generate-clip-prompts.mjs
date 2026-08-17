/**
 * Generates the zero-shot prompt matrix for on-device CLIP labeling.
 *
 * Runs CLIP's text encoder offline (Node) for a curated PT+EN concept list and
 * writes assets/ml/prompts.json with L2-normalized embeddings (base64 float32).
 * The app then only needs the vision encoder ONNX (downloaded at runtime) —
 * no tokenizer, no text model on device. Embeddings are pinned to the exact
 * model the app downloads; regenerate this file if MODEL_ID changes.
 *
 * Usage: bun scripts/generate-clip-prompts.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AutoTokenizer, CLIPTextModelWithProjection } from '@xenova/transformers';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const OUT_DIR = path.resolve('assets/ml');

/** [english, portuguese] concept twins — both become labels, so search works in both languages. */
const CONCEPTS = [
  ['beach', 'praia'], ['mountain', 'montanha'], ['forest', 'floresta'], ['sea', 'mar'],
  ['lake', 'lago'], ['river', 'rio'], ['waterfall', 'cachoeira'], ['sunset', 'por do sol'],
  ['sunrise', 'amanhecer'], ['sky', 'ceu'], ['clouds', 'nuvens'], ['snow', 'neve'],
  ['flower', 'flor'], ['tree', 'arvore'], ['garden', 'jardim'], ['field', 'campo'],
  ['desert', 'deserto'], ['island', 'ilha'], ['cliff', 'penhasco'], ['ocean', 'oceano'],
  ['dog', 'cachorro'], ['cat', 'gato'], ['puppy', 'filhote'], ['bird', 'passaro'],
  ['fish', 'peixe'], ['horse', 'cavalo'], ['cow', 'vaca'], ['chicken', 'galinha'],
  ['rabbit', 'coelho'], ['wild animal', 'animal selvagem'], ['lion', 'leao'],
  ['monkey', 'macaco'], ['insect', 'inseto'], ['butterfly', 'borboleta'], ['snake', 'cobra'],
  ['turtle', 'tartaruga'], ['person', 'pessoa'], ['people', 'pessoas'], ['crowd', 'multidao'],
  ['child', 'crianca'], ['baby', 'bebe'], ['man', 'homem'], ['woman', 'mulher'],
  ['family', 'familia'], ['friends', 'amigos'], ['couple', 'casal'], ['wedding', 'casamento'],
  ['party', 'festa'], ['birthday', 'aniversario'], ['graduation', 'formatura'],
  ['selfie', 'selfie'], ['portrait', 'retrato'], ['face', 'rosto'], ['smile', 'sorriso'],
  ['food', 'comida'], ['fruit', 'fruta'], ['dessert', 'sobremesa'], ['cake', 'bolo'],
  ['pizza', 'pizza'], ['barbecue', 'churrasco'], ['coffee', 'cafe'], ['drink', 'bebida'],
  ['restaurant', 'restaurante'], ['breakfast', 'cafe da manha'], ['lunch', 'almoco'],
  ['dinner', 'jantar'], ['sport', 'esporte'], ['soccer', 'futebol'], ['running', 'corrida'],
  ['cycling', 'ciclismo'], ['swimming', 'natacao'], ['surfing', 'surfe'], ['hiking', 'trilha'],
  ['gym', 'academia'], ['dancing', 'danca'], ['music', 'musica'], ['concert', 'show'],
  ['guitar', 'guitarra'], ['game', 'jogo'], ['videogame', 'videogame'], ['fishing', 'pesca'],
  ['camping', 'acampamento'], ['travel', 'viagem'], ['city', 'cidade'], ['street', 'rua'],
  ['building', 'predio'], ['house', 'casa'], ['room', 'quarto'], ['kitchen', 'cozinha'],
  ['office', 'escritorio'], ['school', 'escola'], ['church', 'igreja'], ['bridge', 'ponte'],
  ['tower', 'torre'], ['castle', 'castelo'], ['museum', 'museu'], ['park', 'parque'],
  ['playground', 'parquinho'], ['stadium', 'estadio'], ['airport', 'aeroporto'],
  ['hotel', 'hotel'], ['store', 'loja'], ['mall', 'shopping'], ['market', 'mercado'],
  ['farm', 'fazenda'], ['car', 'carro'], ['motorcycle', 'motocicleta'],
  ['bicycle', 'bicicleta'], ['bus', 'onibus'], ['train', 'trem'], ['airplane', 'aviao'],
  ['boat', 'barco'], ['ship', 'navio'], ['truck', 'caminhao'], ['book', 'livro'],
  ['computer', 'computador'], ['television', 'televisao'], ['camera', 'camera'],
  ['clock', 'relogio'], ['clothes', 'roupas'], ['shoes', 'sapatos'], ['bag', 'bolsa'],
  ['glasses', 'oculos'], ['toy', 'brinquedo'], ['plant', 'planta'], ['art', 'arte'],
  ['painting', 'pintura'], ['sculpture', 'escultura'], ['money', 'dinheiro'],
  ['tools', 'ferramentas'], ['document', 'documento'], ['receipt', 'recibo'],
  ['invoice', 'nota fiscal'], ['ticket', 'ingresso'], ['card', 'cartao'],
  ['whiteboard', 'quadro branco'], ['handwritten note', 'nota manuscrita'],
  ['screenshot', 'captura de tela'], ['meme', 'meme'], ['wallpaper', 'papel de parede'],
  ['qr code', 'codigo qr'], ['barcode', 'codigo de barras'], ['carnival', 'carnaval'],
  ['christmas', 'natal'], ['fireworks', 'fogos de artificio'], ['rain', 'chuva'],
  ['fog', 'neblina'], ['night', 'noite'], ['indoor', 'interior'], ['outdoor', 'exterior'],
];

function l2NormalizeRows(matrix, dim) {
  for (let i = 0; i < matrix.length; i += dim) {
    let sum = 0;
    for (let j = 0; j < dim; j++) sum += matrix[i + j] * matrix[i + j];
    const norm = Math.sqrt(sum) || 1;
    for (let j = 0; j < dim; j++) matrix[i + j] /= norm;
  }
}

console.log(`Loading ${MODEL_ID} (quantized)…`);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { quantized: true });

// One prompt per (concept, language): template improves CLIP discrimination.
const prompts = [];
const labels = [];
for (const [en, pt] of CONCEPTS) {
  prompts.push(`a photo of ${en}`); labels.push(en);
  prompts.push(`uma foto de ${pt}`); labels.push(pt);
}

console.log(`Embedding ${prompts.length} prompts…`);
const tokenized = tokenizer(prompts, { padding: true, truncation: true });
const textOut = await textModel(tokenized);
const embeds = textOut.text_embeds.tolist(); // [N][512]
const dim = embeds[0].length;
const flat = new Float32Array(embeds.length * dim);
embeds.forEach((row, i) => flat.set(row, i * dim));
l2NormalizeRows(flat, dim);

// Vision tower verified separately (onnxruntime-node): input "pixel_values"
// (1,3,224,224) float32 → output "image_embeds" (1,512).

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, 'prompts.json'),
  JSON.stringify({
    modelId: MODEL_ID,
    dim,
    labels,
    embeddingsB64: Buffer.from(flat.buffer).toString('base64'),
  })
);
console.log(`Wrote assets/ml/prompts.json (${prompts.length} prompts × ${dim} dims, ${(fs.statSync(path.join(OUT_DIR, 'prompts.json')).size / 1024).toFixed(0)} KB)`);
