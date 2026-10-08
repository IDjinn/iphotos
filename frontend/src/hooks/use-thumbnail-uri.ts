import { useEffect, useState } from 'react';

import { ensureThumbnail, getCachedThumbnailUri } from '@/data/thumbnails';
import type { PhotoAsset } from '@/data/types';

/**
 * Resolves the low-res preview URI for a grid cell: the persistent thumbnail
 * when available, the original otherwise. Missing thumbnails are generated in
 * the background and swapped in once ready.
 */
export function useThumbnailUri(asset: PhotoAsset): string {
  const [generated, setGenerated] = useState<string | null>(null);
  const [trackedId, setTrackedId] = useState(asset.id);

  // Render-phase reset when the recycled cell now shows a different asset.
  if (trackedId !== asset.id) {
    setTrackedId(asset.id);
    setGenerated(null);
  }

  useEffect(() => {
    let cancelled = false;
    void ensureThumbnail(asset).then((uri) => {
      if (!cancelled && uri) setGenerated(uri);
    });
    return () => {
      cancelled = true;
    };
    // Keyed on id/uri, not object identity: parents recreate asset objects on
    // every query, and re-running generation per identity would thrash cells.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.uri]);

  // A cheap in-memory Set lookup — no filesystem access on the render path.
  return generated ?? getCachedThumbnailUri(asset.id) ?? asset.uri;
}
