import { fetchFileBlob, type VariantKind } from "@/data/cloud-photos-repository";
import { fetchFaceCropBlob } from "@/data/people-repository";
import { useQuery } from "@tanstack/react-query";

/**
 * Object-URL cache for authenticated file variants. These requests carry the
 * Authorization header, so the browser's HTTP cache can't be relied on — the
 * session keeps a bounded LRU of object URLs and revokes them on eviction.
 */
export class BlobUrlCache {
  private entries = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): string | undefined {
    const url = this.entries.get(key);
    if (url !== undefined) {
      // Refresh recency.
      this.entries.delete(key);
      this.entries.set(key, url);
    }
    return url;
  }

  set(key: string, blob: Blob): string {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const url = URL.createObjectURL(blob);
    this.entries.set(key, url);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      URL.revokeObjectURL(oldest);
    }
    return url;
  }

  /** Returns the cached URL, or loads the blob once for concurrent callers. */
  async load(key: string, loader: () => Promise<Blob>): Promise<string> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    let inFlight = this.pending.get(key);
    if (!inFlight) {
      inFlight = loader()
        .then((blob) => this.set(key, blob))
        .finally(() => {
          this.pending.delete(key);
        });
      this.pending.set(key, inFlight);
    }
    return inFlight;
  }

  /** Drops every entry of one photo (its bytes changed server-side). */
  removePhoto(photoId: string): void {
    for (const [key, url] of [...this.entries]) {
      if (key.startsWith(`${photoId}:`)) {
        this.entries.delete(key);
        URL.revokeObjectURL(url);
      }
    }
  }
}

const thumbnailCache = new BlobUrlCache(600);
const previewCache = new BlobUrlCache(120);

function cacheFor(kind: VariantKind): BlobUrlCache {
  return kind === "thumbnail" ? thumbnailCache : previewCache;
}

/**
 * Resolves an authenticated, cached object URL for a photo variant. The
 * browser back/forward cache and virtualized grids re-mount cells freely;
 * `staleTime: Infinity` keeps the object URL stable for the session.
 */
export function useAuthFileUrl(photoId: string, kind: VariantKind, enabled = true) {
  const cache = cacheFor(kind);
  return useQuery({
    queryKey: ["file-url", photoId, kind],
    queryFn: () => cache.load(`${photoId}:${kind}`, () => fetchFileBlob(photoId, kind)),
    enabled: enabled && typeof window !== "undefined",
    staleTime: Infinity,
  });
}

const faceCropCache = new BlobUrlCache(400);

/**
 * Drops the cached object URLs of one photo's variants — call after a server-side
 * byte change (e.g. Live Photo "Set as Key Photo") so the next `useAuthFileUrl`
 * fetch downloads fresh bytes instead of replaying the stale object URL.
 */
export function invalidateAuthFileUrls(photoId: string): void {
  thumbnailCache.removePhoto(photoId);
  previewCache.removePhoto(photoId);
}

/**
 * Resolves an authenticated, cached object URL for a face crop (person covers,
 * merge chips, review suggestions). Same model as `useAuthFileUrl`: the request
 * carries the Authorization header, so the session keeps its own LRU.
 */
export function useFaceCropUrl(faceId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["face-crop-url", faceId],
    queryFn: () => faceCropCache.load(faceId!, () => fetchFaceCropBlob(faceId!)),
    enabled: enabled && !!faceId && typeof window !== "undefined",
    staleTime: Infinity,
  });
}
