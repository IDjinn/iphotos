import { create } from 'zustand';

import type { HeroFrame } from '@/animations/hero';
import type { PhotoAsset } from '@/data/types';

export type ViewerContext = 'gallery' | 'album' | 'favorites' | 'search' | 'locked';

/**
 * Global viewer state. The viewer renders as an overlay above all
 * navigation, which is what makes the hero transition work from any grid.
 */
interface ViewerState {
  visible: boolean;
  assets: PhotoAsset[];
  index: number;
  context: ViewerContext;
  /** Album id when context === 'album'. */
  albumId?: string;
  /** Grid cell frame the hero animation departs from. */
  origin: HeroFrame | null;
  /** Bumped whenever the overlay finished its closing animation. */
  closedAt: number;
  open: (
    assets: PhotoAsset[],
    index: number,
    context: ViewerContext,
    options?: { albumId?: string; origin?: HeroFrame | null }
  ) => void;
  setAssets: (assets: PhotoAsset[]) => void;
  setIndex: (index: number) => void;
  /** Called by the overlay when the closing animation completes. */
  finishClose: () => void;
  requestClose: () => void;
}

export const useViewerStore = create<ViewerState>()((set) => ({
  visible: false,
  assets: [],
  index: 0,
  context: 'gallery',
  albumId: undefined,
  origin: null,
  closedAt: 0,
  open: (assets, index, context, options) =>
    set({
      visible: true,
      assets,
      index,
      context,
      albumId: options?.albumId,
      origin: options?.origin ?? null,
      closedAt: 0,
    }),
  setAssets: (assets) => set({ assets }),
  setIndex: (index) => set({ index }),
  finishClose: () => set({ visible: false, closedAt: Date.now() }),
  requestClose: () => set({ closedAt: Date.now() }),
}));
