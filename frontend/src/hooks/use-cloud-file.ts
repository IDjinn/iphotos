import { useEffect, useState } from 'react';

import { authHeaders } from '@/data/api-client';
import { ensureCloudFile, getCachedCloudFileUri } from '@/data/cloud-media-cache';
import { fileUrl, type VariantKind } from '@/data/cloud-photos-repository';

interface CloudFileState {
  /** Local cached URI, or null while the variant is not (yet) on disk. */
  localUri: string | null;
  /** True once the download failed — callers should fall back to the remote URL. */
  failed: boolean;
}

/** expo-image source for a cloud variant: local cache needs no auth, the remote fallback does. */
export interface CloudFileSource {
  uri: string;
  headers?: Record<string, string>;
}

function cloudFileSource(localUri: string | null, failed: boolean, photoId: string, kind: VariantKind): CloudFileSource | null {
  if (localUri) return { uri: localUri };
  return failed ? { uri: fileUrl(photoId, kind), headers: authHeaders() } : null;
}

/**
 * Resolves a cloud variant to a local cached URI, downloading it on first
 * use. While the download runs `localUri` is null (callers render a
 * placeholder); afterwards the file is served from disk and the variant
 * never hits the network again, even across restarts.
 */
function useCloudFile(photoId: string, kind: VariantKind): CloudFileState {
  const emptyId = !photoId;
  const [state, setState] = useState<CloudFileState>(() => ({
    localUri: emptyId ? null : getCachedCloudFileUri(photoId, kind),
    failed: false,
  }));

  // Render-phase reset when the recycled cell now shows a different photo.
  const [trackedId, setTrackedId] = useState(photoId);
  if (trackedId !== photoId) {
    setTrackedId(photoId);
    setState({ localUri: emptyId ? null : getCachedCloudFileUri(photoId, kind), failed: false });
  }

  useEffect(() => {
    if (emptyId || state.localUri) return;
    let cancelled = false;
    void ensureCloudFile(photoId, kind).then((uri) => {
      if (cancelled) return;
      if (uri) setState({ localUri: uri, failed: false });
      else setState({ localUri: null, failed: true });
    });
    return () => {
      cancelled = true;
    };
    // `state.localUri` deliberately excluded — a null result must not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId, kind, emptyId]);

  return state;
}

/**
 * Grid-cell thumbnail: served from the persistent cloud cache, downloading on
 * first view; only falls back to the authenticated remote URL when the
 * download fails.
 */
export function useCloudThumbnailUri(photoId: string): CloudFileSource | null {
  const { localUri, failed } = useCloudFile(photoId, 'thumbnail');
  return cloudFileSource(localUri, failed, photoId, 'thumbnail');
}

/**
 * Cloud preview (2048px) for a viewer: the prefetched recent-window cache
 * first, the remote URL as fallback.
 */
export function useCloudPreviewUri(photoId: string): CloudFileSource | null {
  const { localUri, failed } = useCloudFile(photoId, 'preview');
  return cloudFileSource(localUri, failed, photoId, 'preview');
}
