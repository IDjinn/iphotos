import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { PhotoAsset } from './types';

/**
 * Client for the user-configured AI labeling endpoint (Settings → AI labeling).
 * Talks to any OpenAI-compatible /chat/completions server — api.openai.com,
 * OpenRouter, or a local Ollama/LM Studio instance. Photos leave the device
 * only when the user sets this up; until then nothing here is ever called.
 */
export interface AiLabelerConfig {
  /** Base URL, e.g. "https://api.openai.com/v1" (full chat URL also accepted). */
  endpoint: string;
  /** Vision model name, e.g. "gpt-4o-mini". */
  model: string;
  /** Bearer token; null for keyless local servers. */
  apiKey: string | null;
}

const PROMPT = [
  'Look at this photo and reply with 3 to 6 short labels describing its subjects and setting.',
  'Rules: lowercase English, one or two words each, no "#" prefix, no duplicates.',
  'Examples: beach, dog, food, birthday party, document, screenshot, night city.',
  'Reply with ONLY a JSON array of strings, nothing else.',
].join(' ');

const REQUEST_TIMEOUT_MS = 45_000;

function chatCompletionsUrl(endpoint: string): string {
  return endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
}

function mimeFor(filename: string): string {
  if (/\.png$/i.test(filename)) return 'image/png';
  if (/\.webp$/i.test(filename)) return 'image/webp';
  return 'image/jpeg';
}

async function readAssetBase64(asset: PhotoAsset): Promise<string> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
  const uri = info.localUri ?? info.uri ?? asset.uri;
  if (!uri) throw new Error('No readable file for this asset');
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** Pulls the JSON array of labels out of a reply that may be fenced or chatty. */
export function parseLabelsReply(content: string): string[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const labels: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const label = item.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ');
    if (label.length > 0 && label.length <= 40 && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, 8);
}

/** Labels one photo via the configured endpoint. Throws with a readable message on failure. */
export async function classifyPhoto(asset: PhotoAsset, config: AiLabelerConfig): Promise<string[]> {
  const base64 = await readAssetBase64(asset);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(chatCompletionsUrl(config.endpoint), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeFor(asset.filename)};base64,${base64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 180)}` : ''}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const labels = parseLabelsReply(json.choices?.[0]?.message?.content ?? '');
    if (labels.length === 0) throw new Error('Model reply had no usable labels');
    return labels;
  } finally {
    clearTimeout(timeout);
  }
}
