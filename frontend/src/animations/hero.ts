import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Page-space frame of a grid cell, used as the origin/destination of the hero flight. */
export interface HeroFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CellRef = RefObject<View | null>;

/**
 * Global registry of mounted grid cells by asset id. The viewer measures
 * the (possibly re-laid-out) cell at close time so the hero animation
 * returns exactly where the thumbnail currently is.
 */
const cells = new Map<string, CellRef>();

export function registerHeroCell(assetId: string, ref: CellRef): () => void {
  cells.set(assetId, ref);
  return () => {
    if (cells.get(assetId) === ref) cells.delete(assetId);
  };
}

export function measureHeroCell(assetId: string): Promise<HeroFrame | null> {
  return new Promise((resolve) => {
    const ref = cells.get(assetId);
    const node = ref?.current;
    if (!node) {
      resolve(null);
      return;
    }
    try {
      node.measure((x, y, width, height, pageX, pageY) => {
        if (!width || !height) resolve(null);
        else resolve({ x: pageX, y: pageY, width, height });
      });
    } catch {
      resolve(null);
    }
    // Never hang if measure never calls back (unmounted cell).
    setTimeout(() => resolve(null), 350);
  });
}
