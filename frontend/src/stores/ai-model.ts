import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  getModel,
  getHardwareCapability,
  modelEligibility,
  recommendModel,
  type HardwareCapability,
  type ModelDescriptor,
} from '@/data/model-registry';
import { sqliteStorage } from '@/data/kv-storage';

/**
 * Which classification model the app should use. `selectedModelId === null`
 * means "follow the recommendation for this device" — the default. Only the
 * choice is stored; the recommendation is derived from live hardware info.
 */
interface AiModelState {
  selectedModelId: string | null;
  setModel: (id: string | null) => void;
}

export const useAiModelStore = create<AiModelState>()(
  persist(
    (set) => ({
      selectedModelId: null,
      setModel: (selectedModelId) => set({ selectedModelId }),
    }),
    {
      name: 'ai-model',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({ selectedModelId: state.selectedModelId }),
    }
  )
);

let capabilityCache: HardwareCapability | null = null;

/** Device info is static for a process lifetime — read it once. */
function capability(): HardwareCapability {
  if (!capabilityCache) capabilityCache = getHardwareCapability();
  return capabilityCache;
}

/**
 * Resolves the model actually in effect: the explicit selection when it is
 * still eligible, otherwise the device recommendation (null = cloud-only
 * device, nothing runs locally).
 */
export function resolveActiveModel(): ModelDescriptor | null {
  const { selectedModelId } = useAiModelStore.getState();
  if (selectedModelId) {
    const model = getModel(selectedModelId);
    if (model && modelEligibility(model, capability()).ok) return model;
  }
  return recommendModel(capability());
}
