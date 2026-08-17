import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sqliteStorage } from '@/data/kv-storage';

const API_KEY_STORAGE = 'ai-labeling.apiKey.v1';

/**
 * User-configured AI labeling endpoint (Settings → AI labeling). Any
 * OpenAI-compatible vision server works: api.openai.com, OpenRouter, or a
 * local Ollama/LM Studio URL. The API key lives in the device keystore; only
 * the non-secret endpoint/model (and whether a key exists) are persisted in
 * the app database.
 */
interface AiLabelingState {
  /** Base URL, e.g. "https://api.openai.com/v1". Empty = feature off. */
  endpoint: string;
  /** Vision model name, e.g. "gpt-4o-mini". */
  model: string;
  /** Whether an API key is stored (the key itself never enters state). */
  hasApiKey: boolean;
  setConfig: (endpoint: string, model: string) => void;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
}

export const useAiLabelingStore = create<AiLabelingState>()(
  persist(
    (set) => ({
      endpoint: '',
      model: '',
      hasApiKey: false,
      setConfig: (endpoint, model) =>
        set({ endpoint: endpoint.trim().replace(/\/+$/, ''), model: model.trim() }),
      setApiKey: async (key) => {
        const trimmed = key.trim();
        if (trimmed) {
          await SecureStore.setItemAsync(API_KEY_STORAGE, trimmed);
          set({ hasApiKey: true });
        } else {
          await clearKey();
          set({ hasApiKey: false });
        }
      },
      clearApiKey: async () => {
        await clearKey();
        set({ hasApiKey: false });
      },
    }),
    {
      name: 'ai-labeling',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        endpoint: state.endpoint,
        model: state.model,
        hasApiKey: state.hasApiKey,
      }),
    }
  )
);

async function clearKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE).catch(() => undefined);
}

/** Whether the user finished setting up the endpoint (key is optional for local servers). */
export function aiLabelingConfigured(): boolean {
  const { endpoint, model } = useAiLabelingStore.getState();
  return endpoint.length > 0 && model.length > 0;
}

export function getAiApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_STORAGE).catch(() => null);
}
